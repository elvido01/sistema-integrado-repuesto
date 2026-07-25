import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useLayout } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Search, X, RefreshCw, Download, Wallet, TrendingUp, AlertTriangle, Coins, Users,
} from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmt0 = (v) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(Number(v) || 0);
const fdate = (d) => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};

const ATRASO_OPCIONES = [
  ['todos', 'Todos'],
  ['al_dia', 'Al día'],
  ['vencidos', 'Con cuotas vencidas'],
  ['con_mora', 'Con mora'],
];

const Kpi = ({ icon: Icon, label, value, sub, tone }) => {
  const tones = {
    blue: 'from-blue-50 to-white border-blue-200 text-blue-700',
    emerald: 'from-emerald-50 to-white border-emerald-200 text-emerald-700',
    amber: 'from-amber-50 to-white border-amber-200 text-amber-700',
    slate: 'from-slate-100 to-white border-slate-200 text-slate-700',
    indigo: 'from-indigo-50 to-white border-indigo-200 text-indigo-700',
  }[tone] || 'from-slate-50 to-white border-slate-200 text-slate-700';
  return (
    <div className={`rounded-xl border bg-gradient-to-b ${tones} p-3 shadow-sm flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-black text-slate-800 leading-tight truncate" title={value}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 truncate">{sub}</div>}
    </div>
  );
};

const ResumenCarteraPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel, activePanel, openPanel } = usePanels();

  // Doble clic en una línea: abre el Recibo de Pago con ese cliente ya
  // seleccionado (mismo mecanismo que Gestión de Cobro: extraData).
  const abrirReciboDeLinea = useCallback((r) => {
    if (!r?.cliente_id) {
      toast({
        variant: 'destructive',
        title: 'Cliente no disponible',
        description: 'Vuelve a consultar la cartera. Si sigue igual, falta correr sql/cartera_cliente_id.sql.',
      });
      return;
    }
    openPanel('recibo-pago', {
      clienteId: r.cliente_id,
      prestamoId: r.prestamo_id,
      requestedAt: Date.now(),
      cliente: { id: r.cliente_id, codigo: r.codigo || '', nombre: r.cliente || '' },
    });
  }, [openPanel, toast]);
  const { setSidebarOpen } = useLayout();

  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [atraso, setAtraso] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipos, setTipos] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('get_tipos_prestamo').then(({ data, error }) => {
      if (!error && Array.isArray(data)) setTipos(data);
    });
  }, []);

  const consultar = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_resumen_cartera_financiera', {
        p_busqueda: busqueda || null,
        p_tipo: tipo === 'todos' ? null : tipo,
        p_atraso: atraso,
        p_desde: desde || null,
        p_hasta: hasta || null,
      });
      if (error) throw error;
      setData(res || null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la cartera', description: e.message });
      setData(null);
    }
    setLoading(false);
  }, [busqueda, tipo, atraso, desde, hasta, toast]);

  // Carga automática al abrir (la cartera activa es pequeña).
  useEffect(() => { consultar(); /* eslint-disable-next-line */ }, []);

  const limpiar = () => {
    setBusqueda(''); setTipo('todos'); setAtraso('todos'); setDesde(''); setHasta('');
    setTimeout(consultar, 0);
  };

  const prestamos = useMemo(() => (data?.prestamos || []), [data]);

  const exportarCsv = () => {
    if (!prestamos.length) { toast({ variant: 'destructive', title: 'No hay datos para exportar' }); return; }
    const head = ['Prestamo', 'Cliente', 'Codigo', 'Tipo', 'Fecha inicio', 'Capital', 'Interes', 'Mora', 'Total', 'Dias atraso', 'Cuotas vencidas'];
    const lines = prestamos.map((r) => [
      r.numero, `"${(r.cliente || '').replace(/"/g, '""')}"`, r.codigo || '', r.tipo || '',
      fdate(r.fecha_inicio), Number(r.capital || 0).toFixed(2), Number(r.interes || 0).toFixed(2),
      Number(r.mora || 0).toFixed(2), Number(r.total || 0).toFixed(2), r.dias_atraso || 0, r.cuotas_vencidas || 0,
    ].join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartera_${(empresa?.nombre || 'financiera').replace(/[^\w]+/g, '_')}_${data?.generado || ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Resumen de Cartera — {empresa?.nombre || 'Financiera'}</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          RESUMEN DE CARTERA {data?.generado ? `— al ${fdate(data.generado)}` : ''}
        </div>

        <div className="p-2 space-y-2">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <Kpi icon={Wallet} tone="blue" label="Capital colocado"
                 value={`RD$ ${fmt(data?.capital_colocado)}`} sub="Tu dinero prestado afuera" />
            <Kpi icon={TrendingUp} tone="emerald" label="Interés por cobrar"
                 value={`RD$ ${fmt(data?.interes_por_cobrar)}`} sub="Ganancia futura pendiente" />
            <Kpi icon={AlertTriangle} tone="amber" label="Mora pendiente"
                 value={`RD$ ${fmt(data?.mora_pendiente)}`} sub="Recargo por atraso" />
            <Kpi icon={Coins} tone="indigo" label="Total cuentas por cobrar"
                 value={`RD$ ${fmt(data?.total_cxc)}`} sub="Capital + interés + mora" />
            <Kpi icon={Users} tone="slate" label="Préstamos activos"
                 value={fmt0(data?.prestamos_activos)} sub="En el filtro actual" />
          </div>

          {/* Filtros */}
          <div className="border rounded-md p-2 grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="space-y-1 col-span-2 lg:col-span-2">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Buscar cliente / préstamo</Label>
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') consultar(); }}
                     placeholder="Nombre, código o Nº de préstamo" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                      className="h-8 text-sm w-full border rounded-md px-2 bg-white">
                <option value="todos">Todos</option>
                {tipos.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Estado</Label>
              <select value={atraso} onChange={(e) => setAtraso(e.target.value)}
                      className="h-8 text-sm w-full border rounded-md px-2 bg-white">
                {ATRASO_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Inicio desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Inicio hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={limpiar} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" />Limpiar
            </Button>
            <Button type="button" size="sm" onClick={consultar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Consultar
            </Button>
          </div>

          {/* Tabla de préstamos */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-auto h-[330px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Préstamo</th>
                    <th className="text-left px-2 py-1">Cliente</th>
                    <th className="text-left px-2 py-1">Tipo</th>
                    <th className="text-left px-2 py-1">Inicio</th>
                    <th className="text-right px-2 py-1">Capital</th>
                    <th className="text-right px-2 py-1">Interés</th>
                    <th className="text-right px-2 py-1">Mora</th>
                    <th className="text-right px-2 py-1">Total</th>
                    <th className="text-center px-2 py-1">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && prestamos.length === 0 && <tr><td colSpan={9} className="p-10 text-center italic text-slate-400">Sin préstamos activos para este filtro.</td></tr>}
                  {!loading && prestamos.map((r, i) => (
                    <tr
                      key={r.prestamo_id}
                      onDoubleClick={() => abrirReciboDeLinea(r)}
                      title="Doble clic: abrir el Recibo de Pago de este cliente"
                      className={`border-b last:border-0 cursor-pointer hover:bg-blue-100/60 ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'}`}
                    >
                      <td className="px-2 py-1 font-bold text-blue-900">{r.numero}</td>
                      <td className="px-2 py-1 truncate max-w-[220px]" title={r.cliente}>{r.cliente}</td>
                      <td className="px-2 py-1 capitalize">{r.tipo}</td>
                      <td className="px-2 py-1">{fdate(r.fecha_inicio)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.capital)}</td>
                      <td className="px-2 py-1 text-right text-emerald-700">{fmt(r.interes)}</td>
                      <td className="px-2 py-1 text-right text-amber-700">{fmt(r.mora)}</td>
                      <td className="px-2 py-1 text-right font-black">{fmt(r.total)}</td>
                      <td className={`px-2 py-1 text-center ${r.dias_atraso > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                        {r.dias_atraso > 0 ? `${r.dias_atraso} d` : 'Al día'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales + acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600 flex gap-4 flex-wrap">
              <span>Préstamos: <b>{fmt0(data?.prestamos_activos)}</b></span>
              <span>Capital: <b className="text-blue-700">{fmt(data?.capital_colocado)}</b></span>
              <span>Total x cobrar: <b className="text-indigo-700">{fmt(data?.total_cxc)}</b></span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={exportarCsv} disabled={!prestamos.length}>
                <Download className="w-4 h-4 mr-1" />Exportar CSV
              </Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}>
                <X className="w-4 h-4 mr-1" />Retornar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumenCarteraPage;
