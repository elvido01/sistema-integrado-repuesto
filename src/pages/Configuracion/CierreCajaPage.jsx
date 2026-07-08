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
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, Lock, Printer, X, Loader2, Coins, Save, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────── Denominaciones de moneda ──────────────── */
const DENOMINACIONES = [
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

const formatCurrency = (v) =>
  new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

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
  const [cajeros, setCajeros] = useState([]);
  const [selectedCajero, setSelectedCajero] = useState('ALL');
  const [showDesglose, setShowDesglose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [imprimir, setImprimir] = useState(true);

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

  /* ── Fetch resumen del turno ── */
  const fetchResumen = useCallback(async () => {
    if (!fecha) return;
    setLoadingResumen(true);

    const fechaStr = formatDateForSupabase(fecha);
    const startOfDay = `${fechaStr}T00:00:00`;
    const endOfDay = `${fechaStr}T23:59:59`;

    let ventas = [];
    let devoluciones = [];
    let recibos = [];
    let pagosSuplidores = [];
    let gastosDiarios = [];

    try {
      // Ventas del día
      let ventasQuery = supabase
        .from('facturas')
        .select('id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas')
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
        ventas = ventasData || [];
      }

      let ventasMovilesQuery = supabase
        .from('facturas')
        .select('id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas')
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
        .select('monto_pagado, fecha, created_at, origen')
        .eq('tenant_id', tenantId)
        .eq('fecha', fechaStr);

      if (recibosErr) {
        console.warn('Error cargando recibos por fecha:', recibosErr.message);
        // Fallback: intentar por created_at (TIMESTAMPTZ)
        const { data: recibosCreatedData, error: recibosCreatedErr } = await supabase
          .from('recibos_ingreso')
          .select('monto_pagado, created_at, origen')
          .eq('tenant_id', tenantId)
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
        .select('monto, descripcion, tipo_gasto')
        .eq('tenant_id', tenantId)
        .eq('fecha', fechaStr)
        .eq('anulado', false);

      if (gastosErr) {
        console.warn('Error cargando gastos diarios:', gastosErr.message);
      } else {
        gastosDiarios = gastosData || [];
      }
    } catch (e) {
      console.warn('Exception cargando gastos diarios:', e);
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

    const totalVentasContadoCaja = Math.max(0, totalVentasContado - totalVentasContadoMovil);

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
    const totalGastosDiarios = gastosDiarios.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalPagosSuplidoresEfectivo = pagosSuplidores.reduce((sum, p) => {
      const efectivo = (p.formas_pago || []).filter(fp => fp.forma === 'Efectivo')
        .reduce((s, fp) => s + (parseFloat(fp.monto) || 0), 0);
      return sum + efectivo;
    }, 0);

    const cambioEntregado = ventas
      .filter(v => v.forma_pago === 'CONTADO')
      .reduce((sum, v) => sum + (parseFloat(v.cambio) || 0), 0);

    const cantFacturas = ventas.length;

    setResumen({
      totalVentas,
      totalVentasContado,
      totalVentasContadoCaja,
      totalVentasContadoMovil,
      totalVentasCredito,
      totalItbis,
      totalDescuento,
      totalDevoluciones,
      totalRecibos,
      totalRecibosMovil,
      totalRecibosCaja,
      totalGastosDiarios,
      gastosDiarios, // detalle para el impreso del cierre
      totalPagosSuplidores: totalPagosSuplidoresEfectivo,
      cambioEntregado,
      cantFacturas,
      // Fórmula final: Efectivo en Caja = Ventas Contado + Recibos de Ingreso - Devoluciones - Pagos Suplidores (Efectivo)
      efectivoEnCaja: totalVentasContado + totalRecibos - totalDevoluciones - totalPagosSuplidoresEfectivo - totalGastosDiarios,
    });

    setLoadingResumen(false);
  }, [fecha, selectedCajero, tenantId]);

  useEffect(() => {
    fetchResumen();
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
      };

      const { error } = await supabase.from('cierres_caja').insert([cierre]);
      if (error) throw error;

      if (imprimir) {
        printCierreCaja(cierre, resumen);
      }

      toast({ title: 'Cierre de Caja', description: `El cierre del turno ${turno} ha sido registrado exitosamente.` });

      // Reset
      setCantidades(DENOMINACIONES.reduce((acc, d) => ({ ...acc, [d.label]: 0 }), {}));
      setShowDesglose(false);
      setTurno(prev => prev + 1);
      fetchResumen();
    } catch (err) {
      console.error('Error saving cierre:', err);
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo registrar el cierre de caja.' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Print cierre (formato carta 8.5x11) ── */
  const printCierreCajaCarta = (cierre, resumen) => {
    const filaResumen = (label, val, bold = false) =>
      `<tr${bold ? ' class="bold"' : ''}><td>${label}</td><td class="num">${formatCurrency(val)}</td></tr>`;
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { size: letter; margin: 14mm; }
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #000; }
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
            <div><b>Fecha:</b> ${formatInTimeZone(new Date(cierre.fecha), 'dd/MM/yyyy')}</div>
            <div><b>Turno:</b> ${cierre.turno}</div>
            <div><b>Cajero:</b> ${cierre.cajero_nombre}</div>
          </div>
        </div>

        <div class="cols">
          <div class="col">
            <div class="sec">Resumen de Ventas</div>
            <table><tbody>
              ${filaResumen('Ventas Contado Caja', resumen?.totalVentasContadoCaja)}
              ${filaResumen('Ventas Contado Móvil', resumen?.totalVentasContadoMovil)}
              ${filaResumen('Ventas Crédito', resumen?.totalVentasCredito)}
              ${filaResumen('Total Ventas', resumen?.totalVentas, true)}
              ${filaResumen('Devoluciones', resumen?.totalDevoluciones)}
              ${filaResumen('Recibos Ingreso Caja', resumen?.totalRecibosCaja)}
              ${filaResumen('Recibos Ingreso Móvil', resumen?.totalRecibosMovil)}
              ${filaResumen('Recibos Ingreso (total)', resumen?.totalRecibos)}
              ${filaResumen('Pagos Suplidores', resumen?.totalPagosSuplidores)}
              ${filaResumen('Gastos Diarios', resumen?.totalGastosDiarios)}
            </tbody></table>
            <div class="caja"><span>EFECTIVO EN CAJA</span><span>${formatCurrency(resumen?.efectivoEnCaja)}</span></div>

            ${(resumen?.gastosDiarios || []).length ? `
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${resumen.gastosDiarios.map(g => `<tr><td>${(g.tipo_gasto || 'GASTO')}${g.descripcion ? ` — ${g.descripcion}` : ''}</td><td class="num">${formatCurrency(g.monto)}</td></tr>`).join('')}
              <tr class="bold"><td>Total Gastos</td><td class="num">${formatCurrency(resumen?.totalGastosDiarios)}</td></tr>
            </tbody></table>` : ''}
          </div>

          <div class="col">
            <div class="sec">Desglose de Monedas</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${DENOMINACIONES.map(d => {
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
    const esCarta = (empresa?.formato_cierre_caja || 'pos_80mm') === 'carta';
    const html = esCarta ? printCierreCajaCarta(cierre, resumen) : `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 80mm auto; }
          body {
            width: 72mm; margin: 0 auto; padding: 2mm 4mm;
            font-family: Arial, Helvetica, sans-serif; font-size: 14px;
            font-weight: 700; letter-spacing: 0.2px; color: #000;
            -webkit-print-color-adjust: exact;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: 900; }
          .separator { border-top: 1px dashed #000; margin: 5px 0; }
          h1 { font-size: 19px; margin: 0; font-weight: 900; }
          .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          .total-row { font-weight: 900; font-size: 16px; border-top: 2px solid #000; padding-top: 4px; margin-top: 6px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="text-center">
          <h1 class="bold">${(empresa?.nombre || 'MotoFlow').toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${formatInTimeZone(new Date(cierre.fecha), 'dd/MM/yyyy')}</span></div>
        <div class="row"><span>Turno:</span><span>${cierre.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${cierre.cajero_nombre}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">RESUMEN DE VENTAS</div>
        <div class="row"><span>Ventas Contado Caja:</span><span>${formatCurrency(resumen?.totalVentasContadoCaja)}</span></div>
        <div class="row"><span>Cuenta Contado Móvil:</span><span>${formatCurrency(resumen?.totalVentasContadoMovil)}</span></div>
        <div class="row"><span>Ventas Crédito:</span><span>${formatCurrency(resumen?.totalVentasCredito)}</span></div>
        <div class="row"><span>Total Ventas:</span><span class="bold">${formatCurrency(resumen?.totalVentas)}</span></div>
        <div class="row"><span>Devoluciones:</span><span>${formatCurrency(resumen?.totalDevoluciones)}</span></div>
        <div class="row"><span>Recibos Ingreso Caja:</span><span>${formatCurrency(resumen?.totalRecibosCaja)}</span></div>
        <div class="row"><span>Recibos Ingreso Móvil:</span><span>${formatCurrency(resumen?.totalRecibosMovil)}</span></div>
        <div class="row"><span>Recibos Ingreso (total):</span><span>${formatCurrency(resumen?.totalRecibos)}</span></div>
        <div class="row"><span>Pagos Suplidores:</span><span>${formatCurrency(resumen?.totalPagosSuplidores)}</span></div>
        <div class="row"><span>Gastos Diarios:</span><span>${formatCurrency(resumen?.totalGastosDiarios)}</span></div>
        <div class="row total-row"><span>Efectivo en Caja:</span><span>${formatCurrency(resumen?.efectivoEnCaja)}</span></div>
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
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE MONEDAS</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${DENOMINACIONES.map(d => {
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
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
              CIERRE DE CAJA
            </h1>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg mb-4">
            {/* Fecha */}
            <div className="space-y-1">
              <Label className="font-bold">Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fecha && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fecha ? formatInTimeZone(fecha, "dd/MM/yyyy") : <span>Seleccione</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fecha} onSelect={setFecha} initialFocus /></PopoverContent>
              </Popover>
            </div>

            {/* Turno */}
            <div className="space-y-1">
              <Label className="font-bold">Turno</Label>
              <Input
                type="number"
                min="1"
                value={turno}
                onChange={e => setTurno(parseInt(e.target.value, 10) || 1)}
                className="text-center font-bold text-lg"
              />
            </div>

            {/* Caja */}
            <div className="space-y-1">
              <Label className="font-bold">Caja</Label>
              <Select value="caja1" disabled>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caja1">Caja No. 1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cajero */}
            <div className="space-y-1">
              <Label className="font-bold">Cajero</Label>
              <Select value={selectedCajero} onValueChange={setSelectedCajero}>
                <SelectTrigger><SelectValue placeholder="Seleccione cajero" /></SelectTrigger>
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
                  {[
                    ['Cantidad de Facturas', resumen.cantFacturas, false, true],
                    ['Ventas Contado Caja', resumen.totalVentasContadoCaja],
                    ['Cuenta Contado Móvil', resumen.totalVentasContadoMovil],
                    ['Ventas Crédito', resumen.totalVentasCredito],
                    ['Total Ventas', resumen.totalVentas, true],
                    ['Devoluciones', resumen.totalDevoluciones],
                    ['Recibos de Ingreso Caja', resumen.totalRecibosCaja],
                    ['Recibos de Ingreso Móvil', resumen.totalRecibosMovil],
                    ['Recibos de Ingreso (total)', resumen.totalRecibos],
                    ['Pagos a Suplidores (Efectivo)', resumen.totalPagosSuplidores],
                    ['Gastos Diarios', resumen.totalGastosDiarios],
                  ].map(([label, value, bold, isCount]) => (
                    <div key={label} className={`flex justify-between items-center py-1 ${bold ? 'border-t-2 border-morla-blue pt-2' : ''}`}>
                      <span className={`text-sm ${bold ? 'font-bold text-morla-blue' : 'text-gray-600'}`}>{label}</span>
                      <span className={`font-mono text-sm ${bold ? 'font-bold text-morla-blue text-base' : 'text-gray-800'}`}>
                        {isCount ? value : formatCurrency(value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30">
                    <span className="font-bold text-morla-blue">Efectivo en Caja</span>
                    <span className="font-bold text-morla-blue text-lg font-mono">{formatCurrency(resumen.efectivoEnCaja)}</span>
                  </div>
                </div>
              </div>

              {/* Actions / Desglose Card */}
              <div className="border rounded-lg p-4 flex flex-col">
                {!showDesglose ? (
                  <div className="flex-grow flex flex-col items-center justify-center gap-6">
                    <Button
                      onClick={() => {
                        handleCerrarTurno();
                      }}
                      disabled={saving}
                      size="lg"
                      className="bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg"
                    >
                      {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                      Cerrar el Turno
                    </Button>

                    <Button
                      onClick={() => setShowDesglose(true)}
                      variant="outline"
                      size="lg"
                      className="bg-cyan-600 hover:bg-cyan-700 text-white px-8 py-6 text-base gap-3 shadow-lg border-none"
                    >
                      <Coins className="h-5 w-5" />
                      Desglose de Monedas
                    </Button>
                  </div>
                ) : (
                  /* ── Desglose de Monedas ── */
                  <div className="flex flex-col h-full">
                    <h3 className="font-bold text-center text-sm uppercase tracking-widest text-gray-600 mb-3">
                      DESGLOSE DE MONEDAS
                    </h3>

                    <div className="mb-3">
                      <Label className="text-xs text-gray-500">Moneda</Label>
                      <Select value="DOP" disabled>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="DOP">DOP - PESO</SelectItem></SelectContent>
                      </Select>
                    </div>

                    <ScrollArea className="flex-grow border rounded-lg max-h-[380px]">
                      <Table>
                        <TableHeader className="bg-gray-200 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-24 font-bold">MONEDA</TableHead>
                            <TableHead className="w-28 font-bold text-center">CANTIDAD</TableHead>
                            <TableHead className="text-right font-bold">VALOR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {DENOMINACIONES.map(d => {
                            const cant = cantidades[d.label] || 0;
                            const val = d.tipo ? cant : cant * d.value;
                            return (
                              <TableRow key={d.label} className="hover:bg-yellow-50/50">
                                <TableCell className="font-semibold text-right pr-4">{d.label}</TableCell>
                                <TableCell className="text-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={cant}
                                    onChange={e => handleCantidadChange(d.label, e.target.value)}
                                    className="w-20 mx-auto text-center h-7 text-sm"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(val)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 bg-yellow-100 z-10">
                          <TableRow className="font-bold">
                            <TableCell colSpan={2} className="text-right text-red-600 uppercase">TOTAL ==&gt;</TableCell>
                            <TableCell className="text-right text-red-600 font-mono text-base">{formatCurrency(desgloseTotal)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </ScrollArea>

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
                      <Button
                        onClick={handleCerrarTurno}
                        disabled={saving}
                        className="bg-morla-blue hover:bg-morla-blue/90 text-white gap-2"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        F8 - Grabar el Desglose
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
