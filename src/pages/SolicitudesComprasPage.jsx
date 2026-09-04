import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Send, FileDown, RefreshCw, X, Loader2, Search, User, Bike, Calculator, DollarSign, Calendar as CalendarIcon, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase, formatFechaDMY } from '@/lib/dateUtils';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteFormModal from '@/components/catalogo/ClienteFormModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { usePanels } from '@/contexts/PanelContext';
import { ID_GENERICO_FINAL } from '@/lib/clienteGenerico';

// Normaliza una fecha (Date, 'YYYY-MM-DD' o timestamp ISO) al inicio del día local.
// Devuelve null si es inválida. Evita el "Invalid time value" y desfases de zona.
const toLocalMidnight = (value) => {
  if (!value) return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const datePart = String(value).slice(0, 10); // 'YYYY-MM-DD' de un string o ISO timestamp
  const d = new Date(`${datePart}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
};

// Días que dura cada cuota según la frecuencia. Es lo que convierte "número
// de cuotas" en "meses de plazo": 365 cuotas diarias son 12 meses, no 365.
const DIAS_POR_PERIODO = { diario: 1, semanal: 7, quincenal: 15, mensual: 30 };

// >>> "tiempo_meses" NO SON MESES: SON CUOTAS <<<
// La columna se llamó así cuando todo era mensual y daba igual. Con cuotas
// diarias deja de dar igual: una solicitud de 365 cuotas de RD$300 se
// enseñaba —y se IMPRIMÍA, en el papel que firma el cliente— como
// "Tiempo: 365 meses" y "Cuota Mensual: RD$300". Ni el plazo ni la cuota
// eran ciertos. El nombre de la columna no se toca (la usan la aprobación,
// el pedido y los pagarés); lo que se arregla es lo que se lee.
const FRECUENCIA_TXT = {
  diario:    { cuota: 'Diaria',    plural: 'cuotas diarias',     pagares: 'DIARIOS' },
  semanal:   { cuota: 'Semanal',   plural: 'cuotas semanales',   pagares: 'SEMANALES' },
  quincenal: { cuota: 'Quincenal', plural: 'cuotas quincenales', pagares: 'QUINCENALES' },
  mensual:   { cuota: 'Mensual',   plural: 'cuotas mensuales',   pagares: 'MENSUALES' },
};

const frecTxt = (sol) => FRECUENCIA_TXT[sol?.frecuencia] || FRECUENCIA_TXT.mensual;

// "365 cuotas diarias (≈ 12 meses)". Con frecuencia mensual el paréntesis
// sobra, porque cuota y mes son la misma cosa.
const textoPlazo = (sol) => {
  const n = parseInt(sol?.tiempo_meses) || 0;
  if (!n) return '—';
  const etiqueta = `${n} ${frecTxt(sol).plural}`;
  if ((sol?.frecuencia || 'mensual') === 'mensual') return etiqueta;
  const meses = Math.round((n * (DIAS_POR_PERIODO[sol.frecuencia] || 30)) / 30);
  return meses > 0 ? `${etiqueta} (≈ ${meses} ${meses === 1 ? 'mes' : 'meses'})` : etiqueta;
};

const etiquetaCuota = (sol) => `Cuota ${frecTxt(sol).cuota}`;

// Formatea un valor monetario para mostrarlo con separador de miles y decimales
// mientras se escribe (acepta number o string crudo 'YYYY.dd').
const fmtMontoInput = (raw) => {
  if (raw === '' || raw == null) return '';
  const [ip, dp] = String(raw).split('.');
  const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
  return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
};

// Limpia lo tecleado a un crudo 'entero.decimales(2)' sin comas
const parseMontoInput = (value) => {
  let raw = String(value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
  const [ip, dp] = raw.split('.');
  return dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
};

// ── Formulario de Solicitud ──
const SolicitudFormModal = ({ isOpen, onClose, solicitud, onSave, clientes, vendedores }) => {
  const { toast } = useToast();
  const { profile, tenantId } = useAuth();
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isClienteSearchOpen, setIsClienteSearchOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const empty = {
    cliente_id: '',
    cliente_nombre: '',
    cliente_rnc: '',
    vendedor_id: vendedores.length > 0 ? vendedores[0].id : '',
    fecha: getCurrentDateInTimeZone(),
    producto_id: null,
    chasis: '',
    motor: '',
    marca: '',
    modelo: '',
    color: '',
    anio: '',
    condicion: 'NUEVA',
    valor_contado: 0,
    inicial: 0,
    financiamiento: 0,
    adicional: 0,
    adicional_fecha: '',  // fecha límite para pagar el adicional (completivo del inicial)
    tiempo_meses: 12,
    tasa_interes: 3,
    total_pagares: 0,
    cuota_base: 0,        // cuota sin ajuste (Monto de las Cuotas)
    cuota_mensual: 0,     // cuota final (ajustada si el operador la redondea)
    cuota_ajustada: '',   // cuota redondeada por el operador (opcional)
    fecha_vencimiento: '',
    incluye_placa: false,
    incluye_gps: false,
    incluye_casco: false,
    incluye_seguro: false,
    monto_placa: 0,
    monto_gps: 0,
    monto_casco: 0,
    monto_seguro: 0,
    tipo_financiamiento: 'simple',
    frecuencia: 'mensual',
    notas: '',
  };

  const [form, setForm] = useState(empty);
  const [addonPrices, setAddonPrices] = useState({ placa: 0, gps: 0, casco: 0, seguro: 0 });
  // Control cédula↔nombre: cliente existente con esa cédula pero OTRO nombre
  const [cedulaCheck, setCedulaCheck] = useState(null); // { id, nombre } | null

  // Al salir del campo cédula: si ya existe un cliente con esa cédula, coincide
  // el nombre -> autocompletar/vincular; nombre distinto -> avisar (otra persona).
  const verificarCedula = async () => {
    const ced = (form.cliente_rnc || '').trim();
    if (!ced || !tenantId) { setCedulaCheck(null); return; }
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .or(`rnc.eq.${ced},codigo.eq.${ced}`)
      .limit(1)
      .maybeSingle();
    if (!data) { setCedulaCheck(null); return; }
    const nombreActual = (form.cliente_nombre || '').trim().toLowerCase();
    const nombreExist = (data.nombre || '').trim().toLowerCase();
    if (!nombreActual || nombreActual === nombreExist) {
      setForm(prev => ({ ...prev, cliente_nombre: data.nombre || prev.cliente_nombre, cliente_id: data.id }));
      setCedulaCheck(null);
    } else {
      setCedulaCheck({ id: data.id, nombre: data.nombre });
    }
  };

  // Cargar precios de add-ons desde config_empresa del tenant
  useEffect(() => {
    if (!tenantId || !isOpen) return;
    (async () => {
      const { data } = await supabase
        .from('config_empresa')
        .select('precio_placa, precio_gps, precio_casco, precio_seguro')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      setAddonPrices({
        placa: parseFloat(data?.precio_placa) || 0,
        gps: parseFloat(data?.precio_gps) || 0,
        casco: parseFloat(data?.precio_casco) || 0,
        seguro: parseFloat(data?.precio_seguro) || 0,
      });
    })();
  }, [tenantId, isOpen]);

  useEffect(() => {
    if (solicitud) {
      setForm({
        ...empty,
        ...solicitud,
        fecha: solicitud.fecha || getCurrentDateInTimeZone(),
        fecha_vencimiento: solicitud.fecha_vencimiento || '',
        adicional_fecha: solicitud.adicional_fecha || '',
      });
    } else {
      setForm(empty);
    }
  }, [solicitud, isOpen]);

  // Congelar el monto del add-on al marcar el checkbox (snapshot del precio vigente)
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      monto_placa: prev.incluye_placa ? (prev.monto_placa || addonPrices.placa) : 0,
      monto_gps: prev.incluye_gps ? (prev.monto_gps || addonPrices.gps) : 0,
      monto_casco: prev.incluye_casco ? (prev.monto_casco || addonPrices.casco) : 0,
      monto_seguro: prev.incluye_seguro ? (prev.monto_seguro || addonPrices.seguro) : 0,
    }));
  }, [form.incluye_placa, form.incluye_gps, form.incluye_casco, form.incluye_seguro, addonPrices]);

  // ── Auto-cálculos de financiamiento ──
  useEffect(() => {
    const valor = parseFloat(form.valor_contado) || 0;
    const inic = parseFloat(form.inicial) || 0;
    const adic = parseFloat(form.adicional) || 0;
    const tasa = parseFloat(form.tasa_interes) || 0;
    // OJO: tiempo_meses guarda el NÚMERO DE CUOTAS, no meses. Con frecuencia
    // mensual da lo mismo, pero en diario no: 365 cuotas son 12 meses de
    // plazo, no 365. Aplicar el 3% por cuota cobraba 3% DIARIO —la cuota
    // salía en 2,605 en vez de ~300— y el total de pagarés en 951,160.
    const nCuotas = parseInt(form.tiempo_meses) || 0;
    const diasPorPeriodo = DIAS_POR_PERIODO[form.frecuencia] || 30;
    const plazoMeses = nCuotas * diasPorPeriodo / 30;
    // La tasa que se teclea es MENSUAL: para otra frecuencia se lleva a la
    // tasa del período, en vez de usarla tal cual.
    const tasaPeriodo = (tasa / 100) * diasPorPeriodo / 30;

    const addonsTotal =
      (form.incluye_placa ? parseFloat(form.monto_placa) || 0 : 0) +
      (form.incluye_gps ? parseFloat(form.monto_gps) || 0 : 0) +
      (form.incluye_casco ? parseFloat(form.monto_casco) || 0 : 0) +
      (form.incluye_seguro ? parseFloat(form.monto_seguro) || 0 : 0);

    // Capital a financiar = (contado + add-ons) - inicial - adicional.
    // El ADICIONAL es un COMPLETIVO del inicial (el cliente lo paga aparte,
    // normalmente a 15/30 días junto con el primer pago): NO se financia.
    const montoFinanciado = valor + addonsTotal - inic - adic;
    let cuotaBase = 0;

    if (nCuotas > 0 && montoFinanciado > 0) {
      if (tasa > 0) {
        if (form.tipo_financiamiento === 'simple') {
          // Interés simple: interés total = capital × tasa mensual × meses de
          // plazo. Se reparte entre las cuotas que haya, sean 12 o 365.
          const interesTotal = montoFinanciado * (tasa / 100) * plazoMeses;
          cuotaBase = (montoFinanciado + interesTotal) / nCuotas;
        } else {
          // Amortización francesa (PMT, interés sobre saldo), con la tasa del
          // período que corresponda a la frecuencia.
          cuotaBase = montoFinanciado * tasaPeriodo / (1 - Math.pow(1 + tasaPeriodo, -nCuotas));
        }
      } else {
        cuotaBase = montoFinanciado / nCuotas;
      }
    }

    // Cuota ajustada (redondeo manual del operador, como el sistema viejo):
    // si la pone, la cuota final pasa a ese valor y el total se recalcula.
    const adj = parseFloat(form.cuota_ajustada) || 0;
    const cuotaFinal = adj > 0 ? adj : cuotaBase;
    const totalPagares = nCuotas > 0 ? cuotaFinal * nCuotas : 0;

    setForm(prev => ({
      ...prev,
      financiamiento: Math.round(montoFinanciado * 100) / 100,
      cuota_base: Math.round(cuotaBase * 100) / 100,
      total_pagares: Math.round(totalPagares * 100) / 100,
      cuota_mensual: Math.round(cuotaFinal * 100) / 100,
    }));
  }, [
    form.valor_contado, form.inicial, form.adicional, form.tasa_interes, form.tiempo_meses,
    form.incluye_placa, form.incluye_gps, form.incluye_casco, form.incluye_seguro,
    form.monto_placa, form.monto_gps, form.monto_casco, form.monto_seguro,
    form.tipo_financiamiento, form.cuota_ajustada, form.frecuencia,
  ]);

  // Redondear la cuota base hacia arriba al múltiplo elegido (1/5/10/50/100)
  const redondearCuota = (mult) => {
    const base = parseFloat(form.cuota_base) || 0;
    if (!(base > 0)) return;
    setForm(prev => ({ ...prev, cuota_ajustada: String(Math.ceil(base / mult) * mult) }));
  };
  const masAjustes = ((parseFloat(form.cuota_ajustada) || 0) > 0)
    ? Math.round(((parseFloat(form.cuota_ajustada) || 0) - (parseFloat(form.cuota_base) || 0)) * 100) / 100
    : 0;

  // ── Vencimiento de la 1ra cuota = fecha + 1 período según la frecuencia ──
  useEffect(() => {
    // form.fecha puede ser un objeto Date (nuevo, getCurrentDateInTimeZone) o un
    // string 'YYYY-MM-DD'/timestamp (al cargar una solicitud). normalizamos a un
    // Date al inicio del dia local para evitar "Invalid time value" y desfases TZ.
    const base = toLocalMidnight(form.fecha);
    if (!base) return; // fecha inválida: no calcular
    switch (form.frecuencia) {
      case 'diario': base.setDate(base.getDate() + 1); break;
      case 'semanal': base.setDate(base.getDate() + 7); break;
      case 'quincenal': base.setDate(base.getDate() + 15); break;
      default: base.setMonth(base.getMonth() + 1); break; // mensual
    }
    // Formato YYYY-MM-DD con partes locales (no toISOString, que pasa a UTC)
    const venc = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    setForm(prev => (prev.fecha_vencimiento === venc ? prev : { ...prev, fecha_vencimiento: venc }));
  }, [form.fecha, form.frecuencia]);

  // ── Seleccionar producto (motocicleta) ──
  const handleSelectProduct = async (product) => {
    // El RPC get_productos_paginados no devuelve chasis/motor/color/anio/condicion/marca_id/modelos_ids.
    // Hacemos fetch directo de productos por id para traer el registro completo.
    const { data: full, error: fullErr } = await supabase
      .from('productos')
      .select('id, marca_id, modelos_ids, chasis, motor, color, anio, condicion, precio')
      .eq('id', product.id)
      .maybeSingle();

    if (fullErr) {
      console.error('[handleSelectProduct] error leyendo producto:', fullErr);
    }

    const full_ = full || {};

    // Nombre de marca: usar el ya resuelto del RPC si está, si no buscar por marca_id
    let marcaNombre = product.marca_nombre || '';
    if (!marcaNombre && full_.marca_id) {
      const { data: m } = await supabase.from('marcas').select('nombre').eq('id', full_.marca_id).maybeSingle();
      marcaNombre = m?.nombre || '';
    }

    // Nombre de modelo: usar el ya resuelto del RPC si está, si no buscar por modelos_ids
    let modeloNombre = product.modelo_nombre || '';
    if (!modeloNombre && full_.modelos_ids?.length > 0) {
      const { data: mods } = await supabase.from('modelos').select('nombre').in('id', full_.modelos_ids);
      modeloNombre = mods?.map(m => m.nombre).join(', ') || '';
    }

    // Precio de la presentación principal (viene del RPC)
    let precio = parseFloat(full_.precio) || parseFloat(product.precio) || 0;
    if (product.presentaciones?.length > 0) {
      const main = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      precio = parseFloat(main?.precio1) || precio;
    }

    // En Caminero Motors el form de mercancía mapea "Chasis" → codigo y "Motor" → referencia.
    // Si las columnas dedicadas chasis/motor están vacías, caer a codigo/referencia.
    setForm(prev => ({
      ...prev,
      producto_id: product.id,
      chasis: full_.chasis || product.codigo || '',
      motor: full_.motor || product.referencia || '',
      marca: marcaNombre,
      modelo: modeloNombre,
      color: full_.color || '',
      anio: full_.anio || '',
      condicion: full_.condicion || 'NUEVA',
      valor_contado: precio,
    }));

    setIsProductSearchOpen(false);
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Cliente elegido por el buscador (puede no estar en la lista precargada)
  const [pickedCliente, setPickedCliente] = useState(null);
  const selectedCliente = useMemo(
    () => (pickedCliente && pickedCliente.id === form.cliente_id ? pickedCliente : clientes.find(c => c.id === form.cliente_id)),
    [pickedCliente, clientes, form.cliente_id]
  );

  const handleSelectClienteBuscado = (c) => {
    setPickedCliente(c);
    setForm(prev => ({ ...prev, cliente_id: c.id, cliente_nombre: c.nombre || '', cliente_rnc: c.rnc || c.codigo || '' }));
    setCedulaCheck(null);
    setIsClienteSearchOpen(false);
  };

  useEffect(() => {
    if (selectedCliente && !form.cliente_rnc) {
      setForm(prev => ({ ...prev, cliente_rnc: selectedCliente.rnc || '' }));
    }
  }, [selectedCliente]);

  // "Hoy" en hora de RD (YYYY-MM-DD) para bloquear fechas pasadas.
  const hoyStr = formatDateForSupabase(getCurrentDateInTimeZone());

  const handleSave = async () => {
    if (!form.cliente_id && !form.cliente_nombre?.trim()) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un cliente o escribir un nombre.' });
      return;
    }
    // Control cédula↔nombre: si la cédula pertenece a otra persona, confirmar.
    if (cedulaCheck) {
      const ok = window.confirm(
        `La cédula ${form.cliente_rnc} ya está registrada a nombre de «${cedulaCheck.nombre}», ` +
        `pero escribiste «${form.cliente_nombre}».\n\n` +
        `Si es la misma persona, mejor usa el nombre registrado. ` +
        `¿Guardar de todos modos con el nombre que escribiste?`
      );
      if (!ok) return;
    }
    if (!form.vendedor_id) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un vendedor.' });
      return;
    }
    if (!form.producto_id) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un vehículo del inventario.' });
      return;
    }
    // No permitir fechas anteriores a hoy (evita adicional/cuota vencidos al crear).
    if ((parseFloat(form.adicional) || 0) > 0 && form.adicional_fecha && form.adicional_fecha < hoyStr) {
      toast({ variant: 'destructive', title: 'Fecha inválida', description: 'La fecha para pagar el adicional no puede ser anterior a hoy.' });
      return;
    }
    if (form.fecha_vencimiento && form.fecha_vencimiento < hoyStr) {
      toast({ variant: 'destructive', title: 'Fecha inválida', description: 'El vencimiento de la 1ra cuota no puede ser anterior a hoy.' });
      return;
    }

    setIsSubmitting(true);
    const success = await onSave({
      ...(solicitud?.id ? { id: solicitud.id } : {}),
      cliente_id: form.cliente_id || null,
      cliente_nombre: form.cliente_nombre || selectedCliente?.nombre || '',
      cliente_rnc: form.cliente_rnc || null,
      vendedor_id: form.vendedor_id,
      fecha: formatDateForSupabase(form.fecha),
      producto_id: form.producto_id,
      chasis: form.chasis,
      motor: form.motor,
      marca: form.marca,
      modelo: form.modelo,
      color: form.color,
      anio: form.anio ? parseInt(form.anio) : null,
      condicion: form.condicion,
      valor_contado: parseFloat(form.valor_contado) || 0,
      inicial: parseFloat(form.inicial) || 0,
      financiamiento: parseFloat(form.financiamiento) || 0,
      adicional: parseFloat(form.adicional) || 0,
      adicional_fecha: ((parseFloat(form.adicional) || 0) > 0 && form.adicional_fecha) ? form.adicional_fecha : null,
      tiempo_meses: parseInt(form.tiempo_meses) || 0,
      tasa_interes: parseFloat(form.tasa_interes) || 0,
      total_pagares: parseFloat(form.total_pagares) || 0,
      cuota_mensual: parseFloat(form.cuota_mensual) || 0,
      cuota_ajustada: parseFloat(form.cuota_ajustada) || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      incluye_placa: form.incluye_placa,
      incluye_gps: form.incluye_gps,
      incluye_casco: form.incluye_casco,
      incluye_seguro: form.incluye_seguro,
      monto_placa: parseFloat(form.monto_placa) || 0,
      monto_gps: parseFloat(form.monto_gps) || 0,
      monto_casco: parseFloat(form.monto_casco) || 0,
      monto_seguro: parseFloat(form.monto_seguro) || 0,
      tipo_financiamiento: form.tipo_financiamiento || 'simple',
      frecuencia: form.frecuencia || 'mensual',
      notas: form.notas || '',
    });
    setIsSubmitting(false);
    if (success) onClose();
  };

  // ── Atajos de teclado dentro del modal ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'F10') { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape' && !isProductSearchOpen) { e.preventDefault(); onClose(); }
      if (e.key === 'F9') { e.preventDefault(); setIsProductSearchOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isProductSearchOpen, handleSave]);

  if (!isOpen) return null;

  return (
    <>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleSelectProduct} onlyWithStock />
      <ClienteSearchModal isOpen={isClienteSearchOpen} onClose={() => setIsClienteSearchOpen(false)} onSelectCliente={handleSelectClienteBuscado} />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-none shadow-2xl">

          {/* Header */}
          <div className="bg-[#a3c2f0] py-1 px-4 flex justify-between items-center border-b border-blue-300">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> SOLICITUD DE COMPRA
            </h2>
            <div className="flex items-center gap-4">
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Número:</span>
                <span className="text-sm font-mono font-bold text-blue-700">{solicitud?.numero || 'NUEVO'}</span>
              </div>
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Fecha:</span>
                <span className="text-sm font-bold text-slate-700">{(() => { const d = toLocalMidnight(form.fecha); return d ? format(d, 'dd/MM/yyyy') : '---'; })()}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 hover:bg-red-500 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Info Bar */}
          <div className="bg-white border-b px-4 py-2 flex gap-6 items-center shadow-sm z-10">
            <div className="flex items-center gap-2 min-w-[250px]">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Vendedor</Label>
              <Select value={form.vendedor_id} onValueChange={val => updateField('vendedor_id', val)}>
                <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50 focus:ring-blue-500"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 animate-pulse font-medium italic">F10 para guardar &bull; ESC para salir &bull; F9 buscar vehículo</span>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-grow overflow-y-auto p-4 space-y-4">

            {/* Datos del Cliente */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-1.5 opacity-70 border-b pb-1.5">
                <User className="w-3 h-3" /> Datos del Cliente
              </h3>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Cliente</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsClienteSearchOpen(true)}
                      className="h-8 flex-1 justify-start font-normal text-sm border-slate-200 truncate"
                    >
                      <Search className="w-3.5 h-3.5 mr-2 text-slate-400 shrink-0" />
                      {form.cliente_id ? (selectedCliente?.nombre || form.cliente_nombre || 'Cliente') : <span className="text-slate-400">Buscar cliente...</span>}
                    </Button>
                    {form.cliente_id && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0"
                        onClick={() => setForm(prev => ({ ...prev, cliente_id: '', cliente_nombre: '', cliente_rnc: '' }))}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Nombre Manual</Label>
                  <Input value={form.cliente_nombre} onChange={e => updateField('cliente_nombre', e.target.value)} className="h-8 text-xs" placeholder="O escriba nombre..." />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">RNC / Cédula</Label>
                  <Input
                    value={form.cliente_rnc}
                    onChange={e => { updateField('cliente_rnc', e.target.value); if (cedulaCheck) setCedulaCheck(null); }}
                    onBlur={verificarCedula}
                    className="h-8 text-xs font-mono"
                    placeholder="000-0000000-0"
                  />
                </div>
              </div>

              {cedulaCheck && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="font-bold">⚠️ Esta cédula ya pertenece a «{cedulaCheck.nombre}».</span>
                  <span>Si es la misma persona usa ese nombre; si no, corrige la cédula.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] ml-auto border-red-400 text-red-700 hover:bg-red-100"
                    onClick={() => { setForm(prev => ({ ...prev, cliente_nombre: cedulaCheck.nombre, cliente_id: cedulaCheck.id })); setCedulaCheck(null); }}
                  >
                    Usar «{cedulaCheck.nombre}»
                  </Button>
                </div>
              )}
            </div>

            {/* Datos del Vehículo */}
            <div className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm">
              <div className="flex justify-between items-center mb-3 border-b pb-1.5">
                <h3 className="text-[10px] font-extrabold text-amber-800 uppercase flex items-center gap-1.5">
                  <Bike className="w-3 h-3" /> Datos del Vehículo
                </h3>
                <Button size="sm" variant="outline" onClick={() => setIsProductSearchOpen(true)} className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Search className="w-3 h-3 mr-1" /> Buscar Vehículo [F9]
                </Button>
              </div>

              {!form.producto_id ? (
                <div className="text-center py-8 text-slate-400">
                  <Bike className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm italic">Presione F9 o el botón para buscar un vehículo del inventario</p>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Chasis</Label>
                    <Input value={form.chasis} onChange={e => updateField('chasis', e.target.value.toUpperCase())} className="h-8 text-xs font-mono font-bold bg-amber-50" />
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Motor</Label>
                    <Input value={form.motor} onChange={e => updateField('motor', e.target.value.toUpperCase())} className="h-8 text-xs font-mono font-bold bg-amber-50" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Marca</Label>
                    <Input value={form.marca} readOnly className="h-8 text-xs bg-slate-50 font-semibold" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Modelo</Label>
                    <Input value={form.modelo} readOnly className="h-8 text-xs bg-slate-50 font-semibold" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Color</Label>
                    <Input value={form.color} onChange={e => updateField('color', e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Año</Label>
                    <Input type="number" value={form.anio} onChange={e => updateField('anio', e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Condición</Label>
                    <Select value={form.condicion} onValueChange={val => updateField('condicion', val)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NUEVA">NUEVA</SelectItem>
                        <SelectItem value="USADA">USADA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Opciones de Préstamos / Financiamiento */}
            <div className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-green-800 uppercase mb-3 flex items-center gap-1.5 border-b pb-1.5">
                <Calculator className="w-3 h-3" /> Opciones de Préstamos
              </h3>
              <div className="grid grid-cols-12 gap-4">
                {/* Columna izquierda - Inputs */}
                <div className="col-span-7 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Valor al Contado RD$</Label>
                    <Input type="text" inputMode="decimal" value={fmtMontoInput(form.valor_contado)} onChange={e => updateField('valor_contado', parseMontoInput(e.target.value))} className="h-9 text-sm font-bold text-green-800 bg-green-50 border-green-300" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Inicial RD$</Label>
                    <Input type="text" inputMode="decimal" value={fmtMontoInput(form.inicial)} onChange={e => updateField('inicial', parseMontoInput(e.target.value))} className="h-9 text-sm font-bold" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Adicional RD$ <span className="normal-case font-semibold text-slate-400">(completivo del inicial — no se financia)</span></Label>
                    <Input type="text" inputMode="decimal" value={fmtMontoInput(form.adicional)} onChange={e => updateField('adicional', parseMontoInput(e.target.value))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Pagar Adicional antes de</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={form.adicional_fecha}
                        min={hoyStr}
                        onChange={e => updateField('adicional_fecha', e.target.value)}
                        disabled={!((parseFloat(form.adicional) || 0) > 0)}
                        className="h-9 text-sm flex-1"
                      />
                      {[15, 30].map(d => (
                        <button
                          key={d}
                          type="button"
                          disabled={!((parseFloat(form.adicional) || 0) > 0)}
                          onClick={() => {
                            const f = new Date();
                            f.setDate(f.getDate() + d);
                            updateField('adicional_fecha', f.toISOString().slice(0, 10));
                          }}
                          className="h-9 px-2 text-[11px] font-bold rounded border border-slate-300 bg-slate-50 hover:bg-slate-200 disabled:opacity-40"
                          title={`Plazo de ${d} días para completar el inicial`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">N° de Cuotas</Label>
                    <Input type="number" value={form.tiempo_meses} onChange={e => updateField('tiempo_meses', e.target.value)} className="h-9 text-sm" min="1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Frecuencia</Label>
                    <Select value={form.frecuencia} onValueChange={val => updateField('frecuencia', val)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diario">Diario</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quincenal">Quincenal</SelectItem>
                        <SelectItem value="mensual">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Tasa de Interés %</Label>
                    <Input type="number" step="0.01" value={form.tasa_interes} onChange={e => updateField('tasa_interes', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Vencimiento 1ra Cuota</Label>
                    <Input type="date" value={form.fecha_vencimiento} min={hoyStr} onChange={e => updateField('fecha_vencimiento', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo de Financiamiento</Label>
                    <Select value={form.tipo_financiamiento} onValueChange={val => updateField('tipo_financiamiento', val)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="frances">Cuotas fijas (francés, interés sobre saldo)</SelectItem>
                        <SelectItem value="simple">Cuotas iguales (interés simple)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid grid-cols-4 gap-2 pt-1">
                    {[
                      { key: 'incluye_placa', monto: 'monto_placa', label: 'PLACA', price: addonPrices.placa },
                      { key: 'incluye_gps', monto: 'monto_gps', label: 'GPS', price: addonPrices.gps },
                      { key: 'incluye_casco', monto: 'monto_casco', label: 'CASCO', price: addonPrices.casco },
                      { key: 'incluye_seguro', monto: 'monto_seguro', label: 'SEGURO', price: addonPrices.seguro },
                    ].map(a => (
                      <div key={a.key} className="flex items-center gap-1.5 bg-white/60 rounded px-2 py-1 border border-slate-200">
                        <Checkbox checked={form[a.key]} onCheckedChange={val => updateField(a.key, val)} id={a.key} />
                        <Label htmlFor={a.key} className="text-[11px] font-bold text-slate-600 cursor-pointer flex-1">
                          {a.label}
                          <span className="block text-[9px] font-mono text-slate-400 font-normal">
                            RD$ {(form[a.key] ? (parseFloat(form[a.monto]) || 0) : a.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Columna derecha - Resumen calculado */}
                <div className="col-span-5 bg-gradient-to-br from-slate-50 to-green-50 rounded-lg p-4 border border-green-100 flex flex-col justify-center space-y-3">
                  {/* Resultado: cuota ajustable (como MotoPréstamos / sistema viejo) */}
                  <div className="border border-emerald-200 rounded-md bg-emerald-50/60 p-2.5">
                    <div className="text-[9px] font-extrabold text-emerald-700 uppercase tracking-widest mb-1.5">Resultado</div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-slate-500 leading-tight block">Monto de las Cuotas</Label>
                        <div className="h-8 flex items-center px-1.5 bg-white border rounded text-xs font-bold text-slate-700 font-mono">
                          {(parseFloat(form.cuota_base) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[9px] text-slate-500 leading-tight block">Más Ajustes</Label>
                        <div className={`h-8 flex items-center px-1.5 bg-white border rounded text-xs font-bold font-mono ${masAjustes < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {masAjustes.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[9px] font-bold text-emerald-800 leading-tight block">Cuota Ajustada</Label>
                        <Input
                          type="number" step="0.01" value={form.cuota_ajustada}
                          onChange={e => updateField('cuota_ajustada', e.target.value)}
                          placeholder={(parseFloat(form.cuota_base) || 0).toFixed(2)}
                          className="h-8 text-xs font-bold font-mono border-emerald-300"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-[9px] text-slate-500">Redondear a:</span>
                      {[1, 5, 10, 50, 100].map(m => (
                        <Button key={m} type="button" size="sm" variant="outline" className="h-5 px-1.5 text-[9px]" onClick={() => redondearCuota(m)}>{m}</Button>
                      ))}
                      {(parseFloat(form.cuota_ajustada) || 0) > 0 && (
                        <Button type="button" size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-slate-500" onClick={() => updateField('cuota_ajustada', '')}>Quitar</Button>
                      )}
                    </div>
                  </div>
                  <div className="h-px bg-green-200" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Financiamiento:</span>
                    <span className="font-mono font-bold text-slate-700">RD$ {(parseFloat(form.financiamiento) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-px bg-green-200" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Total de Pagarés:</span>
                    <span className="font-mono font-bold text-slate-700">RD$ {(parseFloat(form.total_pagares) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-px bg-green-200" />
                  <div className="flex justify-between items-end pt-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cuota {form.frecuencia === 'diario' ? 'Diaria' : form.frecuencia === 'semanal' ? 'Semanal' : form.frecuencia === 'quincenal' ? 'Quincenal' : 'Mensual'}</span>
                    <div className="text-right">
                      <span className="text-[10px] block text-green-600 font-bold -mb-1">A RD$</span>
                      <span className="text-2xl font-black text-green-700 font-mono tracking-tighter">
                        {(parseFloat(form.cuota_mensual) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <Label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Notas y Observaciones</Label>
              <Textarea value={form.notas} onChange={e => updateField('notas', e.target.value)} className="min-h-[50px] text-xs resize-none" placeholder="Notas adicionales..." />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-[#f0f4f8] p-3 border-t border-slate-200 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="h-10 px-6 font-bold uppercase text-[11px] tracking-widest">
              <X className="w-4 h-4 mr-2" /> Cancelar [ESC]
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting} className="h-10 px-8 bg-blue-900 hover:bg-blue-950 text-white font-bold uppercase text-[11px] tracking-widest shadow-md">
              {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Guardar [F10]</>}
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
};


// ── Página Principal ──
const SolicitudesComprasPage = () => {
  const { toast } = useToast();
  const { empresa, tenantId, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSolicitud, setEditingSolicitud] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [clientePrefill, setClientePrefill] = useState(null);
  const { activePanel, openPanel } = usePanels();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [solRes, cliRes, venRes] = await Promise.all([
      supabase
        .from('solicitudes_compras')
        .select('*')
        .in('estado', ['Pendiente', 'C/RUTA'])
        .order('fecha', { ascending: false }),
      supabase.from('clientes').select('*').eq('activo', true),
      supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    if (solRes.error) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las solicitudes.' });
    else setSolicitudes(solRes.data);
    setClientes(cliRes.data || []);
    setVendedores(venRes.data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveSolicitud = async (data) => {
    try {
      const payload = {
        ...data,
        tenant_id: tenantId,
      };

      if (data.id) {
        const { id, ...updateData } = payload;
        const { error } = await supabase.from('solicitudes_compras').update(updateData).eq('id', id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from('solicitudes_compras').insert(payload);
        if (error) throw error;
      }

      toast({ title: 'Éxito', description: 'Solicitud guardada correctamente.' });
      fetchData();
      return true;
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
      return false;
    }
  };

  const handleAnular = async () => {
    if (!selectedSolicitud) return;
    try {
      await supabase.from('solicitudes_compras').update({ estado: 'Anulada' }).eq('id', selectedSolicitud.id);
      toast({ title: 'Solicitud Anulada', description: `La solicitud #${selectedSolicitud.numero} ha sido anulada.` });
      fetchData();
      setSelectedSolicitud(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al anular', description: error.message });
    }
  };

  const handleAprobar = async () => {
    if (!selectedSolicitud) return;
    try {
      const s = selectedSolicitud;

      // 0. Asegurar el cliente: si la solicitud no tiene cliente vinculado,
      //    buscar por cédula/RNC; si no existe, crearlo con el nombre manual,
      //    crédito = total pagarés y SIN teléfono (se salta la validación del alta normal).
      let clienteId = s.cliente_id || null;
      const rncCli = (s.cliente_rnc || '').trim();
      const nombreManual = (s.cliente_nombre || '').trim();
      if (!clienteId && rncCli) {
        const { data: existentes } = await supabase
          .from('clientes')
          .select('id, codigo')
          .eq('tenant_id', tenantId)
          .or(`rnc.eq.${rncCli},codigo.eq.${rncCli}`)
          .limit(1);
        if (existentes && existentes.length) {
          clienteId = existentes[0].id;
        } else {
          const { data: nuevoCli, error: cErr } = await supabase
            .from('clientes')
            .insert({
              tenant_id: tenantId,
              codigo: rncCli,
              nombre: nombreManual || 'CLIENTE',
              rnc: rncCli,
              autorizar_credito: true,
              limite_credito: parseFloat(s.total_pagares) || 0,
              activo: true,
            })
            .select('id')
            .single();
          if (cErr) throw new Error('No se pudo crear el cliente: ' + cErr.message);
          clienteId = nuevoCli.id;
        }
        // Vincular la solicitud al cliente creado/encontrado
        await supabase.from('solicitudes_compras').update({ cliente_id: clienteId }).eq('id', s.id);
      }

      // El código del cliente DEBE ser su cédula/RNC: backfill si está vacío
      // (cubre tanto el cliente recién creado como uno ya vinculado sin código).
      if (clienteId && rncCli) {
        const { data: cliRow } = await supabase
          .from('clientes')
          .select('codigo')
          .eq('id', clienteId)
          .maybeSingle();
        if (cliRow && (!cliRow.codigo || String(cliRow.codigo).trim() === '')) {
          await supabase.from('clientes').update({ codigo: rncCli }).eq('id', clienteId);
        }
      }

      // 1. Factura = valor de contado + add-ons incluidos (placa/GPS/casco/
      //    seguro): son parte de la venta y el sistema viejo los factura DENTRO
      //    del precio del vehículo (ej. FERNANDO: 180,000 + 4,600 = 184,600).
      //    Así la CxC del dealer cuadra con lo que cobra la financiera:
      //    pendiente = financiamiento (capital) + adicional.
      const valor = parseFloat(s.valor_contado) || 0;
      const addonsTotal =
        (s.incluye_placa ? parseFloat(s.monto_placa) || 0 : 0) +
        (s.incluye_gps ? parseFloat(s.monto_gps) || 0 : 0) +
        (s.incluye_casco ? parseFloat(s.monto_casco) || 0 : 0) +
        (s.incluye_seguro ? parseFloat(s.monto_seguro) || 0 : 0);
      const subtotal = valor + addonsTotal;
      const itbis = 0;
      const montoTotal = subtotal + itbis;

      // 2. Descripción del vehículo
      const vehiculoDesc = [
        s.marca, s.modelo,
        s.anio ? `${s.anio}` : null,
        s.color,
        s.chasis ? `CHASIS: ${s.chasis}` : null,
        s.motor ? `MOTOR: ${s.motor}` : null,
      ].filter(Boolean).join(' ');

      // 3. Comentarios: add-ons marcados + datos de financiamiento (solo si aplica)
      const inicial = parseFloat(s.inicial) || 0;
      const cuota = parseFloat(s.cuota_mensual) || 0;
      const meses = parseInt(s.tiempo_meses) || 0;

      // Placa / Matrícula: leer del producto (solo USADAS las tienen). NUEVAS = TRAMITE.
      let placaTxt = 'TRAMITE';
      let matriculaTxt = 'TRAMITE';
      if (s.condicion === 'USADA' && s.producto_id) {
        const { data: prod } = await supabase
          .from('productos')
          .select('placa, matricula')
          .eq('id', s.producto_id)
          .maybeSingle();
        if (prod?.placa) placaTxt = prod.placa;
        if (prod?.matricula) matriculaTxt = 'SI';
        else matriculaTxt = 'TRAMITE';
      }

      const notasExtra = [
        `SOLICITUD #${s.numero}`,
        `MATRICULA: ${matriculaTxt}`,
        `PLACA: ${placaTxt}`,
        s.incluye_placa ? 'INCLUYE PLACA' : null,
        s.incluye_gps ? 'INCLUYE GPS' : null,
        s.incluye_casco ? 'INCLUYE CASCO' : null,
        s.incluye_seguro ? 'INCLUYE SEGURO' : null,
        inicial > 0 ? `INICIAL = ${inicial.toFixed(2)}` : null,
        meses > 0 && cuota > 0 ? `PENDIENTE ${meses} PAGARES ${frecTxt(s).pagares} DE ${cuota.toFixed(2)}` : null,
        s.notas,
      ].filter(Boolean).join(' | ');

      const FINAL_GENERIC_ID = ID_GENERICO_FINAL;
      const pedidoData = {
        cliente_id: clienteId || FINAL_GENERIC_ID,
        manual_cliente_nombre: s.cliente_nombre || null,
        fecha: new Date().toISOString().split('T')[0],
        vendedor_id: s.vendedor_id || null,
        subtotal,
        descuento_total: 0,
        itbis_total: itbis,
        monto_total: montoTotal,
        estado: 'Facturando',
        notas: notasExtra,
      };

      const detallesData = [{
        producto_id: s.producto_id,
        codigo: s.chasis || '',
        descripcion: vehiculoDesc || 'VEHÍCULO',
        cantidad: 1,
        unidad: 'UND',
        precio: subtotal,
        descuento: 0,
        itbis_pct: 0,
        itbis: 0,
        importe: montoTotal,
      }];

      const { data: pedidoId, error: rpcErr } = await supabase.rpc('crear_o_actualizar_pedido', {
        p_pedido_data: pedidoData,
        p_detalles_data: detallesData,
      });
      if (rpcErr) throw new Error('No se pudo generar la solicitud en Ventas: ' + rpcErr.message);

      // Vincular el pedido con la solicitud para mostrar el número real
      if (pedidoId) {
        await supabase
          .from('pedidos')
          .update({ solicitud_compra_id: s.id })
          .eq('id', pedidoId);
      }

      // 3. Marcar la solicitud como aprobada
      const { error: updErr } = await supabase
        .from('solicitudes_compras')
        .update({ estado: 'Aprobada' })
        .eq('id', s.id);
      if (updErr) throw updErr;

      toast({ title: '✅ Solicitud Aprobada', description: `#${s.numero} enviada a Lista de Solicitudes en Ventas.` });
      fetchData();
      setSelectedSolicitud(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // ── Atajos de teclado de la página ──
  const handleKeyDown = useCallback((e) => {
    if (activePanel !== 'solicitudes-compras') return;
    if (document.querySelector('[role="dialog"]')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key.toLowerCase() === 'insert') { e.preventDefault(); setEditingSolicitud(null); setIsModalOpen(true); }
    if (e.key === 'Enter' && selectedSolicitud) { e.preventDefault(); setEditingSolicitud(selectedSolicitud); setIsModalOpen(true); }
    if (e.key.toLowerCase() === 'delete' && selectedSolicitud) { e.preventDefault(); document.getElementById('sol-delete-trigger')?.click(); }
    if (e.key === 'F5' && selectedSolicitud) { e.preventDefault(); handleAprobar(); }
  }, [selectedSolicitud, activePanel, handleAprobar]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filteredSolicitudes = useMemo(() => {
    if (!searchTerm) return solicitudes;
    const term = searchTerm.toLowerCase();
    return solicitudes.filter(s =>
      s.numero?.toString().includes(term) ||
      s.cliente_nombre?.toLowerCase().includes(term) ||
      s.marca?.toLowerCase().includes(term) ||
      s.modelo?.toLowerCase().includes(term) ||
      s.chasis?.toLowerCase().includes(term)
    );
  }, [solicitudes, searchTerm]);

  return (
    <>
      <Helmet><title>Solicitudes de Compras — {empresa?.nombre || 'Sistema'}</title></Helmet>
      <SolicitudFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        solicitud={editingSolicitud}
        onSave={handleSaveSolicitud}
        clientes={clientes}
        vendedores={vendedores}
      />

      {/* Completar datos del cliente (precargado desde la solicitud) */}
      <ClienteFormModal
        isOpen={clienteModalOpen}
        onClose={() => { setClienteModalOpen(false); setClientePrefill(null); fetchData(); }}
        prefill={clientePrefill}
      />

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Solicitudes de Compras
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por #, cliente, marca, chasis..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-72" />
            </div>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow min-h-0">
          {/* Tabla de solicitudes */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
              <div className="h-full overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-100">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Chasis</TableHead>
                      <TableHead>Condición</TableHead>
                      <TableHead className="text-right">Valor RD$</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan="9" className="text-center"><Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /></TableCell></TableRow>
                    ) : filteredSolicitudes.length === 0 ? (
                      <TableRow><TableCell colSpan="9" className="text-center text-slate-400 py-8">No hay solicitudes pendientes</TableCell></TableRow>
                    ) : filteredSolicitudes.map(s => (
                      <TableRow
                        key={s.id}
                        onClick={() => setSelectedSolicitud(s)}
                        onDoubleClick={() => { if (['Pendiente', 'C/RUTA'].includes(s.estado)) { setEditingSolicitud(s); setIsModalOpen(true); } }}
                        className={`cursor-pointer ${selectedSolicitud?.id === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <TableCell>{s.fecha ? formatInTimeZone(new Date(s.fecha), 'dd/MM/yyyy') : '---'}</TableCell>
                        <TableCell className="font-mono font-bold">{s.numero}</TableCell>
                        <TableCell>{s.cliente_nombre}</TableCell>
                        <TableCell className="font-semibold">{s.marca}</TableCell>
                        <TableCell>{s.modelo}</TableCell>
                        <TableCell className="font-mono text-xs">{s.chasis}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.condicion === 'NUEVA' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {s.condicion}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{Number(s.valor_contado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.estado === 'Aprobada' ? 'bg-green-100 text-green-700'
                            : s.estado === 'Anulada' ? 'bg-red-100 text-red-700'
                            : s.estado === 'C/RUTA' ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-yellow-100 text-yellow-700'
                          }`}>{s.estado}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Detalle de la solicitud seleccionada */}
            {selectedSolicitud && (
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <h2 className="text-sm font-bold text-blue-800 mb-3">Detalle Solicitud #{selectedSolicitud.numero}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Chasis</span>
                    <span className="font-mono font-bold">{selectedSolicitud.chasis || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Motor</span>
                    <span className="font-mono font-bold">{selectedSolicitud.motor || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Marca / Modelo</span>
                    <span className="font-semibold">{selectedSolicitud.marca} {selectedSolicitud.modelo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Color / Año</span>
                    <span className="font-semibold">{selectedSolicitud.color || '---'} / {selectedSolicitud.anio || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Valor Contado</span>
                    <span className="font-bold text-green-700">RD$ {Number(selectedSolicitud.valor_contado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Inicial</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.inicial || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Financiamiento</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.financiamiento || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">{etiquetaCuota(selectedSolicitud)}</span>
                    <span className="font-bold text-blue-700">RD$ {Number(selectedSolicitud.cuota_mensual || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Tiempo</span>
                    <span className="font-semibold">{textoPlazo(selectedSolicitud)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Tasa Interés</span>
                    <span className="font-semibold">{selectedSolicitud.tasa_interes || 0}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Total Pagarés</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.total_pagares || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Incluye Placa</span>
                    <span className="font-semibold">{selectedSolicitud.incluye_placa ? 'SÍ' : 'NO'}</span>
                  </div>
                </div>
                {selectedSolicitud.notas && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Notas</span>
                    <span className="text-xs text-slate-600">{selectedSolicitud.notas}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Panel de acciones */}
          <div className="bg-white p-4 rounded-lg shadow-sm border space-y-2 flex flex-col">
            <h2 className="text-lg font-bold text-center mb-2">Acciones</h2>
            <Button onClick={() => { setEditingSolicitud(null); setIsModalOpen(true); }} className="w-full justify-between">
              <span>INS - Nueva Solicitud</span><Plus />
            </Button>
            <Button
              onClick={() => { if (selectedSolicitud) { setEditingSolicitud(selectedSolicitud); setIsModalOpen(true); } }}
              disabled={!selectedSolicitud || !['Pendiente', 'C/RUTA'].includes(selectedSolicitud.estado)}
              className="w-full justify-between"
            >
              <span>ENTER - Modificar</span><Edit />
            </Button>
            <Button
              onClick={handleAprobar}
              disabled={!selectedSolicitud || !['Pendiente', 'C/RUTA'].includes(selectedSolicitud.estado)}
              className="w-full justify-between bg-green-600 hover:bg-green-700"
            >
              <span>F5 - Aprobar Solicitud</span><Send />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button id="sol-delete-trigger" variant="destructive" disabled={!selectedSolicitud || !['Pendiente', 'C/RUTA'].includes(selectedSolicitud.estado)} className="w-full justify-between">
                  <span>DEL - Anular</span><Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Anular Solicitud?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer. La solicitud #{selectedSolicitud?.numero} será anulada.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAnular}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              disabled={!selectedSolicitud}
              className="w-full justify-between bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={async () => {
                if (!selectedSolicitud) return;
                const id = selectedSolicitud.id;
                const { error } = await supabase.from('solicitudes_compras').update({ estado: 'C/RUTA' }).eq('id', id);
                if (error) toast({ variant: 'destructive', title: 'No se pudo cambiar el estado', description: error.message });
                openPanel('carta-ruta', { solicitudId: id });
                fetchData();
              }}
            >
              <span>Enviar a Carta de Ruta</span><Send />
            </Button>

            <Button
              variant="outline"
              disabled={!selectedSolicitud}
              className="w-full justify-between border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                if (!selectedSolicitud) return;
                const ced = (selectedSolicitud.cliente_rnc || '').trim();
                const nCuotas = parseInt(selectedSolicitud.tiempo_meses) || 0;
                const diasPorPeriodo = DIAS_POR_PERIODO[selectedSolicitud.frecuencia] || 30;
                setClientePrefill({
                  nombre: selectedSolicitud.cliente_nombre || '',
                  rnc: ced,
                  codigo: ced,
                  autorizar_credito: true,
                  limite_credito: parseFloat(selectedSolicitud.total_pagares) || 0,
                  dias_credito: nCuotas * diasPorPeriodo,
                });
                setClienteModalOpen(true);
              }}
            >
              <span>Completar Datos del Cliente</span><User />
            </Button>

            <div className="flex-grow" />

            <Button variant="outline" disabled={!selectedSolicitud} className="w-full justify-between" onClick={() => {
              if (!selectedSolicitud) return;
              const s = selectedSolicitud;
              const fmtMoney = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const fechaStr = s.fecha ? formatInTimeZone(new Date(s.fecha), 'dd/MM/yyyy') : '---';
              const printW = window.open('', '_blank', 'width=816,height=1056');
              printW.document.write(`<!DOCTYPE html><html><head><title>Solicitud #${s.numero}</title>
              <style>
                @page { size: letter; margin: 15mm 20mm; }
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size:12px; color:#000; padding:20px 30px; }
                .header { text-align:center; margin-bottom:15px; border-bottom:2px solid #1e40af; padding-bottom:8px; }
                .header h1 { font-size:20px; font-weight:bold; color:#1e40af; }
                .header .sub { font-size:14px; font-weight:bold; letter-spacing:1px; }
                .header .rnc { font-size:11px; color:#555; }
                .info-bar { display:flex; justify-content:space-between; margin-bottom:12px; font-size:13px; }
                .info-bar strong { color:#1e40af; }
                .section { margin-bottom:10px; border:1px solid #ddd; border-radius:4px; padding:8px 12px; }
                .section-title { font-size:11px; font-weight:bold; color:#1e40af; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; border-bottom:1px solid #e5e7eb; padding-bottom:3px; }
                .grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 20px; font-size:12px; }
                .grid div { line-height:1.6; }
                .grid .label { color:#666; font-weight:600; }
                .grid .value { font-weight:bold; }
                .summary { background:#f0f9ff; border:1px solid #93c5fd; border-radius:6px; padding:10px 16px; margin-top:10px; }
                .summary .row { display:flex; justify-content:space-between; padding:3px 0; font-size:13px; }
                .summary .total { font-size:16px; font-weight:900; color:#1e40af; border-top:2px solid #1e40af; padding-top:6px; margin-top:4px; }
                .footer { text-align:center; margin-top:30px; font-size:10px; color:#888; border-top:1px solid #ddd; padding-top:6px; }
                .firmas { display:flex; justify-content:space-around; margin-top:50px; }
                .firma { text-align:center; }
                .firma .linea { width:180px; border-top:1px solid #000; margin:0 auto 4px; }
                .firma .label { font-size:11px; font-weight:bold; }
                @media print { body { padding:0; } }
              </style></head><body>
              <div class="header">
                <h1>${(empresa?.nombre || 'SISTEMA').toUpperCase()}</h1>
                <div class="sub">SOLICITUD DE COMPRA</div>
                <div class="rnc">R.N.C: ${empresa?.rnc || ''}</div>
              </div>
              <div class="info-bar">
                <div><strong>Solicitud #:</strong> ${s.numero}</div>
                <div><strong>Fecha:</strong> ${fechaStr}</div>
                <div><strong>Estado:</strong> ${s.estado}</div>
              </div>
              <div class="section">
                <div class="section-title">Datos del Cliente</div>
                <div class="grid">
                  <div><span class="label">Nombre:</span> <span class="value">${s.cliente_nombre || '---'}</span></div>
                  <div><span class="label">Condición:</span> <span class="value">${s.condicion || '---'}</span></div>
                </div>
              </div>
              <div class="section">
                <div class="section-title">Datos del Vehículo</div>
                <div class="grid">
                  <div><span class="label">Chasis:</span> <span class="value">${s.chasis || '---'}</span></div>
                  <div><span class="label">Motor:</span> <span class="value">${s.motor || '---'}</span></div>
                  <div><span class="label">Marca:</span> <span class="value">${s.marca || '---'}</span></div>
                  <div><span class="label">Modelo:</span> <span class="value">${s.modelo || '---'}</span></div>
                  <div><span class="label">Color:</span> <span class="value">${s.color || '---'}</span></div>
                  <div><span class="label">Año:</span> <span class="value">${s.anio || '---'}</span></div>
                </div>
              </div>
              <div class="section">
                <div class="section-title">Opciones de Préstamos</div>
                <div class="grid">
                  <div><span class="label">Valor al Contado:</span> <span class="value">RD$ ${fmtMoney(s.valor_contado)}</span></div>
                  <div><span class="label">Inicial:</span> <span class="value">RD$ ${fmtMoney(s.inicial)}</span></div>
                  <div><span class="label">Adicional:</span> <span class="value">RD$ ${fmtMoney(s.adicional)}${s.adicional_fecha ? ` (pagar antes de ${formatFechaDMY(s.adicional_fecha)})` : ''}</span></div>
                  <div><span class="label">Tasa de Interés:</span> <span class="value">${s.tasa_interes || 0}%</span></div>
                  <div><span class="label">Tiempo:</span> <span class="value">${textoPlazo(s)}</span></div>
                  <div><span class="label">Incluye Placa:</span> <span class="value">${s.incluye_placa ? 'SÍ' : 'NO'}</span></div>
                </div>
                <div class="summary">
                  <div class="row"><span>Financiamiento:</span> <strong>RD$ ${fmtMoney(s.financiamiento)}</strong></div>
                  <div class="row"><span>Total de Pagarés:</span> <strong>RD$ ${fmtMoney(s.total_pagares)}</strong></div>
                  <div class="row total"><span>${etiquetaCuota(s)}:</span> <span>RD$ ${fmtMoney(s.cuota_mensual)}</span></div>
                </div>
              </div>
              ${s.notas ? `<div class="section"><div class="section-title">Notas</div><p style="font-size:12px">${s.notas}</p></div>` : ''}
              <div class="firmas">
                <div class="firma"><div class="linea"></div><div class="label">VENDEDOR</div></div>
                <div class="firma"><div class="linea"></div><div class="label">CLIENTE</div></div>
                <div class="firma"><div class="linea"></div><div class="label">APROBADO POR</div></div>
              </div>
              <div class="footer">${empresa?.direccion || ''} — Tel: ${empresa?.telefono || ''}</div>
              <script>window.onload=function(){window.print();};</script>
              </body></html>`);
              printW.document.close();
            }}>
              <span>Imprimir Solicitud</span><FileDown />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SolicitudesComprasPage;
