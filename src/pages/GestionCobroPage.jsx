import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Gavel,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Receipt,
  Search,
  UserCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { usePanels } from '@/contexts/PanelContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const money = (v) => `RD$ ${new Intl.NumberFormat('es-DO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}).format(Number(v) || 0)}`;

const APP_TIME_ZONE = 'America/Santo_Domingo';
const SUPABASE_PAGE_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 200;
const PRESTAMOS_BATCH_SIZE = 100;
const DIAS_GRACIA_PAGO = 3;

const fdate = (d) => {
  if (!d) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};
const todayDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const dayMs = 24 * 60 * 60 * 1000;

const shiftDate = (dateText, days) => {
  const [year, month, day] = String(dateText).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const chunkArray = (items, size = IN_FILTER_CHUNK_SIZE) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const fetchPaged = async (queryFactory, pageSize = SUPABASE_PAGE_SIZE) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const sortCaseRows = (items) => [...items].sort((a, b) => (
  b.dias_atraso - a.dias_atraso
  || b.monto_vencido - a.monto_vencido
  || String(a.cliente?.nombre || '').localeCompare(String(b.cliente?.nombre || ''))
));

const mergeById = (current, incoming) => {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

const daysBetween = (from, to = todayDate()) => {
  if (!from) return 0;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / dayMs));
};

const pendingCuota = (q) => Math.max(
  0,
  Number(q.capital || 0) + Number(q.interes || 0)
    - Number(q.capital_pagado || 0) - Number(q.interes_pagado || 0),
);

const hasReminderSentForCuota = (gestiones = [], cuotaId) => gestiones.some((g) => (
  g.tipo === 'mensaje_enviado'
    && String(g.metadata?.recordatorio_pago || 'false') === 'true'
    && String(g.metadata?.recordatorio_cuota_id || '') === String(cuotaId)
));

const hasInteresCorrienteEquivalente = (prestamo, cuotas = []) => {
  const capitalBase = cuotas.reduce((sum, q) => (
    sum + Math.max(0, Number(q.capital || 0) - Number(q.capital_pagado || 0))
  ), 0);
  const ultimoInteres = cuotas
    .filter((q) => Number(q.interes || 0) > 0 && q.fecha_vencimiento)
    .map((q) => q.fecha_vencimiento)
    .sort()
    .at(-1);

  return capitalBase > 0
    && Number(prestamo?.tasa_interes || 0) > 0
    && ultimoInteres
    && daysBetween(ultimoInteres) > 0;
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `1${digits}`;
  return digits;
};

const cleanLoanNumber = (value) => {
  const raw = String(value || '').trim();
  const duplicatedLegacy = raw.match(/^(PT-\d+)-2\d+$/i);
  return duplicatedLegacy ? duplicatedLegacy[1] : raw;
};

const bucketLabel = (dias) => {
  if (dias >= 31) return '31+';
  if (dias >= 16) return '16 - 30';
  if (dias >= 8) return '8 - 15';
  return '1 - 7';
};

const priorityFor = (row) => {
  if (row.recordatorio_pago) return 'Baja';
  if (row.dias_atraso >= 31 || row.monto_vencido >= 15000) return 'Alta';
  if (row.dias_atraso >= 16 || row.monto_vencido >= 6000) return 'Media';
  return 'Baja';
};

const estadoFrom = (row) => {
  if (row.recordatorio_pago) return 'Recordatorio 3 dias';
  const promesa = row.promesa;
  if (row.gestion_fisica?.estado === 'mandado_buscar') return 'Mandado a buscar';
  if (promesa?.fecha_promesa) {
    if (promesa.fecha_promesa < todayDate()) return 'Promesa vencida';
    if (promesa.fecha_promesa === todayDate()) return 'Promesa para hoy';
    return 'Promesa futura';
  }
  if (row.ultima_respuesta) return 'Respondio';
  if (row.pagos_vencidos_equivalentes >= 2) return 'Moroso';
  return 'Seguimiento';
};

const badgeClass = {
  Alta: 'bg-red-100 text-red-700 border-red-200',
  Media: 'bg-amber-100 text-amber-700 border-amber-200',
  Baja: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Promesa para hoy': 'bg-amber-100 text-amber-700 border-amber-200',
  'Promesa futura': 'bg-blue-100 text-blue-700 border-blue-200',
  'Promesa vencida': 'bg-red-100 text-red-700 border-red-200',
  'Mandado a buscar': 'bg-violet-100 text-violet-700 border-violet-200',
  Moroso: 'bg-orange-100 text-orange-700 border-orange-200',
  Seguimiento: 'bg-amber-100 text-amber-700 border-amber-200',
  Respondio: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Recordatorio 3 dias': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Sin respuesta': 'bg-slate-100 text-slate-600 border-slate-200',
  Critico: 'bg-red-100 text-red-700 border-red-200',
};

const kpiMeta = [
  { key: 'atrasados', label: 'Clientes atrasados', icon: Users, tone: 'text-blue-600 bg-blue-50' },
  { key: 'montoVencido', label: 'Monto vencido', icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
  { key: 'recordatorios3', label: 'Recordatorio 3 dias', icon: MessageCircle, tone: 'text-cyan-600 bg-cyan-50' },
  { key: 'promesasHoy', label: 'Promesas para hoy', icon: CalendarClock, tone: 'text-amber-600 bg-amber-50' },
  { key: 'promesasVencidas', label: 'Promesas vencidas', icon: Clock, tone: 'text-red-600 bg-red-50' },
  { key: 'pagaron15', label: 'Pagaron ult. 15 dias y siguen atrasados', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
  { key: 'mandadosBuscar', label: 'Mandados a buscar', icon: MapPin, tone: 'text-violet-600 bg-violet-50' },
  { key: 'sinRespuesta', label: 'Sin respuesta', icon: MessageCircle, tone: 'text-slate-600 bg-slate-50' },
  { key: 'respRevisar', label: 'Resp. por revisar', icon: UserCheck, tone: 'text-cyan-600 bg-cyan-50' },
];

const tabOptions = [
  { key: 'todos', label: 'Todos los atrasados' },
  { key: 'recordatorio_pago', label: 'Recordatorio 3 dias' },
  { key: 'promesas', label: 'Promesas de pago' },
  { key: 'promesas_vencidas', label: 'Promesas vencidas' },
  { key: 'pagaron_siguen', label: 'Pagaron y siguen atrasados' },
  { key: 'mandados_buscar', label: 'Mandados a buscar' },
  { key: 'sin_respuesta', label: 'Sin respuesta' },
  { key: 'criticos', label: 'Casos criticos' },
];

const PAGE_SIZE = 10;

const GestionCobroPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [rows, setRows] = useState([]);
  const [gestiones, setGestiones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('todos');
  const [detailTab, setDetailTab] = useState('gestion');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [diasFiltro, setDiasFiltro] = useState('todos');
  const [prioridadFiltro, setPrioridadFiltro] = useState('todas');
  const [cobradorFiltro, setCobradorFiltro] = useState('todos');
  const [savingAction, setSavingAction] = useState(false);
  const [promiseForm, setPromiseForm] = useState({ fecha: todayDate(), monto: '', nota: '' });
  const [visitForm, setVisitForm] = useState({ resultado: 'pendiente', nota: '' });
  const [noteText, setNoteText] = useState('');
  const [quickActionMode, setQuickActionMode] = useState('promesa');
  const loadTokenRef = useRef(0);
  // Castigar cuenta activa (con autorización del creador)
  const [castigarOpen, setCastigarOpen] = useState(false);
  const [castigarMotivo, setCastigarMotivo] = useState('incobrable');
  const [castigarPass, setCastigarPass] = useState('');
  const [castigando, setCastigando] = useState(false);
  const [puedeSinClave, setPuedeSinClave] = useState(true);

  useEffect(() => {
    supabase.rpc('puede_castigar_sin_clave').then(({ data }) => setPuedeSinClave(!!data)).catch(() => setPuedeSinClave(false));
  }, []);

  const confirmarCastigo = async () => {
    if (!selected?.prestamo_id) return;
    if (!puedeSinClave && !castigarPass.trim()) {
      toast({ variant: 'destructive', title: 'Autorización requerida', description: 'Ingresa la contraseña del creador de la empresa.' });
      return;
    }
    setCastigando(true);
    try {
      const { error } = await supabase.rpc('castigar_prestamo', {
        p_prestamo_id: selected.prestamo_id, p_motivo: castigarMotivo,
        p_password: puedeSinClave ? null : castigarPass,
      });
      if (error) throw error;
      toast({ title: 'Cuenta castigada', description: `${selected.prestamo_numero} pasó a Cuentas Incobrables.` });
      setCastigarOpen(false); setCastigarPass(''); setCaseOpen(false);
      cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo castigar', description: e.message });
    }
    setCastigando(false);
  };

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const abrirReciboCliente = useCallback(() => {
    if (!selected?.cliente_id) return;
    setCaseOpen(false);
    openPanel('recibo-pago', {
      clienteId: selected.cliente_id,
      prestamoId: selected.prestamo_id,
      requestedAt: Date.now(),
      cliente: {
        id: selected.cliente_id,
        codigo: selected.cliente?.codigo || '',
        nombre: selected.cliente?.nombre || '',
        rnc: selected.cliente?.rnc || '',
        direccion: selected.cliente?.direccion || '',
        telefono: selected.cliente?.telefono || '',
      },
    });
  }, [openPanel, selected]);

  const loadGestiones = useCallback(async (clienteIds) => {
    if (!clienteIds.length) return [];
    try {
      const chunks = chunkArray(clienteIds);
      const data = [];
      for (const ids of chunks) {
        const chunkRows = await fetchPaged(() => supabase
          .from('cobro_gestiones')
          .select('*')
          .in('cliente_id', ids)
          .order('created_at', { ascending: false }));
        data.push(...chunkRows);
      }
      return data.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } catch (error) {
      if (error.code === '42P01' || /cobro_gestiones/i.test(error.message || '')) return [];
      throw error;
    }
  }, []);

  const buildRowsForPrestamos = useCallback(async (prestamos) => {
    if (!prestamos.length) return { rows: [], gestiones: [] };

      const prestamoIds = prestamos.map((p) => p.id);
      const cuotasData = [];
      for (const ids of chunkArray(prestamoIds)) {
        const chunkRows = await fetchPaged(() => supabase
          .from('prestamo_cuotas')
          .select('id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, capital_pagado, interes_pagado, estado')
          .in('prestamo_id', ids)
          .or('estado.is.null,estado.neq.pagada')
          .order('fecha_vencimiento', { ascending: true }));
        cuotasData.push(...chunkRows);
      }
      cuotasData.sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')));

      const vencidas = (cuotasData || []).filter((q) => (
        daysBetween(q.fecha_vencimiento) > DIAS_GRACIA_PAGO && pendingCuota(q) > 0
      ));
      const recordatoriosDia3 = (cuotasData || []).filter((q) => (
        daysBetween(q.fecha_vencimiento) === DIAS_GRACIA_PAGO && pendingCuota(q) > 0
      ));
      const prestamosConVencidas = new Set(vencidas.map((q) => q.prestamo_id));
      const prestamosConRecordatorioDia3 = new Set(recordatoriosDia3.map((q) => q.prestamo_id));
      const cuotasDataPorPrestamo = (cuotasData || []).reduce((acc, q) => {
        if (!acc[q.prestamo_id]) acc[q.prestamo_id] = [];
        acc[q.prestamo_id].push(q);
        return acc;
      }, {});
      const prestamosConInteresEquivalente = new Set(
        prestamos
          .filter((p) => hasInteresCorrienteEquivalente(p, cuotasDataPorPrestamo[p.id] || []))
          .map((p) => p.id)
      );
      const activePrestamos = prestamos.filter((p) => (
        prestamosConVencidas.has(p.id)
          || prestamosConInteresEquivalente.has(p.id)
          || prestamosConRecordatorioDia3.has(p.id)
      ));
      const clienteIds = [...new Set(activePrestamos.map((p) => p.cliente_id).filter(Boolean))];

      let clientesMap = {};
      if (clienteIds.length) {
        const clientesData = [];
        for (const ids of chunkArray(clienteIds)) {
          const chunkRows = await fetchPaged(() => supabase
            .from('clientes')
            .select('id, codigo, nombre, telefono, rnc, direccion')
            .in('id', ids));
          clientesData.push(...chunkRows);
        }
        clientesMap = Object.fromEntries((clientesData || []).map((c) => [c.id, c]));
      }

      let pagosMap = {};
      let ultimoPagoMap = {};
      if (clienteIds.length) {
        const fifteen = shiftDate(todayDate(), -15);
        const pagosData = [];
        for (const ids of chunkArray(clienteIds)) {
          const chunkRows = await fetchPaged(() => supabase
            .from('prestamo_pagos')
            .select('id, cliente_id, fecha, total_pagado, cobrador, comentarios, created_at')
            .in('cliente_id', ids)
            .eq('anulado', false)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false }));
          pagosData.push(...chunkRows);
        }
        pagosData.sort((a, b) => (
          String(b.fecha || '').localeCompare(String(a.fecha || ''))
          || String(b.created_at || '').localeCompare(String(a.created_at || ''))
        ));
        (pagosData || []).forEach((p) => {
          if (!ultimoPagoMap[p.cliente_id]) ultimoPagoMap[p.cliente_id] = p;
          if (p.fecha >= fifteen) {
            if (!pagosMap[p.cliente_id]) pagosMap[p.cliente_id] = [];
            pagosMap[p.cliente_id].push(p);
          }
        });
      }

      const gestionesData = await loadGestiones(clienteIds);

      const gestionesPorCliente = gestionesData.reduce((acc, g) => {
        if (!acc[g.cliente_id]) acc[g.cliente_id] = [];
        acc[g.cliente_id].push(g);
        return acc;
      }, {});

      const cuotasPorPrestamo = vencidas.reduce((acc, q) => {
        if (!acc[q.prestamo_id]) acc[q.prestamo_id] = [];
        acc[q.prestamo_id].push(q);
        return acc;
      }, {});
      const recordatoriosPorPrestamo = recordatoriosDia3.reduce((acc, q) => {
        if (!acc[q.prestamo_id]) acc[q.prestamo_id] = [];
        acc[q.prestamo_id].push(q);
        return acc;
      }, {});

      const built = activePrestamos.map((p) => {
        const cliente = clientesMap[p.cliente_id] || {};
        const cuotas = cuotasPorPrestamo[p.id] || [];
        const interesCorrienteEquivalente = prestamosConInteresEquivalente.has(p.id) ? 1 : 0;
        const pagos15 = pagosMap[p.cliente_id] || [];
        const ultimoPago = ultimoPagoMap[p.cliente_id] || null;
        const gs = gestionesPorCliente[p.cliente_id] || [];
        const isCasoAtrasado = cuotas.length > 0 || interesCorrienteEquivalente > 0;
        const cuotasRecordatorio = (recordatoriosPorPrestamo[p.id] || [])
          .filter((q) => !hasReminderSentForCuota(gs, q.id));
        const isRecordatorioPago = !isCasoAtrasado && cuotasRecordatorio.length === 1;
        if (!isCasoAtrasado && !isRecordatorioPago) return null;

        const cuotasCaso = isRecordatorioPago ? cuotasRecordatorio : cuotas;
        const recordatorioCuota = isRecordatorioPago ? cuotasRecordatorio[0] : null;
        const montoVencido = cuotasCaso.reduce((sum, q) => sum + pendingCuota(q), 0);
        const oldest = cuotasCaso[0]?.fecha_vencimiento;
        const diasAtraso = isRecordatorioPago ? DIAS_GRACIA_PAGO : (oldest ? daysBetween(oldest) : 0);
        const promesa = gs.find((g) => g.tipo === 'promesa_pago' && g.estado !== 'cumplida' && g.estado !== 'cancelada');
        const gestionFisica = gs.find((g) => ['mandado_buscar', 'visita'].includes(g.tipo) && g.estado !== 'cerrada');
        const ultimaRespuesta = gs.find((g) => g.tipo === 'respuesta_cliente' || g.tipo === 'llamada');
        const row = {
          id: isRecordatorioPago ? `recordatorio-${recordatorioCuota.id}` : p.id,
          prestamo_id: p.id,
          prestamo_numero: cleanLoanNumber(p.numero),
          prestamo_numero_raw: p.numero,
          cliente_id: p.cliente_id,
          cliente,
          tipo: p.tipo,
          garantia: p.garantia,
          cuotas_vencidas: isRecordatorioPago ? 1 : cuotas.length,
          pagos_vencidos_equivalentes: isRecordatorioPago ? 1 : cuotas.length + interesCorrienteEquivalente,
          interes_corriente_equivalente: isRecordatorioPago ? 0 : interesCorrienteEquivalente,
          monto_vencido: montoVencido,
          dias_atraso: diasAtraso,
          bucket: bucketLabel(diasAtraso),
          recordatorio_pago: isRecordatorioPago,
          recordatorio_cuota_id: recordatorioCuota?.id || null,
          recordatorio_fecha_vencimiento: recordatorioCuota?.fecha_vencimiento || null,
          pagos15,
          ultimo_pago: ultimoPago,
          gestiones: gs,
          promesa,
          gestion_fisica: gestionFisica,
          ultima_respuesta: ultimaRespuesta,
        };
        row.prioridad = priorityFor(row);
        row.estado_cobro = estadoFrom(row);
        return row;
      }).filter(Boolean);

      return { rows: built, gestiones: gestionesData };
  }, [loadGestiones]);

  const cargar = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setLoading(true);
    setLoadingMore(false);
    setRows([]);
    setGestiones([]);

    try {
      let publishedFirstBatch = false;
      let accumulatedRows = [];
      let accumulatedGestiones = [];

      for (let from = 0; ; from += PRESTAMOS_BATCH_SIZE) {
        const { data: prestamosData, error: prestamosError } = await supabase
          .from('prestamos')
          .select('id, numero, cliente_id, tipo, garantia, estado, fecha_inicio, monto_capital, tasa_interes, created_at')
          .eq('estado', 'activo')
          .order('fecha_inicio', { ascending: true })
          .order('created_at', { ascending: false })
          .range(from, from + PRESTAMOS_BATCH_SIZE - 1);

        if (prestamosError) throw prestamosError;
        if (loadTokenRef.current !== token) return;

        const prestamos = prestamosData || [];
        if (!prestamos.length) break;

        const built = await buildRowsForPrestamos(prestamos);
        if (loadTokenRef.current !== token) return;

        if (built.rows.length || built.gestiones.length) {
          accumulatedRows = sortCaseRows(mergeById(accumulatedRows, built.rows));
          accumulatedGestiones = mergeById(accumulatedGestiones, built.gestiones)
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

          setRows(accumulatedRows);
          setGestiones(accumulatedGestiones);

          if (!publishedFirstBatch && accumulatedRows.length >= PAGE_SIZE) {
            publishedFirstBatch = true;
            setLoading(false);
            setLoadingMore(true);
          }
        }

        if (prestamos.length < PRESTAMOS_BATCH_SIZE) break;
      }

      if (loadTokenRef.current !== token) return;
      setRows((current) => sortCaseRows(current));
      setSelectedId((current) => current && accumulatedRows.some((r) => r.id === current) ? current : null);
    } catch (e) {
      if (loadTokenRef.current === token) {
        toast({ variant: 'destructive', title: 'No se pudo cargar Gestion de Cobro', description: e.message });
      }
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildRowsForPrestamos, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const kpis = useMemo(() => {
    const regularRows = rows.filter((r) => !r.recordatorio_pago);
    const promesasHoy = regularRows.filter((r) => r.promesa?.fecha_promesa === todayDate()).length;
    const promesasVencidas = regularRows.filter((r) => r.promesa?.fecha_promesa && r.promesa.fecha_promesa < todayDate()).length;
    return {
      // "Clientes atrasados" = clientes DISTINTOS (no préstamos): un cliente con
      // varias motos vencidas cuenta 1 vez. Así coincide con la extensión, que
      // agrupa por cliente.
      atrasados: new Set(regularRows.map((r) => r.cliente_id)).size,
      montoVencido: regularRows.reduce((sum, r) => sum + Number(r.monto_vencido || 0), 0),
      recordatorios3: rows.filter((r) => r.recordatorio_pago).length,
      promesasHoy,
      promesasVencidas,
      pagaron15: regularRows.filter((r) => r.pagos15.length > 0).length,
      mandadosBuscar: regularRows.filter((r) => r.gestion_fisica?.estado === 'mandado_buscar').length,
      sinRespuesta: regularRows.filter((r) => !r.ultima_respuesta && !r.promesa).length,
      respRevisar: regularRows.filter((r) => r.ultima_respuesta?.estado === 'pendiente_revision').length,
    };
  }, [rows]);

  const cobradores = useMemo(() => {
    const names = new Set();
    gestiones.forEach((g) => { if (g.asignado_a) names.add(g.asignado_a); });
    rows.forEach((r) => r.pagos15.forEach((p) => { if (p.cobrador) names.add(p.cobrador); }));
    return Array.from(names).sort();
  }, [gestiones, rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = [
        row.cliente?.nombre,
        row.cliente?.telefono,
        row.cliente?.rnc,
        row.cliente?.codigo,
        row.prestamo_numero,
        row.prestamo_numero_raw,
        row.garantia,
      ].filter(Boolean).join(' ').toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (diasFiltro !== 'todos' && row.bucket !== diasFiltro) return false;
      if (prioridadFiltro !== 'todas' && row.prioridad !== prioridadFiltro) return false;
      if (cobradorFiltro !== 'todos') {
        const assigned = row.gestiones.some((g) => g.asignado_a === cobradorFiltro) || row.pagos15.some((p) => p.cobrador === cobradorFiltro);
        if (!assigned) return false;
      }

      if (activeTab === 'recordatorio_pago') return !!row.recordatorio_pago;
      if (row.recordatorio_pago) return false;
      if (activeTab === 'promesas') return !!row.promesa;
      if (activeTab === 'promesas_vencidas') return row.promesa?.fecha_promesa && row.promesa.fecha_promesa < todayDate();
      if (activeTab === 'pagaron_siguen') return row.pagos15.length > 0;
      if (activeTab === 'mandados_buscar') return !!row.gestion_fisica;
      if (activeTab === 'sin_respuesta') return !row.promesa && !row.ultima_respuesta;
      if (activeTab === 'criticos') return row.prioridad === 'Alta' && (row.dias_atraso >= 31 || !row.promesa);
      return true;
    });
  }, [activeTab, cobradorFiltro, diasFiltro, prioridadFiltro, rows, search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, cobradorFiltro, diasFiltro, prioridadFiltro, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = filteredRows.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const pageEnd = Math.min(filteredRows.length, currentPage * PAGE_SIZE);
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filteredRows],
  );
  const pageNumbers = useMemo(() => {
    const end = Math.min(totalPages, Math.max(5, currentPage + 2));
    const start = Math.max(1, Math.min(currentPage - 2, end - 4));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const saveGestion = async (payload, successTitle) => {
    if (!selected) return;
    setSavingAction(true);
    try {
      const payloads = Array.isArray(payload) ? payload : [payload];
      const rowsToInsert = payloads.map(({ metadata, ...item }) => ({
        cliente_id: selected.cliente_id,
        prestamo_id: selected.prestamo_id,
        ...item,
        metadata: metadata ?? {},
      }));
      const { error } = await supabase.from('cobro_gestiones').insert(rowsToInsert);
      if (error) throw error;
      toast({ title: successTitle });
      await cargar();
      return true;
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar el seguimiento',
        description: e.code === '42P01'
          ? 'Falta aplicar la migracion sql/gestion_cobro_financiera.sql.'
          : e.message,
      });
      return false;
    } finally {
      setSavingAction(false);
    }
  };

  const resetPromiseFields = () => {
    setPromiseForm({ fecha: todayDate(), monto: '', nota: '' });
  };

  const registrarPromesa = async () => {
    if (!promiseForm.fecha) {
      toast({ variant: 'destructive', title: 'Fecha requerida' });
      return;
    }
    const montoPromesa = Number(String(promiseForm.monto).replace(/,/g, '')) || null;
    const respuesta = promiseForm.nota.trim();
    const saved = await saveGestion({
      tipo: 'promesa_pago',
      estado: 'pendiente',
      fecha_promesa: promiseForm.fecha,
      monto_promesa: montoPromesa,
      nota: respuesta || null,
      canal: 'whatsapp',
      metadata: {
        origen: detailTab === 'mensajes' ? 'whatsapp' : 'manual',
      },
    }, detailTab === 'mensajes' ? 'Promesa WhatsApp registrada' : 'Promesa registrada');
    if (saved) resetPromiseFields();
  };

  const mandarABuscar = async () => {
    const saved = await saveGestion({
      tipo: 'mandado_buscar',
      estado: 'mandado_buscar',
      resultado: 'pendiente',
      nota: visitForm.nota || `Cliente fue mandado a buscar dia ${fdate(promiseForm.fecha || todayDate())}.`,
      metadata: { fecha_busqueda: promiseForm.fecha || todayDate(), origen: 'gestion_credito' },
    }, 'Cliente marcado para buscar fisicamente');
    if (saved) resetPromiseFields();
  };

  const registrarVisita = () => saveGestion({
    tipo: 'visita',
    estado: visitForm.resultado === 'resuelto' ? 'cerrada' : 'pendiente',
    resultado: visitForm.resultado,
    nota: visitForm.nota || null,
  }, 'Visita registrada');

  const registrarNota = async () => {
    if (!noteText.trim()) return;
    const saved = await saveGestion({
      tipo: 'nota',
      estado: 'registrada',
      nota: noteText.trim(),
    }, 'Nota registrada');
    if (saved) setNoteText('');
  };

  const registrarNotaLlamada = async () => {
    const nota = noteText.trim();
    if (!nota || nota.toLowerCase() === 'llamada:') {
      toast({ variant: 'destructive', title: 'Nota de llamada requerida' });
      return;
    }
    const montoPromesa = Number(String(promiseForm.monto).replace(/,/g, '')) || null;
    const saved = await saveGestion({
      tipo: 'llamada',
      estado: 'registrada',
      canal: 'telefono',
      resultado: 'respondio',
      nota,
      metadata: {
        fecha_llamada: promiseForm.fecha || todayDate(),
        monto_promesa: montoPromesa,
      },
    }, 'Llamada registrada');
    if (saved) {
      setNoteText('');
      setQuickActionMode('promesa');
      resetPromiseFields();
    }
  };

  const prepararNotaLlamada = () => {
    setDetailTab('notas');
    setQuickActionMode('llamada');
    setNoteText((current) => current.trim() || 'Llamada: ');
  };

  const handlePrimaryAction = () => {
    if (quickActionMode === 'llamada') {
      registrarNotaLlamada();
      return;
    }
    registrarPromesa();
  };

  const primaryActionLabel = quickActionMode === 'llamada'
    ? 'Registrar nota llamada'
    : detailTab === 'mensajes'
      ? 'Registrar promesa WhatsApp'
      : 'Registrar promesa';

  const enviarWhatsapp = () => {
    if (!selected) return;
    const phone = normalizePhone(selected.cliente?.telefono);
    const msg = selected.recordatorio_pago
      ? `Hola ${selected.cliente?.nombre || ''}, le recordamos que su cuota del prestamo ${selected.prestamo_numero} tiene 3 dias vencida por ${money(selected.monto_vencido)}. Por favor indiquenos cuando realizara el pago.`
      : `Hola ${selected.cliente?.nombre || ''}, le recordamos que tiene un atraso de ${money(selected.monto_vencido)} en el prestamo ${selected.prestamo_numero}. Por favor indiquenos la fecha en que realizara el pago.`;
    if (!phone) {
      toast({ variant: 'destructive', title: 'Telefono faltante', description: 'Este cliente no tiene telefono registrado.' });
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    saveGestion({
      tipo: 'mensaje_enviado',
      estado: 'enviado',
      canal: 'whatsapp',
      nota: msg,
      metadata: selected.recordatorio_pago ? {
        origen: 'gestion_cobro_web',
        recordatorio_pago: true,
        recordatorio_cuota_id: selected.recordatorio_cuota_id,
        recordatorio_fecha_vencimiento: selected.recordatorio_fecha_vencimiento,
        dias_atraso: selected.dias_atraso,
      } : {
        origen: 'gestion_cobro_web',
      },
    }, 'Mensaje registrado');
  };

  const timeline = selected?.gestiones || [];

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-4">
      <Helmet><title>Gestion de Cobro - Financiera</title></Helmet>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Gestion de Cobro</h1>
          <p className="text-xs text-slate-500">Seguimiento y gestion de clientes atrasados</p>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading || loadingMore}>
          {loading || loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-9">
        {kpiMeta.map(({ key, label, icon: Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === 'promesasHoy') setActiveTab('promesas');
              if (key === 'recordatorios3') setActiveTab('recordatorio_pago');
              if (key === 'promesasVencidas') setActiveTab('promesas_vencidas');
              if (key === 'pagaron15') setActiveTab('pagaron_siguen');
              if (key === 'mandadosBuscar') setActiveTab('mandados_buscar');
              if (key === 'sinRespuesta') setActiveTab('sin_respuesta');
            }}
            className="min-h-[86px] rounded-lg border bg-white px-3 pb-3 pt-2 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/30"
          >
            <div className="flex items-start gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-tight text-slate-600">{label}</p>
                <p className={`mt-1 font-black text-slate-900 ${
                  key === 'montoVencido'
                    ? '-ml-9 whitespace-nowrap text-[15px] leading-5 tracking-tight'
                    : 'text-lg'
                }`}
                >
                  {key === 'montoVencido' ? money(kpis[key]) : kpis[key]}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <section className="min-w-0 rounded-lg border bg-white shadow-sm">
          <div className="border-b px-3 pt-3">
            <div className="flex gap-2 overflow-x-auto">
              {tabOptions.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`h-9 whitespace-nowrap border-b-2 px-2 text-xs font-bold ${
                    activeTab === tab.key
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-blue-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 border-b p-3 lg:grid-cols-[minmax(220px,1fr)_150px_170px_140px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 text-sm"
                placeholder="Buscar cliente, telefono, cedula o prestamo..."
              />
            </div>
            <Select value={cobradorFiltro} onValueChange={setCobradorFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Cobrador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Cobrador: Todos</SelectItem>
                {cobradores.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={diasFiltro} onValueChange={setDiasFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Dias" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Dias de atraso: Todos</SelectItem>
                <SelectItem value="1 - 7">1 - 7</SelectItem>
                <SelectItem value="8 - 15">8 - 15</SelectItem>
                <SelectItem value="16 - 30">16 - 30</SelectItem>
                <SelectItem value="31+">31+</SelectItem>
              </SelectContent>
            </Select>
            <Select value={prioridadFiltro} onValueChange={setPrioridadFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Prioridad: Todas</SelectItem>
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Media">Media</SelectItem>
                <SelectItem value="Baja">Baja</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9 text-xs">
              <Filter className="mr-2 h-4 w-4" /> Filtros
            </Button>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left">Cliente</th>
                  <th className="px-2 py-2 text-left">Prestamo / Motor</th>
                  <th className="px-2 py-2 text-left">Dias atraso</th>
                  <th className="px-2 py-2 text-right">Vencido</th>
                  <th className="px-2 py-2 text-left">Ult. pago</th>
                  <th className="px-2 py-2 text-left">Ult. respuesta</th>
                  <th className="px-2 py-2 text-left">Promesa de pago</th>
                  <th className="px-2 py-2 text-left">Estado</th>
                  <th className="px-2 py-2 text-left">Prioridad</th>
                  <th className="px-2 py-2 text-right">Accion</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
                )}
                {!loading && filteredRows.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">No hay casos para este filtro.</td></tr>
                )}
                {!loading && paginatedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b last:border-0 hover:bg-blue-50/40 ${selected?.id === row.id ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{row.cliente?.nombre || '-'}</p>
                          <p className="text-slate-500">{row.cliente?.telefono || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <p className="font-bold text-blue-700">{row.prestamo_numero}</p>
                      <p className="max-w-[160px] truncate text-slate-500" title={row.garantia || ''}>{row.garantia || row.tipo || '-'}</p>
                    </td>
                    <td className="px-2 py-2">
                      <p className={`font-bold ${row.recordatorio_pago ? 'text-cyan-700' : 'text-amber-700'}`}>
                        {row.dias_atraso} dias
                      </p>
                      <p className="text-slate-500">
                        {row.recordatorio_pago ? 'Aviso temprano' : `${row.bucket} · ${row.pagos_vencidos_equivalentes} pagos`}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-red-600">{money(row.monto_vencido)}</td>
                    <td className="px-2 py-2">
                      <p>{fdate(row.ultimo_pago?.fecha)}</p>
                      {row.ultimo_pago && <p className="font-bold text-emerald-700">{money(row.ultimo_pago.total_pagado)}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <p className="max-w-[150px] truncate font-medium text-slate-700" title={row.ultima_respuesta?.nota || ''}>
                        {row.ultima_respuesta?.nota || 'Sin respuesta'}
                      </p>
                      <p className="text-slate-400">{fdate(row.ultima_respuesta?.created_at)}</p>
                    </td>
                    <td className="px-2 py-2">
                      {row.promesa ? (
                        <>
                          <p className="font-bold text-blue-700">{fdate(row.promesa.fecha_promesa)}</p>
                          <p className="font-bold text-blue-700">{row.promesa.monto_promesa ? money(row.promesa.monto_promesa) : '-'}</p>
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={badgeClass[row.estado_cobro] || badgeClass['Sin respuesta']}>{row.estado_cobro}</Badge>
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={badgeClass[row.prioridad]}>{row.prioridad}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setSelectedId(row.id); setDetailTab('gestion'); setCaseOpen(true); }}>
                        <Eye className="mr-1 h-3.5 w-3.5" /> Ver caso
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-slate-500">
            <div className="flex flex-wrap gap-3">
              <span><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Promesa para hoy</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Promesa futura</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Promesa vencida</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-violet-400" /> Mandado a buscar</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-cyan-400" /> Recordatorio 3 dias</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Mostrando {pageStart}-{pageEnd} de {filteredRows.length} casos
                {loadingMore ? ' · cargando mas...' : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((pageNumber) => (
                <Button
                  key={pageNumber}
                  variant={pageNumber === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 min-w-8 px-2"
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <Dialog open={caseOpen} onOpenChange={setCaseOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-24px)] max-w-[1120px] overflow-y-auto p-0 [&>button]:hidden">
          {!selected ? (
            <div className="p-8 text-center text-sm text-slate-400">Seleccione un caso de cobro.</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 className="text-base font-bold text-slate-800">Caso de cobro</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => { setCastigarMotivo('incobrable'); setCastigarPass(''); setCastigarOpen(true); }}
                    >
                      <Gavel className="mr-1 h-3.5 w-3.5" /> Castigar cuenta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={abrirReciboCliente}
                    >
                      <Receipt className="mr-1 h-3.5 w-3.5" /> Ver cliente
                    </Button>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">Cliente activo</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      aria-label="Cerrar caso de cobro"
                      onClick={() => setCaseOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <p className="min-w-0 truncate text-lg font-black leading-tight text-slate-900">{selected.cliente?.nombre || '-'}</p>
                      <span className="flex items-center gap-1 text-xs text-slate-600"><Phone className="h-3 w-3" /> {selected.cliente?.telefono || '-'}</span>
                      <span className="text-xs text-slate-500">Cedula: {selected.cliente?.rnc || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="grid gap-3 lg:grid-cols-[1.18fr_0.82fr]">
                  <div className="min-h-[116px] rounded-lg border p-3">
                    <p className="mb-3 text-xs font-black uppercase text-slate-700">Resumen del prestamo</p>
                    <div className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Prestamo:</span>
                        <b className="min-w-0 truncate">{selected.prestamo_numero}</b>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Monto vencido:</span>
                        <b className="min-w-0 truncate text-red-600">{money(selected.monto_vencido)}</b>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Dias de atraso:</span>
                        <b className={selected.recordatorio_pago ? 'text-cyan-700' : 'text-amber-700'}>{selected.dias_atraso} dias</b>
                      </div>
                      {selected.recordatorio_pago && (
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="shrink-0 text-slate-500">Recordatorio:</span>
                          <b className="min-w-0 truncate text-cyan-700">{fdate(selected.recordatorio_fecha_vencimiento)}</b>
                        </div>
                      )}
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Pagos vencidos:</span>
                        <b>{selected.pagos_vencidos_equivalentes}</b>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Ultimo pago:</span>
                        <b className="min-w-0 truncate">{fdate(selected.ultimo_pago?.fecha)}</b>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Motor/Garantia:</span>
                        <b className="min-w-0 truncate" title={selected.garantia || ''}>{selected.garantia || '-'}</b>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-500">Pago ult. 15 dias:</span>
                        <b className={selected.pagos15.length ? 'text-emerald-700' : ''}>{selected.pagos15.length ? 'Si' : 'No'}</b>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-[116px] rounded-lg border p-3">
                    <p className="mb-3 text-xs font-black uppercase text-slate-700">Promesa de pago actual</p>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2">
                        <span className="text-slate-500">Fecha prometida:</span>
                        <b className="text-right">{fdate(selected.promesa?.fecha_promesa)}</b>
                      </div>
                      <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2">
                        <span className="text-slate-500">Monto prometido:</span>
                        <b className="text-right">{selected.promesa?.monto_promesa ? money(selected.promesa.monto_promesa) : '-'}</b>
                      </div>
                      <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2">
                        <span className="text-slate-500">Estado:</span>
                        <div className="flex justify-end">
                          <Badge variant="outline" className={badgeClass[selected.estado_cobro] || badgeClass['Sin respuesta']}>{selected.estado_cobro}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="flex gap-2 overflow-x-auto">
                    {['gestion', 'pagos', 'mensajes', 'visitas', 'notas'].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setDetailTab(tab);
                          if (tab !== 'notas') setQuickActionMode('promesa');
                        }}
                        className={`h-9 border-b-2 px-2 text-xs font-bold capitalize ${
                          detailTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {detailTab === 'gestion' && (
                  <div className="max-h-[218px] space-y-3 overflow-y-auto pr-1">
                    {timeline.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Sin gestiones registradas.</p>}
                    {timeline.map((g) => (
                      <div key={g.id} className="flex gap-3 text-xs">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          {g.tipo === 'promesa_pago' ? <CalendarClock className="h-4 w-4" /> : g.tipo === 'llamada' ? <Phone className="h-4 w-4" /> : g.tipo === 'mandado_buscar' || g.tipo === 'visita' ? <MapPin className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1 border-b pb-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <p className="font-bold text-slate-800">{g.tipo?.replaceAll('_', ' ') || 'Gestion'}</p>
                            <span className="text-slate-500">{fdate(g.created_at)}</span>
                            {g.metadata?.fecha_llamada && (
                              <span className="text-slate-500">
                                Llamada: {fdate(g.metadata.fecha_llamada)}
                                {g.metadata?.monto_promesa ? ` · ${money(g.metadata.monto_promesa)}` : ''}
                              </span>
                            )}
                            {g.metadata?.fecha_busqueda && <span className="text-slate-500">Busqueda: {fdate(g.metadata.fecha_busqueda)}</span>}
                            {g.fecha_promesa && (
                              <span className="text-slate-500">
                                Promesa: {fdate(g.fecha_promesa)}
                                {g.monto_promesa ? ` · ${money(g.monto_promesa)}` : ''}
                              </span>
                            )}
                          </div>
                          {g.nota && <p className="mt-1 text-slate-700">{g.nota}</p>}
                          {g.resultado && <p className="mt-1 text-slate-500">Resultado: {g.resultado}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'pagos' && (
                  <div className="space-y-2 text-xs">
                    {selected.pagos15.length === 0 && <p className="py-4 text-center text-slate-400">Sin pagos en los ultimos 15 dias.</p>}
                    {selected.pagos15.map((p) => (
                      <div key={p.id} className="flex justify-between rounded-md border p-2">
                        <span>{fdate(p.fecha)}</span>
                        <b className="text-emerald-700">{money(p.total_pagado)}</b>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'mensajes' && (
                  <div className="space-y-2">
                    <Textarea
                      value={promiseForm.nota}
                      onChange={(e) => setPromiseForm((prev) => ({ ...prev, nota: e.target.value }))}
                      placeholder="Nota o respuesta del cliente..."
                      className="min-h-[80px] text-xs"
                    />
                  </div>
                )}

                {detailTab === 'visitas' && (
                  <div className="space-y-2">
                    <Select value={visitForm.resultado} onValueChange={(value) => setVisitForm((prev) => ({ ...prev, resultado: value }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="no_estaba">No estaba</SelectItem>
                        <SelectItem value="prometio_pagar">Prometio pagar</SelectItem>
                        <SelectItem value="direccion_incorrecta">Direccion incorrecta</SelectItem>
                        <SelectItem value="resuelto">Resuelto</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={visitForm.nota}
                      onChange={(e) => setVisitForm((prev) => ({ ...prev, nota: e.target.value }))}
                      placeholder="Nota de visita..."
                      className="min-h-[80px] text-xs"
                    />
                    <Button variant="outline" className="w-full" onClick={registrarVisita} disabled={savingAction}>
                      Registrar visita
                    </Button>
                  </div>
                )}

                {detailTab === 'notas' && (
                  <div className="space-y-2">
                    <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Nota interna..." className="min-h-[90px] text-xs" />
                    {quickActionMode !== 'llamada' && (
                      <Button variant="outline" className="w-full" onClick={registrarNota} disabled={savingAction}>
                        Guardar nota
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-black uppercase text-slate-700">Acciones rapidas</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <Button variant="outline" className="h-11 justify-start text-xs" onClick={() => { setQuickActionMode('promesa'); enviarWhatsapp(); }} disabled={savingAction}>
                      <MessageCircle className="mr-2 h-4 w-4" /> Enviar WhatsApp
                    </Button>
                    <Button variant="outline" className="h-11 justify-start text-xs" onClick={prepararNotaLlamada}>
                      <Phone className="mr-2 h-4 w-4" /> Registrar llamada
                    </Button>
                    <Button variant="outline" className="h-11 justify-start text-xs" onClick={() => { setQuickActionMode('promesa'); setDetailTab('visitas'); }}>
                      <MapPin className="mr-2 h-4 w-4" /> Registrar visita
                    </Button>
                    <Button variant="outline" className="h-11 justify-start text-xs" onClick={() => { setQuickActionMode('promesa'); mandarABuscar(); }} disabled={savingAction}>
                      <UserCheck className="mr-2 h-4 w-4" /> Mandar a buscar
                    </Button>
                    <Input
                      type="date"
                      value={promiseForm.fecha}
                      onChange={(e) => setPromiseForm((prev) => ({ ...prev, fecha: e.target.value }))}
                      className="h-11 text-xs"
                    />
                    <Input
                      value={promiseForm.monto}
                      onChange={(e) => setPromiseForm((prev) => ({ ...prev, monto: e.target.value }))}
                      placeholder="Monto"
                      className="h-11 text-xs"
                    />
                  </div>
                  <Button className="w-full" onClick={handlePrimaryAction} disabled={savingAction}>
                    {savingAction ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : quickActionMode === 'llamada' ? (
                      <Phone className="mr-2 h-4 w-4" />
                    ) : (
                      <CalendarClock className="mr-2 h-4 w-4" />
                    )}
                    {primaryActionLabel}
                  </Button>
                </div>
              </div>
            </div>
          )}
          </DialogContent>
        </Dialog>

        {/* Castigar cuenta activa (autorización del creador) */}
        <Dialog open={castigarOpen} onOpenChange={(o) => { setCastigarOpen(o); if (!o) setCastigarPass(''); }}>
          <DialogContent className="max-w-md">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Gavel className="h-4 w-4 text-red-600" /> Castigar cuenta activa</h3>
            <p className="text-sm text-slate-500">
              {selected?.prestamo_numero} · {selected?.cliente?.nombre}. Pasará a <b>Cuentas Incobrables</b> (fuera de cobranza y métricas). Recuperable si el cliente paga.
            </p>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-500">Motivo</label>
                <Select value={castigarMotivo} onValueChange={setCastigarMotivo}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incobrable">Incobrable</SelectItem>
                    <SelectItem value="vehiculo_robado">Vehículo robado</SelectItem>
                    <SelectItem value="perdida_total">Pérdida total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!puedeSinClave && (
                <div>
                  <label className="text-xs font-bold text-slate-500">Contraseña del creador de la empresa</label>
                  <Input type="password" autoComplete="off" value={castigarPass}
                    onChange={(e) => setCastigarPass(e.target.value)} placeholder="Requerida para autorizar" />
                  <p className="text-[11px] text-slate-400 mt-1">Solo el creador (o super-admin) puede castigar sin contraseña.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" onClick={() => setCastigarOpen(false)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={confirmarCastigo} disabled={castigando}>
                {castigando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gavel className="h-4 w-4 mr-2" />}Castigar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default GestionCobroPage;
