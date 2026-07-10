import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useLayout } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, Loader2, Save, X, Search, FilePlus, Gavel, Printer, Pencil, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { printReciboPagoFinancieraPOS } from '@/lib/printPOS';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import OtrasTransaccionesModal from '@/components/financiera/OtrasTransaccionesModal';
import { round2 } from '@/components/financiera/amortizacion';
import { formatFechaDMY } from '@/lib/dateUtils';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Date().toISOString().slice(0, 10);
const FORMAS = ['Efectivo', 'Cheque', 'Tarjeta', 'Transferencia'];
const DIAS_GRACIA_PAGO = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const diasDesde = (fecha, hasta = hoy()) => {
  if (!fecha) return 0;
  const inicio = new Date(`${fecha}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  return Math.max(0, Math.floor((fin.getTime() - inicio.getTime()) / DAY_MS));
};

const cuotaSuperaGracia = (cuota) => {
  const pendiente = Number(cuota?.pendiente ?? 0) > 0;
  return pendiente && diasDesde(cuota?.fecha_vencimiento) > DIAS_GRACIA_PAGO;
};

const cuotaInteresPendiente = (cuota) => (
  Boolean(cuota?.es_interes_corriente) && Number(cuota?.pendiente ?? 0) > 0
);

const estadoPorCuotas = (cuotas = []) => {
  const vencidas = cuotas.filter(cuotaSuperaGracia);
  const pagosVencidosEquivalentes = vencidas.length + (cuotas.some(cuotaInteresPendiente) ? 1 : 0);
  if (pagosVencidosEquivalentes >= 2) return { txt: 'MOROSO', cls: 'text-orange-600' };
  if (pagosVencidosEquivalentes === 1) return { txt: 'SEGUIMIENTO', cls: 'text-amber-600' };
  return { txt: 'AL DIA', cls: 'text-emerald-600' };
};

// Formatea el texto del Monto Pagado con separador de miles y decimales
const fmtMontoInput = (raw) => {
  if (raw === '' || raw == null) return '';
  const [ip, dp] = String(raw).split('.');
  const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
  return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
};

const cleanLoanNumber = (value) => {
  const raw = String(value || '').trim();
  const duplicatedLegacy = raw.match(/^(PT-\d+)-2\d+$/i);
  return duplicatedLegacy ? duplicatedLegacy[1] : raw;
};

const ReciboPagoFinancieraPage = ({ extraData = null }) => {
  const { toast } = useToast();
  const { empresa, profile, user } = useAuth();
  // Nombre del usuario logueado — sale debajo de "Recibido por" en el recibo
  const usuarioActual = profile?.full_name || profile?.nombre_completo || user?.email || '';

  // En reimpresiones se muestra quien HIZO el recibo (si se sabe); si no, el logueado
  const nombreUsuarioDePago = async (createdBy) => {
    if (!createdBy) return usuarioActual;
    const { data: prof } = await supabase.from('profiles').select('full_name, email').eq('id', createdBy).maybeSingle();
    return prof?.full_name || prof?.email || usuarioActual;
  };
  const { closePanel, activePanel } = usePanels();
  const { setSidebarOpen } = useLayout();
  const lastAutoClienteKeyRef = useRef(null);

  // Al abrir el Recibo de Pago, cerrar el menu lateral para ganar espacio
  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [cliente, setCliente] = useState(null);
  const [otrasOpen, setOtrasOpen] = useState(false); // modal Otras Transacciones (cargos)
  const [moraOn, setMoraOn] = useState(true);      // cotejo Generar Cargos por Atrasos (MORA)
  const [moraPctText, setMoraPctText] = useState('0'); // tasa de mora del cliente
  // Tasa default de la empresa (se lee de la BD, no del contexto: el objeto
  // empresa de la sesión puede ser anterior a la columna mora_pct_default)
  const [moraDefaultRef, setMoraDefaultRef] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('config_empresa').select('mora_pct_default').limit(1).maybeSingle();
      setMoraDefaultRef(Number(data?.mora_pct_default) || 0);
    })();
  }, []);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [estado, setEstado] = useState(null);
  const [clienteMandadoBuscar, setClienteMandadoBuscar] = useState(false);
  const [promesa, setPromesa] = useState(null); // promesa de pago activa (Gestión de Cobro)
  const [ultimoPago, setUltimoPago] = useState(null);
  const [numero, setNumero] = useState('—');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prestamoFiltro, setPrestamoFiltro] = useState('todos');
  const [abonos, setAbonos] = useState({}); // { rowKey: monto abonado }
  const [editKey, setEditKey] = useState(null); // fila cuyo abono se esta editando
  const [selKey, setSelKey] = useState(null); // fila seleccionada (resaltado azul)
  const [montoText, setMontoText] = useState(''); // texto del campo Monto Pagado
  const [forma, setForma] = useState('Efectivo');
  const [cuenta, setCuenta] = useState('');
  const [banco, setBanco] = useState('');
  const [cobrador, setCobrador] = useState(empresa?.nombre || '');
  const [comentarios, setComentarios] = useState('');
  const [imprimir, setImprimir] = useState(true);
  // Tamaño del papel del recibo — se recuerda por PC (cada caja tiene su impresora)
  const [paperSize, setPaperSize] = useState(() => localStorage.getItem('recibo_financiera_paper') || '4inch');
  const cambiarPapel = (v) => { setPaperSize(v); localStorage.setItem('recibo_financiera_paper', v); };
  // Opciones > Reimprimir: número de recibo editable (null = modo normal)
  const [reimpNumero, setReimpNumero] = useState(null);
  const [reimpBusy, setReimpBusy] = useState(false);
  // Opciones > Editar: cambiar forma de pago de un recibo grabado
  const esAdminUser = ['admin', 'owner'].includes(profile?.role);
  const [editOpen, setEditOpen] = useState(false);
  const [editNumero, setEditNumero] = useState('');
  const [editInfo, setEditInfo] = useState(null); // { numero, cliente, monto, forma }
  const [editForma, setEditForma] = useState('Efectivo');
  const [editCuenta, setEditCuenta] = useState('');
  const [editBanco, setEditBanco] = useState('');
  const [editPass, setEditPass] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => { if (empresa?.nombre && !cobrador) setCobrador(empresa.nombre); }, [empresa, cobrador]);

  const cargarProximoNumero = useCallback(async () => {
    try {
      const { data } = await supabase.from('prestamo_pagos').select('numero').order('created_at', { ascending: false }).limit(1);
      const last = data?.[0]?.numero ? parseInt(String(data[0].numero).replace(/\D/g, ''), 10) : 0;
      setNumero(String((last || 0) + 1).padStart(7, '0'));
    } catch { setNumero('—'); }
  }, []);

  useEffect(() => { cargarProximoNumero(); }, [cargarProximoNumero]);

  const cargarEstado = useCallback(async (clienteId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_prestamos_cliente', { p_cliente_id: clienteId });
      if (error) throw error;
      setEstado(data);

      const { data: gestionBuscar, error: gestionError } = await supabase
        .from('cobro_gestiones')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('tipo', 'mandado_buscar')
        .eq('estado', 'mandado_buscar')
        .limit(1)
        .maybeSingle();
      if (gestionError && gestionError.code !== 'PGRST116' && gestionError.code !== '42P01') throw gestionError;
      setClienteMandadoBuscar(!!gestionBuscar);

      // Promesa de pago activa (registrada en Gestión de Cobro): se muestra
      // con su fecha y monto en la cabecera del recibo
      const { data: proms, error: promError } = await supabase
        .from('cobro_gestiones')
        .select('fecha_promesa, monto_promesa, estado, created_at')
        .eq('cliente_id', clienteId)
        .eq('tipo', 'promesa_pago')
        .not('estado', 'in', '(cumplida,cancelada)')
        .order('created_at', { ascending: false })
        .limit(1);
      if (promError && promError.code !== '42P01') console.warn('promesa:', promError.message);
      setPromesa(proms?.[0]?.fecha_promesa ? proms[0] : null);

      // Estado de la mora del cliente (para el switch en tiempo real).
      // El campo muestra la tasa EFECTIVA: la del cliente, o la default de la
      // empresa cuando el cliente esta en 0 — asi se nota que el cotejo esta
      // encendido y cobrando (el guardado sigue siendo por cliente).
      const { data: cliMora } = await supabase
        .from('clientes').select('generar_mora, mora_pct').eq('id', clienteId).maybeSingle();
      if (cliMora) {
        const on = cliMora.generar_mora ?? true;
        const tasaCli = Number(cliMora.mora_pct) || 0;
        const efectiva = tasaCli > 0 ? tasaCli : moraDefaultRef;
        setMoraOn(on);
        setMoraPctText(String(on ? efectiva : tasaCli));
      }

      // Último pago (capital/interés/mora) — best effort. Se trae completo
      // para poder REIMPRIMIR el recibo con el formato del ticket móvil.
      const { data: pago } = await supabase
        .from('prestamo_pagos')
        .select('id, numero, fecha, forma_pago, cobrador, comentarios, cuenta_numero, banco, total_pagado, balance_anterior, balance_actual')
        .eq('cliente_id', clienteId).eq('anulado', false)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (pago) {
        const { data: det } = await supabase
          .from('prestamo_pago_detalle')
          .select('abono_capital, abono_interes, abono_mora, abono_total, prestamo_cuotas:cuota_id(numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, capital_pagado, interes_pagado, prestamos:prestamo_id(numero, plazo_cuotas))')
          .eq('pago_id', pago.id);
        const s = (det || []).reduce((a, d) => ({
          cap: a.cap + Number(d.abono_capital || 0),
          int: a.int + Number(d.abono_interes || 0),
          mora: a.mora + Number(d.abono_mora || 0),
        }), { cap: 0, int: 0, mora: 0 });
        setUltimoPago({ fecha: pago.fecha, ...s, pago, detalle: det || [] });
      } else {
        setUltimoPago(null);
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el estado', description: e.message });
      setEstado(null);
      setClienteMandadoBuscar(false);
    }
    setLoading(false);
  }, [toast, moraDefaultRef]);

  // Switch de mora en tiempo real: actualiza el cliente y recalcula el estado.
  const toggleMora = async (checked) => {
    if (!cliente) return;
    setMoraOn(checked);
    const { error } = await supabase.from('clientes').update({ generar_mora: checked }).eq('id', cliente.id);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo cambiar la mora', description: error.message }); return; }
    setAbonos({}); setMontoText('');
    cargarEstado(cliente.id);
  };
  const guardarMoraPct = async () => {
    if (!cliente) return;
    const val = parseFloat(moraPctText) || 0;
    const { error } = await supabase.from('clientes').update({ mora_pct: val }).eq('id', cliente.id);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo cambiar la tasa', description: error.message }); return; }
    setAbonos({}); setMontoText('');
    cargarEstado(cliente.id);
  };

  const seleccionarCliente = useCallback((c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    setAbonos({}); setEditKey(null); setMontoText(''); setComentarios(''); setPrestamoFiltro('todos');
    cargarEstado(c.id);
  }, [cargarEstado]);

  useEffect(() => {
    const clienteId = extraData?.clienteId;
    if (!clienteId) return;

    const autoKey = `${clienteId}:${extraData?.requestedAt || ''}`;
    if (lastAutoClienteKeyRef.current === autoKey) return;
    lastAutoClienteKeyRef.current = autoKey;

    if (extraData?.cliente?.id === clienteId) {
      seleccionarCliente(extraData.cliente);
      if (extraData?.prestamoId) setPrestamoFiltro(extraData.prestamoId);
      return;
    }

    let cancelled = false;
    const cargarClientePreseleccionado = async () => {
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nombre, codigo, rnc, direccion, telefono')
          .eq('id', clienteId)
          .eq('activo', true)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (data) {
          seleccionarCliente(data);
          if (extraData?.prestamoId) setPrestamoFiltro(extraData.prestamoId);
        } else {
          toast({ variant: 'destructive', title: 'Cliente no encontrado', description: 'No se pudo cargar el cliente seleccionado desde Gestion de Cobro.' });
        }
      } catch (e) {
        if (!cancelled) {
          toast({ variant: 'destructive', title: 'Error al cargar cliente', description: e.message });
        }
      }
    };

    cargarClientePreseleccionado();
    return () => { cancelled = true; };
  }, [extraData, seleccionarCliente, toast]);

  // Buscar cliente escribiendo el código o la cédula y presionando Enter
  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`)
        .eq('activo', true)
        .limit(1);
      if (error) throw error;
      if (data && data.length) {
        seleccionarCliente(data[0]);
      } else {
        toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  const nuevo = () => {
    setCliente(null); setEstado(null); setClienteMandadoBuscar(false); setUltimoPago(null); setCodigoInput(''); setPromesa(null);
    setAbonos({}); setEditKey(null); setMontoText(''); setComentarios(''); setForma('Efectivo'); setCuenta(''); setBanco('');
    setPrestamoFiltro('todos'); setReimpNumero(null); cargarProximoNumero();
  };

  // Opciones > Reimprimir: habilita el campo Número editable, pre-llenado
  // con el último recibo emitido (de cualquier cliente)
  const iniciarReimpresion = async () => {
    try {
      const { data } = await supabase.from('prestamo_pagos')
        .select('numero, fecha')
        .order('fecha', { ascending: false })
        .limit(50);
      const ultimo = (data || [])
        .map((r) => ({ n: r.numero, d: Number(String(r.numero).replace(/\D/g, '')) || 0 }))
        .sort((a, b) => b.d - a.d)[0];
      setReimpNumero(ultimo?.n || '');
    } catch {
      setReimpNumero('');
    }
  };

  // Busca el recibo por número (acepta con o sin el prefijo RI- y sin ceros)
  const reimprimirPorNumero = async () => {
    const raw = String(reimpNumero || '').trim();
    if (!raw) return;
    setReimpBusy(true);
    try {
      const dig = raw.replace(/\D/g, '');
      const candidatos = [...new Set([raw, dig.padStart(7, '0'), `RI-${dig.padStart(7, '0')}`])].filter(Boolean);
      let pago = null;
      for (const n of candidatos) {
        const { data } = await supabase.from('prestamo_pagos').select('*').eq('numero', n).limit(1);
        if (data && data.length) { pago = data[0]; break; }
      }
      if (!pago) {
        toast({ variant: 'destructive', title: 'Recibo no encontrado', description: `No existe el recibo "${raw}".` });
        return;
      }
      const [{ data: cli }, { data: det }] = await Promise.all([
        supabase.from('clientes').select('nombre, codigo, rnc').eq('id', pago.cliente_id).maybeSingle(),
        supabase.from('prestamo_pago_detalle')
          .select('abono_total, cuota:cuota_id (numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, capital_pagado, interes_pagado, prestamos(numero, plazo_cuotas))')
          .eq('pago_id', pago.id),
      ]);
      printReciboPagoFinancieraPOS({
        numero: pago.numero,
        fecha: pago.fecha,
        hora: pago.created_at || null,
        usuario: await nombreUsuarioDePago(pago.created_by),
        clienteNombre: cli?.nombre,
        clienteCodigo: cli?.codigo || cli?.rnc || null,
        totalPagado: pago.total_pagado,
        balanceAnterior: pago.balance_anterior,
        balanceActual: pago.balance_actual,
        formaPago: pago.forma_pago,
        cuenta: pago.cuenta_numero || null,
        banco: pago.banco || null,
        comentarios: pago.comentarios || null,
        cobrador: pago.cobrador || null,
        detalles: (det || []).map((d) => {
          const q = d.cuota;
          return {
            documento: cleanLoanNumber(q?.prestamos?.numero || ''),
            referencia: q ? `${String(q.numero_cuota).padStart(3, '0')}/${String(q.prestamos?.plazo_cuotas || 0).padStart(3, '0')}` : '',
            fecha: q?.fecha_vencimiento || pago.fecha,
            monto: q?.monto_cuota || d.abono_total,
            abono: d.abono_total,
            pendiente: q ? Math.max(round2((Number(q.capital) - Number(q.capital_pagado)) + (Number(q.interes) - Number(q.interes_pagado))), 0) : 0,
          };
        }),
      }, paperSize);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo reimprimir', description: e.message });
    } finally {
      setReimpBusy(false);
    }
  };

  // ── Opciones > Editar (forma de pago de un recibo grabado) ──
  const abrirEditar = async () => {
    setEditInfo(null); setEditPass(''); setEditCuenta(''); setEditBanco('');
    try {
      const { data } = await supabase.from('prestamo_pagos')
        .select('numero, fecha').order('fecha', { ascending: false }).limit(50);
      const ultimo = (data || [])
        .map((r) => ({ n: r.numero, d: Number(String(r.numero).replace(/\D/g, '')) || 0 }))
        .sort((a, b) => b.d - a.d)[0];
      setEditNumero(ultimo?.n || '');
    } catch { setEditNumero(''); }
    setEditOpen(true);
  };

  const buscarEditPago = async () => {
    const raw = String(editNumero || '').trim();
    if (!raw) return;
    setEditBusy(true);
    try {
      const dig = raw.replace(/\D/g, '');
      const candidatos = [...new Set([raw, dig.padStart(7, '0'), `RI-${dig.padStart(7, '0')}`])].filter(Boolean);
      let pago = null;
      for (const n of candidatos) {
        const { data } = await supabase.from('prestamo_pagos').select('*').eq('numero', n).eq('anulado', false).limit(1);
        if (data && data.length) { pago = data[0]; break; }
      }
      if (!pago) {
        toast({ variant: 'destructive', title: 'Recibo no encontrado', description: `No existe el recibo "${raw}".` });
        setEditInfo(null);
        return;
      }
      const { data: cli } = await supabase.from('clientes').select('nombre').eq('id', pago.cliente_id).maybeSingle();
      setEditInfo({ numero: pago.numero, cliente: cli?.nombre || '—', monto: pago.total_pagado, forma: pago.forma_pago || 'Efectivo' });
      setEditForma(pago.forma_pago || 'Efectivo');
      setEditCuenta(pago.cuenta_numero || '');
      setEditBanco(pago.banco || '');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    } finally {
      setEditBusy(false);
    }
  };

  const guardarEdicion = async () => {
    if (!editInfo) return;
    if (!esAdminUser && !editPass.trim()) {
      toast({ variant: 'destructive', title: 'Falta la contraseña administrativa' });
      return;
    }
    setEditBusy(true);
    try {
      const { error } = await supabase.rpc('editar_forma_pago_recibo', {
        p_numero: editInfo.numero,
        p_forma: editForma,
        p_cuenta: editCuenta.trim() || null,
        p_banco: editBanco.trim() || null,
        p_password: esAdminUser ? null : editPass,
      });
      if (error) throw error;
      toast({ title: 'Recibo actualizado', description: `${editInfo.numero} → ${editForma}` });
      setEditOpen(false);
      if (cliente) cargarEstado(cliente.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo editar', description: e.message });
    } finally {
      setEditBusy(false);
    }
  };

  const cuotas = estado?.cuotas || [];
  const cargos = estado?.cargos || []; // Otras Transacciones (cargos manuales)
  const prestamosUnicos = useMemo(
    () => [...new Map(cuotas.map((c) => [c.prestamo_id, cleanLoanNumber(c.prestamo_numero)])).entries()].map(([id, num]) => ({ id, num })),
    [cuotas]
  );
  const cuotasFiltradas = useMemo(
    () => (prestamoFiltro === 'todos' ? cuotas : cuotas.filter((c) => c.prestamo_id === prestamoFiltro)),
    [cuotas, prestamoFiltro]
  );
  // Los cargos son a nivel cliente: se muestran con "Todos…" o si coinciden con el préstamo filtrado
  const cargosFiltrados = useMemo(
    () => (prestamoFiltro === 'todos' ? cargos : cargos.filter((c) => c.prestamo_id === prestamoFiltro)),
    [cargos, prestamoFiltro]
  );

  const capitalPend = cuotasFiltradas.reduce((a, c) => a + Number(c.capital_pend || 0), 0);
  const interesPend = cuotasFiltradas.reduce((a, c) => a + Number(c.interes_pend || 0), 0);
  const moraPend = cuotasFiltradas.reduce((a, c) => a + Number(c.mora_pend || 0), 0);
  const cargosPend = cargosFiltrados.reduce((a, c) => a + Number(c.pendiente || 0), 0);
  const balanceAnterior = round2(capitalPend + interesPend + moraPend + cargosPend);
  // Filas de la tabla (MORA y cargos como lineas aparte). El abono se marca por fila.
  const filas = useMemo(() => {
    const out = [];
    cuotasFiltradas.forEach((c) => {
      if (Number(c.mora_pend) > 0) {
        out.push({
          key: `${c.cuota_id}-mora`, cuota_id: c.cuota_id, esMora: true, esCargo: false,
          fecha: hoy(), vence: c.fecha_vencimiento, origen: '>>MORA<<',
          referencia: c.referencia, descripcion: 'Cargos por Atrasos (MORA)',
          monto: round2(c.mora_pend), pendiente: round2(c.mora_pend),
          capital_pend: 0, interes_pend: 0, mora_pend: round2(c.mora_pend),
        });
      }
      out.push({
        key: `${c.cuota_id}-fin`, cuota_id: c.cuota_id, esMora: false, esCargo: false,
        fecha: c.fecha || '', vence: c.fecha_vencimiento, origen: cleanLoanNumber(c.prestamo_numero),
        referencia: c.referencia, descripcion: 'Financiamiento',
        monto: round2(c.monto_cuota), pendiente: round2(Number(c.capital_pend) + Number(c.interes_pend)),
        capital_pend: round2(c.capital_pend), interes_pend: round2(c.interes_pend), mora_pend: 0,
      });
    });
    // Cargos manuales (Otras Transacciones) como filas cobrables
    cargosFiltrados.forEach((cg) => {
      out.push({
        key: `cargo-${cg.cargo_id}`, cargo_id: cg.cargo_id, esMora: false, esCargo: true,
        fecha: cg.fecha || '', vence: cg.fecha || '', origen: cg.numero,
        referencia: cg.concepto || '', descripcion: cg.tipo + (cg.descripcion ? ` · ${cg.descripcion}` : ''),
        monto: round2(cg.monto), pendiente: round2(cg.pendiente),
        capital_pend: 0, interes_pend: 0, mora_pend: 0,
      });
    });
    return out;
  }, [cuotasFiltradas, cargosFiltrados]);

  const montoNum = round2(filas.reduce((a, r) => a + (Number(abonos[r.key]) || 0), 0));
  const balanceActual = Math.max(round2(balanceAnterior - montoNum), 0);

  // Desglose del abono actual (capital / interes / mora): el abono de cada
  // cuota cubre primero interes y luego capital; la mora va en su propia fila.
  const desglose = useMemo(() => {
    let cap = 0, int = 0, mora = 0;
    filas.forEach((r) => {
      const ab = Number(abonos[r.key]) || 0;
      if (ab <= 0) return;
      if (r.esCargo) return; // los cargos no son capital/interés/mora
      if (r.esMora) { mora += ab; }
      else { const i = Math.min(ab, r.interes_pend); int += i; cap += round2(ab - i); }
    });
    return { cap: round2(cap), int: round2(int), mora: round2(mora) };
  }, [filas, abonos]);
  const abonoCapital = desglose.cap;
  const abonoInteres = desglose.int;
  const abonoMora = desglose.mora;

  const sumaAbonos = (mapa) => round2(filas.reduce((a, f) => a + (Number(mapa[f.key]) || 0), 0));

  // Fija el abono de una fila (tope: su pendiente) y sincroniza el Monto Pagado
  const setAbonoFila = (r, val) => {
    const n = Math.min(Math.max(round2(Number(val) || 0), 0), round2(r.pendiente));
    const next = { ...abonos, [r.key]: n };
    setAbonos(next);
    const s = sumaAbonos(next);
    setMontoText(s ? String(s) : '');
  };

  // Teclear un total en Monto Pagado -> repartir entre cuotas (mas vieja primero)
  const distribuirTotal = (total) => {
    let rest = round2(Number(total) || 0);
    const next = {};
    filas.forEach((r) => {
      const ab = Math.min(rest, r.pendiente);
      if (ab > 0) next[r.key] = round2(ab);
      rest = round2(rest - ab);
    });
    setAbonos(next);
  };

  // Estado del cliente segun su condicion (no se elige a mano):
  //  verde AL DIA (sin cuotas vencidas) · amarillo SEGUIMIENTO (atraso <=30d) · rojo SE BUSCA (>30d)
  // Regla actual: 0-3 dias = AL DIA; 2+ pagos equivalentes = MOROSO; 1 equivalente = SEGUIMIENTO; SE BUSCA es manual.
  const estadoCliente = (() => {
    if (!cliente) return null;
    if (clienteMandadoBuscar) return { txt: 'SE BUSCA', cls: 'text-red-600' };
    const cuotasP = estado?.cuotas || [];
    return estadoPorCuotas(cuotasP);
    if (!hayVencida) return { txt: 'AL DÍA', cls: 'text-emerald-600' };
  })();

  // Reimprime el ÚLTIMO pago del cliente con el mismo formato del ticket móvil
  const reimprimirUltimoPago = async () => {
    const p = ultimoPago?.pago;
    if (!p) return;
    printReciboPagoFinancieraPOS({
      numero: p.numero,
      fecha: p.fecha,
      hora: p.created_at || null,
      usuario: await nombreUsuarioDePago(p.created_by),
      clienteNombre: cliente?.nombre,
      clienteCodigo: cliente?.codigo || cliente?.rnc || null,
      totalPagado: p.total_pagado,
      balanceAnterior: p.balance_anterior,
      balanceActual: p.balance_actual,
      formaPago: p.forma_pago,
      cuenta: p.cuenta_numero || null,
      banco: p.banco || null,
      comentarios: p.comentarios || null,
      cobrador: p.cobrador || null,
      detalles: (ultimoPago.detalle || []).map((d) => {
        const q = d.prestamo_cuotas;
        return {
          documento: cleanLoanNumber(q?.prestamos?.numero || ''),
          referencia: q ? `${String(q.numero_cuota).padStart(3, '0')}/${String(q.prestamos?.plazo_cuotas || 0).padStart(3, '0')}` : '',
          fecha: q?.fecha_vencimiento || p.fecha,
          monto: q?.monto_cuota || d.abono_total,
          abono: d.abono_total,
          pendiente: q ? Math.max(round2((Number(q.capital) - Number(q.capital_pagado)) + (Number(q.interes) - Number(q.interes_pagado))), 0) : 0,
        };
      }),
    }, paperSize);
  };

  const handleGrabar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(montoNum > 0)) { toast({ variant: 'destructive', title: 'Marca el abono de al menos una cuota' }); return; }
    if (montoNum > balanceAnterior + 0.01) { toast({ variant: 'destructive', title: 'El monto excede el balance pendiente' }); return; }

    // Abonos exactos por cuota (interes antes que capital; mora en su fila)
    // y abonos a cargos manuales (Otras Transacciones) por separado.
    const map = {};
    const cargosAlloc = [];
    filas.forEach((r) => {
      const ab = Number(abonos[r.key]) || 0;
      if (ab <= 0) return;
      if (r.esCargo) { cargosAlloc.push({ cargo_id: r.cargo_id, monto: round2(ab) }); return; }
      if (!map[r.cuota_id]) map[r.cuota_id] = { cuota_id: r.cuota_id, capital: 0, interes: 0, mora: 0 };
      if (r.esMora) {
        map[r.cuota_id].mora = round2(map[r.cuota_id].mora + ab);
      } else {
        const i = Math.min(ab, r.interes_pend);
        map[r.cuota_id].interes = round2(map[r.cuota_id].interes + i);
        map[r.cuota_id].capital = round2(map[r.cuota_id].capital + (ab - i));
      }
    });
    const allocations = Object.values(map);

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('registrar_pago_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: montoNum,
        p_forma_pago: forma,
        p_cuenta: cuenta || null,
        p_banco: banco || null,
        p_comentarios: comentarios || null,
        p_cobrador: cobrador || null,
        p_fecha: null,
        p_prestamo_id: prestamoFiltro === 'todos' ? null : prestamoFiltro,
        p_abonos: allocations,
        p_cargos: cargosAlloc,
      });
      if (error) throw error;
      const { error: gestionPagoError } = await supabase
        .from('cobro_gestiones')
        .update({
          estado: 'cerrada',
          resultado: 'pago_recibido',
        })
        .eq('cliente_id', cliente.id)
        .eq('tipo', 'mandado_buscar')
        .eq('estado', 'mandado_buscar');
      if (gestionPagoError && gestionPagoError.code !== '42P01') throw gestionPagoError;
      setClienteMandadoBuscar(false);
      toast({ title: 'Pago registrado', description: `Recibo ${data?.numero} · Total ${fmt(data?.total_pagado)}` });
      // Imprimir el recibo con el formato del ticket movil (4 pulgadas)
      if (imprimir) {
        try {
          printReciboPagoFinancieraPOS({
            numero: data?.numero,
            fecha: new Date(),
            usuario: usuarioActual,
            clienteNombre: cliente?.nombre,
            clienteCodigo: cliente?.codigo || cliente?.rnc || null,
            totalPagado: data?.total_pagado,
            balanceAnterior: data?.balance_anterior,
            balanceActual: data?.balance_actual,
            formaPago: forma,
            cuenta: cuenta || null,
            banco: banco || null,
            comentarios: comentarios || null,
            cobrador: cobrador || null,
            detalles: filas
              .filter((r) => (Number(abonos[r.key]) || 0) > 0)
              .map((r) => {
                const ab = Number(abonos[r.key]) || 0;
                return {
                  documento: r.origen,
                  referencia: r.referencia || '',
                  fecha: r.vence || r.fecha,
                  monto: r.monto,
                  abono: ab,
                  pendiente: Math.max(round2(r.pendiente - ab), 0),
                };
              }),
          }, paperSize);
        } catch (printErr) {
          console.error('No se pudo imprimir el recibo de pago:', printErr);
        }
      }
      setAbonos({}); setEditKey(null); setMontoText(''); setComentarios('');
      await cargarEstado(cliente.id);
      await cargarProximoNumero();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar el pago', description: e.message });
    }
    setSaving(false);
  };

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Recibo de Pago — Financiera</title></Helmet>

      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        {/* Título con menú Opciones (Reimprimir / Nuevo / Salir, como el viejo) */}
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 py-1 px-2 font-extrabold tracking-wide text-base flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 w-28 text-xs font-bold">
                Opciones <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={iniciarReimpresion}>
                <Printer className="w-3.5 h-3.5 mr-2" />Reimprimir
              </DropdownMenuItem>
              <DropdownMenuItem onClick={abrirEditar}>
                <Pencil className="w-3.5 h-3.5 mr-2" />Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={nuevo}>
                <FilePlus className="w-3.5 h-3.5 mr-2" />Nuevo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => closePanel(activePanel)}>
                <X className="w-3.5 h-3.5 mr-2" />Salir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1 text-center">RECIBO DE PAGO</span>
          <span className="w-28" />
        </div>

        <div className="p-2 space-y-1">
          {/* Fila superior: cliente / cobrador-prestamo / numero-fecha */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            {/* Cliente */}
            <div className="border rounded-md p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula"
                  className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 truncate flex-1 min-w-0" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</span>
                <span className="text-emerald-600 whitespace-nowrap font-semibold">{cliente?.telefono || '—'}</span>
              </div>
            </div>

            {/* Cobrador / Préstamo / Último pago */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Cobrador</Label>
                <Input value={cobrador} onChange={(e) => setCobrador(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Estado<br />Cliente</span>
                  {estadoCliente
                    ? <span className={`text-[11px] font-bold whitespace-nowrap ${estadoCliente.cls}`}>{estadoCliente.txt}</span>
                    : <span className="text-xs text-slate-400">—</span>}
                </div>
                <Label className="text-xs w-20 text-right shrink-0">Préstamo</Label>
                <Select value={prestamoFiltro} onValueChange={setPrestamoFiltro}>
                  <SelectTrigger className="h-8 text-sm flex-1 min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos…</SelectItem>
                    {prestamosUnicos.map((p) => <SelectItem key={p.id} value={p.id}>{p.num}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {promesa && (
                <div className={`text-[12px] font-bold rounded px-2 py-1 border ${promesa.fecha_promesa < hoy()
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : 'text-amber-800 bg-amber-50 border-amber-300'}`}>
                  🤝 PROMESA DE PAGO{promesa.fecha_promesa < hoy() ? ' (VENCIDA)' : ''}: {formatFechaDMY(promesa.fecha_promesa)}
                  {Number(promesa.monto_promesa) > 0 ? ` · RD$ ${fmt(promesa.monto_promesa)}` : ''}
                </div>
              )}
            </div>

            {/* Numero / Fecha / Forma de pago */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Número</span>
                  {reimpNumero === null ? (
                    <span className="font-mono font-bold">{numero}</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Input
                        value={reimpNumero}
                        onChange={(e) => setReimpNumero(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); reimprimirPorNumero(); } }}
                        autoFocus
                        className="h-7 w-32 font-mono font-bold text-sm bg-amber-50 border-amber-400"
                        title="Número del recibo a reimprimir"
                      />
                      <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={reimprimirPorNumero} disabled={reimpBusy}>
                        {reimpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setReimpNumero(null)} title="Cancelar reimpresión">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Fecha</span>
                  <span className="font-bold">{formatFechaDMY(hoy())}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex items-center gap-2 min-w-0">
                <Label className="text-[10px] font-bold text-slate-400 uppercase leading-none shrink-0">Forma de<br />Pago</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger className="h-9 text-sm w-[100px] min-w-[44px] shrink"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label className="text-[10px] font-bold text-slate-400 uppercase leading-none whitespace-nowrap shrink-0">Monto<br />Pagado</Label>
                <Input
                  type="text" inputMode="decimal"
                  value={fmtMontoInput(montoText)}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
                    const parts = raw.split('.');
                    if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
                    const [ip, dp] = raw.split('.');
                    raw = dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
                    setMontoText(raw);
                    distribuirTotal(raw);
                  }}
                  placeholder="0.00"
                  className="text-right font-bold text-lg h-9 flex-1 min-w-[96px] shrink-0"
                />
              </div>
              {forma !== 'Efectivo' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Cta. Número" className="h-8 text-xs" />
                  <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Banco" className="h-8 text-xs" />
                </div>
              )}
            </div>
          </div>

          {/* Grid de cuotas (altura fija: ~6 filas visibles, scroll si hay mas) */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[180px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Vence</th>
                  <th className="text-left px-2 py-1">Origen</th>
                  <th className="text-left px-2 py-1">Referencia</th>
                  <th className="text-left px-2 py-1">Descripción</th>
                  <th className="text-right px-2 py-1">Monto</th>
                  <th className="text-right px-2 py-1">Pendiente</th>
                  <th className="text-right px-2 py-1 bg-red-50 w-28">Abono</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {!loading && !cliente && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE PARA VER REGISTROS ---</td></tr>}
                {!loading && cliente && filas.length === 0 && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">Sin cuotas pendientes.</td></tr>}
                {filas.map((r, i) => {
                  const isSel = selKey === r.key;
                  return (
                  <tr key={r.key}
                      onClick={() => setSelKey(r.key)}
                      className={`select-none border-b last:border-0 cursor-pointer ${isSel ? 'bg-blue-500 text-white' : (i % 2 === 1 ? 'bg-[#e0fadd]' : 'bg-white')} ${r.esMora && !isSel ? 'text-red-600 font-semibold' : ''} ${r.esCargo && !isSel ? 'text-amber-700 font-semibold' : ''}`}>
                    <td className="px-2 py-1">{formatFechaDMY(r.fecha)}</td>
                    <td className="px-2 py-1">{formatFechaDMY(r.vence)}</td>
                    <td className={`px-2 py-1 ${isSel ? 'text-white' : (r.esMora ? '' : (r.esCargo ? 'font-bold' : 'font-bold text-blue-900'))}`}>{r.origen}</td>
                    <td className="px-2 py-1">{r.referencia}</td>
                    <td className="px-2 py-1">{r.descripcion}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.monto)}</td>
                    <td className="px-2 py-1 text-right"
                        onDoubleClick={() => setAbonoFila(r, r.pendiente)}
                        title="Doble clic: abonar todo el pendiente">{fmt(r.pendiente)}</td>
                    <td className="px-2 py-1 text-right"
                        onDoubleClick={() => setEditKey(r.key)}
                        title="Doble clic: editar abono">
                      {editKey === r.key ? (
                        <input
                          type="text" inputMode="decimal" autoFocus
                          defaultValue={(Number(abonos[r.key]) || 0) || ''}
                          onBlur={(e) => { setAbonoFila(r, e.target.value); setEditKey(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { setAbonoFila(r, e.target.value); setEditKey(null); }
                            if (e.key === 'Escape') setEditKey(null);
                          }}
                          className="w-full text-right border rounded px-1 py-0.5 text-xs font-bold text-emerald-700 box-border"
                        />
                      ) : (
                        <span className={`font-bold ${isSel ? 'text-white' : 'text-emerald-700'}`}>{fmt(Number(abonos[r.key]) || 0)}</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Otras Informaciones (col1) · Último Pago (col3) · Comentarios (col1-2) · Balances (col3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0 items-start">
            <div className="border rounded-md p-2 text-xs space-y-1 bg-slate-50 lg:col-start-1 lg:row-start-1">
              <div className="font-bold text-slate-500 mb-1">Otras Informaciones</div>
              <div className="flex justify-between"><span>Capital Pendiente</span><b>{fmt(capitalPend)}</b></div>
              <div className="flex justify-between"><span>Intereses Pendientes</span><b>{fmt(interesPend)}</b></div>
              <div className="flex justify-between"><span>Mora Pendiente</span><b className="text-red-600">{fmt(moraPend)}</b></div>
              {cargosPend > 0 && (
                <div className="flex justify-between"><span>Otros Cargos</span><b className="text-amber-700">{fmt(cargosPend)}</b></div>
              )}
            </div>

            {/* Mora en tiempo real (60%) + acceso rápido a Otras Transacciones (40%) */}
            <div className="lg:col-start-2 lg:row-start-1 flex gap-2 items-stretch">
              <div className="border rounded-md p-2 text-xs space-y-2 bg-amber-50/50 basis-[60%] grow-0 shrink min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <Label className="font-bold text-slate-600 cursor-pointer text-[11px] leading-tight">Generar Cargos por Atrasos (MORA)</Label>
                  <Switch checked={moraOn} onCheckedChange={toggleMora} disabled={!cliente} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-slate-500 whitespace-nowrap">Mora %</Label>
                  <Input
                    type="number" step="0.01" value={moraPctText}
                    disabled={!cliente || !moraOn}
                    onChange={(e) => setMoraPctText(e.target.value)}
                    onBlur={guardarMoraPct}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarMoraPct(); } }}
                    className="h-7 text-sm flex-1 min-w-0"
                  />
                </div>
                {moraOn && !(parseFloat(moraPctText) > 0) && (
                  <p className="text-[10px] text-slate-500 leading-tight">
                    En 0 usa la tasa de la empresa{moraDefaultRef > 0 ? ` (${moraDefaultRef}% mensual)` : ''}.
                    Para quitarle la mora a este cliente, apaga el cotejo de arriba.
                  </p>
                )}
              </div>
              <div className="basis-[40%] grow-0 shrink-0 min-w-0">
                <Button
                  type="button" variant="outline" disabled={!cliente}
                  onClick={() => setOtrasOpen(true)}
                  title="Aplicar un cargo al cliente (Cargo por Abogados, Gastos de Cobro…)"
                  className="h-full w-full flex flex-col items-center justify-center gap-1 border-dashed border-amber-300 bg-amber-50/40 hover:bg-amber-100 text-amber-700 whitespace-normal py-2"
                >
                  <Gavel className="w-4 h-4" />
                  <span className="text-[11px] font-bold leading-tight text-center">Otras Transacciones</span>
                </Button>
              </div>
            </div>

            <div className="border-2 border-blue-200 rounded-md p-2 text-xs lg:col-start-3 lg:row-start-1">
              <div className="text-blue-600 font-bold text-center mb-1 flex items-center justify-center gap-2">
                <span>Último Pago → {ultimoPago?.fecha ? formatFechaDMY(ultimoPago.fecha) : 'N/A'}</span>
                {ultimoPago?.pago && (
                  <button
                    type="button"
                    onClick={reimprimirUltimoPago}
                    title={`Reimprimir recibo ${ultimoPago.pago.numero || ''}`}
                    className="text-slate-500 hover:text-blue-700"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex justify-between"><span>Capital</span><b>{fmt(abonoCapital)}</b></div>
              <div className="flex justify-between"><span>Intereses</span><b>{fmt(abonoInteres)}</b></div>
              <div className="flex justify-between"><span>Mora</span><b className="text-red-600">{fmt(abonoMora)}</b></div>
            </div>

            <div className="border rounded-md p-2 lg:col-start-1 lg:col-span-2 lg:row-start-2 max-h-[94px] overflow-hidden">
              <Label className="text-xs font-bold">Comentarios</Label>
              <Textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} className="mt-1 h-12 text-sm resize-none" />
            </div>

            <div className="border rounded-md p-2 text-sm space-y-1 lg:col-start-3 lg:row-start-2">
              <div className="flex justify-between text-slate-500"><span>Balance Anterior</span><b className="text-slate-700">{fmt(balanceAnterior)}</b></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total Pagado</span><span>{fmt(montoNum)}</span></div>
              <div className="flex justify-between text-red-600 font-bold border-t pt-1"><span>Balance Actual</span><span>{fmt(balanceActual)}</span></div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={imprimir} onCheckedChange={(c) => setImprimir(!!c)} /> Imprimir
              </label>
              {imprimir && (
                <Select value={paperSize} onValueChange={cambiarPapel}>
                  <SelectTrigger className="h-8 w-44 text-xs font-bold bg-white border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4inch">📑 101.6mm (4 pulgadas)</SelectItem>
                    <SelectItem value="80mm">📑 80mm (3 pulgadas)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={nuevo}><FilePlus className="w-4 h-4 mr-1" />Nuevo</Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
              <Button type="button" onClick={handleGrabar} disabled={saving || !cliente}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />

      {/* Opciones > Editar: forma de pago de un recibo grabado */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar recibo</DialogTitle>
            <DialogDescription>Cambia la forma de pago de un recibo ya grabado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={editNumero}
                onChange={(e) => setEditNumero(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarEditPago(); } }}
                placeholder="Número del recibo" className="font-mono"
              />
              <Button type="button" variant="outline" onClick={buscarEditPago} disabled={editBusy}>
                {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {editInfo && (
              <>
                <div className="rounded-md border bg-slate-50 p-2 text-sm">
                  <div className="font-mono font-bold">{editInfo.numero}</div>
                  <div className="truncate">{editInfo.cliente}</div>
                  <div>Monto: <b>{fmt(editInfo.monto)}</b> · Forma actual: <b>{editInfo.forma}</b></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Nueva forma de pago</Label>
                  <Select value={editForma} onValueChange={setEditForma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {editForma !== 'Efectivo' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Cta./Referencia</Label>
                      <Input value={editCuenta} onChange={(e) => setEditCuenta(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Banco</Label>
                      <Input value={editBanco} onChange={(e) => setEditBanco(e.target.value)} />
                    </div>
                  </div>
                )}
                {!esAdminUser && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1.5">
                    <Label className="flex items-center gap-1 text-amber-800">
                      <Lock className="w-3.5 h-3.5" /> Contraseña de un administrador
                    </Label>
                    <Input type="password" value={editPass} onChange={(e) => setEditPass(e.target.value)} placeholder="Requerida para editar" />
                    <p className="text-[11px] text-amber-700">Editar recibos requiere autorización administrativa.</p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={editBusy}>Cancelar</Button>
            <Button type="button" onClick={guardarEdicion} disabled={editBusy || !editInfo}>
              {editBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OtrasTransaccionesModal
        isOpen={otrasOpen}
        clientePreseleccionado={cliente}
        onClose={(ok) => {
          setOtrasOpen(false);
          if (ok && cliente?.id) cargarEstado(cliente.id); // refrescar para ver el nuevo cargo AB-
        }}
      />
    </div>
  );
};

export default ReciboPagoFinancieraPage;
