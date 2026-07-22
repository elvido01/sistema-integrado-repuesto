import React, { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import ExcelJS from 'exceljs';
import { formatDateForSupabase } from '@/lib/dateUtils';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const primerDiaMesISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const n = (value) => Number(value || 0);
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const money = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const descargarExcel = async ({ nombre, resumen, ventas, devoluciones, gastos }) => {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Estado de Resultado');
  ws.columns = [
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: '#,##0.00' } },
    { header: '% Ventas', key: 'porcentaje', width: 12 },
  ];
  resumen.forEach(row => ws.addRow(row));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };

  const wsVentas = wb.addWorksheet('Ventas');
  wsVentas.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Factura', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Descuento', key: 'descuento', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Recargo', key: 'recargo', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Costo Venta', key: 'costo', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Total', key: 'total', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  ventas.forEach(v => wsVentas.addRow(v));

  const wsDev = wb.addWorksheet('Devoluciones');
  wsDev.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Documento', key: 'numero', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Descuento', key: 'descuento', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Costo Devuelto', key: 'costo', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Total', key: 'total', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  devoluciones.forEach(d => wsDev.addRow(d));

  const wsGastos = wb.addWorksheet('Gastos');
  wsGastos.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Monto', key: 'monto', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  gastos.forEach(g => wsGastos.addRow(g));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const EstadoResultadosPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [loading, setLoading] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [compromisos, setCompromisos] = useState([]);
  const [transacciones, setTransacciones] = useState([]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [facturasRes, devolucionesRes, compromisosRes, transaccionesRes] = await Promise.all([
        supabase.from('facturas')
          .select('id, numero, fecha, subtotal, descuento, recargo, itbis, total, estado, clientes(nombre), facturas_detalle(cantidad, costo_unitario, importe, productos(costo))')
          .gte('fecha', desde)
          .lte('fecha', `${hasta}T23:59:59`)
          .neq('estado', 'ANULADA')
          .order('fecha', { ascending: true }),
        supabase.from('devoluciones')
          .select('id, numero, fecha_devolucion, subtotal, descuento_total, itbis_total, total_devolucion, clientes(nombre), devoluciones_detalle(cantidad, productos(costo))')
          .gte('fecha_devolucion', desde)
          .lte('fecha_devolucion', hasta)
          .order('fecha_devolucion', { ascending: true }),
        supabase.from('compromisos')
          .select('id, nombre, monto, fecha, tipo, activo')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .eq('activo', false)
          .order('fecha', { ascending: true }),
        supabase.rpc('get_transacciones_diarias_sin_limite', {
          p_fecha_desde: formatDateForSupabase(new Date(`${desde}T12:00:00`)),
          p_fecha_hasta: formatDateForSupabase(new Date(`${hasta}T12:00:00`)),
          p_cliente_id: null,
          p_tipo_transaccion: null,
        }),
      ]);

      if (facturasRes.error) throw facturasRes.error;
      if (devolucionesRes.error) throw devolucionesRes.error;
      if (compromisosRes.error) throw compromisosRes.error;
      if (transaccionesRes.error) throw transaccionesRes.error;

      setVentas(facturasRes.data || []);
      setDevoluciones(devolucionesRes.data || []);
      setCompromisos(compromisosRes.data || []);
      setTransacciones(transaccionesRes.data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar estado de resultado', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, desde, hasta, toast]);

  React.useEffect(() => { cargar(); }, [cargar]);

  const ventasDetalle = useMemo(() => ventas.map(v => {
    const costo = (v.facturas_detalle || []).reduce((sum, d) => {
      const costoUnitario = n(d.costo_unitario) || n(d.productos?.costo);
      return sum + (n(d.cantidad) * costoUnitario);
    }, 0);
    return {
      id: v.id,
      fecha: fecha(v.fecha),
      numero: v.numero,
      cliente: v.clientes?.nombre || '',
      subtotal: n(v.subtotal),
      descuento: n(v.descuento),
      recargo: n(v.recargo),
      itbis: n(v.itbis),
      costo,
      total: n(v.total),
      ventaNeta: Math.max(0, n(v.total) - n(v.itbis)),
    };
  }), [ventas]);

  const devolucionesDetalle = useMemo(() => devoluciones.map(d => {
    const costo = (d.devoluciones_detalle || []).reduce((sum, item) => (
      sum + (n(item.cantidad) * n(item.productos?.costo))
    ), 0);
    return {
      id: d.id,
      fecha: fecha(d.fecha_devolucion),
      numero: d.numero,
      cliente: d.clientes?.nombre || '',
      subtotal: n(d.subtotal),
      descuento: n(d.descuento_total),
      itbis: n(d.itbis_total),
      costo,
      total: n(d.total_devolucion),
      ventaNeta: Math.max(0, n(d.total_devolucion) - n(d.itbis_total)),
    };
  }), [devoluciones]);

  const gastosDetalle = useMemo(() => compromisos.map(c => ({
    id: c.id,
    fecha: fecha(c.fecha),
    concepto: c.nombre,
    tipo: c.tipo || 'Compromiso',
    monto: n(c.monto),
  })), [compromisos]);

  const totales = useMemo(() => {
    const ventasBrutas = ventasDetalle.reduce((sum, v) => sum + v.subtotal, 0);
    const descuentosVentas = ventasDetalle.reduce((sum, v) => sum + v.descuento, 0);
    const recargos = ventasDetalle.reduce((sum, v) => sum + v.recargo, 0);
    const ventasNetasFacturadas = ventasDetalle.reduce((sum, v) => sum + v.ventaNeta, 0);
    const devolucionesVentas = devolucionesDetalle.reduce((sum, d) => sum + d.ventaNeta, 0);
    const ajusteFacturas = ventasNetasFacturadas - (ventasBrutas - descuentosVentas + recargos);
    const ventasNetas = ventasNetasFacturadas - devolucionesVentas;
    const costoVentas = ventasDetalle.reduce((sum, v) => sum + v.costo, 0) - devolucionesDetalle.reduce((sum, d) => sum + d.costo, 0);
    const utilidadBruta = ventasNetas - costoVentas;
    const gastosOperativos = gastosDetalle.reduce((sum, g) => sum + g.monto, 0);
    const utilidadOperativa = utilidadBruta - gastosOperativos;
    const margenBruto = ventasNetas > 0 ? (utilidadBruta / ventasNetas) * 100 : 0;
    const margenNeto = ventasNetas > 0 ? (utilidadOperativa / ventasNetas) * 100 : 0;

    return {
      ventasBrutas,
      descuentosVentas,
      recargos,
      ajusteFacturas,
      devolucionesVentas,
      ventasNetas,
      costoVentas,
      utilidadBruta,
      gastosOperativos,
      utilidadOperativa,
      margenBruto,
      margenNeto,
    };
  }, [ventasDetalle, devolucionesDetalle, gastosDetalle]);

  const conciliacion = useMemo(() => {
    const debitos = transacciones.reduce((sum, t) => sum + n(t.debito), 0);
    const creditos = transacciones.reduce((sum, t) => sum + n(t.credito), 0);
    const ventasConItbis = ventasDetalle.reduce((sum, v) => sum + v.total, 0);
    const itbisFacturado = ventas.reduce((sum, v) => sum + n(v.itbis), 0);
    return {
      debitos,
      creditos,
      ventasConItbis,
      itbisFacturado,
      diferenciaDebitos: debitos - ventasConItbis,
    };
  }, [transacciones, ventasDetalle, ventas]);

  const resumen = useMemo(() => [
    { concepto: 'Ventas brutas', monto: totales.ventasBrutas, porcentaje: pct(totales.ventasNetas ? (totales.ventasBrutas / totales.ventasNetas) * 100 : 0) },
    { concepto: 'Descuentos sobre ventas', monto: -totales.descuentosVentas, porcentaje: pct(totales.ventasNetas ? (-totales.descuentosVentas / totales.ventasNetas) * 100 : 0) },
    { concepto: 'Recargos', monto: totales.recargos, porcentaje: pct(totales.ventasNetas ? (totales.recargos / totales.ventasNetas) * 100 : 0) },
    ...(Math.abs(totales.ajusteFacturas) > 0.01 ? [{
      concepto: 'Ajuste facturas / redondeo',
      monto: totales.ajusteFacturas,
      porcentaje: pct(totales.ventasNetas ? (totales.ajusteFacturas / totales.ventasNetas) * 100 : 0),
    }] : []),
    { concepto: 'Devoluciones', monto: -totales.devolucionesVentas, porcentaje: pct(totales.ventasNetas ? (-totales.devolucionesVentas / totales.ventasNetas) * 100 : 0) },
    { concepto: 'Ventas netas', monto: totales.ventasNetas, porcentaje: '100.0%' },
    { concepto: 'Costo de ventas', monto: -totales.costoVentas, porcentaje: pct(totales.ventasNetas ? (-totales.costoVentas / totales.ventasNetas) * 100 : 0) },
    { concepto: 'Utilidad bruta', monto: totales.utilidadBruta, porcentaje: pct(totales.margenBruto) },
    { concepto: 'Gastos operativos pagados', monto: -totales.gastosOperativos, porcentaje: pct(totales.ventasNetas ? (-totales.gastosOperativos / totales.ventasNetas) * 100 : 0) },
    { concepto: 'Resultado operativo', monto: totales.utilidadOperativa, porcentaje: pct(totales.margenNeto) },
  ], [totales]);

  const exportar = async () => {
    await descargarExcel({
      nombre: `EstadoResultado_${desde}_${hasta}.xlsx`,
      resumen,
      ventas: ventasDetalle,
      devoluciones: devolucionesDetalle,
      gastos: gastosDetalle,
    });
    toast({ title: 'Estado de resultado exportado' });
  };

  const hasCostFallback = ventas.some(v => (v.facturas_detalle || []).some(d => !d.costo_unitario && d.productos?.costo));

  return (
    <>
      <Helmet><title>Estado de Resultado - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full flex flex-col p-4 bg-slate-50 overflow-y-auto space-y-3">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" /> Estado de Resultado
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Se calcula desde facturas, devoluciones, costo vendido por línea y compromisos pagados.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Desde</Label>
                <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 w-36" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Hasta</Label>
                <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9 w-36" />
              </div>
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Actualizar
              </Button>
              <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={exportar} disabled={loading}>
                <Download className="w-4 h-4 mr-1" /> Exportar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Metric title="Ventas netas sin ITBIS" value={totales.ventasNetas} tone="blue" />
          <Metric title="Costo de ventas" value={totales.costoVentas} tone="amber" />
          <Metric title="Utilidad bruta" value={totales.utilidadBruta} tone="emerald" badge={pct(totales.margenBruto)} />
          <Metric title="Resultado operativo" value={totales.utilidadOperativa} tone={totales.utilidadOperativa >= 0 ? 'emerald' : 'red'} badge={pct(totales.margenNeto)} />
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-800">Conciliacion con Transacciones Diarias</h2>
              <p className="text-xs text-slate-500 mt-1">
                Transacciones usa el total de factura con ITBIS. El estado de resultado usa ventas sin ITBIS para calcular utilidad.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs min-w-full lg:min-w-[720px]">
              <MiniTotal label="Debitos transacciones" value={conciliacion.debitos} />
              <MiniTotal label="Facturado con ITBIS" value={conciliacion.ventasConItbis} />
              <MiniTotal label="ITBIS facturado" value={conciliacion.itbisFacturado} />
              <MiniTotal label="Creditos transacciones" value={conciliacion.creditos} />
            </div>
          </div>
          {Math.abs(conciliacion.diferenciaDebitos) > 0.01 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Diferencia contra debitos: RD$ {money(conciliacion.diferenciaDebitos)}. Revisa si hay transacciones no facturadas o fechas con hora distinta.
            </div>
          )}
        </div>

        {hasCostFallback && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-xs">
            Algunas ventas antiguas no tienen costo histórico guardado; el sistema usó el costo actual del producto como respaldo.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-3">
          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <h2 className="font-bold text-slate-800">Resumen</h2>
                <p className="text-xs text-slate-500">{ventas.length} facturas · {devoluciones.length} devoluciones · {compromisos.length} gastos pagados</p>
              </div>
              <Badge variant="outline">{desde} / {hasta}</Badge>
            </div>
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">% ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.map(row => (
                  <TableRow key={row.concepto} className={row.concepto.includes('Utilidad') || row.concepto.includes('Resultado') || row.concepto.includes('Ventas netas') ? 'font-bold bg-slate-50/60' : ''}>
                    <TableCell>{row.concepto}</TableCell>
                    <TableCell className={`text-right tabular-nums ${row.monto < 0 ? 'text-red-600' : 'text-slate-900'}`}>RD$ {money(row.monto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.porcentaje}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-bold text-slate-800 border-b pb-3 mb-3">Qué falta para automatizarlo al 100%</h2>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p><strong>Listo:</strong> ventas netas, devoluciones y costo de venta quedan automatizados cuando la migración agregue `costo_unitario` a `facturas_detalle`.</p>
              <p><strong>Parcial:</strong> gastos operativos salen de compromisos pagados. Para contabilidad completa conviene agregar un módulo de gastos/cuentas contables.</p>
              <p><strong>Recomendado:</strong> clasificar compras entre mercancía para inventario y gastos administrativos, para no mezclar costo de reposición con gasto del período.</p>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center border-b pb-3 mb-3">
            <h2 className="font-bold text-slate-800">Detalle de ventas</h2>
            <Button size="sm" variant="outline" onClick={exportar} disabled={loading}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>
          <div className="max-h-[44vh] overflow-y-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Venta neta</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasDetalle.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">Sin ventas en el periodo</TableCell></TableRow>
                ) : ventasDetalle.map(v => {
                  const ventaNeta = v.ventaNeta;
                  return (
                    <TableRow key={v.id}>
                      <TableCell>{fecha(v.fecha)}</TableCell>
                      <TableCell>{v.numero}</TableCell>
                      <TableCell className="truncate max-w-[260px]">{v.cliente}</TableCell>
                      <TableCell className="text-right">RD$ {money(ventaNeta)}</TableCell>
                      <TableCell className="text-right">RD$ {money(v.costo)}</TableCell>
                      <TableCell className="text-right font-bold">RD$ {money(ventaNeta - v.costo)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
};

const MiniTotal = ({ label, value }) => (
  <div className="border rounded-md bg-slate-50 px-3 py-2">
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p className="font-black text-slate-900 tabular-nums mt-1">RD$ {money(value)}</p>
  </div>
);

const Metric = ({ title, value, tone, badge }) => {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };

  return (
    <div className={`border rounded-lg p-4 shadow-sm ${colors[tone] || colors.blue}`}>
      <div className="flex justify-between items-start gap-2">
        <p className="text-xs font-bold uppercase opacity-75">{title}</p>
        {badge && <span className="text-[11px] font-bold bg-white/70 border border-current/20 rounded px-1.5 py-0.5">{badge}</span>}
      </div>
      <p className="text-2xl font-black mt-2 tabular-nums">RD$ {money(value)}</p>
    </div>
  );
};

export default EstadoResultadosPage;
