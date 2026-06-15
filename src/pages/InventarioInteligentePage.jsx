import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { subDays } from 'date-fns';
import { Boxes, Loader2, PackageCheck, PackageX, RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const n = (value) => Number(value || 0);
const money = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InventarioInteligentePage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [resumenBd, setResumenBd] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const desde = subDays(new Date(), 180).toISOString();
      const fetchProductos = async () => {
        const batchSize = 5000;
        const allProducts = [];
        let offset = 0;
        let totalCount = null;

        while (totalCount === null || allProducts.length < totalCount) {
          const { data, error } = await supabase.rpc('get_productos_paginados', {
            p_limit: batchSize,
            p_offset: offset,
            p_search_term: null,
            p_marca_filter: null,
            p_modelo_filter: null,
            p_include_zero_stock: true,
          });

          if (error) throw error;

          const page = data || [];
          allProducts.push(...page);
          totalCount = page[0]?.total_count ?? allProducts.length;

          if (page.length < batchSize) break;
          offset += batchSize;
        }

        return allProducts;
      };

      const [productosData, movRes, resumenRes] = await Promise.all([
        fetchProductos(),
        supabase
          .from('inventario_movimientos')
          .select('producto_id, cantidad, costo_unitario, fecha, tipo')
          .gte('fecha', desde)
          .order('fecha', { ascending: false })
          .limit(50000),
        supabase.rpc('get_inventario_inteligente_resumen'),
      ]);

      if (movRes.error) throw movRes.error;
      if (resumenRes.error) {
        console.warn('[InventarioInteligente] No se pudo cargar resumen BD:', resumenRes.error.message);
        setResumenBd(null);
      } else {
        setResumenBd((resumenRes.data || [])[0] || null);
      }

      setProductos(productosData.filter(producto => producto.activo !== false));
      setMovimientos(movRes.data || []);
      setLastSync(new Date());
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar inventario inteligente', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const analisis = useMemo(() => {
    const hoy = new Date();
    const porProducto = movimientos.reduce((acc, mov) => {
      if (!acc[mov.producto_id]) {
        acc[mov.producto_id] = {
          salidas30: 0,
          salidas90: 0,
          salidas180: 0,
          ultimaSalida: null,
          ultimoCosto: 0,
        };
      }

      const bucket = acc[mov.producto_id];
      const cantidad = n(mov.cantidad);
      const fecha = new Date(mov.fecha);
      const dias = Math.max(0, Math.floor((hoy - fecha) / 86400000));

      if (cantidad < 0) {
        const salida = Math.abs(cantidad);
        if (dias <= 30) bucket.salidas30 += salida;
        if (dias <= 90) bucket.salidas90 += salida;
        bucket.salidas180 += salida;
        if (!bucket.ultimaSalida || fecha > bucket.ultimaSalida) bucket.ultimaSalida = fecha;
      }

      if (cantidad > 0 && n(mov.costo_unitario) > 0 && (!bucket.ultimoCostoFecha || fecha > bucket.ultimoCostoFecha)) {
        bucket.ultimoCosto = n(mov.costo_unitario);
        bucket.ultimoCostoFecha = fecha;
      }

      return acc;
    }, {});

    const rows = productos.map(producto => {
      const mov = porProducto[producto.id] || {};
      const stock = n(producto.existencia);
      const costo = n(producto.costo);
      const valorInventario = Math.max(0, stock) * costo;
      const ventaPromedio30 = n(mov.salidas30) / 30;
      const coberturaDias = stock > 0 && ventaPromedio30 > 0 ? stock / ventaPromedio30 : null;
      const minStock = n(producto.min_stock);
      const maxStock = n(producto.max_stock);
      const cantidadBase = maxStock > 0
        ? maxStock - stock
        : Math.max(minStock - stock, (ventaPromedio30 * 30) - stock, stock <= 0 ? Math.abs(stock) + 1 : 0);
      const cantidadSugerida = Math.max(0, Math.ceil(cantidadBase));
      const diasSinSalida = mov.ultimaSalida ? Math.floor((hoy - mov.ultimaSalida) / 86400000) : 999;

      let estado = 'Normal';
      if (stock <= 0) estado = 'Agotado';
      else if (minStock > 0 && stock <= minStock) estado = 'Reponer';
      else if (maxStock > 0 && stock > maxStock) estado = 'Sobrestock';
      else if (stock > 0 && diasSinSalida >= 90) estado = 'Lento';
      else if (coberturaDias !== null && coberturaDias < 10) estado = 'Riesgo';

      return {
        id: producto.id,
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        marca: producto.marca_nombre || '',
        tipo: producto.modelo_nombre || '',
        stock,
        costo,
        valorInventario,
        minStock,
        maxStock,
        salidas30: n(mov.salidas30),
        salidas90: n(mov.salidas90),
        salidas180: n(mov.salidas180),
        ventaPromedio30,
        coberturaDias,
        cantidadSugerida,
        diasSinSalida,
        estado,
      };
    });

    return rows;
  }, [productos, movimientos]);

  const reponer = useMemo(() => analisis
    .filter(p => ['Agotado', 'Reponer', 'Riesgo'].includes(p.estado) && p.cantidadSugerida > 0)
    .sort((a, b) => (a.coberturaDias ?? -1) - (b.coberturaDias ?? -1))
    .slice(0, 30), [analisis]);

  const lentos = useMemo(() => analisis
    .filter(p => p.stock > 0 && p.diasSinSalida >= 90)
    .sort((a, b) => b.valorInventario - a.valorInventario)
    .slice(0, 30), [analisis]);

  const sobrestock = useMemo(() => analisis
    .filter(p => p.estado === 'Sobrestock')
    .sort((a, b) => b.valorInventario - a.valorInventario)
    .slice(0, 30), [analisis]);

  const masVendidos = useMemo(() => analisis
    .filter(p => p.salidas30 > 0)
    .sort((a, b) => b.salidas30 - a.salidas30)
    .slice(0, 30), [analisis]);

  const resumen = useMemo(() => ({
    valor: resumenBd?.valor_real_inventario_actual ?? analisis.reduce((sum, p) => sum + p.valorInventario, 0),
    agotados: analisis.filter(p => p.estado === 'Agotado').length,
    reponer: reponer.length,
    lentos: lentos.length,
  }), [analisis, reponer.length, lentos.length, resumenBd?.valor_real_inventario_actual]);

  return (
    <>
      <Helmet><title>Inventario Inteligente - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" /> Inventario Inteligente
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Reposición sugerida, mercancía lenta, sobreinventario y rotación reciente.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lastSync && <span className="text-[11px] text-slate-500">Actualizado {lastSync.toLocaleTimeString('es-DO')}</span>}
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualizar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric title="Valor inventario" value={`RD$ ${money(resumen.valor)}`} tone="blue" icon={Boxes} />
          <Metric title="Agotados" value={resumen.agotados} tone="red" icon={PackageX} />
          <Metric title="A reponer" value={resumen.reponer} tone="amber" icon={PackageCheck} />
          <Metric title="Lentos" value={resumen.lentos} tone="slate" icon={TrendingUp} />
        </div>

        {loading ? (
          <div className="bg-white border rounded-lg p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analizando inventario...
          </div>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <InventoryTable title="Reposición sugerida" rows={reponer} mode="reponer" />
            <InventoryTable title="Más vendidos últimos 30 días" rows={masVendidos} mode="ventas" />
            <InventoryTable title="Mercancía lenta" rows={lentos} mode="lento" />
            <InventoryTable title="Sobreinventario" rows={sobrestock} mode="sobrestock" />
          </div>
        )}
      </div>
    </>
  );
};

