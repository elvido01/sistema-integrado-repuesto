import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase, formatFechaDMY } from '@/lib/dateUtils';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import { Calendar as CalendarIcon, Lock, Printer, X, Loader2, Coins, Save, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────── Denominaciones de moneda ──────────────── */
// Todas las que han existido alguna vez, en orden. Los cierres viejos
// guardaron sus cantidades con estas etiquetas, así que la lista completa se
// sigue usando para IMPRIMIR: un cierre con billetes de 20 tiene que poder
// reimprimirse con sus 20, aunque hoy ya no se cuenten.
const DENOMINACIONES_TODAS = [
  { label: '2,000', value: 2000 },
  { label: '1,000', value: 1000 },
  { label: '500', value: 500 },
  { label: '200', value: 200 },
  { label: '100', value: 100 },
  { label: '50', value: 50 },
  { label: '25', value: 25 },
  { label: '20', value: 20 },
  { label: '10', value: 10 },
  { label: '5', value: 5 },
  { label: '1', value: 1 },
  { label: 'Cent.', value: 0 },
  { label: 'Tarjetas', value: 0, tipo: 'tarjeta' },
  { label: 'Cheques', value: 0, tipo: 'cheque' },
  { label: 'Otros', value: 0, tipo: 'otro' },
];

// Retiradas del conteo: no circulan o no se usan. Solo dejan de pedirse al
// contar; lo ya grabado con ellas se sigue leyendo.
const DENOMINACIONES_RETIRADAS = new Set(['20', 'Cent.', 'Otros']);
const DENOMINACIONES = DENOMINACIONES_TODAS.filter(d => !DENOMINACIONES_RETIRADAS.has(d.label));

const formatCurrency = (v) =>
  new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

// Una factura anulada no metió plata en la caja. Se comprueba así y no con
// .neq('estado','ANULADA') en la consulta: en PostgREST eso descarta también
// las filas con estado NULL, que son la mayoría de las facturas.
const noAnulada = (f) => String(f?.estado || '').toUpperCase() !== 'ANULADA';

const isMobileCashSale = (venta) => {
  const formaPago = String(venta?.forma_pago || '').toUpperCase();
  const tipoPago = String(venta?.tipo_pago || '').toUpperCase();
  const notas = String(venta?.notas || '').toUpperCase();

  return formaPago === 'EFECTIVO'
    || notas.includes('POS_MOVIL')
    || notas.includes('POS MOVIL')
    || notas.includes('MOVIL')
    || notas.includes('MÓVIL')
    || tipoPago.includes('MOVIL');
};

/* ─────────────────────────────────────────────────────────── */
const CierreCajaPage = () => {
  const { toast } = useToast();
  const { user, profile, empresa, tenantId } = useAuth();
  const { closePanel } = usePanels();

  /* ── State ── */
  const [fecha, setFecha] = useState(getCurrentDateInTimeZone());
  const [turno, setTurno] = useState(1);
  // Cuántas veces al día cierra caja esta empresa (Configuración del Sistema).
  // Con 1 —el caso normal— el turno ni se pregunta.
  const turnosPorDia = Math.max(1, parseInt(empresa?.turnos_caja_dia, 10) || 1);
  const unTurno = turnosPorDia <= 1;
  const [cajeros, setCajeros] = useState([]);
  const [selectedCajero, setSelectedCajero] = useState('ALL');
  const [showDesglose, setShowDesglose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [imprimir, setImprimir] = useState(true);
  // Cierres ya grabados: para volver a imprimir uno sin depender de nadie.
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [cuentaId, setCuentaId] = useState(null); // cuenta bancaria destino del efectivo
  // Papel del impreso del cierre — se recuerda por PC (la caja tiene térmica
  // 80mm; la oficina, impresora de hoja). Default: la config de la empresa.
  const [papelCierre, setPapelCierre] = useState(() => localStorage.getItem('cierre_caja_paper') || '');
  const cambiarPapelCierre = (v) => { setPapelCierre(v); localStorage.setItem('cierre_caja_paper', v); };

  /* Resumen de ventas */
  const [resumen, setResumen] = useState(null);

  /* Cantidades del desglose */
  const [cantidades, setCantidades] = useState(
    DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d.label]: 0 }), {})
  );

  /* ── Fetch cajeros (perfiles) ── */
  useEffect(() => {
    const loadCajeros = async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, email')
        .order('nombre_completo');
      if (!error && data) {
        setCajeros(data);
        // Default to ALL to show consolidated daily total
        setSelectedCajero('ALL');
      }
    };
    loadCajeros();
  }, [user]);

  /* ── Fetch resumen del turno ──
     Con p_fechaStr calcula OTRA fecha y devuelve el resumen sin tocar la
     pantalla: así se reconstruye el desglose de un cierre viejo, que se
     grabó antes de que se guardara la foto completa. */
  const fetchResumen = useCallback(async (p_fechaStr) => {
    const soloCalcular = !!p_fechaStr;
    if (!fecha && !soloCalcular) return;
    if (!soloCalcular) setLoadingResumen(true);

    const fechaStr = p_fechaStr || formatDateForSupabase(fecha);
    const startOfDay = `${fechaStr}T00:00:00`;
    const endOfDay = `${fechaStr}T23:59:59`;

    let ventas = [];
    let devoluciones = [];
    let recibos = [];
    let pagosSuplidores = [];
    let gastosDiarios = [];
    let pagosTerceros = []; // GPS, seguro, placa...: salen de la gaveta pero no son gasto
    let pagosNomina = [];   // sueldos pagados empleado por empleado: son nómina, no gasto diario
    let prestamosEfectivo = []; // préstamos desembolsados HOY en efectivo (financieras)
    let compromisosEfectivo = []; // compromisos pagados HOY en efectivo (salen de la caja)

    try {
      // Ventas del día
      let ventasQuery = supabase
        .from('facturas')
        .select('id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado')
        .eq('tenant_id', tenantId)
        .gte('fecha', startOfDay)
        .lte('fecha', endOfDay);

      if (selectedCajero && selectedCajero !== 'ALL') {
        ventasQuery = ventasQuery.eq('usuario_id', selectedCajero);
      }

      const { data: ventasData, error: ventasErr } = await ventasQuery;
      if (ventasErr) {
        console.warn('Error cargando ventas:', ventasErr.message);
      } else {
        // Una factura anulada no entró plata a la caja. Se filtra aquí y no
        // con .neq('estado','ANULADA') porque en PostgREST eso también
        // descarta las que tienen estado NULL, que son la mayoría.
        ventas = (ventasData || []).filter(noAnulada);
      }

      let ventasMovilesQuery = supabase
        .from('facturas')
        .select('id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado')
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (selectedCajero && selectedCajero !== 'ALL') {
        ventasMovilesQuery = ventasMovilesQuery.eq('usuario_id', selectedCajero);
      }

      const { data: ventasMovilesData, error: ventasMovilesErr } = await ventasMovilesQuery;
      if (ventasMovilesErr) {
        console.warn('Error cargando ventas moviles:', ventasMovilesErr.message);
      } else {
        const ventasIds = new Set(ventas.map(v => v.id));
        const ventasMovilesFaltantes = (ventasMovilesData || [])
          .filter(noAnulada)
          .filter(v => isMobileCashSale(v) && !ventasIds.has(v.id));
        ventas = [...ventas, ...ventasMovilesFaltantes];
      }
    } catch (e) {
      console.warn('Exception cargando ventas:', e);
    }

    try {
      // Devoluciones del día (sin filtro de usuario)
      const { data: devData, error: devErr } = await supabase
        .from('devoluciones')
        .select('total_devolucion, facturas!inner(forma_pago)')
        .eq('tenant_id', tenantId)
        .ilike('facturas.forma_pago', 'contado')
        .gte('fecha_devolucion', startOfDay)
        .lte('fecha_devolucion', endOfDay);

      if (devErr) {
        console.warn('Error cargando devoluciones:', devErr.message);
      } else {
        devoluciones = devData || [];
      }
    } catch (e) {
      console.warn('Exception cargando devoluciones:', e);
    }

    try {
      // Recibos de Ingreso del día
      // El campo real del monto es 'monto_pagado' (no existe 'total' en esta tabla).
      // Primero filtramos por fecha como DATE, luego fallback a created_at.
      const { data: recibosData, error: recibosErr } = await supabase
        .from('recibos_ingreso')
        .select('monto_pagado, fecha, created_at, origen, formas_pago')
        .eq('tenant_id', tenantId)
        .eq('anulado', false)
        .eq('fecha', fechaStr);

      if (recibosErr) {
        console.warn('Error cargando recibos por fecha:', recibosErr.message);
        // Fallback: intentar por created_at (TIMESTAMPTZ)
        const { data: recibosCreatedData, error: recibosCreatedErr } = await supabase
          .from('recibos_ingreso')
          .select('monto_pagado, created_at, origen, formas_pago')
          .eq('tenant_id', tenantId)
          .eq('anulado', false)
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay);

        if (recibosCreatedErr) {
          console.warn('Error cargando recibos por created_at:', recibosCreatedErr.message);
        } else {
          recibos = recibosCreatedData || [];
        }
      } else {
        recibos = recibosData || [];
      }

      console.log(`Recibos encontrados para ${fechaStr}:`, recibos.length, recibos);
    } catch (e) {
      console.warn('Exception cargando recibos:', e);
    }

    try {
      // Pagos a Suplidores del día
      const { data: pagosData, error: pagosErr } = await supabase
        .from('pagos_suplidores')
        .select('monto_pagado, formas_pago')
        .eq('tenant_id', tenantId)
        .eq('anulado', false)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (pagosErr) {
        console.warn('Error cargando pagos suplidores:', pagosErr.message);
      } else {
        pagosSuplidores = pagosData || [];
      }
    } catch (e) {
      console.warn('Exception cargando pagos suplidores:', e);
    }

    try {
      const { data: gastosData, error: gastosErr } = await supabase
        .from('gastos_diarios')
        .select('monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero')
        .eq('tenant_id', tenantId)
        .eq('fecha', fechaStr)
        .eq('anulado', false);

      if (gastosErr) {
        console.warn('Error cargando gastos diarios:', gastosErr.message);
      } else {
        // Solo los gastos que SALIERON DE LA GAVETA cuentan en el cierre de
        // caja. Los pagados por banco de la empresa o por un tercero (Odalys)
        // no restan del efectivo. Ver sql/gasto_no_afecta_caja.sql
        const deLaGaveta = (gastosData || []).filter(
          (g) => !g.cuenta_bancaria_id && g.afecta_caja !== false
        );
        // El GPS y el seguro salen de la gaveta igual que un gasto —el cuadre
        // no cambia— pero se listan aparte: no son gastos de la empresa, son
        // dinero del cliente de paso. Ver sql/pagos_a_terceros.sql
        pagosTerceros = deLaGaveta.filter((g) => g.es_tercero === true);

        // El sueldo que se le paga a un empleado es NÓMINA, aunque el módulo
        // lo guarde como gasto diario para descontarlo de la caja. Mezclado
        // con la gasolina y la merienda no hay forma de cuadrarlo contra la
        // nómina ni de saber cuánto se pagó de sueldos ese día.
        const esNomina = (g) => /n[oó]mina/i.test(String(g.tipo_gasto || ''));
        const restantes = deLaGaveta.filter((g) => g.es_tercero !== true);
        pagosNomina   = restantes.filter(esNomina);
        gastosDiarios = restantes.filter((g) => !esNomina(g));
      }
    } catch (e) {
      console.warn('Exception cargando gastos diarios:', e);
    }

    // Compras de CONTADO pagadas en efectivo: salen de la gaveta el mismo día.
    // Faltaban en el cierre, y por eso una moto comprada de contado por
    // RD$50,000 dejaba el cuadre pidiendo ese dinero de más (OC-0007, 31/07).
    let comprasContadoEfectivo = 0;
    try {
      const { data: compData, error: compErr } = await supabase
        .from('compras')
        .select('numero, total_compra, forma_pago, estado, pagos, created_at')
        .eq('tenant_id', tenantId)
        .ilike('forma_pago', 'contado')
        .gte('created_at', `${fechaStr}T00:00:00`)
        .lte('created_at', `${fechaStr}T23:59:59.999`);
      if (compErr) {
        console.warn('Error cargando compras de contado:', compErr.message);
      } else {
        comprasContadoEfectivo = (compData || [])
          .filter((c) => (c.estado || '') !== 'ANULADA')
          .reduce((sum, c) => {
            // Las líneas de «Monto Pagado» dicen de dónde salió. Tipo '01' es
            // Efectivo; lo demás sale de una cuenta y no toca la gaveta.
            const lineas = Array.isArray(c.pagos) ? c.pagos : [];
            if (lineas.length === 0) return sum + (parseFloat(c.total_compra) || 0);
            return sum + lineas
              .filter((f) => String(f?.tipo ?? '01') === '01'
                || String(f?.forma || '').toLowerCase().includes('efectivo'))
              .reduce((s, f) => s + (parseFloat(f?.monto) || 0), 0);
          }, 0);
      }
    } catch (e) {
      console.warn('Exception cargando compras de contado:', e);
    }

    try {
      // Préstamos originados hoy con desembolso en EFECTIVO (salen de la caja)
      const { data: prestData, error: prestErr } = await supabase
        .from('prestamos')
        .select('numero, monto_capital, created_at, clientes(nombre)')
        .eq('tenant_id', tenantId)
        .ilike('desembolso', 'efectivo')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);
      if (prestErr) {
        console.warn('Error cargando préstamos en efectivo:', prestErr.message);
      } else {
        prestamosEfectivo = prestData || [];
      }
    } catch (e) {
      console.warn('Exception cargando préstamos en efectivo:', e);
    }

    try {
      // Compromisos pagados HOY en efectivo (nómina, alquiler, etc.): el
      // efectivo físico sale de la caja. Se filtra a efectivo en JS (NULL =
      // efectivo, histórico), igual que el dashboard "caja del día".
      const { data: compData, error: compErr } = await supabase
        .from('compromisos')
        .select('id, nombre, monto, tipo, forma_pago, fecha_pago')
        .eq('tenant_id', tenantId)
        .eq('activo', false)
        .gte('fecha_pago', startOfDay)
        .lte('fecha_pago', endOfDay);
      if (compErr) {
        console.warn('Error cargando compromisos pagados:', compErr.message);
      } else {
        compromisosEfectivo = (compData || []).filter(c =>
          String(c.forma_pago || 'Efectivo').toLowerCase().includes('efectivo')
        );

        // La nómina no es una salida sola de RD$8,000: son los sueldos de dos
        // empleados. En el cierre tiene que verse a quién se le pagó y cuánto,
        // igual que en la nómina — un número redondo sin nombres no se puede
        // cuadrar contra los recibos firmados.
        const idsNomina = compromisosEfectivo
          .filter((c) => String(c.tipo || '').toLowerCase() === 'nomina')
          .map((c) => c.id);

        if (idsNomina.length > 0) {
          const { data: nomData } = await supabase
            .from('nominas')
            .select('id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))')
            .eq('tenant_id', tenantId)
            .in('compromiso_id', idsNomina)
            .neq('estado', 'anulada');

          // Un pago por empleado ya dejó su gasto diario y ya salió de la caja
          // EL DÍA QUE SALIÓ. Si además se cuenta el compromiso completo, la
          // nómina se cobra dos veces y la parte de ayer cae en el día de hoy.
          // Ver sql/compromiso_nomina_no_se_cuenta_dos_veces.sql
          const idsGasto = (nomData || [])
            .flatMap((n) => (n.nomina_detalle || []).map((d) => d.gasto_id))
            .filter(Boolean);
          const anulados = new Set();
          if (idsGasto.length > 0) {
            const { data: gAnul } = await supabase
              .from('gastos_diarios').select('id, anulado').in('id', idsGasto);
            for (const g of gAnul || []) if (g.anulado) anulados.add(g.id);
          }

          const porCompromiso = {};
          for (const n of nomData || []) {
            porCompromiso[n.compromiso_id] = (n.nomina_detalle || [])
              .map((d) => ({
                nombre: d.empleados?.nombre || 'Empleado',
                monto: Number(d.neto) || 0,
                // "Ya salió por su propio gasto": no debe volver a restarse aquí.
                yaEnGastos: !!d.gasto_id && !anulados.has(d.gasto_id),
                pagadoAt: d.pagado_at || null,
              }))
              .filter((e) => e.monto > 0)
              .sort((a, b) => b.monto - a.monto);
          }

          compromisosEfectivo = compromisosEfectivo.map((c) => {
            const emps = porCompromiso[c.id] || null;
            const cubierto = (emps || [])
              .filter((e) => e.yaEnGastos)
              .reduce((s, e) => s + e.monto, 0);
            return {
              ...c,
              empleados: emps,
              cubierto,
              monto_efectivo: Math.max((parseFloat(c.monto) || 0) - cubierto, 0),
            };
          });
        }
      }
    } catch (e) {
      console.warn('Exception cargando compromisos pagados:', e);
    }

    const ventasContado = ventas.filter(v => {
      const formaPago = String(v.forma_pago || '').toUpperCase();
      return formaPago === 'CONTADO' || formaPago === 'EFECTIVO';
    });

    const totalVentasContado = ventasContado
      .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

    const totalVentasContadoMovil = ventasContado
      .filter(isMobileCashSale)
      .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

    // Ventas de contado cobradas por transferencia/tarjeta/cheque NO entran a la
    // gaveta (van a la cuenta bancaria). Sin tipo_pago = efectivo (histórico).
    const esContadoEfectivo = (v) => {
      const tp = String(v.tipo_pago || '').toUpperCase();
      return !tp || tp.includes('EFECTIVO');
    };
    const totalVentasContadoNoEfectivo = ventasContado
      .filter(v => !esContadoEfectivo(v))
      .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

    const totalVentasContadoCaja = Math.max(0, totalVentasContado - totalVentasContadoMovil - totalVentasContadoNoEfectivo);

    const totalVentasCredito = ventas
      .filter(v => String(v.forma_pago || '').toUpperCase() === 'CREDITO')
      .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

    const totalVentas = ventas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
    const totalItbis = ventas.reduce((sum, v) => sum + (parseFloat(v.itbis) || 0), 0);
    const totalDescuento = ventas.reduce((sum, v) => sum + (parseFloat(v.descuento) || 0), 0);
    const totalDevoluciones = devoluciones.reduce((sum, d) => sum + (parseFloat(d.total_devolucion) || 0), 0);
    const totalRecibos = recibos.reduce((sum, r) => sum + (parseFloat(r.monto_pagado) || 0), 0);
    const totalRecibosMovil = recibos
      .filter(r => String(r.origen || '').toLowerCase() === 'movil')
      .reduce((sum, r) => sum + (parseFloat(r.monto_pagado) || 0), 0);
    const totalRecibosCaja = Math.max(0, totalRecibos - totalRecibosMovil);
    // Porción del recibo cobrada EN EFECTIVO (transferencia/cheque/tarjeta no
    // entran al efectivo físico del día). Sin formas_pago = todo efectivo.
    const efectivoDeRecibo = (r) => {
      const formas = Array.isArray(r.formas_pago) ? r.formas_pago : null;
      if (!formas || !formas.length) return parseFloat(r.monto_pagado) || 0;
      return formas.reduce((s, f) => s + (String(f.forma || '').toLowerCase().includes('efectivo') ? (parseFloat(f.monto) || 0) : 0), 0);
    };
    const totalRecibosEfectivo = recibos.reduce((sum, r) => sum + efectivoDeRecibo(r), 0);
    const totalRecibosOtrasFormas = Math.max(0, totalRecibos - totalRecibosEfectivo);
    const totalGastosDiarios = gastosDiarios.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalPagosTerceros = pagosTerceros.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalPagosNomina = pagosNomina.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalPrestamosEfectivo = prestamosEfectivo.reduce((sum, p) => sum + (parseFloat(p.monto_capital) || 0), 0);
    // Del compromiso solo sale de la caja lo que no salió ya como gasto al
    // pagar empleado por empleado. Sin esto la nómina se resta dos veces.
    const efectivoDeCompromiso = (c) =>
      c.monto_efectivo !== undefined ? (parseFloat(c.monto_efectivo) || 0) : (parseFloat(c.monto) || 0);

    // El que ya salió completo por los gastos de cada empleado no pinta nada
    // en el cuadre: aporta 0 y solo estorba. Ese dinero se ve en su día, en
    // la línea de Nómina. Se listan solo los que sí sacan efectivo hoy.
    compromisosEfectivo = compromisosEfectivo.filter((c) => efectivoDeCompromiso(c) > 0);

    const totalCompromisosEfectivo = compromisosEfectivo.reduce((sum, c) => sum + efectivoDeCompromiso(c), 0);
    const totalPagosSuplidoresEfectivo = pagosSuplidores.reduce((sum, p) => {
      const efectivo = (p.formas_pago || []).filter(fp => fp.forma === 'Efectivo')
        .reduce((s, fp) => s + (parseFloat(fp.monto) || 0), 0);
      return sum + efectivo;
    }, 0);

    const cambioEntregado = ventas
      .filter(v => v.forma_pago === 'CONTADO')
      .reduce((sum, v) => sum + (parseFloat(v.cambio) || 0), 0);

    const cantFacturas = ventas.length;

    const calculado = {
      totalVentas,
      totalVentasContado,
      totalVentasContadoCaja,
      totalVentasContadoMovil,
      totalVentasContadoNoEfectivo,
      totalVentasCredito,
      totalItbis,
      totalDescuento,
      totalDevoluciones,
      totalRecibos,
      totalRecibosMovil,
      totalRecibosCaja,
      totalRecibosEfectivo,
      totalRecibosOtrasFormas,
      totalGastosDiarios,
      gastosDiarios, // detalle para el impreso del cierre
      totalPagosTerceros,
      pagosTerceros, // detalle para el impreso del cierre (GPS, seguro...)
      totalPagosNomina,
      pagosNomina, // detalle para el impreso del cierre (sueldos por empleado)
      totalPrestamosEfectivo,
      prestamosEfectivo, // detalle para el impreso del cierre (financieras)
      totalCompromisosEfectivo,
      compromisosEfectivo, // detalle para el impreso del cierre (compromisos)
      totalPagosSuplidores: totalPagosSuplidoresEfectivo,
      cambioEntregado,
      cantFacturas,
      comprasContadoEfectivo,
      // Fórmula final: Efectivo en Caja = Ventas Contado + Recibos EN EFECTIVO - Devoluciones
      //                - Pagos Suplidores (Efectivo) - Gastos - Préstamos (efectivo)
      //                - Compromisos (efectivo) - Compras de contado (efectivo)
      //                - Pagos a terceros (GPS, seguro...)
      // Los pagos a terceros se separaron de los gastos SOLO para el reporte:
      // aquí se siguen restando igual, porque ese dinero sí salió de la gaveta.
      // Solo lo que de verdad entra a la GAVETA. Antes se usaba
      // totalVentasContado, que incluye las ventas cobradas por
      // transferencia/tarjeta y las del movil: el cierre pedia un efectivo
      // que nunca estuvo en la caja y siempre salia faltante.
      efectivoEnCaja: totalVentasContadoCaja + totalRecibosEfectivo - totalDevoluciones - totalPagosSuplidoresEfectivo - totalGastosDiarios - totalPagosTerceros - totalPagosNomina - totalPrestamosEfectivo - totalCompromisosEfectivo - comprasContadoEfectivo,
    };

    if (soloCalcular) return calculado;

    setResumen(calculado);
    setLoadingResumen(false);
    return calculado;
  }, [fecha, selectedCajero, tenantId]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  // Volver a consultar al regresar a la ventana. El cierre se deja abierto en
  // una pestaña mientras se sigue facturando, cobrando y prestando en otra:
  // sin esto muestra los montos de cuando se abrió, y el descuadre aparece
  // recién al contar el efectivo, cuando ya nadie recuerda qué pasó.
  useEffect(() => {
    const alVolver = () => { if (!document.hidden) fetchResumen(); };
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [fetchResumen]);

  /* ── Desglose math ── */
  const handleCantidadChange = (label, value) => {
    const parsed = parseInt(value, 10);
    setCantidades(prev => ({ ...prev, [label]: isNaN(parsed) ? 0 : parsed }));
  };

  const desgloseTotal = useMemo(() => {
    return DENOMINACIONES.reduce((sum, d) => {
      const cant = cantidades[d.label] || 0;
      if (d.tipo) return sum + cant; // Para tarjetas/cheques/otros el valor se ingresa directo
      return sum + (cant * d.value);
    }, 0);
  }, [cantidades]);

  /* ── Cerrar turno ── */
  const handleCerrarTurno = async () => {
    setSaving(true);
    try {
      const cajeroName = selectedCajero === 'ALL'
        ? 'Todos los Cajeros'
        : (cajeros.find(c => c.id === selectedCajero)?.nombre_completo || 'N/A');

      const cierre = {
        tenant_id: tenantId,
        fecha: formatDateForSupabase(fecha),
        turno,
        cajero_id: selectedCajero === 'ALL' ? user?.id : selectedCajero,
        cajero_nombre: cajeroName,
        total_ventas: resumen?.totalVentas || 0,
        total_ventas_contado: resumen?.totalVentasContado || 0,
        total_ventas_contado_caja: resumen?.totalVentasContadoCaja || 0,
        total_ventas_contado_movil: resumen?.totalVentasContadoMovil || 0,
        total_ventas_credito: resumen?.totalVentasCredito || 0,
        total_itbis: resumen?.totalItbis || 0,
        total_descuento: resumen?.totalDescuento || 0,
        total_devoluciones: resumen?.totalDevoluciones || 0,
        total_recibos: resumen?.totalRecibos || 0,
        total_gastos_diarios: resumen?.totalGastosDiarios || 0,
        cambio_entregado: resumen?.cambioEntregado || 0,
        efectivo_en_caja: resumen?.efectivoEnCaja || 0,
        total_desglose: desgloseTotal,
        diferencia: desgloseTotal - (resumen?.efectivoEnCaja || 0),
        desglose: cantidades,
        usuario_id: user?.id,
        // La foto del cierre, para poder reimprimirlo idéntico. Recalcular el
        // día más tarde daría otro documento: los cobros siguen entrando.
        // Ver sql/cierre_caja_detalle_para_reimprimir.sql
        detalle: resumen || null,
      };

      const { data: cierreRow, error } = await supabase.from('cierres_caja').insert([cierre]).select('id').single();
      if (error) throw error;

      // El efectivo del cierre entra a la cuenta bancaria seleccionada.
      // No bloquea el cierre si el banco falla (el cierre ya quedó grabado).
      const efectivo = resumen?.efectivoEnCaja || 0;
      if (cuentaId && efectivo > 0 && cierreRow?.id) {
        const { error: eMov } = await supabase.rpc('registrar_movimiento_bancario', {
          p_cuenta_id: cuentaId,
          p_tipo: 'ENTRADA',
          p_monto: efectivo,
          p_concepto: `Cierre de caja — turno ${turno} (${formatDateForSupabase(fecha)})`,
          p_referencia: null,
          p_origen_tipo: 'cierre_caja',
          p_origen_id: cierreRow.id,
          p_fecha: formatDateForSupabase(fecha),
        });
        if (eMov) toast({ variant: 'destructive', title: 'Cierre grabado, pero no se registró en la cuenta', description: eMov.message });
      } else if (efectivo > 0 && !cuentaId) {
        // Antes esto pasaba callado y el efectivo no aparecía en ninguna cuenta
        // (cierre del 25/07/2026 en Los Naranjos). Ahora avisa.
        toast({
          variant: 'destructive',
          title: 'El efectivo NO entró a ninguna cuenta',
          description: `Se cerró la caja con ${formatCurrency(efectivo)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`,
        });
      }

      if (imprimir) {
        printCierreCaja(cierre, resumen);
      }

      toast({ title: 'Cierre de Caja', description: `El cierre del turno ${turno} ha sido registrado exitosamente.` });

      // Reset
      setCantidades(DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d.label]: 0 }), {}));
      setShowDesglose(false);
      // Con una sola caja al día el turno no avanza: siempre es el 1.
      if (!unTurno) setTurno(prev => Math.min(prev + 1, turnosPorDia));
      fetchResumen();
    } catch (err) {
      console.error('Error saving cierre:', err);
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo registrar el cierre de caja.' });
    } finally {
      setSaving(false);
    }
  };

  // La pantalla se lee igual que el papel: los renglones en cero no se
  // muestran (salvo los marcados "siempre"), y los totales fuertes cierran
  // cada bloque. Antes la pantalla mostraba conceptos en 0.00 que el impreso
  // ocultaba, y al imprimir el documento no se parecía a lo que se vio.
  const Fila = ({ label, value, bold, isCount, siempre }) =>
    (siempre || Number(value) > 0) ? (
      <div className={`flex justify-between items-center py-1 ${bold ? 'border-t-2 border-morla-blue pt-2' : ''}`}>
        <span className={`text-sm ${bold ? 'font-bold text-morla-blue' : 'text-gray-600'}`}>{label}</span>
        <span className={`font-mono text-sm ${bold ? 'font-bold text-morla-blue text-base' : 'text-gray-800'}`}>
          {isCount ? value : formatCurrency(value)}
        </span>
      </div>
    ) : null;

  const LineaFuerte = ({ label, value }) => (
    <div className="flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800">
      <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{label}</span>
      <span className="font-mono text-sm font-bold text-gray-900">{formatCurrency(value)}</span>
    </div>
  );

  // Todo lo que sale de la gaveta, y lo que entra. Se calculan una vez y se
  // usan igual en el resumen de salidas y en el recuadro final, para que no
  // puedan discrepar entre sí.
  const gastoTotalDe = (r) =>
    (Number(r?.totalGastosDiarios) || 0) + (Number(r?.totalPagosNomina) || 0)
    + (Number(r?.totalPagosTerceros) || 0) + (Number(r?.totalPrestamosEfectivo) || 0)
    + (Number(r?.totalPagosSuplidores) || 0) + (Number(r?.totalCompromisosEfectivo) || 0)
    + (Number(r?.comprasContadoEfectivo) || 0) + (Number(r?.totalDevoluciones) || 0);

  const totalSistemaDe = (r) =>
    (Number(r?.totalVentasContadoCaja ?? r?.totalVentasContado) || 0)
    + (Number(r?.totalRecibosEfectivo ?? r?.totalRecibos) || 0);

  /* ── Print cierre (formato carta 8.5x11) ── */
  const printCierreCajaCarta = (cierre, resumen) => {
    const GASTO_TOTAL = gastoTotalDe(resumen);
    const TOTAL_SISTEMA = totalSistemaDe(resumen);
    // Los renglones en 0.00 no se imprimen (salvo los marcados "siempre")
    const filaResumen = (label, val, bold = false, siempre = false) =>
      (siempre || Number(val) > 0)
        ? `<tr${bold ? ' class="bold"' : ''}><td>${label}</td><td class="num">${formatCurrency(val)}</td></tr>`
        : '';
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { size: letter; margin: 14mm; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #000; }
          h1 { font-size: 22px; margin: 0; }
          .sub { font-size: 14px; letter-spacing: 2px; font-weight: bold; margin-top: 2px; }
          .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 8px; }
          .meta { text-align: right; font-size: 12px; line-height: 1.5; }
          .cols { display: flex; gap: 28px; margin-top: 16px; }
          .col { flex: 1; }
          .sec { font-weight: bold; font-size: 13px; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 14px 0 6px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 3px 2px; border-bottom: 1px solid #ddd; }
          th { text-align: left; border-bottom: 1px solid #000; font-size: 11px; }
          .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .bold { font-weight: bold; }
          .grande { font-size: 15px; font-weight: bold; }
          .caja { border: 2px solid #000; padding: 6px 10px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 10px; }
          .cuadre-final { border: 2px solid #000; margin-top: 14px; }
          .cuadre-final .linea { display: flex; justify-content: space-between; padding: 4px 10px; font-size: 13px; }
          .cuadre-final .total { font-size: 16px; font-weight: bold; padding: 7px 10px; }
          .linea-fuerte { display: flex; justify-content: space-between; border-top: 2px solid #000; margin-top: 4px; padding: 5px 2px 0; font-size: 14px; font-weight: bold; }
          .firmas { display: flex; gap: 60px; margin-top: 60px; }
          .firmas div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 11px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="head">
          <div>
            <h1>${(empresa?.nombre || 'MotoFlow').toUpperCase()}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${formatFechaDMY(cierre.fecha)}</div>
            <div><b>Turno:</b> ${cierre.turno}</div>
            <div><b>Cajero:</b> ${cierre.cajero_nombre}</div>
            ${cierre._reimpresion ? '<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>' : ''}
          </div>
        </div>
        ${cierre._reimpresion ? `<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${formatFechaDMY(cierre.created_at || cierre.fecha)}. No es un cierre nuevo.
          ${cierre._reconstruido ? '<br>Este cierre es anterior al guardado del detalle: el desglose se reconstruyó con los movimientos de esa fecha. Los totales de caja y el conteo de billetes son los que quedaron grabados.' : ''}
          ${cierre._descuadre ? `<br><b>Ojo:</b> hoy esa fecha da ${formatCurrency(cierre._descuadre)} de efectivo, distinto de los ${formatCurrency(cierre.efectivo_en_caja)} que se grabaron. Manda lo grabado.` : ''}
        </div>` : ''}

        <div class="cols">
          <div class="col">
            <!-- Arriba SOLO lo que entró: ventas y cobros. Lo que salió va
                 abajo, cada cosa con su desglose. Mezclar entradas y salidas
                 en una sola lista obligaba a leerla dos veces. -->
            <div class="sec">Entradas del día</div>
            <table><tbody>
              ${filaResumen('Ventas Contado Caja', resumen?.totalVentasContadoCaja)}
              ${filaResumen('Ventas Contado Móvil', resumen?.totalVentasContadoMovil)}
              ${filaResumen('Ventas por Transferencia/Tarjeta', resumen?.totalVentasContadoNoEfectivo)}
              ${filaResumen('Ventas Crédito', resumen?.totalVentasCredito)}
              ${filaResumen('Total Ventas', resumen?.totalVentas, true)}
              ${Number(resumen?.totalRecibosMovil) > 0 ? `
              ${filaResumen('Recibos Ingreso Caja', resumen?.totalRecibosCaja)}
              ${filaResumen('Recibos Ingreso Móvil', resumen?.totalRecibosMovil)}` : ''}
              ${filaResumen('Recibos Ingreso (total)', resumen?.totalRecibos, true)}
              ${Number(resumen?.totalRecibosOtrasFormas) > 0 ? `
              ${filaResumen('· Recibos en Efectivo', resumen?.totalRecibosEfectivo)}
              ${filaResumen('· Recibos Transf/Cheque/Tarjeta', resumen?.totalRecibosOtrasFormas)}` : ''}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${formatCurrency(TOTAL_SISTEMA)}</span></div>

            ${(resumen?.gastosDiarios || []).length ? `
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${resumen.gastosDiarios.map(g => `<tr><td>${(g.tipo_gasto || 'GASTO')}${g.descripcion ? ` — ${g.descripcion}` : ''}</td><td class="num">${formatCurrency(g.monto)}</td></tr>`).join('')}
              <tr class="bold"><td>Total Gastos</td><td class="num">${formatCurrency(resumen?.totalGastosDiarios)}</td></tr>
            </tbody></table>` : ''}

            ${(resumen?.pagosNomina || []).length ? `
            <div class="sec">Nómina pagada hoy (efectivo)</div>
            <table><tbody>
              ${resumen.pagosNomina.map(g => `<tr><td>${g.descripcion || 'NÓMINA'}</td><td class="num">${formatCurrency(g.monto)}</td></tr>`).join('')}
              <tr class="bold"><td>Total Nómina</td><td class="num">${formatCurrency(resumen?.totalPagosNomina)}</td></tr>
            </tbody></table>` : ''}

            ${(resumen?.pagosTerceros || []).length ? `
            <div class="sec">Pagos a terceros (no son gastos de la empresa)</div>
            <table><tbody>
              ${resumen.pagosTerceros.map(g => `<tr><td>${(g.concepto_tercero || 'TERCERO')}${g.descripcion ? ` — ${g.descripcion}` : ''}</td><td class="num">${formatCurrency(g.monto)}</td></tr>`).join('')}
              <tr class="bold"><td>Total entregado a terceros</td><td class="num">${formatCurrency(resumen?.totalPagosTerceros)}</td></tr>
            </tbody></table>` : ''}

            ${(resumen?.prestamosEfectivo || []).length ? `
            <div class="sec">Préstamos (Efectivo)</div>
            <table><tbody>
              ${resumen.prestamosEfectivo.map(p => `<tr><td>${(p.clientes?.nombre || 'PRÉSTAMO')}${p.numero ? ` — ${p.numero}` : ''}</td><td class="num">${formatCurrency(p.monto_capital)}</td></tr>`).join('')}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${formatCurrency(resumen?.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>` : ''}

            ${(resumen?.compromisosEfectivo || []).length ? `
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${resumen.compromisosEfectivo.map(c => `
                <tr><td>${(c.nombre || 'COMPROMISO')}${c.tipo ? ` — ${c.tipo}` : ''}</td><td class="num">${formatCurrency(c.monto_efectivo !== undefined ? c.monto_efectivo : c.monto)}</td></tr>
                ${(c.empleados || []).map(e => `<tr><td style="padding-left:14px;color:#555">· ${e.nombre}${e.yaEnGastos ? ` <i>(ya salió ${e.pagadoAt ? formatFechaDMY(e.pagadoAt) : 'antes'}, en Gastos)</i>` : ''}</td><td class="num" style="color:#555">${formatCurrency(e.monto)}</td></tr>`).join('')}
              `).join('')}
              <tr class="bold"><td>Total Compromisos</td><td class="num">${formatCurrency(resumen?.totalCompromisosEfectivo)}</td></tr>
            </tbody></table>` : ''}

            <!-- Las salidas que no tienen desglose propio. Si están en cero no
                 aparecen, pero cuando existen tienen que verse: si no, el
                 GASTO TOTAL de abajo saldría con dinero que no se explica. -->
            ${(Number(resumen?.totalDevoluciones) > 0 || Number(resumen?.totalPagosSuplidores) > 0 || Number(resumen?.comprasContadoEfectivo) > 0) ? `
            <div class="sec">Otras salidas</div>
            <table><tbody>
              ${filaResumen('Devoluciones', resumen?.totalDevoluciones)}
              ${filaResumen('Pagos Suplidores (Efectivo)', resumen?.totalPagosSuplidores)}
              ${filaResumen('Compras de contado (Efectivo)', resumen?.comprasContadoEfectivo)}
            </tbody></table>` : ''}

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${formatCurrency(GASTO_TOTAL)}</span></div>

            <!-- El cierre termina en un solo recuadro: lo que entró, lo que
                 salió y lo que debe haber en la gaveta. La resta a la vista,
                 en vez de un número suelto arriba que hay que ir a comprobar. -->
            <div class="cuadre-final">
              <div class="linea total"><span>EFECTIVO EN CAJA</span><span>${formatCurrency(resumen?.efectivoEnCaja)}</span></div>
            </div>
          </div>

          <div class="col">
            <div class="sec">Desglose del Dinero en Caja</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${DENOMINACIONES_TODAS.filter(d => Number(cierre.desglose[d.label] || 0) > 0).map(d => {
                  const cant = cierre.desglose[d.label] || 0;
                  const val = d.tipo ? cant : cant * d.value;
                  return `<tr><td>${d.label}</td><td class="num">${cant}</td><td class="num">${formatCurrency(val)}</td></tr>`;
                }).join('')}
                <tr class="grande"><td colspan="2">Total Desglose</td><td class="num">${formatCurrency(cierre.total_desglose)}</td></tr>
                <tr class="grande"><td colspan="2">Diferencia${cierre.diferencia < 0 ? ' (FALTANTE)' : cierre.diferencia > 0 ? ' (SOBRANTE)' : ''}</td><td class="num">${formatCurrency(cierre.diferencia)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="firmas">
          <div>Cajero</div>
          <div>Supervisor</div>
        </div>
      </body>
      </html>
    `;
  };

  /* ── Print cierre ── */
  const printCierreCaja = (cierre, resumen) => {
    const esCarta = (papelCierre || empresa?.formato_cierre_caja || 'pos_80mm') === 'carta';
    const GASTO_TOTAL = gastoTotalDe(resumen);
    const TOTAL_SISTEMA = totalSistemaDe(resumen);
    // Renglones en 0.00 no se imprimen (salvo los marcados "siempre")
    const filaPos = (label, val, opts = {}) =>
      (opts.siempre || Number(val) > 0)
        ? `<div class="row${opts.total ? ' total-row' : ''}"><span>${label}:</span><span${opts.bold ? ' class="bold"' : ''}>${formatCurrency(val)}</span></div>`
        : '';
    const html = esCarta ? printCierreCajaCarta(cierre, resumen) : `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 80mm auto; }
          html, body { margin: 0; padding: 0; background-color: #fff; }
          body {
            width: 68mm; margin: 0; padding: 2mm 4mm;
            box-sizing: border-box; line-height: 1.2;
            font-family: Arial, Helvetica, sans-serif; font-size: 14px;
            font-weight: 700; letter-spacing: 0.2px; color: #000;
            -webkit-print-color-adjust: exact;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: 900; }
          .separator { border-top: 1px dashed #000; margin: 3px 0; }
          h1 { font-size: 19px; margin: 0; font-weight: 900; }
          p { margin: 1px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 1px; }
          .total-row { font-weight: 900; font-size: 16px; border-top: 2px solid #000; padding-top: 3px; margin-top: 4px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="text-center">
          <h1 class="bold">${(empresa?.nombre || 'MotoFlow').toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${cierre._reimpresion ? '<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>' : ''}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${formatFechaDMY(cierre.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${cierre.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${cierre.cajero_nombre}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">ENTRADAS DEL DIA</div>
        ${filaPos('Ventas Contado Caja', resumen?.totalVentasContadoCaja)}
        ${filaPos('Cuenta Contado Móvil', resumen?.totalVentasContadoMovil)}
        ${filaPos('Ventas Transf./Tarjeta', resumen?.totalVentasContadoNoEfectivo)}
        ${filaPos('Ventas Crédito', resumen?.totalVentasCredito)}
        ${filaPos('Total Ventas', resumen?.totalVentas, { bold: true })}
        ${Number(resumen?.totalRecibosMovil) > 0 ? `
        ${filaPos('Recibos Ingreso Caja', resumen?.totalRecibosCaja)}
        ${filaPos('Recibos Ingreso Móvil', resumen?.totalRecibosMovil)}` : ''}
        ${filaPos('Recibos Ingreso (total)', resumen?.totalRecibos)}
        ${Number(resumen?.totalRecibosOtrasFormas) > 0 ? `
        ${filaPos('&nbsp;&nbsp;En Efectivo', resumen?.totalRecibosEfectivo, { siempre: true })}
        ${filaPos('&nbsp;&nbsp;Transf/Cheque/Tarjeta', resumen?.totalRecibosOtrasFormas)}` : ''}
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${formatCurrency(TOTAL_SISTEMA)}</span></div>
        ${(resumen?.gastosDiarios || []).length ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE GASTOS</div>
        ${resumen.gastosDiarios.map(g => `
          <div class="row">
            <span style="max-width: 70%;">${(g.tipo_gasto || 'GASTO')}${g.descripcion ? ` — ${g.descripcion}` : ''}</span>
            <span>${formatCurrency(g.monto)}</span>
          </div>`).join('')}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Gastos:</span><span>${formatCurrency(resumen?.totalGastosDiarios)}</span>
        </div>` : ''}
        ${(resumen?.pagosNomina || []).length ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">NOMINA PAGADA HOY</div>
        ${resumen.pagosNomina.map(g => `
          <div class="row">
            <span style="max-width: 70%;">${g.descripcion || 'NOMINA'}</span>
            <span>${formatCurrency(g.monto)}</span>
          </div>`).join('')}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Nomina:</span><span>${formatCurrency(resumen?.totalPagosNomina)}</span>
        </div>` : ''}
        ${(resumen?.pagosTerceros || []).length ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PAGOS A TERCEROS</div>
        ${resumen.pagosTerceros.map(g => `
          <div class="row">
            <span style="max-width: 70%;">${(g.concepto_tercero || 'TERCERO')}${g.descripcion ? ` — ${g.descripcion}` : ''}</span>
            <span>${formatCurrency(g.monto)}</span>
          </div>`).join('')}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total a terceros:</span><span>${formatCurrency(resumen?.totalPagosTerceros)}</span>
        </div>` : ''}
        ${(resumen?.prestamosEfectivo || []).length ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PRÉSTAMOS (EFECTIVO)</div>
        ${resumen.prestamosEfectivo.map(p => `
          <div class="row">
            <span style="max-width: 70%;">${(p.clientes?.nombre || p.numero || 'PRÉSTAMO')}</span>
            <span>${formatCurrency(p.monto_capital)}</span>
          </div>`).join('')}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Préstamos:</span><span>${formatCurrency(resumen?.totalPrestamosEfectivo)}</span>
        </div>` : ''}
        ${(resumen?.compromisosEfectivo || []).length ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">COMPROMISOS (EFECTIVO)</div>
        ${resumen.compromisosEfectivo.map(c => `
          <div class="row">
            <span style="max-width: 70%;">${(c.nombre || 'COMPROMISO')}</span>
            <span>${formatCurrency(c.monto_efectivo !== undefined ? c.monto_efectivo : c.monto)}</span>
          </div>
          ${(c.empleados || []).map(e => `
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${e.nombre}${e.yaEnGastos ? ' (en Gastos)' : ''}</span>
            <span>${formatCurrency(e.monto)}</span>
          </div>`).join('')}`).join('')}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Compromisos:</span><span>${formatCurrency(resumen?.totalCompromisosEfectivo)}</span>
        </div>` : ''}
        ${(Number(resumen?.totalDevoluciones) > 0 || Number(resumen?.totalPagosSuplidores) > 0 || Number(resumen?.comprasContadoEfectivo) > 0) ? `
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">OTRAS SALIDAS</div>
        ${filaPos('Devoluciones', resumen?.totalDevoluciones)}
        ${filaPos('Pagos Suplidores', resumen?.totalPagosSuplidores)}
        ${filaPos('Compras de contado', resumen?.comprasContadoEfectivo)}` : ''}
        <div class="separator"></div>
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${formatCurrency(GASTO_TOTAL)}</span></div>
        <div class="row total-row"><span>EFECTIVO EN CAJA:</span><span>${formatCurrency(resumen?.efectivoEnCaja)}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${DENOMINACIONES_TODAS.filter(d => Number(cierre.desglose[d.label] || 0) > 0).map(d => {
          const cant = cierre.desglose[d.label] || 0;
          const val = d.tipo ? cant : cant * d.value;
          return `<div class="row">
            <span style="flex: 1;">${d.label}</span>
            <span class="text-right" style="width: 42px;">${cant}</span>
            <span class="text-right" style="width: 84px;">${formatCurrency(val)}</span>
          </div>`;
        }).join('')}
        <div class="row total-row"><span>Total Desglose:</span><span>${formatCurrency(cierre.total_desglose)}</span></div>
        <div class="row" style="margin-top: 6px; font-weight: 900; font-size: 16px;">
          <span>Diferencia${cierre.diferencia < 0 ? ' (FALTANTE)' : cierre.diferencia > 0 ? ' (SOBRANTE)' : ''}:</span>
          <span>${formatCurrency(cierre.diferencia)}</span>
        </div>
        <div class="separator"></div>
        <p class="text-center" style="margin-top: 10px; font-size: 13px;">*** FIN DEL CIERRE ***</p>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
  };

  /* ── Cierres ya grabados: historial y reimpresión ── */
  const cargarHistorial = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from('cierres_caja')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (!error) setHistorial(data || []);
  }, [tenantId]);

  useEffect(() => { if (verHistorial) cargarHistorial(); }, [verHistorial, cargarHistorial]);

  const [reimprimiendo, setReimprimiendo] = useState(null);

  const reimprimir = async (r) => {
    setReimprimiendo(r.id);
    try {
      // Con la foto guardada se reimprime idéntico. Sin ella —los cierres
      // anteriores a hoy— se reconstruye el desglose con los movimientos de
      // esa fecha: es la única forma de que salga con el mismo detalle que el
      // original y no un resumen de dos líneas.
      const reconstruido = !r.detalle;
      const calc = r.detalle || await fetchResumen(r.fecha);
      if (!calc) throw new Error('No se pudo armar el desglose de esa fecha.');

      // El efectivo que manda es el GRABADO, no el que dé la reconstrucción:
      // es contra ese que se contaron los billetes y se sacó la diferencia.
      const dif = Math.abs((Number(calc.efectivoEnCaja) || 0) - (Number(r.efectivo_en_caja) || 0));
      const resumen = reconstruido ? { ...calc, efectivoEnCaja: r.efectivo_en_caja } : calc;

      printCierreCaja({
        ...r,
        _reimpresion: true,
        _reconstruido: reconstruido,
        // Si la reconstrucción no da lo mismo, el documento lo dice. Callarlo
        // sería hacer pasar por fiel una copia que ya no cuadra.
        _descuadre: reconstruido && dif > 0.01 ? calc.efectivoEnCaja : null,
      }, resumen);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo reimprimir', description: e.message });
    } finally {
      setReimprimiendo(null);
    }
  };

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F8' && showDesglose) {
        e.preventDefault();
        handleCerrarTurno();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDesglose) setShowDesglose(false);
        else closePanel('cierre-caja');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDesglose, handleCerrarTurno, closePanel]);

  return (
    <>
      <Helmet>
        <title>Cierre de Caja — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          {/* Title */}
          <div className="bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center">
              CIERRE DE CAJA
            </h1>
            {/* Los paneles son pestañas que quedan abiertas: si el cierre se
                dejó abierto en la mañana, lo que se ve es de la mañana. Se
                refresca solo al volver a la ventana, y este botón está para
                cuando alguien acaba de grabar algo en otra pestaña. */}
            <button
              type="button"
              onClick={() => fetchResumen()}
              disabled={loadingResumen}
              title="Actualizar los montos del día"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingResumen ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filters Row */}
          {/* Rótulo a la izquierda y campo a la derecha: apilados gastaban una
              franja entera arriba, que es la que le hace falta al conteo. */}
          {/* Cerrar una fecha pasada es legítimo y pasa: un apagón deja el
              cuadre para la mañana siguiente. Lo que no puede pasar es
              hacerlo sin darse cuenta, en ninguno de los dos sentidos —
              cerrar ayer creyendo que es hoy, o abrir el calendario en hoy y
              grabar sin cambiarlo, dejando el día anterior sin cerrar. */}
          {fecha && formatDateForSupabase(fecha) !== formatDateForSupabase(getCurrentDateInTimeZone()) && (
            <div className="mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <b>Estás cerrando una fecha pasada: {formatInTimeZone(fecha, 'dd/MM/yyyy')}.</b>{' '}
              Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de
              la gaveta incluye lo de hoy y no va a cuadrar con el conteo.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3">
            {/* Fecha */}
            <div className="flex items-center gap-2 min-w-0">
              <Label className="font-bold text-xs shrink-0">Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2", !fecha && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    {fecha ? formatInTimeZone(fecha, "dd/MM/yyyy") : <span>Seleccione</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fecha} onSelect={setFecha} initialFocus /></PopoverContent>
              </Popover>
            </div>

            {/* Turno. Con una sola caja al día no se pregunta: nadie tiene que
                entender qué es un turno para cerrar la suya. */}
            {!unTurno && (
              <div className="flex items-center gap-2 min-w-0">
                <Label className="font-bold text-xs shrink-0">Turno</Label>
                <Input
                  type="number"
                  min="1"
                  max={turnosPorDia}
                  value={turno}
                  onChange={e => setTurno(parseInt(e.target.value, 10) || 1)}
                  onFocus={e => e.target.select()}
                  className="flex-1 min-w-0 h-8 text-center font-bold px-2"
                />
              </div>
            )}

            {/* Caja */}
            <div className="flex items-center gap-2 min-w-0">
              <Label className="font-bold text-xs shrink-0">Caja</Label>
              <Select value="caja1" disabled>
                <SelectTrigger className="flex-1 min-w-0 h-8 text-sm px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caja1">Caja No. 1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cajero */}
            <div className="flex items-center gap-2 min-w-0">
              <Label className="font-bold text-xs shrink-0">Cajero</Label>
              <Select value={selectedCajero} onValueChange={setSelectedCajero}>
                <SelectTrigger className="flex-1 min-w-0 h-8 text-sm px-2"><SelectValue placeholder="Seleccione cajero" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="font-bold text-morla-blue">
                    📊 Todos los Cajeros (Consolidado)
                  </SelectItem>
                  {cajeros.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_completo || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Resumen Section ── */}
          {loadingResumen ? (
            <div className="flex-grow flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-morla-blue" />
            </div>
          ) : resumen ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
              {/* Summary Card */}
              <div className="border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50">
                <h2 className="font-bold text-sm uppercase text-gray-500 tracking-wider mb-3">
                  {selectedCajero === 'ALL' ? 'Resumen Total del Día' : 'Resumen del Turno'}
                </h2>
                <div className="space-y-2">
                  {/* ── LO QUE ENTRÓ ── */}
                  <Fila label="Cantidad de Facturas" value={resumen.cantFacturas} isCount siempre />
                  <Fila label="Ventas Contado Caja" value={resumen.totalVentasContadoCaja} />
                  <Fila label="Cuenta Contado Móvil" value={resumen.totalVentasContadoMovil} />
                  <Fila label="Ventas por Transferencia/Tarjeta" value={resumen.totalVentasContadoNoEfectivo} />
                  <Fila label="Ventas Crédito" value={resumen.totalVentasCredito} />
                  <Fila label="Total Ventas" value={resumen.totalVentas} bold />
                  {/* "Caja" y "Móvil" solo cuando hubo cobros por el móvil: si
                      no, "Caja" repite el mismo número que el total. */}
                  {Number(resumen.totalRecibosMovil) > 0 && (
                    <>
                      <Fila label="Recibos de Ingreso Caja" value={resumen.totalRecibosCaja} />
                      <Fila label="Recibos de Ingreso Móvil" value={resumen.totalRecibosMovil} />
                    </>
                  )}
                  <Fila label="Recibos de Ingreso (total)" value={resumen.totalRecibos} />
                  {Number(resumen.totalRecibosOtrasFormas) > 0 && (
                    <>
                      <Fila label="· Recibos en Efectivo" value={resumen.totalRecibosEfectivo} />
                      <Fila label="· Recibos Transf/Cheque/Tarjeta" value={resumen.totalRecibosOtrasFormas} />
                    </>
                  )}
                  <LineaFuerte label="Total ingreso en caja" value={totalSistemaDe(resumen)} />

                  {/* ── LO QUE SALIÓ ── */}
                  <Fila label="Gastos Diarios" value={resumen.totalGastosDiarios} />
                  <Fila label="Nómina (Efectivo)" value={resumen.totalPagosNomina} />

                  {/* Los sueldos pagados hoy, uno por uno. Es lo mismo que se
                      firma en la nómina, así que se puede cotejar directo. */}
                  {(resumen.pagosNomina || []).length > 0 && (
                    <div className="mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200">
                      {resumen.pagosNomina.map((g) => (
                        <div key={g.id || g.descripcion} className="flex justify-between items-center py-0.5">
                          <span className="text-xs text-gray-500 truncate pr-2" title={g.descripcion}>
                            {String(g.descripcion || 'Nómina').split('—').pop().trim()}
                          </span>
                          <span className="font-mono text-xs text-gray-600 shrink-0">{formatCurrency(g.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Fila label="Pagos a terceros (GPS, seguro...)" value={resumen.totalPagosTerceros} />
                  <Fila label="Préstamos (Efectivo)" value={resumen.totalPrestamosEfectivo} />
                  <Fila label="Compromisos (Efectivo)" value={resumen.totalCompromisosEfectivo} />

                  {/* La nómina se abre por empleado: un RD$8,000 redondo no se
                      puede cuadrar contra los recibos que firmó cada uno. */}
                  {(resumen.compromisosEfectivo || [])
                    .filter((c) => (c.empleados || []).length > 0)
                    .map((c) => (
                      <div key={c.id} className="mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{c.nombre}</p>
                        {c.empleados.map((e, i) => (
                          <div key={`${c.id}-${i}`} className="flex justify-between items-center py-0.5">
                            <span className={`text-xs truncate pr-2 ${e.yaEnGastos ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                              {e.nombre}
                            </span>
                            <span className={`font-mono text-xs shrink-0 ${e.yaEnGastos ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                              {formatCurrency(e.monto)}
                            </span>
                          </div>
                        ))}
                        {/* Tachado = ese sueldo ya salió el día que se le pagó,
                            por su propio gasto. Contarlo aquí otra vez era lo
                            que inflaba el cuadre. */}
                        {Number(c.cubierto) > 0 && (
                          <p className="text-[10px] text-amber-700 leading-snug mt-0.5">
                            {formatCurrency(c.cubierto)} ya salió como gasto el día de cada pago; aquí solo entra{' '}
                            {formatCurrency(c.monto_efectivo)}.
                          </p>
                        )}
                      </div>
                    ))}
                  {/* Salidas sin desglose propio. Ocultas si están en cero,
                      pero el día que existan tienen que verse: si no, el gasto
                      total saldría con dinero que la pantalla no explica. */}
                  <Fila label="Devoluciones" value={resumen.totalDevoluciones} />
                  <Fila label="Pagos a Suplidores (Efectivo)" value={resumen.totalPagosSuplidores} />
                  <Fila label="Compras de contado (Efectivo)" value={resumen.comprasContadoEfectivo} />

                  <LineaFuerte label="Gasto total" value={gastoTotalDe(resumen)} />

                  <div className="flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30">
                    <span className="font-bold text-morla-blue">Efectivo en Caja</span>
                    <span className="font-bold text-morla-blue text-lg font-mono">{formatCurrency(resumen.efectivoEnCaja)}</span>
                  </div>
                </div>
              </div>

              {/* Actions / Desglose Card */}
              <div className="border rounded-lg p-4 flex flex-col">
                {!showDesglose ? (
                  /* Un solo camino: contar el efectivo. El botón viejo de
                     "Cerrar el Turno" grababa sin contar —desglose en cero y
                     toda la caja como faltante, como el cierre del 28/07— y un
                     cierre así no dice si sobró o faltó, dice que no se contó. */
                  <div className="flex-grow flex flex-col items-center justify-center gap-4">
                    <Button
                      onClick={() => setShowDesglose(true)}
                      size="lg"
                      className="bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg"
                    >
                      <Coins className="h-5 w-5" />
                      Contar Efectivo y Cerrar {unTurno ? 'Caja' : 'Turno'}
                    </Button>
                    <p className="text-xs text-gray-400 text-center max-w-[260px]">
                      Se cuentan los billetes y al grabar el desglose {unTurno ? 'la caja queda cerrada' : 'el turno queda cerrado'}.
                    </p>
                  </div>
                ) : (
                  /* ── Desglose de Monedas ── */
                  <div className="flex flex-col h-full">
                    {/* La moneda va en la misma línea del título: ocupaba un
                        renglón entero para decir siempre lo mismo. */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h3 className="font-bold text-sm uppercase tracking-widest text-gray-600">
                        DESGLOSE DE MONEDAS
                      </h3>
                      <Select value="DOP" disabled>
                        <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="DOP">DOP - PESO</SelectItem></SelectContent>
                      </Select>
                    </div>

                    <ScrollArea className="flex-grow border rounded-lg max-h-[380px]">
                      <Table>
                        <TableHeader className="bg-gray-200 sticky top-0 z-10">
                          <TableRow className="h-8">
                            <TableHead className="w-20 h-8 py-1 font-bold text-xs">MONEDA</TableHead>
                            <TableHead className="w-24 h-8 py-1 font-bold text-center text-xs">CANTIDAD</TableHead>
                            <TableHead className="h-8 py-1 text-right font-bold text-xs">VALOR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {DENOMINACIONES.map(d => {
                            const cant = cantidades[d.label] || 0;
                            const val = d.tipo ? cant : cant * d.value;
                            return (
                              <TableRow key={d.label} className="hover:bg-yellow-50/50">
                                <TableCell className="py-0.5 font-semibold text-right pr-4 text-sm">{d.label}</TableCell>
                                <TableCell className="py-0.5 text-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={cant}
                                    onChange={e => handleCantidadChange(d.label, e.target.value)}
                                    // Al entrar en la casilla se selecciona el 0
                                    // para que se pise al teclear. Si no, un 3
                                    // sobre el 0 quedaba en 30 y el cuadre salía
                                    // disparado sin que se notara.
                                    onFocus={e => e.target.select()}
                                    onClick={e => e.target.select()}
                                    className="w-20 mx-auto text-center h-6 text-sm px-1"
                                  />
                                </TableCell>
                                <TableCell className="py-0.5 text-right font-mono text-sm">{formatCurrency(val)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 bg-yellow-100 z-10">
                          <TableRow className="font-bold">
                            <TableCell colSpan={2} className="py-1 text-right text-red-600 uppercase text-sm">TOTAL ==&gt;</TableCell>
                            <TableCell className="py-1 text-right text-red-600 font-mono text-base">{formatCurrency(desgloseTotal)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </ScrollArea>

                    <div className="mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <CuentaBancariaSelect
                        value={cuentaId} onChange={setCuentaId} moneda="DOP" contexto="cierre_caja"
                        label="Depositar en" inline
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={imprimir}
                          onChange={e => setImprimir(e.target.checked)}
                          className="rounded"
                        />
                        <Printer className="h-4 w-4" />
                        Imprimir ?
                      </label>
                      {imprimir && (
                        <select
                          value={papelCierre || empresa?.formato_cierre_caja || 'pos_80mm'}
                          onChange={(e) => cambiarPapelCierre(e.target.value)}
                          className="h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white"
                          title="Papel del impreso — se recuerda en esta PC"
                        >
                          <option value="pos_80mm">📑 Ticket 80mm</option>
                          <option value="carta">📄 Carta (8.5 x 11)</option>
                        </select>
                      )}
                      <Button
                        onClick={handleCerrarTurno}
                        disabled={saving}
                        className="bg-morla-blue hover:bg-morla-blue/90 text-white gap-2"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        F8 - Grabar y Cerrar {unTurno ? 'Caja' : 'Turno'}
                      </Button>
                    </div>

                    {/* Diferencia indicator */}
                    {resumen && (
                      <div className={`mt-3 p-3 rounded-lg text-center font-bold text-sm ${
                        desgloseTotal - resumen.efectivoEnCaja === 0
                          ? 'bg-green-100 text-green-700'
                          : desgloseTotal - resumen.efectivoEnCaja < 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        Diferencia: {formatCurrency(desgloseTotal - resumen.efectivoEnCaja)}
                        {desgloseTotal - resumen.efectivoEnCaja === 0 && ' ✓ Cuadra'}
                        {desgloseTotal - resumen.efectivoEnCaja < 0 && ' (Faltante)'}
                        {desgloseTotal - resumen.efectivoEnCaja > 0 && ' (Sobrante)'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Bottom Actions */}
          {/* Cierres ya grabados. Antes, una vez impreso el cierre no había
              forma de volver a sacarlo: se imprimía solo al cerrar el turno. */}
          <div className="mt-4 border rounded-lg">
            <button
              type="button"
              onClick={() => setVerHistorial((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700">Cierres anteriores</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${verHistorial ? 'rotate-180' : ''}`} />
            </button>

            {verHistorial && (
              <div className="border-t max-h-72 overflow-y-auto">
                {historial.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400 italic">No hay cierres grabados.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Turno</TableHead>
                        <TableHead className="text-xs">Cajero</TableHead>
                        <TableHead className="text-xs text-right">Efectivo</TableHead>
                        <TableHead className="text-xs text-right">Contado</TableHead>
                        <TableHead className="text-xs text-right">Diferencia</TableHead>
                        <TableHead className="text-xs text-right">&nbsp;</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historial.map((r) => {
                        const dif = Number(r.diferencia) || 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm py-1.5">{formatFechaDMY(r.fecha)}</TableCell>
                            <TableCell className="text-sm py-1.5">{r.turno}</TableCell>
                            <TableCell className="text-sm py-1.5 max-w-[160px] truncate" title={r.cajero_nombre}>
                              {r.cajero_nombre}
                            </TableCell>
                            <TableCell className="text-sm py-1.5 text-right font-mono">{formatCurrency(r.efectivo_en_caja)}</TableCell>
                            <TableCell className="text-sm py-1.5 text-right font-mono">{formatCurrency(r.total_desglose)}</TableCell>
                            <TableCell className={`text-sm py-1.5 text-right font-mono ${
                              Math.abs(dif) < 0.005 ? 'text-green-600' : dif < 0 ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {formatCurrency(dif)}
                            </TableCell>
                            <TableCell className="text-right py-1.5">
                              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                disabled={reimprimiendo === r.id}
                                onClick={() => reimprimir(r)}>
                                {reimprimiendo === r.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Printer className="h-3.5 w-3.5" />} Reimprimir
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                <p className="px-4 py-2 text-[11px] text-gray-400 italic border-t">
                  Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados.
                </p>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 flex justify-end items-center space-x-4 border-t">
            <Button
              variant="outline"
              onClick={() => closePanel('cierre-caja')}
              className="gap-2"
            >
              <X className="h-4 w-4" /> ESC - Salir
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default CierreCajaPage;
