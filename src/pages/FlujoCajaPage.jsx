import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { CalendarDays, CreditCard, Download, Loader2, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePanels } from '@/contexts/PanelContext';

const n = (value) => Number(value || 0);
const money = (value) => n(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toDateOnly = (value) => {
  if (!value) return null;
  const [datePart] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const getVencimiento = (fecha, diasCredito) => {
  const base = toDateOnly(fecha);
  if (!base) return null;
  return addDays(base, Number(diasCredito || 0));
};

const periodoLabel = (dias) => {
  if (dias < 0) return 'Vencido';
  if (dias === 0) return 'Hoy';
  if (dias <= 7) return '1-7 dias';
  if (dias <= 15) return '8-15 dias';
  if (dias <= 30) return '16-30 dias';
  return '31+ dias';
};

const FlujoCajaPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [loading, setLoading] = useState(false);
  const [diasVista, setDiasVista] = useState('30');
  const [facturas, setFacturas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [pagosDetalle, setPagosDetalle] = useState([]);
  const [pagosSuplidores, setPagosSuplidores] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [facturasRes, comprasRes, pagosDetalleRes, pagosRes] = await Promise.all([
        supabase
          .from('facturas')
          .select('id, numero, fecha, dias_credito, total, monto_pendiente, cliente_id, clientes(nombre)')
          .eq('tenant_id', tenantId)
          .eq('estado', 'PENDIENTE')
          .gt('monto_pendiente', 0)
          .order('fecha', { ascending: true })
          .limit(1000),
        supabase
          .from('compras')
          .select('id, numero, referencia, fecha, dias_credito, total_compra, monto_pendiente, monto_pagado, estado, suplidor_id, proveedores(nombre)')
          .eq('tenant_id', tenantId)
          .ilike('forma_pago', 'CREDITO')
          .order('fecha', { ascending: true })
          .limit(1000),
        supabase
          .from('pagos_suplidores_detalle')
          .select('pago_id, compra_id, monto_abonado, pagos_suplidores!inner(anulado)')
          .eq('tenant_id', tenantId)
          .eq('pagos_suplidores.anulado', false)
          .limit(20000),
        supabase
          .from('pagos_suplidores')
          .select('id, suplidor_id, monto_pagado, anulado')
          .eq('tenant_id', tenantId)
          .eq('anulado', false)
          .limit(20000),
      ]);

      if (facturasRes.error) throw facturasRes.error;
      if (comprasRes.error) throw comprasRes.error;
      if (pagosDetalleRes.error) throw pagosDetalleRes.error;
      if (pagosRes.error) throw pagosRes.error;

      setFacturas(facturasRes.data || []);
      setCompras(comprasRes.data || []);
      setPagosDetalle(pagosDetalleRes.data || []);
      setPagosSuplidores(pagosRes.data || []);
      setLastSync(new Date());
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el flujo de caja', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pagosPorCompra = useMemo(() => pagosDetalle.reduce((acc, pago) => {
    acc[pago.compra_id] = n(acc[pago.compra_id]) + n(pago.monto_abonado);
    return acc;
  }, {}), [pagosDetalle]);

  const pagosGeneralesPorSuplidor = useMemo(() => {
    const pagosConDetalle = new Set(pagosDetalle.map(p => p.pago_id).filter(Boolean));
    return pagosSuplidores.reduce((acc, pago) => {
      if (pagosConDetalle.has(pago.id)) return acc;
      acc[pago.suplidor_id] = n(acc[pago.suplidor_id]) + n(pago.monto_pagado);
      return acc;
    }, {});
  }, [pagosDetalle, pagosSuplidores]);

  const proyeccion = useMemo(() => {
    const hoy = toDateOnly(new Date().toISOString());
    const limiteDias = Number(diasVista);
    const pagosGeneralesRestantes = { ...pagosGeneralesPorSuplidor };

    const cobros = facturas
      .map(factura => {
        const vence = getVencimiento(factura.fecha, factura.dias_credito);
        const dias = vence ? differenceInCalendarDays(vence, hoy) : 0;
        return {
          id: factura.id,
          tipo: 'cobro',
          numero: factura.numero,
          nombre: factura.clientes?.nombre || 'Cliente',
          fecha: factura.fecha,
          vence,
          dias,
          monto: Math.max(0, n(factura.monto_pendiente)),
          clienteId: factura.cliente_id,
          periodo: periodoLabel(dias),
        };
      })
      .filter(item => item.monto > 0.01 && item.dias <= limiteDias)
      .sort((a, b) => a.dias - b.dias);

    const pagosBase = compras
      .map(compra => {
        const estado = String(compra.estado || '').toUpperCase();
        if (estado === 'PAGADA') {
          return { ...compra, pendienteReal: 0 };
        }
        const total = n(compra.total_compra);
        const pagadoDirecto = Math.max(n(compra.monto_pagado), n(pagosPorCompra[compra.id]));
        const pendienteDirecto = Math.max(0, total - pagadoDirecto);
        const pendienteGuardado = Math.max(0, n(compra.monto_pendiente ?? pendienteDirecto));
        return { ...compra, pendienteReal: Math.min(pendienteGuardado, pendienteDirecto) };
      })
      .sort((a, b) => {
        const da = getVencimiento(a.fecha, a.dias_credito)?.getTime() || 0;
        const db = getVencimiento(b.fecha, b.dias_credito)?.getTime() || 0;
        return da - db;
      });

    pagosBase.forEach(compra => {
      if (compra.pendienteReal <= 0.01 || !compra.suplidor_id) return;
      const disponible = n(pagosGeneralesRestantes[compra.suplidor_id]);
      if (disponible <= 0) return;
      const aplicado = Math.min(disponible, compra.pendienteReal);
      compra.pendienteReal = Math.max(0, compra.pendienteReal - aplicado);
      pagosGeneralesRestantes[compra.suplidor_id] = disponible - aplicado;
    });

    const pagos = pagosBase
      .map(compra => {
        const vence = getVencimiento(compra.fecha, compra.dias_credito);
        const dias = vence ? differenceInCalendarDays(vence, hoy) : 0;
        return {
          id: compra.id,
          tipo: 'pago',
          numero: compra.referencia || compra.numero,
          nombre: compra.proveedores?.nombre || 'Suplidor',
          fecha: compra.fecha,
          vence,
          dias,
          monto: Math.max(0, n(compra.pendienteReal)),
          estado: compra.estado,
          suplidorId: compra.suplidor_id,
          periodo: periodoLabel(dias),
        };
      })
      .filter(item => item.monto > 0.01 && item.dias <= limiteDias && String(item.estado || '').toUpperCase() !== 'PAGADA')
      .sort((a, b) => a.dias - b.dias);

    const periodos = ['Vencido', 'Hoy', '1-7 dias', '8-15 dias', '16-30 dias', '31+ dias'];
    const buckets = periodos.map(periodo => {
      const entradas = cobros.filter(i => i.periodo === periodo).reduce((sum, i) => sum + i.monto, 0);
      const salidas = pagos.filter(i => i.periodo === periodo).reduce((sum, i) => sum + i.monto, 0);
      return { periodo, entradas, salidas, neto: entradas - salidas };
    }).filter(b => b.entradas > 0 || b.salidas > 0);

    return { cobros, pagos, buckets };
  }, [compras, diasVista, facturas, pagosGeneralesPorSuplidor, pagosPorCompra]);

  const resumen = useMemo(() => {
    const entradas = proyeccion.cobros.reduce((sum, item) => sum + item.monto, 0);
    const salidas = proyeccion.pagos.reduce((sum, item) => sum + item.monto, 0);
    const vencidoCobrar = proyeccion.cobros.filter(i => i.dias < 0).reduce((sum, item) => sum + item.monto, 0);
    const vencidoPagar = proyeccion.pagos.filter(i => i.dias < 0).reduce((sum, item) => sum + item.monto, 0);
    return { entradas, salidas, neto: entradas - salidas, vencidoCobrar, vencidoPagar };
  }, [proyeccion]);

  return (
    <>
      <Helmet><title>Flujo de Caja - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-600" /> Flujo de Caja Proyectado
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Proyeccion de facturas pendientes por cobrar menos compras a credito pendientes por pagar. No representa efectivo disponible en caja.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lastSync && <span className="text-[11px] text-slate-500">Actualizado {lastSync.toLocaleTimeString('es-DO')}</span>}
              <Select value={diasVista} onValueChange={setDiasVista}>
                <SelectTrigger className="w-[150px] h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Proximos 7 dias</SelectItem>
                  <SelectItem value="15">Proximos 15 dias</SelectItem>
                  <SelectItem value="30">Proximos 30 dias</SelectItem>
                  <SelectItem value="60">Proximos 60 dias</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualizar
              </Button>
            </div>
          </div>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric
              title="Entradas previstas"
              value={`RD$ ${money(resumen.entradas)}`}
              tone="green"
              icon={TrendingUp}
              description={`Facturas pendientes que esperas cobrar, vencidas o que vencen en los proximos ${diasVista} dias.`}
            />
            <Metric
              title="Salidas previstas"
              value={`RD$ ${money(resumen.salidas)}`}
              tone="red"
              icon={TrendingDown}
              description={`Compras a credito pendientes por pagar, vencidas o que vencen en los proximos ${diasVista} dias.`}
            />
            <Metric
              title="Neto proyectado"
              value={`RD$ ${money(resumen.neto)}`}
              tone={resumen.neto >= 0 ? 'blue' : 'amber'}
              icon={Wallet}
              description={`Entradas menos salidas: RD$ ${money(resumen.entradas)} - RD$ ${money(resumen.salidas)} = RD$ ${money(resumen.neto)}.`}
            />
            <Metric
              title="Cobros vencidos"
              value={`RD$ ${money(resumen.vencidoCobrar)}`}
              tone="amber"
              icon={Download}
              description="Facturas pendientes de cobro cuya fecha de vencimiento ya paso."
            />
            <Metric
              title="Pagos vencidos"
              value={`RD$ ${money(resumen.vencidoPagar)}`}
              tone="red"
              icon={CreditCard}
              description="Compras pendientes de pago cuya fecha de vencimiento ya paso."
            />
          </div>
        </TooltipProvider>

        {loading ? (
          <div className="bg-white border rounded-lg p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculando flujo...
          </div>
        ) : (
          <>
            <ResumenPorPeriodo buckets={proyeccion.buckets} />
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              <FlujoTable
                title="Cobros esperados"
                rows={proyeccion.cobros}
                type="cobro"
                onRowDoubleClick={(row) => row.clienteId && openPanel('recibo-ingreso', { clienteId: row.clienteId })}
              />
              <FlujoTable
                title="Pagos pendientes"
                rows={proyeccion.pagos}
                type="pago"
                onRowDoubleClick={() => openPanel('pago-suplidores')}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
};

const tones = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
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
        <div className="text-xl xl:text-2xl font-black mt-2">{value}</div>
      </div>
    </TooltipTrigger>
    <TooltipContent className="max-w-[320px] bg-slate-900 text-white border-slate-800 text-xs leading-relaxed">
      {description}
    </TooltipContent>
  </Tooltip>
);

