import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { AlertTriangle, Loader2, Percent, RefreshCw, Tags, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const n = (value) => Number(value || 0);
const money = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clampPercent = (value, fallback) => Math.max(0, Math.min(100, Number(value ?? fallback) || fallback));
const roundPrice = (value) => Math.ceil(n(value) * 100) / 100;

const metricForPrice = (price, cost, discount = 0) => {
  const precio = n(price);
  const costo = n(cost);
  const neto = precio * (1 - n(discount) / 100);
  const utilidad = neto - costo;
  const margenReal = neto > 0 ? (utilidad / neto) * 100 : 0;
  return { neto, utilidad, margenReal };
};

const priceForRealMargin = (cost, marginPct) => {
  const costo = n(cost);
  const margin = Math.max(0, Math.min(95, n(marginPct)));
  if (costo <= 0) return 0;
  return roundPrice(costo / (1 - margin / 100));
};

const RecomendadorPreciosPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState([]);
  const [margenObjetivo, setMargenObjetivo] = useState('20');
  const [lastSync, setLastSync] = useState(null);

  const p2Discount = clampPercent(empresa?.precio2_descuento_pct, 10);
  const p3Discount = clampPercent(empresa?.precio3_descuento_pct, 15);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_productos_paginados', {
        p_limit: 5000,
        p_offset: 0,
        p_search_term: null,
        p_marca_filter: null,
        p_modelo_filter: null,
        p_include_zero_stock: true,
      });

      if (error) throw error;
      setProductos((data || []).filter(producto => producto.activo !== false));
      setLastSync(new Date());
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el recomendador', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const recomendaciones = useMemo(() => {
    const objetivo = Math.max(0, Math.min(80, n(margenObjetivo)));

    return productos.flatMap(producto => {
      const presentaciones = Array.isArray(producto.presentaciones) && producto.presentaciones.length > 0
        ? producto.presentaciones
        : [{
            id: `${producto.id}-base`,
            tipo: 'UND - Unidad',
            costo: producto.costo,
            precio1: producto.precio,
            precio2: 0,
            precio3: 0,
            descuento_pct: 0,
          }];

      return presentaciones.map(p => {
        const costo = n(p.costo || producto.costo);
        const precio1 = n(p.precio1 || producto.precio);
        const precio2 = n(p.precio2);
        const precio3 = n(p.precio3);
        const descuento = n(p.descuento_pct);
        const p1 = metricForPrice(precio1, costo, descuento);
        const p2 = metricForPrice(precio2, costo);
        const p3 = metricForPrice(precio3, costo);
        const precioObjetivo = priceForRealMargin(costo, objetivo);
        const sugeridoP1 = Math.max(precio1, precioObjetivo);
        const sugeridoP2Base = roundPrice(sugeridoP1 * (1 - p2Discount / 100));
        const sugeridoP3Base = roundPrice(sugeridoP1 * (1 - p3Discount / 100));
        const sugeridoP2 = metricForPrice(sugeridoP2Base, costo).utilidad >= 0 ? sugeridoP2Base : 0;
        const sugeridoP3 = metricForPrice(sugeridoP3Base, costo).utilidad >= 0 ? sugeridoP3Base : 0;

        const problemas = [];
        if (costo <= 0) problemas.push('Sin costo');
        if (precio1 <= 0) problemas.push('Sin precio');
        if (costo > 0 && precio1 > 0 && p1.margenReal < objetivo) problemas.push('Margen bajo');
        if (precio2 > 0 && p2.utilidad < 0) problemas.push('P2 pierde');
        if (precio3 > 0 && p3.utilidad < 0) problemas.push('P3 pierde');

        let nivel = 'Normal';
        if (problemas.some(item => item.includes('pierde') || item === 'Sin costo' || item === 'Sin precio')) nivel = 'Critico';
        else if (problemas.length > 0) nivel = 'Revisar';

        return {
          id: `${producto.id}-${p.id}`,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          marca: producto.marca_nombre || '',
          presentacion: p.tipo || 'UND - Unidad',
          costo,
          precio1,
          precio2,
          precio3,
          margenReal: p1.margenReal,
          utilidad: p1.utilidad,
          sugeridoP1: roundPrice(sugeridoP1),
          sugeridoP2,
          sugeridoP3,
          problemas,
          nivel,
        };
      });
    }).sort((a, b) => {
      const prioridad = { Critico: 0, Revisar: 1, Normal: 2 };
      if (prioridad[a.nivel] !== prioridad[b.nivel]) return prioridad[a.nivel] - prioridad[b.nivel];
      return a.margenReal - b.margenReal;
    });
  }, [margenObjetivo, p2Discount, p3Discount, productos]);

  const visibles = useMemo(() => recomendaciones.filter(row => row.nivel !== 'Normal').slice(0, 150), [recomendaciones]);

  const resumen = useMemo(() => ({
    total: recomendaciones.length,
    criticos: recomendaciones.filter(row => row.nivel === 'Critico').length,
    revisar: recomendaciones.filter(row => row.nivel === 'Revisar').length,
    p2P3Pierde: recomendaciones.filter(row => row.problemas.some(p => p.includes('pierde'))).length,
    margenBajo: recomendaciones.filter(row => row.problemas.includes('Margen bajo')).length,
  }), [recomendaciones]);

  return (
    <>
      <Helmet><title>Recomendador de Precios - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Tags className="w-5 h-5 text-blue-600" /> Recomendador de Precios
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Detecta precios con margen bajo, P2/P3 con perdida y sugiere precios para proteger la ganancia real.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-500">% margen real objetivo</Label>
                <Input
                  className="h-9 w-32 text-right"
                  type="number"
                  value={margenObjetivo}
                  onChange={event => setMargenObjetivo(event.target.value)}
                />
              </div>
              {lastSync && <span className="text-[11px] text-slate-500 mb-2">Actualizado {lastSync.toLocaleTimeString('es-DO')}</span>}
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualizar
              </Button>
            </div>
          </div>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric title="Presentaciones" value={resumen.total} tone="blue" icon={Tags} description="Cantidad de presentaciones analizadas." />
            <Metric title="Criticos" value={resumen.criticos} tone="red" icon={AlertTriangle} description="Sin costo, sin precio o con P2/P3 generando perdida." />
            <Metric title="A revisar" value={resumen.revisar} tone="amber" icon={Percent} description="Presentaciones con margen real por debajo del objetivo." />
            <Metric title="P2/P3 pierde" value={resumen.p2P3Pierde} tone="red" icon={TrendingUp} description="Presentaciones donde Precio 2 o Precio 3 estan por debajo del costo." />
            <Metric title="Margen bajo" value={resumen.margenBajo} tone="amber" icon={Percent} description={`Productos cuyo margen real de P1 esta por debajo de ${pct(margenObjetivo)}%.`} />
          </div>
        </TooltipProvider>

        {loading ? (
          <div className="bg-white border rounded-lg p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analizando precios...
          </div>
        ) : (
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">Precios recomendados</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">P2 usa -{pct(p2Discount)}% y P3 usa -{pct(p3Discount)}% sobre P1, segun configuracion del sistema.</p>
              </div>
              <Badge variant="outline">{visibles.length}</Badge>
            </div>
            {visibles.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No hay precios con riesgo segun el margen objetivo actual.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Producto</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">P1 actual</TableHead>
                    <TableHead className="text-right">Margen real</TableHead>
                    <TableHead className="text-right">P1 sugerido</TableHead>
                    <TableHead className="text-right">P2 sugerido</TableHead>
                    <TableHead className="text-right">P3 sugerido</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map(row => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-bold text-slate-900">{row.codigo} - {row.descripcion}</div>
                        <div className="text-xs text-slate-500">{row.presentacion} {row.marca ? `| ${row.marca}` : ''}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex border rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${row.nivel === 'Critico' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{row.nivel}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">RD$ {money(row.costo)}</TableCell>
                      <TableCell className="text-right tabular-nums">RD$ {money(row.precio1)}</TableCell>
                      <TableCell className={`text-right font-black ${row.margenReal < 0 ? 'text-red-700' : row.margenReal < n(margenObjetivo) ? 'text-amber-700' : 'text-emerald-700'}`}>{pct(row.margenReal)}%</TableCell>
                      <TableCell className="text-right font-black text-blue-700">RD$ {money(row.sugeridoP1)}</TableCell>
                      <TableCell className="text-right font-semibold">{row.sugeridoP2 > 0 ? `RD$ ${money(row.sugeridoP2)}` : 'Desactivar'}</TableCell>
                      <TableCell className="text-right font-semibold">{row.sugeridoP3 > 0 ? `RD$ ${money(row.sugeridoP3)}` : 'Desactivar'}</TableCell>
                      <TableCell className="text-xs text-slate-600">{row.problemas.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
};

const Metric = ({ title, value, tone, icon: Icon, description }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={`border rounded-lg p-4 cursor-help ${tones[tone] || tones.blue}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase">{title}</span>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-2xl font-black mt-2">{value}</div>
      </div>
    </TooltipTrigger>
    <TooltipContent className="max-w-[300px] bg-slate-900 text-white border-slate-800 text-xs leading-relaxed">
      {description}
    </TooltipContent>
  </Tooltip>
);

export default RecomendadorPreciosPage;