const tones = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
};

const Metric = ({ title, value, tone, icon: Icon }) => (
  <div className={`border rounded-lg p-4 ${tones[tone] || tones.slate}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase">{title}</span>
      <Icon className="w-4 h-4" />
    </div>
    <div className="text-2xl font-black mt-2">{value}</div>
  </div>
);

const statusTone = {
  Agotado: 'bg-red-100 text-red-700 border-red-200',
  Reponer: 'bg-amber-100 text-amber-700 border-amber-200',
  Riesgo: 'bg-orange-100 text-orange-700 border-orange-200',
  Lento: 'bg-slate-100 text-slate-700 border-slate-200',
  Sobrestock: 'bg-blue-100 text-blue-700 border-blue-200',
  Normal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const InventoryTable = ({ title, rows, mode }) => (
  <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <h2 className="font-bold text-slate-800">{title}</h2>
      <Badge variant="outline">{rows.length}</Badge>
    </div>
    {rows.length === 0 ? (
      <div className="p-4 text-sm text-slate-500">Sin productos en esta categoría.</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">{mode === 'reponer' ? 'Sugerido' : 'Salidas 30d'}</TableHead>
            <TableHead className="text-right">{mode === 'lento' ? 'Días sin salida' : 'Cobertura'}</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={`${title}-${row.id}`}>
              <TableCell>
                <div className="font-bold text-sm text-slate-800">{row.codigo} - {row.descripcion}</div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{row.marca || row.tipo || 'Sin clasificación'}</span>
                  <span className={`inline-flex border rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusTone[row.estado] || statusTone.Normal}`}>{row.estado}</span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.stock}</TableCell>
              <TableCell className="text-right tabular-nums">{mode === 'reponer' ? row.cantidadSugerida : row.salidas30}</TableCell>
              <TableCell className="text-right tabular-nums">
                {mode === 'lento' ? row.diasSinSalida : (row.coberturaDias === null ? 'N/A' : `${Math.round(row.coberturaDias)} días`)}
              </TableCell>
              <TableCell className="text-right tabular-nums">RD$ {money(row.valorInventario)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </div>
);

export default InventarioInteligentePage;