const ResumenPorPeriodo = ({ buckets }) => (
  <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b flex items-center gap-2">
      <CalendarDays className="w-4 h-4 text-blue-600" />
      <h2 className="font-bold text-slate-800">Resumen por periodo</h2>
    </div>
    {buckets.length === 0 ? (
      <div className="p-4 text-sm text-slate-500">No hay vencimientos en el rango seleccionado.</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Periodo</TableHead>
            <TableHead className="text-right">Entradas</TableHead>
            <TableHead className="text-right">Salidas</TableHead>
            <TableHead className="text-right">Neto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map(bucket => (
            <TableRow key={bucket.periodo}>
              <TableCell className="font-bold">{bucket.periodo}</TableCell>
              <TableCell className="text-right text-emerald-700 font-semibold">RD$ {money(bucket.entradas)}</TableCell>
              <TableCell className="text-right text-red-700 font-semibold">RD$ {money(bucket.salidas)}</TableCell>
              <TableCell className={`text-right font-black ${bucket.neto >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>RD$ {money(bucket.neto)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </div>
);

const FlujoTable = ({ title, rows, type, onRowDoubleClick }) => (
  <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <h2 className="font-bold text-slate-800">{title}</h2>
      <Badge variant="outline">{rows.length}</Badge>
    </div>
    {rows.length === 0 ? (
      <div className="p-4 text-sm text-slate-500">Sin registros para mostrar.</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Documento</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 60).map(row => (
            <TableRow
              key={`${type}-${row.id}`}
              onDoubleClick={() => onRowDoubleClick?.(row)}
              className="cursor-pointer"
            >
              <TableCell className="font-bold text-slate-800">{row.numero || 'N/A'}</TableCell>
              <TableCell className="text-slate-600">{row.nombre}</TableCell>
              <TableCell>{row.vence ? format(row.vence, 'dd/MM/yyyy') : 'N/A'}</TableCell>
              <TableCell>
                <Badge className={row.dias < 0 ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-blue-100 text-blue-700 hover:bg-blue-100'}>
                  {row.dias < 0 ? `Vencido ${Math.abs(row.dias)} dias` : row.dias === 0 ? 'Hoy' : `${row.dias} dias`}
                </Badge>
              </TableCell>
              <TableCell className={`text-right font-black ${type === 'cobro' ? 'text-emerald-700' : 'text-red-700'}`}>RD$ {money(row.monto)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </div>
);

export default FlujoCajaPage;
