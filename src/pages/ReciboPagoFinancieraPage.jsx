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
  const { setSidebarOpen } = useLayout();

  // Al abrir el Recibo de Pago, cerrar el menu lateral para ganar espacio
  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
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
    setCodigoInput(c.codigo || c.rnc || '');
    setMonto(''); setComentarios(''); setPrestamoFiltro('todos');
    cargarEstado(c.id);
  };

  // Buscar cliente escribiendo el código o la cédula y presionando Enter
  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`)
        .eq('activo', true)
        .limit(1);
      if (error) throw error;
      if (data && data.length) {
        seleccionarCliente(data[0]);
      } else {
        toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  const nuevo = () => {
    setCliente(null); setEstado(null); setUltimoPago(null); setCodigoInput('');
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

  // Monto Pagado con separador de miles (,) y decimales (.) mientras se escribe
  const displayMonto = (() => {
    if (monto === '' || monto == null) return '';
    const [ip, dp] = String(monto).split('.');
    const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
    return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
  })();
  const handleMontoChange = (e) => {
    let v = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = v.split('.');
    if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join('')}`;
    const [ip, dp] = v.split('.');
    v = dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
    setMonto(v);
  };

  // Estado del cliente segun su condicion (no se elige a mano):
  //  verde AL DIA (sin cuotas vencidas) · amarillo SEGUIMIENTO (atraso <=30d) · rojo SE BUSCA (>30d)
  const estadoCliente = (() => {
    if (!cliente) return null;
    const cuotasP = estado?.cuotas || [];
    const hoy = new Date();
    let maxDias = 0;
    let hayVencida = false;
    cuotasP.forEach((c) => {
      if (c.vencida) {
        hayVencida = true;
        const fv = new Date(`${c.fecha_vencimiento}T00:00:00`);
        const dias = Math.floor((hoy - fv) / 86400000);
        if (dias > maxDias) maxDias = dias;
      }
    });
    if (!hayVencida) return { txt: 'AL DÍA', cls: 'text-emerald-600' };
    if (maxDias <= 30) return { txt: 'SEGUIMIENTO', cls: 'text-amber-600' };
    return { txt: 'SE BUSCA', cls: 'text-red-600' };
  })();

  const cuotasConAbono = useMemo(() => distribuirAbono(cuotasFiltradas, montoNum), [cuotasFiltradas, montoNum]);

  // Desglose del monto que se esta abonando ahora (capital / interes / mora)
  const abonoCapital = cuotasConAbono.reduce((a, c) => a + Number(c.ab_cap || 0), 0);
  const abonoInteres = cuotasConAbono.reduce((a, c) => a + Number(c.ab_int || 0), 0);
  const abonoMora = cuotasConAbono.reduce((a, c) => a + Number(c.ab_mora || 0), 0);

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
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Recibo de Pago — Financiera</title></Helmet>

      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        {/* Título */}
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          RECIBO DE PAGO
        </div>

        <div className="p-2 space-y-1">
          {/* Fila superior: cliente / cobrador-prestamo / numero-fecha */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            {/* Cliente */}
            <div className="border rounded-md p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula"
                  className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 truncate flex-1 min-w-0" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</span>
                <span className="text-emerald-600 whitespace-nowrap font-semibold">{cliente?.telefono || '—'}</span>
              </div>
            </div>

            {/* Cobrador / Préstamo / Último pago */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Cobrador</Label>
                <Input value={cobrador} onChange={(e) => setCobrador(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Estado<br />Cliente</span>
                  {estadoCliente
                    ? <span className={`text-[11px] font-bold whitespace-nowrap ${estadoCliente.cls}`}>{estadoCliente.txt}</span>
                    : <span className="text-xs text-slate-400">—</span>}
                </div>
                <Label className="text-xs w-20 text-right shrink-0">Préstamo</Label>
                <Select value={prestamoFiltro} onValueChange={setPrestamoFiltro}>
                  <SelectTrigger className="h-8 text-sm flex-1 min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos…</SelectItem>
                    {prestamosUnicos.map((p) => <SelectItem key={p.id} value={p.id}>{p.num}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Numero / Fecha / Forma de pago */}
            <div className="border rounded-md p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Número</span>
                  <span className="font-mono font-bold">{numero}</span>
                </div>
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Fecha</span>
                  <span className="font-bold">{hoy()}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex items-center gap-2 min-w-0">
                <Label className="text-[10px] font-bold text-slate-400 uppercase leading-none shrink-0">Forma de<br />Pago</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger className="h-9 text-sm w-[100px] min-w-[44px] shrink"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label className="text-[10px] font-bold text-slate-400 uppercase leading-none whitespace-nowrap shrink-0">Monto<br />Pagado</Label>
                <Input type="text" inputMode="decimal" value={displayMonto} onChange={handleMontoChange} placeholder="0.00" className="text-right font-bold text-lg h-9 flex-1 min-w-[96px] shrink-0" />
              </div>
              {forma !== 'Efectivo' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Cta. Número" className="h-8 text-xs" />
                  <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Banco" className="h-8 text-xs" />
                </div>
              )}
            </div>
          </div>

          {/* Grid de cuotas (altura fija: ~6 filas visibles, scroll si hay mas) */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[160px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-500 border-b sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Vence</th>
                  <th className="text-left px-2 py-1">Origen</th>
                  <th className="text-left px-2 py-1">Referencia</th>
                  <th className="text-left px-2 py-1">Descripción</th>
                  <th className="text-right px-2 py-1">Monto</th>
                  <th className="text-right px-2 py-1">Pendiente</th>
                  <th className="text-right px-2 py-1 bg-red-50">Abono</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {!loading && !cliente && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE PARA VER REGISTROS ---</td></tr>}
                {!loading && cliente && filas.length === 0 && <tr><td colSpan={8} className="p-10 text-center italic text-slate-400">Sin cuotas pendientes.</td></tr>}
                {filas.map((r, i) => (
                  <tr key={r.key} className={`${i % 2 === 1 ? 'bg-emerald-50/60' : 'bg-white'} ${r.esMora ? 'text-red-600 font-semibold' : ''}`}>
                    <td className="px-2 py-1">{r.fecha}</td>
                    <td className="px-2 py-1">{r.vence}</td>
                    <td className="px-2 py-1">{r.origen}</td>
                    <td className="px-2 py-1">{r.referencia}</td>
                    <td className="px-2 py-1">{r.descripcion}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.monto)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.pendiente)}</td>
                    <td className="px-2 py-1 text-right font-bold text-emerald-700">{fmt(r.abono)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Otras Informaciones (col1) · Último Pago (col3) · Comentarios (col1-2) · Balances (col3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0 items-start">
            <div className="border rounded-md p-2 text-xs space-y-1 bg-slate-50 lg:col-start-1 lg:row-start-1">
              <div className="font-bold text-slate-500 mb-1">Otras Informaciones</div>
              <div className="flex justify-between"><span>Capital Pendiente</span><b>{fmt(capitalPend)}</b></div>
              <div className="flex justify-between"><span>Intereses Pendientes</span><b>{fmt(interesPend)}</b></div>
              <div className="flex justify-between"><span>Mora Pendiente</span><b className="text-red-600">{fmt(moraPend)}</b></div>
            </div>

            <div className="border-2 border-blue-200 rounded-md p-2 text-xs lg:col-start-3 lg:row-start-1">
              <div className="text-blue-600 font-bold text-center mb-1">
                Último Pago → {ultimoPago?.fecha || 'N/A'}
              </div>
              <div className="flex justify-between"><span>Capital</span><b>{fmt(abonoCapital)}</b></div>
              <div className="flex justify-between"><span>Intereses</span><b>{fmt(abonoInteres)}</b></div>
              <div className="flex justify-between"><span>Mora</span><b className="text-red-600">{fmt(abonoMora)}</b></div>
            </div>

            <div className="border rounded-md p-2 lg:col-start-1 lg:col-span-2 lg:row-start-2 max-h-[94px] overflow-hidden">
              <Label className="text-xs font-bold">Comentarios</Label>
              <Textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} className="mt-1 h-12 text-sm resize-none" />
            </div>

            <div className="border rounded-md p-2 text-sm space-y-1 lg:col-start-3 lg:row-start-2">
              <div className="flex justify-between text-slate-500"><span>Balance Anterior</span><b className="text-slate-700">{fmt(balanceAnterior)}</b></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total Pagado</span><span>{fmt(montoNum)}</span></div>
              <div className="flex justify-between text-red-600 font-bold border-t pt-1"><span>Balance Actual</span><span>{fmt(balanceActual)}</span></div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
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
