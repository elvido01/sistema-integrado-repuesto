import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, Clock, Loader2, RefreshCw, ShieldAlert, TrendingUp, Users, Wallet } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const vencimiento = (fecha, diasCredito) => {
  const base = toDateOnly(fecha);
  if (!base) return null;
  return addDays(base, Number(diasCredito || 0));
};

const riesgoInfo = (row) => {
  if (row.vencido > 0 && row.maxDiasVencido >= 30) {
    return { label: 'Critico', className: 'bg-red-100 text-red-700 border-red-200' };
  }
  if (row.limiteCredito > 0 && row.pendiente > row.limiteCredito) {
    return { label: 'Critico', className: 'bg-red-100 text-red-700 border-red-200' };
  }
  if (row.vencido > 0 || row.usoCredito >= 80) {
    return { label: 'Alto', className: 'bg-amber-100 text-amber-700 border-amber-200' };
  }
  if (row.pendiente > 0) {
    return { label: 'Normal', className: 'bg-blue-100 text-blue-700 border-blue-200' };
  }
  return { label: 'Sano', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
};

const CarteraClientesPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [clientesRes, facturasRes, recibosRes] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, codigo, nombre, rnc, telefono, limite_credito, dias_credito, autorizar_credito, activo')
          .eq('activo', true)
          .order('nombre', { ascending: true })
          .limit(5000),
        supabase
          .from('facturas')
          .select('id, numero, fecha, dias_credito, total, monto_pendiente, cliente_id, clientes(nombre)')
          .eq('estado', 'PENDIENTE')
          .gt('monto_pendiente', 0)
          .order('fecha', { ascending: true })
          .limit(5000),
        supabase
          .from('recibos_ingreso')
          .select('id, cliente_id, fecha, monto_pagado, anulado')
          .eq('anulado', false)
          .order('fecha', { ascending: false })
          .limit(5000),
      ]);

      if (clientesRes.error) throw clientesRes.error;
      if (facturasRes.error) throw facturasRes.error;
      if (recibosRes.error) throw recibosRes.error;

      setClientes(clientesRes.data || []);
      setFacturas(facturasRes.data || []);
      setRecibos(recibosRes.data || []);
      setLastSync(new Date());
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la cartera', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cartera = useMemo(() => {
    const hoy = toDateOnly(new Date().toISOString());
    const clientesMap = new Map(clientes.map(cliente => [cliente.id, cliente]));
    const ultimoPagoPorCliente = recibos.reduce((acc, recibo) => {
      if (!recibo.cliente_id) return acc;
      const actual = acc[recibo.cliente_id];
      const fecha = toDateOnly(recibo.fecha);
      if (!actual || (fecha && fecha > actual.fecha)) {
        acc[recibo.cliente_id] = { fecha, monto: n(recibo.monto_pagado) };
      }
      return acc;
    }, {});

    const agrupado = facturas.reduce((acc, factura) => {
      const clienteId = factura.cliente_id || `sin-cliente-${factura.id}`;
      const cliente = clientesMap.get(factura.cliente_id) || {};
      if (!acc[clienteId]) {
        acc[clienteId] = {
          id: clienteId,
          clienteId: factura.cliente_id,
          codigo: cliente.codigo || '',
          nombre: cliente.nombre || factura.clientes?.nombre || 'Cliente sin ficha',
          telefono: cliente.telefono || '',
          limiteCredito: n(cliente.limite_credito),
          diasCredito: n(cliente.dias_credito),
          autorizadoCredito: !!cliente.autorizar_credito,
          pendiente: 0,
          vencido: 0,
          porVencer: 0,
          facturas: 0,
          facturasVencidas: 0,
          maxDiasVencido: 0,
          facturaMasVieja: null,
        };
      }

      const row = acc[clienteId];
      const monto = Math.max(0, n(factura.monto_pendiente));
      const vence = vencimiento(factura.fecha, factura.dias_credito);
      const dias = vence ? differenceInCalendarDays(hoy, vence) : 0;

      row.pendiente += monto;
      row.facturas += 1;
      if (!row.facturaMasVieja || toDateOnly(factura.fecha) < row.facturaMasVieja) {
        row.facturaMasVieja = toDateOnly(factura.fecha);
      }

      if (dias > 0) {
        row.vencido += monto;
        row.facturasVencidas += 1;
        row.maxDiasVencido = Math.max(row.maxDiasVencido, dias);
      } else {
        row.porVencer += monto;
      }

      return acc;
    }, {});

    return Object.values(agrupado)
      .map(row => {
        const pago = ultimoPagoPorCliente[row.clienteId];
        const usoCredito = row.limiteCredito > 0 ? (row.pendiente / row.limiteCredito) * 100 : 0;
        return {
          ...row,
          usoCredito,
          ultimoPagoFecha: pago?.fecha || null,
          ultimoPagoMonto: pago?.monto || 0,
          riesgo: riesgoInfo({ ...row, usoCredito }),
        };
      })
      .sort((a, b) => {
        if (b.vencido !== a.vencido) return b.vencido - a.vencido;
        return b.pendiente - a.pendiente;
      });
  }, [clientes, facturas, recibos]);

  const resumen = useMemo(() => ({
    clientesConBalance: cartera.length,
    pendiente: cartera.reduce((sum, row) => sum + row.pendiente, 0),
    vencido: cartera.reduce((sum, row) => sum + row.vencido, 0),
    criticos: cartera.filter(row => row.riesgo.label === 'Critico').length,
    sobreLimite: cartera.filter(row => row.limiteCredito > 0 && row.pendiente > row.limiteCredito).length,
  }), [cartera]);

  return (
    <>
      <Helmet><title>Cartera de Clientes - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-blue-600" /> Cartera de Clientes
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Riesgo de cobro, balances vencidos, uso de credito y clientes a priorizar.
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

        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric title="Pendiente total" value={`RD$ ${money(resumen.pendiente)}`} tone="blue" icon={Wallet} description="Total pendiente de cobro en facturas a credito." />
            <Metric title="Vencido" value={`RD$ ${money(resumen.vencido)}`} tone="red" icon={AlertTriangle} description="Monto pendiente cuya fecha de vencimiento ya paso." />
            <Metric title="Clientes con balance" value={resumen.clientesConBalance} tone="slate" icon={Users} description="Clientes que tienen una o mas facturas pendientes." />
            <Metric title="Clientes criticos" value={resumen.criticos} tone="amber" icon={ShieldAlert} description="Clientes con deuda vencida por 30 dias o mas, o por encima del limite de credito." />
            <Metric title="Sobre limite" value={resumen.sobreLimite} tone="red" icon={TrendingUp} description="Clientes cuyo balance pendiente supera su limite de credito configurado." />
          </div>
        </TooltipProvider>

        {loading ? (
          <div className="bg-white border rounded-lg p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analizando cartera...
          </div>
        ) : (
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Clientes a gestionar</h2>
              <Badge variant="outline">{cartera.length}</Badge>
            </div>
            {cartera.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No hay cuentas por cobrar pendientes.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Riesgo</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-right">Vencido</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                    <TableHead className="text-right">Limite</TableHead>
                    <TableHead className="text-right">Uso</TableHead>
                    <TableHead>Ultimo pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartera.map(row => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onDoubleClick={() => row.clienteId && openPanel('recibo-ingreso', { clienteId: row.clienteId })}
                    >
                      <TableCell>
                        <div className="font-bold text-slate-900">{row.codigo ? `${row.codigo} - ` : ''}{row.nombre}</div>
                        <div className="text-xs text-slate-500">{row.telefono || 'Sin telefono'} {row.maxDiasVencido > 0 ? `| Vencido hace ${row.maxDiasVencido} dias` : ''}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex border rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${row.riesgo.className}`}>{row.riesgo.label}</span>
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-800">RD$ {money(row.pendiente)}</TableCell>
                      <TableCell className="text-right font-black text-red-700">RD$ {money(row.vencido)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.facturas}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.limiteCredito > 0 ? `RD$ ${money(row.limiteCredito)}` : 'Sin limite'}</TableCell>
                      <TableCell className={`text-right font-bold ${row.usoCredito >= 100 ? 'text-red-700' : row.usoCredito >= 80 ? 'text-amber-700' : 'text-slate-600'}`}>
                        {row.limiteCredito > 0 ? `${money(row.usoCredito)}%` : 'N/A'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {row.ultimoPagoFecha ? `${format(row.ultimoPagoFecha, 'dd/MM/yyyy')} | RD$ ${money(row.ultimoPagoMonto)}` : 'Sin registro'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="px-4 py-2 border-t bg-slate-50 text-[11px] text-slate-500 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Doble clic sobre un cliente abre Recibo de Ingreso para registrar el cobro.
            </div>
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

const Metric = ({ title, value, tone, icon: Icon, description }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={`border rounded-lg p-4 cursor-help ${tones[tone] || tones.slate}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase">{title}</span>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-xl xl:text-2xl font-black mt-2">{value}</div>
      </div>
    </TooltipTrigger>
    <TooltipContent className="max-w-[300px] bg-slate-900 text-white border-slate-800 text-xs leading-relaxed">
      {description}
    </TooltipContent>
  </Tooltip>
);

export default CarteraClientesPage;
