import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, X, Search, FilePlus } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { distribuirAbono, round2 } from '@/components/financiera/amortizacion';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Date().toISOString().slice(0, 10);
const FORMAS = ['Efectivo', 'Cheque', 'Tarjeta'];

const ReciboPagoFinancieraPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel, activePanel } = usePanels();

  const [cliente, setCliente] = useState(null);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [estado, setEstado] = useState(null);
  const [ultimoPago, setUltimoPago] = useState(null);
  const [numero, setNumero] = useState('—');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [prestamoFiltro, setPrestamoFiltro] = useState('todos');
  const [monto, setMonto] = useState('');
  const [forma, setForma] = useState('Efectivo');
  const [cuenta, setCuenta] = useState('');
  const [banco, setBanco] = useState('');
  const [cobrador, setCobrador] = useState(empresa?.nombre || '');
  const [comentarios, setComentarios] = useState('');
  const [imprimir, setImprimir] = useState(true);

  useEffect(() => { if (empresa?.nombre && !cobrador) setCobrador(empresa.nombre); }, [empresa, cobrador]);

  const cargarProximoNumero = useCallback(async () => {
    try {
      const { data } = await supabase.from('prestamo_pagos').select('numero').order('created_at', { ascending: false }).limit(1);
      const last = data?.[0]?.numero ? parseInt(String(data[0].numero).replace(/\D/g, ''), 10) : 0;
      setNumero(String((last || 0) + 1).padStart(7, '0'));
    } catch { setNumero('—'); }
  }, []);

  useEffect(() => { cargarProximoNumero(); }, [cargarProximoNumero]);

  const cargarEstado = useCallback(async (clienteId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_prestamos_cliente', { p_cliente_id: clienteId });
      if (error) throw error;
      setEstado(data);

      // Último pago (capital/interés/mora) — best effort
      const { data: pago } = await supabase
        .from('prestamo_pagos')
        .select('id, fecha')
        .eq('cliente_id', clienteId).eq('anulado', false)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (pago) {
        const { data: det } = await supabase
          .from('prestamo_pago_detalle')
          .select('abono_capital, abono_interes, abono_mora')
          .eq('pago_id', pago.id);
        const s = (det || []).reduce((a, d) => ({
          cap: a.cap + Number(d.abono_capital || 0),
          int: a.int + Number(d.abono_interes || 0),
          mora: a.mora + Number(d.abono_mora || 0),
        }), { cap: 0, int: 0, mora: 0 });
        setUltimoPago({ fecha: pago.fecha, ...s });
      } else {
        setUltimoPago(null);
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el estado', description: e.message });
      setEstado(null);
    }
    setLoading(false);
  }, [toast]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setMonto(''); setComentarios(''); setPrestamoFiltro('todos');
    cargarEstado(c.id);
  };

  const nuevo = () => {
    setCliente(null); setEstado(null); setUltimoPago(null);
    setMonto(''); setComentarios(''); setForma('Efectivo'); setCuenta(''); setBanco('');
    setPrestamoFiltro('todos'); cargarProximoNumero();
  };

  const cuotas = estado?.cuotas || [];
  const prestamosUnicos = useMemo(
    () => [...new Map(cuotas.map((c) => [c.prestamo_id, c.prestamo_numero])).entries()].map(([id, num]) => ({ id, num })),
    [cuotas]
  );
  const cuotasFiltradas = useMemo(
    () => (prestamoFiltro === 'todos' ? cuotas : cuotas.filter((c) => c.prestamo_id === prestamoFiltro)),
    [cuotas, prestamoFiltro]
  );

  const capitalPend = cuotasFiltradas.reduce((a, c) => a + Number(c.capital_pend || 0), 0);
  const interesPend = cuotasFiltradas.reduce((a, c) => a + Number(c.interes_pend || 0), 0);
  const moraPend = cuotasFiltradas.reduce((a, c) => a + Number(c.mora_pend || 0), 0);
  const balanceAnterior = round2(capitalPend + interesPend + moraPend);
  const montoNum = round2(Number(monto) || 0);
  const balanceActual = Math.max(round2(balanceAnterior - montoNum), 0);

  const cuotasConAbono = useMemo(() => distribuirAbono(cuotasFiltradas, montoNum), [cuotasFiltradas, montoNum]);

  // Filas a mostrar (MORA como línea aparte, igual a la foto)
  const filas = useMemo(() => {
    const out = [];
    cuotasConAbono.forEach((c) => {
      if (Number(c.mora_pend) > 0) {
        out.push({
          key: `${c.cuota_id}-mora`, fecha: '', vence: c.fecha_vencimiento, origen: '>>MORA<<',
          referencia: c.referencia, descripcion: 'Cargos por Atrasos (MORA)',
          monto: c.mora_pend, pendiente: c.mora_pend, abono: c.ab_mora, esMora: true,
        });
      }
      out.push({
        key: `${c.cuota_id}-fin`, fecha: c.fecha || '', vence: c.fecha_vencimiento, origen: c.prestamo_numero,
        referencia: c.referencia, descripcion: 'Financiamiento',
        monto: c.monto_cuota, pendiente: round2(Number(c.capital_pend) + Number(c.interes_pend)),
        abono: round2(Number(c.ab_int) + Number(c.ab_cap)), esMora: false,
      });
    });
    return out;
  }, [cuotasConAbono]);

  const handleGrabar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(montoNum > 0)) { toast({ variant: 'destructive', title: 'Ingresa el monto a pagar' }); return; }
    if (montoNum > balanceAnterior + 0.01) { toast({ variant: 'destructive', title: 'El monto excede el balance pendiente' }); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('registrar_pago_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: montoNum,
        p_forma_pago: forma,
        p_cuenta: cuenta || null,
        p_banco: banco || null,
        p_comentarios: comentarios || null,
        p_cobrador: cobrador || null,
        p_fecha: null,
        p_prestamo_id: prestamoFiltro === 'todos' ? null : prestamoFiltro,
      });
      if (error) throw error;
      toast({ title: 'Pago registrado', description: `Recibo ${data?.numero} · Total ${fmt(data?.total_pagado)}` });
      setMonto(''); setComentarios('');
      await cargarEstado(cliente.id);
      await cargarProximoNumero();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar el pago', description: e.message });
    }
    setSaving(false);
  };

  return (
    <div className="p-3 md:p-4 bg-slate-100 min-h-full">
      <Helmet><title>Recibo de Pago — Financiera</title></Helmet>

      <div className="bg-white rounded-lg shadow border max-w-6xl mx-auto overflow-hidden flex flex-col min-h-[calc(100vh-80px)]">
        {/* Título */}
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-2 font-extrabold tracking-wide text-lg">
          RECIBO DE PAGO
        </div>

        <div className="p-4 space-y-3 flex flex-col flex-1 min-h-0">
          {/* Fila superior: cliente / cobrador-prestamo / numero-fecha */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Cliente */}
            <div className="border rounded-md p-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cliente</div>
              <div className="flex gap-2 items-center">
                <Input readOnly value={cliente?.codigo || ''} placeholder="Código" className="w-28 h-8 text-sm" />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight">{cliente?.nombre || '—'}</div>
              <div className="text-xs text-slate-500">{cliente?.direccion || '—'}</div>
              <div className="text-xs text-emerald-600">{cliente?.telefono || '—'}</div>
            </div>

            {/* Cobrador / Préstamo / Último pago */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Cobrador</Label>
                <Input value={cobrador} onChange={(e) => setCobrador(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Préstamo</Label>
                <Select value={prestamoFiltro} onValueChange={setPrestamoFiltro}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos…</SelectItem>
                    {prestamosUnicos.map((p) => <SelectItem key={p.id} value={p.id}>{p.num}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Numero / Fecha / Forma de pago */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <div><div className="text-[10px] font-bold text-slate-400 uppercase">Número</div><div className="font-mono font-bold">{numero}</div></div>
                <div className="text-right"><div className="text-[10px] font-bold text-slate-400 uppercase">Fecha</div><div className="font-bold">{hoy()}</div></div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm border-t pt-2">
                {FORMAS.map((f) => (
                  <label key={f} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="forma" checked={forma === f} onChange={() => setForma(f)} />{f}
                  </label>
                ))}
              </div>
              {forma !== 'Efectivo' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Cta. Número" className="h-8 text-xs" />
                  <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Banco" className="h-8 text-xs" />
                </div>
              )}
              <div className="border-t pt-2 flex items-center gap-2">
                <Label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Monto Pagado</Label>
                <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="text-right font-bold text-lg h-9 flex-1" />
              </div>
            </div>
          </div>

          {/* Grid de cuotas (crece para llenar el espacio disponible) */}
          <div className="border rounded-md overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="overflow-y-auto flex-1">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-500 border-b sticky top-0">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Vence</th>
                  <th className="text-left p-2">Origen</th>
                  <th className="text-left p-2">Referencia</th>
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-right p-2">Monto</th>
                  <th className="text-right p-2">Pendiente</th>
                  <th className="text-right p-2 bg-red-50">Abono</th>
                </tr>
              </thead>
              <tbody className="bg-emerald-50/30">
                {loading && <tr><td colSpan={8} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {!loading && !cliente && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE PARA VER REGISTROS ---</td></tr>}
                {!loading && cliente && filas.length === 0 && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">Sin cuotas pendientes.</td></tr>}
                {filas.map((r) => (
                  <tr key={r.key} className={`border-b last:border-0 ${r.esMora ? 'text-red-600 font-semibold' : ''}`}>
                    <td className="p-2">{r.fecha}</td>
                    <td className="p-2">{r.vence}</td>
                    <td className="p-2">{r.origen}</td>
                    <td className="p-2">{r.referencia}</td>
                    <td className="p-2">{r.descripcion}</td>
                    <td className="p-2 text-right">{fmt(r.monto)}</td>
                    <td className="p-2 text-right">{fmt(r.pendiente)}</td>
                    <td className="p-2 text-right font-bold text-emerald-700">{fmt(r.abono)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Otras Informaciones (col1) · Último Pago (col3) · Comentarios (col1-2) · Balances (col3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            <div className="border rounded-md p-3 text-xs space-y-1 bg-slate-50 lg:col-start-1 lg:row-start-1">
              <div className="font-bold text-slate-500 mb-1">Otras Informaciones</div>
              <div className="flex justify-between"><span>Capital Pendiente</span><b>{fmt(capitalPend)}</b></div>
              <div className="flex justify-between"><span>Intereses Pendientes</span><b>{fmt(interesPend)}</b></div>
              <div className="flex justify-between"><span>Mora Pendiente</span><b className="text-red-600">{fmt(moraPend)}</b></div>
            </div>

            <div className="border-2 border-blue-200 rounded-md p-3 text-xs lg:col-start-3 lg:row-start-1">
              <div className="text-blue-600 font-bold text-center mb-1">
                Último Pago → {ultimoPago?.fecha || 'N/A'}
              </div>
              <div className="flex justify-between"><span>Capital</span><b>{fmt(ultimoPago?.cap)}</b></div>
              <div className="flex justify-between"><span>Intereses</span><b>{fmt(ultimoPago?.int)}</b></div>
              <div className="flex justify-between"><span>Mora</span><b>{fmt(ultimoPago?.mora)}</b></div>
            </div>

            <div className="border rounded-md p-3 lg:col-start-1 lg:col-span-2 lg:row-start-2">
              <Label className="text-xs font-bold">Comentarios</Label>
              <Textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} className="mt-1 h-16 text-sm resize-none" />
            </div>

            <div className="border rounded-md p-3 text-sm space-y-1 lg:col-start-3 lg:row-start-2">
              <div className="flex justify-between text-slate-500"><span>Balance Anterior</span><b className="text-slate-700">{fmt(balanceAnterior)}</b></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total Pagado</span><span>{fmt(montoNum)}</span></div>
              <div className="flex justify-between text-red-600 font-bold border-t pt-1"><span>Balance Actual</span><span>{fmt(balanceActual)}</span></div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={imprimir} onCheckedChange={(c) => setImprimir(!!c)} /> Imprimir
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={nuevo}><FilePlus className="w-4 h-4 mr-1" />Nuevo</Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
              <Button type="button" onClick={handleGrabar} disabled={saving || !cliente}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </div>
  );
};

export default ReciboPagoFinancieraPage;
