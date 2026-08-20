import React, { useState, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, Loader2, BookOpen, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { rangoDeFechas } from '@/lib/dateUtils';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const primerDiaMesISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const fmtNum = (v) => parseFloat(v || 0);
const fmtRD = (v) => fmtNum(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFechaCorta = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const descargarExcel = async (nombre, sheets) => {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.columns = s.columns;
    s.rows.forEach(r => ws.addRow(r));
    // total row
    if (s.totalRow) ws.addRow(s.totalRow).font = { bold: true };
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const LibrosContablesPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [loading, setLoading] = useState(false);

  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [movimientos, setMovimientos] = useState([]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // facturas.fecha e inventario_movimientos.fecha llevan hora, así que
      // el periodo va en instantes de aquí. Las otras tres (compras,
      // recibos_ingreso, pagos_suplidores) guardan fecha sin hora y se
      // comparan con el texto tal cual.
      const periodo = rangoDeFechas(desde, hasta);
      const [v, c, ri, ps, im] = await Promise.all([
        supabase.from('facturas')
          .select('id, numero, fecha, ncf, subtotal, descuento, itbis, total, forma_pago, tipo_pago, estado, clientes(nombre, rnc)')
          .gte('fecha', periodo.desde).lte('fecha', periodo.hasta)
          .order('fecha', { ascending: true }),
        supabase.from('compras')
          .select('id, numero, fecha, ncf, total_exento, total_gravado, itbis_total, total_compra, forma_pago, itbis_retenido_pct, isr_retenido_pct, proveedores(nombre, rnc)')
          .gte('fecha', desde).lte('fecha', hasta)
          .order('fecha', { ascending: true }),
        supabase.from('recibos_ingreso')
          .select('id, numero, fecha, monto_pagado, concepto, formas_pago, anulado, clientes(nombre, rnc)')
          .gte('fecha', desde).lte('fecha', hasta)
          .eq('anulado', false)
          .order('fecha', { ascending: true }),
        supabase.from('pagos_suplidores')
          .select('id, numero, fecha, monto_pagado, concepto, formas_pago, anulado, proveedores(nombre, rnc)')
          .gte('fecha', desde).lte('fecha', hasta)
          .eq('anulado', false)
          .order('fecha', { ascending: true }),
        supabase.from('inventario_movimientos')
          .select('id, fecha, tipo, cantidad, costo_unitario, referencia_doc, productos(codigo, descripcion)')
          .gte('fecha', periodo.desde).lte('fecha', periodo.hasta)
          .order('fecha', { ascending: true })
          .limit(5000),
      ]);

      if (v.error) throw v.error;
      if (c.error) throw c.error;
      if (ri.error) throw ri.error;
      if (ps.error) throw ps.error;
      if (im.error) throw im.error;

      setVentas(v.data || []);
      setCompras(c.data || []);
      setCobros(ri.data || []);
      setPagos(ps.data || []);
      setMovimientos(im.data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, desde, hasta, toast]);

  const cargarInventario = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, costo, precio, activo')
        .eq('activo', true)
        .order('codigo');
      if (error) throw error;

      // obtener stock actual en paralelo (batch rpc)
      const ids = (data || []).map(p => p.id);
      const stocks = {};
      // ejecutar rpc por lotes de 50 para no saturar
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const results = await Promise.all(
          batch.map(id => supabase.rpc('get_stock_actual', { producto_uuid: id }))
        );
        batch.forEach((id, idx) => { stocks[id] = results[idx].data || 0; });
      }
      setInventario((data || []).map(p => ({ ...p, stock: stocks[p.id] || 0 })));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar inventario', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => { cargar(); }, [cargar]);

  // ── Totales ──
  const totVentas = useMemo(() => ({
    cant: ventas.length,
    subtotal: ventas.reduce((s, v) => s + fmtNum(v.subtotal), 0),
    itbis: ventas.reduce((s, v) => s + fmtNum(v.itbis), 0),
    total: ventas.reduce((s, v) => s + fmtNum(v.total), 0),
  }), [ventas]);

  const totCompras = useMemo(() => ({
    cant: compras.length,
    subtotal: compras.reduce((s, c) => s + fmtNum(c.total_gravado) + fmtNum(c.total_exento), 0),
    itbis: compras.reduce((s, c) => s + fmtNum(c.itbis_total), 0),
    total: compras.reduce((s, c) => s + fmtNum(c.total_compra), 0),
  }), [compras]);

  const totCobros = useMemo(() => ({
    cant: cobros.length,
    total: cobros.reduce((s, r) => s + fmtNum(r.monto_pagado), 0),
  }), [cobros]);

  const totPagos = useMemo(() => ({
    cant: pagos.length,
    total: pagos.reduce((s, p) => s + fmtNum(p.monto_pagado), 0),
  }), [pagos]);

  const totInventario = useMemo(() => ({
    cant: inventario.length,
    valor: inventario.reduce((s, p) => s + fmtNum(p.stock) * fmtNum(p.costo), 0),
  }), [inventario]);

  // ── Exports ──
  const periodoStr = `${desde}_${hasta}`;

  const exportVentas = () => descargarExcel(`LibroVentas_${periodoStr}.xlsx`, [{
    name: 'Libro de Ventas',
    columns: [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Factura #', key: 'numero', width: 12 },
      { header: 'NCF', key: 'ncf', width: 15 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'RNC/Cédula', key: 'rnc', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Descuento', key: 'descuento', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'ITBIS', key: 'itbis', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Total', key: 'total', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Forma Pago', key: 'forma', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Estado', key: 'estado', width: 10 },
    ],
    rows: ventas.map(v => ({
      fecha: fmtFechaCorta(v.fecha),
      numero: v.numero,
      ncf: v.ncf || '',
      cliente: v.clientes?.nombre || '',
      rnc: v.clientes?.rnc || '',
      subtotal: fmtNum(v.subtotal),
      descuento: fmtNum(v.descuento),
      itbis: fmtNum(v.itbis),
      total: fmtNum(v.total),
      forma: v.forma_pago || '',
      tipo: v.tipo_pago || '',
      estado: v.estado || '',
    })),
    totalRow: { fecha: 'TOTALES', subtotal: totVentas.subtotal, itbis: totVentas.itbis, total: totVentas.total },
  }]);

  const exportCompras = () => descargarExcel(`LibroCompras_${periodoStr}.xlsx`, [{
    name: 'Libro de Compras',
    columns: [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Compra #', key: 'numero', width: 12 },
      { header: 'NCF', key: 'ncf', width: 15 },
      { header: 'Suplidor', key: 'suplidor', width: 30 },
      { header: 'RNC', key: 'rnc', width: 14 },
      { header: 'Exento', key: 'exento', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Gravado', key: 'gravado', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'ITBIS', key: 'itbis', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'ITBIS Retenido %', key: 'itbis_ret', width: 12 },
      { header: 'ISR Retenido %', key: 'isr_ret', width: 12 },
      { header: 'Total', key: 'total', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Forma Pago', key: 'forma', width: 14 },
    ],
    rows: compras.map(c => ({
      fecha: fmtFechaCorta(c.fecha),
      numero: c.numero,
      ncf: c.ncf || '',
      suplidor: c.proveedores?.nombre || '',
      rnc: c.proveedores?.rnc || '',
      exento: fmtNum(c.total_exento),
      gravado: fmtNum(c.total_gravado),
      itbis: fmtNum(c.itbis_total),
      itbis_ret: fmtNum(c.itbis_retenido_pct),
      isr_ret: fmtNum(c.isr_retenido_pct),
      total: fmtNum(c.total_compra),
      forma: c.forma_pago || '',
    })),
    totalRow: { fecha: 'TOTALES', gravado: totCompras.subtotal, itbis: totCompras.itbis, total: totCompras.total },
  }]);

  const exportCobros = () => descargarExcel(`LibroCobros_${periodoStr}.xlsx`, [{
    name: 'Libro de Cobros',
    columns: [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Recibo #', key: 'numero', width: 12 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'RNC/Cédula', key: 'rnc', width: 14 },
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Monto', key: 'monto', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Formas de Pago', key: 'formas', width: 40 },
    ],
    rows: cobros.map(r => ({
      fecha: fmtFechaCorta(r.fecha),
      numero: r.numero,
      cliente: r.clientes?.nombre || '',
      rnc: r.clientes?.rnc || '',
      concepto: r.concepto || '',
      monto: fmtNum(r.monto_pagado),
      formas: resumirFormasPago(r.formas_pago),
    })),
    totalRow: { fecha: 'TOTALES', monto: totCobros.total },
  }]);

  const exportPagos = () => descargarExcel(`LibroPagos_${periodoStr}.xlsx`, [{
    name: 'Libro de Pagos',
    columns: [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Pago #', key: 'numero', width: 12 },
      { header: 'Suplidor', key: 'suplidor', width: 30 },
      { header: 'RNC', key: 'rnc', width: 14 },
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Monto', key: 'monto', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Formas de Pago', key: 'formas', width: 40 },
    ],
    rows: pagos.map(p => ({
      fecha: fmtFechaCorta(p.fecha),
      numero: p.numero,
      suplidor: p.proveedores?.nombre || '',
      rnc: p.proveedores?.rnc || '',
      concepto: p.concepto || '',
      monto: fmtNum(p.monto_pagado),
      formas: resumirFormasPago(p.formas_pago),
    })),
    totalRow: { fecha: 'TOTALES', monto: totPagos.total },
  }]);

  const exportInventario = () => descargarExcel(`InventarioValorizado_${hoyISO()}.xlsx`, [{
    name: 'Inventario Valorizado',
    columns: [
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Stock', key: 'stock', width: 10, style: { numFmt: '#,##0.00' } },
      { header: 'Costo Unitario', key: 'costo', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'Precio Venta', key: 'precio', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'Valor Costo', key: 'valor_costo', width: 14, style: { numFmt: '#,##0.00' } },
    ],
    rows: inventario.map(p => ({
      codigo: p.codigo,
      descripcion: p.descripcion,
      stock: fmtNum(p.stock),
      costo: fmtNum(p.costo),
      precio: fmtNum(p.precio),
      valor_costo: fmtNum(p.stock) * fmtNum(p.costo),
    })),
    totalRow: { codigo: 'TOTAL', valor_costo: totInventario.valor },
  }]);

  const exportMovimientos = () => descargarExcel(`MovimientosInventario_${periodoStr}.xlsx`, [{
    name: 'Movimientos Inventario',
    columns: [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Producto', key: 'producto', width: 40 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Cantidad', key: 'cantidad', width: 10, style: { numFmt: '#,##0.00' } },
      { header: 'Costo Unit.', key: 'costo', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Valor', key: 'valor', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Referencia', key: 'ref', width: 20 },
    ],
    rows: movimientos.map(m => ({
      fecha: fmtFechaCorta(m.fecha),
      codigo: m.productos?.codigo || '',
      producto: m.productos?.descripcion || '',
      tipo: m.tipo || '',
      cantidad: fmtNum(m.cantidad),
      costo: fmtNum(m.costo_unitario),
      valor: fmtNum(m.cantidad) * fmtNum(m.costo_unitario),
      ref: m.referencia_doc || '',
    })),
  }]);

  const exportTodo = async () => {
    toast({ title: 'Generando libro consolidado...', description: 'Un Excel con todas las hojas.' });
    // Forzar carga inventario si está vacío
    if (inventario.length === 0) await cargarInventario();
    await descargarExcel(`LibrosContables_${periodoStr}.xlsx`, [
      // reutilizar la lógica de cada export creando las sheets inline sería repetitivo;
      // para MVP, se recomienda descargar cada libro individual — aquí solo Ventas + Compras como ejemplo
      {
        name: 'Ventas',
        columns: [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'NCF', key: 'ncf', width: 15 },
          { header: 'Cliente', key: 'cliente', width: 30 },
          { header: 'Subtotal', key: 'subtotal', width: 12 },
          { header: 'ITBIS', key: 'itbis', width: 12 },
          { header: 'Total', key: 'total', width: 12 },
        ],
        rows: ventas.map(v => ({
          fecha: fmtFechaCorta(v.fecha), ncf: v.ncf || '',
          cliente: v.clientes?.nombre || '',
          subtotal: fmtNum(v.subtotal), itbis: fmtNum(v.itbis), total: fmtNum(v.total),
        })),
      },
      {
        name: 'Compras',
        columns: [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'NCF', key: 'ncf', width: 15 },
          { header: 'Suplidor', key: 'suplidor', width: 30 },
          { header: 'Gravado', key: 'gravado', width: 12 },
          { header: 'ITBIS', key: 'itbis', width: 12 },
          { header: 'Total', key: 'total', width: 12 },
        ],
        rows: compras.map(c => ({
          fecha: fmtFechaCorta(c.fecha), ncf: c.ncf || '',
          suplidor: c.proveedores?.nombre || '',
          gravado: fmtNum(c.total_gravado), itbis: fmtNum(c.itbis_total), total: fmtNum(c.total_compra),
        })),
      },
      {
        name: 'Cobros',
        columns: [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Cliente', key: 'cliente', width: 30 },
          { header: 'Monto', key: 'monto', width: 12 },
        ],
        rows: cobros.map(r => ({
          fecha: fmtFechaCorta(r.fecha), cliente: r.clientes?.nombre || '', monto: fmtNum(r.monto_pagado),
        })),
      },
      {
        name: 'Pagos',
        columns: [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Suplidor', key: 'suplidor', width: 30 },
          { header: 'Monto', key: 'monto', width: 12 },
        ],
        rows: pagos.map(p => ({
          fecha: fmtFechaCorta(p.fecha), suplidor: p.proveedores?.nombre || '', monto: fmtNum(p.monto_pagado),
        })),
      },
    ]);
    toast({ title: 'Libros consolidados descargados' });
  };

  return (
    <>
      <Helmet><title>Libros Contables — {empresa?.nombre || 'Sistema'}</title></Helmet>

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-3 overflow-y-auto">
        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-xl font-bold text-blue-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5" /> Libros Contables Auxiliares
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Ventas, Compras, Cobros, Pagos, Inventario. Excel listo para enviar al contador.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Desde</Label>
                <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 w-36" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Hasta</Label>
                <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9 w-36" />
              </div>
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar'}
              </Button>
              <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={exportTodo} disabled={loading}>
                <Download className="w-4 h-4 mr-1" /> Exportar Todo
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border p-4 flex-grow">
          <Tabs defaultValue="ventas" className="w-full">
            <TabsList className="flex flex-wrap w-full h-auto">
              <TabsTrigger value="ventas">Ventas ({totVentas.cant})</TabsTrigger>
              <TabsTrigger value="compras">Compras ({totCompras.cant})</TabsTrigger>
              <TabsTrigger value="cobros">Cobros ({totCobros.cant})</TabsTrigger>
              <TabsTrigger value="pagos">Pagos ({totPagos.cant})</TabsTrigger>
              <TabsTrigger value="inventario" onClick={cargarInventario}>Inventario Valorizado</TabsTrigger>
              <TabsTrigger value="movimientos">Mov. Inventario ({movimientos.length})</TabsTrigger>
            </TabsList>

            {/* Ventas */}
            <TabsContent value="ventas" className="mt-4">
              <LibroHeader titulo="Libro de Ventas" subtitulo={`${totVentas.cant} facturas · Subtotal RD$ ${fmtRD(totVentas.subtotal)} · ITBIS RD$ ${fmtRD(totVentas.itbis)} · Total RD$ ${fmtRD(totVentas.total)}`} onExport={exportVentas} loading={loading} />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead><TableHead>#</TableHead><TableHead>NCF</TableHead>
                      <TableHead>Cliente</TableHead><TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">ITBIS</TableHead><TableHead className="text-right">Total</TableHead>
                      <TableHead>Forma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ventas.map(v => (
                      <TableRow key={v.id}>
                        <TableCell>{fmtFechaCorta(v.fecha)}</TableCell>
                        <TableCell>{v.numero}</TableCell>
                        <TableCell className="font-mono">{v.ncf || '—'}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{v.clientes?.nombre}</TableCell>
                        <TableCell className="text-right">{fmtRD(v.subtotal)}</TableCell>
                        <TableCell className="text-right">{fmtRD(v.itbis)}</TableCell>
                        <TableCell className="text-right font-bold">{fmtRD(v.total)}</TableCell>
                        <TableCell className="text-[10px]">{v.forma_pago}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Compras */}
            <TabsContent value="compras" className="mt-4">
              <LibroHeader titulo="Libro de Compras" subtitulo={`${totCompras.cant} compras · Gravado RD$ ${fmtRD(totCompras.subtotal)} · ITBIS RD$ ${fmtRD(totCompras.itbis)} · Total RD$ ${fmtRD(totCompras.total)}`} onExport={exportCompras} loading={loading} />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead><TableHead>#</TableHead><TableHead>NCF</TableHead>
                      <TableHead>Suplidor</TableHead><TableHead className="text-right">Gravado</TableHead>
                      <TableHead className="text-right">ITBIS</TableHead><TableHead className="text-right">Total</TableHead>
                      <TableHead>Forma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compras.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>{fmtFechaCorta(c.fecha)}</TableCell>
                        <TableCell>{c.numero}</TableCell>
                        <TableCell className="font-mono">{c.ncf || '—'}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{c.proveedores?.nombre}</TableCell>
                        <TableCell className="text-right">{fmtRD(c.total_gravado)}</TableCell>
                        <TableCell className="text-right">{fmtRD(c.itbis_total)}</TableCell>
                        <TableCell className="text-right font-bold">{fmtRD(c.total_compra)}</TableCell>
                        <TableCell className="text-[10px]">{c.forma_pago}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Cobros */}
            <TabsContent value="cobros" className="mt-4">
              <LibroHeader titulo="Libro de Cobros" subtitulo={`${totCobros.cant} recibos · Total RD$ ${fmtRD(totCobros.total)}`} onExport={exportCobros} loading={loading} />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead><TableHead>#</TableHead>
                      <TableHead>Cliente</TableHead><TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cobros.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{fmtFechaCorta(r.fecha)}</TableCell>
                        <TableCell>{r.numero}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{r.clientes?.nombre}</TableCell>
                        <TableCell className="truncate max-w-[240px] text-[10px]">{r.concepto}</TableCell>
                        <TableCell className="text-right font-bold">{fmtRD(r.monto_pagado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Pagos */}
            <TabsContent value="pagos" className="mt-4">
              <LibroHeader titulo="Libro de Pagos" subtitulo={`${totPagos.cant} pagos · Total RD$ ${fmtRD(totPagos.total)}`} onExport={exportPagos} loading={loading} />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead><TableHead>#</TableHead>
                      <TableHead>Suplidor</TableHead><TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{fmtFechaCorta(p.fecha)}</TableCell>
                        <TableCell>{p.numero}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{p.proveedores?.nombre}</TableCell>
                        <TableCell className="truncate max-w-[240px] text-[10px]">{p.concepto}</TableCell>
                        <TableCell className="text-right font-bold">{fmtRD(p.monto_pagado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Inventario Valorizado */}
            <TabsContent value="inventario" className="mt-4">
              <LibroHeader
                titulo="Inventario Valorizado (snapshot actual)"
                subtitulo={`${totInventario.cant} productos activos · Valor total a costo: RD$ ${fmtRD(totInventario.valor)}`}
                onExport={exportInventario}
                loading={loading}
                extraButton={<Button variant="outline" size="sm" onClick={cargarInventario} disabled={loading}>Recargar</Button>}
              />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Código</TableHead><TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Valor Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventario.length === 0 && !loading ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-4">Click "Recargar" para cargar inventario</TableCell></TableRow>
                    ) : inventario.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono">{p.codigo}</TableCell>
                        <TableCell className="truncate max-w-[320px]">{p.descripcion}</TableCell>
                        <TableCell className="text-right">{fmtRD(p.stock)}</TableCell>
                        <TableCell className="text-right">{fmtRD(p.costo)}</TableCell>
                        <TableCell className="text-right font-bold">{fmtRD(fmtNum(p.stock) * fmtNum(p.costo))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Movimientos Inventario */}
            <TabsContent value="movimientos" className="mt-4">
              <LibroHeader
                titulo="Movimientos de Inventario"
                subtitulo={`${movimientos.length} movimientos en el período${movimientos.length >= 5000 ? ' (límite 5000, ajuste fechas)' : ''}`}
                onExport={exportMovimientos}
                loading={loading}
              />
              <div className="max-h-[55vh] overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead><TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead><TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Ref.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>{fmtFechaCorta(m.fecha)}</TableCell>
                        <TableCell className="font-mono">{m.productos?.codigo}</TableCell>
                        <TableCell className="truncate max-w-[240px]">{m.productos?.descripcion}</TableCell>
                        <TableCell><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${String(m.tipo).toUpperCase().includes('ENTRADA') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.tipo}</span></TableCell>
                        <TableCell className="text-right">{fmtRD(m.cantidad)}</TableCell>
                        <TableCell className="text-right">{fmtRD(m.costo_unitario)}</TableCell>
                        <TableCell className="text-[10px]">{m.referencia_doc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

const LibroHeader = ({ titulo, subtitulo, onExport, loading, extraButton }) => (
  <div className="flex justify-between items-start gap-4 border-b pb-3 mb-3">
    <div>
      <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>
    </div>
    <div className="flex gap-2">
      {extraButton}
      <Button size="sm" className="bg-blue-700 hover:bg-blue-800 text-white" onClick={onExport} disabled={loading}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Exportar Excel
      </Button>
    </div>
  </div>
);

// Serializa formas_pago jsonb a texto legible
const resumirFormasPago = (fp) => {
  if (!fp) return '';
  if (typeof fp === 'string') return fp;
  try {
    const arr = Array.isArray(fp) ? fp : Object.entries(fp);
    return arr.map(x => {
      if (Array.isArray(x)) return `${x[0]}: ${x[1]}`;
      if (x?.tipo) return `${x.tipo}: ${x.monto || ''}`;
      return JSON.stringify(x);
    }).join(' | ');
  } catch { return ''; }
};

export default LibrosContablesPage;
