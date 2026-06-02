import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { CalendarDays, Loader2, RefreshCw, TrendingUp, WalletCards } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const todayISO = () => format(new Date(), 'yyyy-MM-dd');
const n = (value) => Number(value || 0);
const money = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value) => `${n(value).toFixed(2)}%`;

const RentabilidadDiariaPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const [fecha, setFecha] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [facturas, setFacturas] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);

  const cargar = useCallback(async () => {
    if (!tenantId || !fecha) return;
    setLoading(true);
    try {
      const desde = `${fecha}T00:00:00`;
      const hasta = `${fecha}T23:59:59`;
      const [facturasRes, devolucionesRes] = await Promise.all([
        supabase
          .from('facturas')
          .select('id, numero, fecha, subtotal, descuento, recargo, itbis, total, forma_pago, tipo_pago, vendedor, estado, clientes(nombre), facturas_detalle(codigo, descripcion, cantidad, precio, descuento, itbis, importe, costo_unitario, productos(costo))')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .neq('estado', 'ANULADA')
          .order('fecha', { ascending: true }),
        supabase
          .from('devoluciones')
          .select('id, numero, fecha_devolucion, subtotal, descuento_total, itbis_total, total_devolucion, clientes(nombre), devoluciones_detalle(cantidad, productos(costo))')
          .gte('fecha_devolucion', fecha)
          .lte('fecha_devolucion', fecha)
          .order('fecha_devolucion', { ascending: true }),
      ]);

      if (facturasRes.error) throw facturasRes.error;
      if (devolucionesRes.error) throw devolucionesRes.error;

      setFacturas(facturasRes.data || []);
      setDevoluciones(devolucionesRes.data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar rentabilidad', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, fecha, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ventasDetalle = useMemo(() => facturas.map(f => {
    const costo = (f.facturas_detalle || []).reduce((sum, d) => {
      const costoUnitario = n(d.costo_unitario) || n(d.productos?.costo);
      return sum + (n(d.cantidad) * costoUnitario);
    }, 0);

    const subtotal = n(f.subtotal);
    const descuento = n(f.descuento);
    const recargo = n(f.recargo);
    const ventaNeta = subtotal - descuento + recargo;
    const utilidad = ventaNeta - costo;

    return {
      id: f.id,
      numero: f.numero,
      cliente: f.clientes?.nombre || 'Cliente',
      vendedor: f.vendedor || 'Sin vendedor',
      forma_pago: f.forma_pago || 'N/A',
      tipo_pago: f.tipo_pago || '',
      subtotal,
      descuento,
      recargo,
      itbis: n(f.itbis),
      total: n(f.total),
      costo,
      ventaNeta,
      utilidad,
      margen: ventaNeta > 0 ? (utilidad / ventaNeta) * 100 : 0,
      detalles: f.facturas_detalle || [],
    };
  }), [facturas]);

  const devolucionesDetalle = useMemo(() => devoluciones.map(d => {
    const costo = (d.devoluciones_detalle || []).reduce((sum, item) => (
      sum + (n(item.cantidad) * n(item.productos?.costo))
    ), 0);
    const ventaNeta = n(d.subtotal) - n(d.descuento_total);
    return {
      ventaNeta,
      costo,
      total: n(d.total_devolucion),
    };
  }), [devoluciones]);

  const totales = useMemo(() => {
    const ventasNetas = ventasDetalle.reduce((sum, v) => sum + v.ventaNeta, 0);
    const descuentos = ventasDetalle.reduce((sum, v) => sum + v.descuento, 0);
    const recargos = ventasDetalle.reduce((sum, v) => sum + v.recargo, 0);
    const itbis = ventasDetalle.reduce((sum, v) => sum + v.itbis, 0);
    const totalConItbis = ventasDetalle.reduce((sum, v) => sum + v.total, 0);
    const costoVentas = ventasDetalle.reduce((sum, v) => sum + v.costo, 0);
    const devolucionesNetas = devolucionesDetalle.reduce((sum, d) => sum + d.ventaNeta, 0);
    const costoDevuelto = devolucionesDetalle.reduce((sum, d) => sum + d.costo, 0);
    const ventaNetaFinal = ventasNetas - devolucionesNetas;
    const costoFinal = costoVentas - costoDevuelto;
    const utilidadBruta = ventaNetaFinal - costoFinal;

    return {
      ventasNetas,
      descuentos,
      recargos,
      itbis,
      totalConItbis,
      costoVentas,
      devolucionesNetas,
      costoDevuelto,
      ventaNetaFinal,
      costoFinal,
      utilidadBruta,
      margenBruto: ventaNetaFinal > 0 ? (utilidadBruta / ventaNetaFinal) * 100 : 0,
      tickets: ventasDetalle.length,
      ticketPromedio: ventasDetalle.length > 0 ? totalConItbis / ventasDetalle.length : 0,
    };
  }, [ventasDetalle, devolucionesDetalle]);

  const porVendedor = useMemo(() => groupBy(ventasDetalle, 'vendedor'), [ventasDetalle]);
  const porPago = useMemo(() => groupBy(ventasDetalle, 'forma_pago'), [ventasDetalle]);

  const productosCriticos = useMemo(() => {
    const rows = [];
    ventasDetalle.forEach(v => {
      v.detalles.forEach(d => {
        const cantidad = n(d.cantidad);
        const venta = n(d.importe) - n(d.itbis);
        const costo = cantidad * (n(d.costo_unitario) || n(d.productos?.costo));
        const utilidad = venta - costo;
        const margen = venta > 0 ? (utilidad / venta) * 100 : 0;
        if (venta > 0 && margen < 10) {
          rows.push({
            factura: v.numero,
            codigo: d.codigo,
            descripcion: d.descripcion,
            cantidad,
            venta,
            costo,
            utilidad,
            margen,
          });
        }
      });
    });
    return rows.sort((a, b) => a.margen - b.margen).slice(0, 15);
  }, [ventasDetalle]);

  const hasCostFallback = facturas.some(f => (f.facturas_detalle || []).some(d => !d.costo_unitario && d.productos?.costo));

  return (
    <>
      <Helmet><title>Rentabilidad Diaria - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" /> Rentabilidad Diaria
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Utilidad bruta estimada del día, antes de gastos operativos.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Fecha</Label>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9 w-40" />
              </div>
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualizar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric title="Ventas netas sin ITBIS" value={totales.ventaNetaFinal} tone="blue" />
          <Metric title="Costo vendido" value={totales.costoFinal} tone="amber" />
          <Metric title="Utilidad bruta" value={totales.utilidadBruta} tone={totales.utilidadBruta >= 0 ? 'emerald' : 'red'} badge={pct(totales.margenBruto)} />
          <Metric title="Ticket promedio" value={totales.ticketPromedio} tone="slate" badge={`${totales.tickets} ventas`} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Mini title="Total con ITBIS" value={totales.totalConItbis} />
          <Mini title="ITBIS facturado" value={totales.itbis} />
          <Mini title="Descuentos" value={totales.descuentos} danger />
          <Mini title="Devoluciones netas" value={totales.devolucionesNetas} danger />
        </div>

        {hasCostFallback && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-xs">
            Algunas ventas no tienen costo histórico guardado; se usó el costo actual del producto como respaldo.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SummaryTable title="Rentabilidad por vendedor" icon={WalletCards} rows={porVendedor} />
          <SummaryTable title="Rentabilidad por forma de pago" icon={CalendarDays} rows={porPago} />
        </div>

        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Productos con margen bajo hoy</h2>
            <Badge variant="outline">{productosCriticos.length}</Badge>
          </div>
          {productosCriticos.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No se detectaron productos vendidos con margen menor a 10%.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Venta neta</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosCriticos.map((p, idx) => (
                  <TableRow key={`${p.factura}-${p.codigo}-${idx}`}>
                    <TableCell>
                      <div className="font-bold text-sm text-slate-800">{p.codigo} - {p.descripcion}</div>
                      <div className="text-xs text-slate-500">FT-{p.factura} | Cant. {p.cantidad}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">RD$ {money(p.venta)}</TableCell>
                    <TableCell className="text-right tabular-nums">RD$ {money(p.costo)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-bold ${p.utilidad < 0 ? 'text-red-600' : 'text-slate-800'}`}>RD$ {money(p.utilidad)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-bold ${p.margen < 0 ? 'text-red-600' : 'text-amber-700'}`}>{pct(p.margen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
};

const groupBy = (ventas, key) => {
  const grouped = ventas.reduce((acc, venta) => {
    const name = venta[key] || 'N/A';
    if (!acc[name]) {
      acc[name] = { nombre: name, ventas: 0, costo: 0, utilidad: 0, total: 0, tickets: 0 };
    }
    acc[name].ventas += venta.ventaNeta;
    acc[name].costo += venta.costo;
    acc[name].utilidad += venta.utilidad;
    acc[name].total += venta.total;
    acc[name].tickets += 1;
    return acc;
  }, {});

  return Object.values(grouped)
    .map(row => ({ ...row, margen: row.ventas > 0 ? (row.utilidad / row.ventas) * 100 : 0 }))
    .sort((a, b) => b.utilidad - a.utilidad);
};

const metricTone = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
};

const Metric = ({ title, value, tone, badge }) => (
  <div className={`border rounded-lg p-4 ${metricTone[tone] || metricTone.slate}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold uppercase">{title}</span>
      {badge && <Badge variant="outline" className="bg-white/70">{badge}</Badge>}
    </div>
    <div className="text-2xl font-black mt-2">RD$ {money(value)}</div>
  </div>
);

const Mini = ({ title, value, danger }) => (
  <div className="bg-white border rounded-lg p-3 shadow-sm">
    <div className="text-[10px] font-bold uppercase text-slate-500">{title}</div>
    <div className={`text-lg font-black mt-1 ${danger && value > 0 ? 'text-red-600' : 'text-slate-800'}`}>RD$ {money(value)}</div>
  </div>
);

const SummaryTable = ({ title, icon: Icon, rows }) => (
  <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-600" /> {title}
      </h2>
      <Badge variant="outline">{rows.length}</Badge>
    </div>
    {rows.length === 0 ? (
      <div className="p-4 text-sm text-slate-500">Sin ventas para esta fecha.</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Nombre</TableHead>
            <TableHead className="text-right">Ventas</TableHead>
            <TableHead className="text-right">Costo</TableHead>
            <TableHead className="text-right">Utilidad</TableHead>
            <TableHead className="text-right">Margen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.nombre}>
              <TableCell>
                <div className="font-bold text-sm text-slate-800">{row.nombre}</div>
                <div className="text-xs text-slate-500">{row.tickets} ticket(s)</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">RD$ {money(row.ventas)}</TableCell>
              <TableCell className="text-right tabular-nums">RD$ {money(row.costo)}</TableCell>
              <TableCell className={`text-right tabular-nums font-bold ${row.utilidad < 0 ? 'text-red-600' : 'text-emerald-700'}`}>RD$ {money(row.utilidad)}</TableCell>
              <TableCell className="text-right tabular-nums font-bold">{pct(row.margen)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </div>
);

export default RentabilidadDiariaPage;
