import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Search, HandCoins, Undo2, Gavel, Ban, ShieldAlert } from 'lucide-react';
import { formatFechaDMY } from '@/lib/dateUtils';

const money = (v) => `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const hoy = () => new Date().toISOString().slice(0, 10);

const MOTIVOS = [
  { value: 'incobrable', label: 'Incobrable' },
  { value: 'vehiculo_robado', label: 'Vehículo robado' },
  { value: 'perdida_total', label: 'Pérdida total' },
];
const motivoLabel = (m) => MOTIVOS.find((x) => x.value === m)?.label || 'Incobrable';
const motivoTone = (m) => m === 'vehiculo_robado' ? 'bg-red-100 text-red-700'
  : m === 'perdida_total' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';

const CuentasIncobrablesPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  // modales
  const [recuperar, setRecuperar] = useState(null); // cuenta a recuperar
  const [recForm, setRecForm] = useState({ monto: '', fecha: hoy(), forma: 'Efectivo', comentarios: '' });
  const [castigarOpen, setCastigarOpen] = useState(false);
  const [castigarSearch, setCastigarSearch] = useState('');
  const [castigarResultados, setCastigarResultados] = useState([]);
  const [castigarSel, setCastigarSel] = useState(null);
  const [castigarMotivo, setCastigarMotivo] = useState('incobrable');
  const [castigarPass, setCastigarPass] = useState('');
  const [puedeSinClave, setPuedeSinClave] = useState(true);

  useEffect(() => {
    supabase.rpc('puede_castigar_sin_clave').then(({ data }) => setPuedeSinClave(!!data)).catch(() => setPuedeSinClave(false));
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_cuentas_incobrables');
      if (error) throw error;
      setData(res);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
      setData(null);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const cuentas = useMemo(() => {
    const arr = data?.cuentas || [];
    const q = search.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((c) => [c.cliente_nombre, c.cliente_codigo, c.numero, c.rnc]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [data, search]);

  const abrirRecuperar = (c) => {
    setRecForm({ monto: String(c.balance?.toFixed?.(2) || ''), fecha: hoy(), forma: 'Efectivo', comentarios: '' });
    setRecuperar(c);
  };

  const confirmarRecuperacion = async () => {
    const monto = Number(String(recForm.monto).replace(/,/g, '')) || 0;
    if (monto <= 0) { toast({ variant: 'destructive', title: 'Monto requerido' }); return; }
    setBusy(true);
    try {
      const { data: r, error } = await supabase.rpc('registrar_recuperacion', {
        p_prestamo_id: recuperar.prestamo_id, p_monto: monto, p_fecha: recForm.fecha,
        p_forma_pago: recForm.forma, p_comentarios: recForm.comentarios || null,
      });
      if (error) throw error;
      toast({ title: 'Recuperación registrada', description: `Recibo ${r.numero} · aplicado ${money(r.aplicado)}${r.saldado ? ' · cuenta SALDADA' : ''}` });
      setRecuperar(null); cargar();
    } catch (e) { toast({ variant: 'destructive', title: 'No se pudo registrar', description: e.message }); }
    setBusy(false);
  };

  const restaurar = async (c) => {
    if (!window.confirm(`¿Devolver a ACTIVO el préstamo ${c.numero} de ${c.cliente_nombre}?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('restaurar_prestamo', { p_prestamo_id: c.prestamo_id });
      if (error) throw error;
      toast({ title: 'Restaurado', description: `${c.numero} volvió a cobranza activa.` });
      cargar();
    } catch (e) { toast({ variant: 'destructive', title: 'No se pudo restaurar', description: e.message }); }
    setBusy(false);
  };

  // --- Castigar una cuenta activa (manual) ---
  const buscarActivos = async () => {
    const q = castigarSearch.trim();
    if (!q) return;
    setBusy(true);
    try {
      const { data: cli } = await supabase.from('clientes').select('id, nombre, codigo, rnc')
        .or(`codigo.ilike.%${q}%,rnc.ilike.%${q}%,nombre.ilike.%${q}%`).limit(10);
      const ids = (cli || []).map((c) => c.id);
      const byId = new Map((cli || []).map((c) => [c.id, c]));
      let prest = [];
      if (ids.length) {
        const { data: p } = await supabase.from('prestamos')
          .select('id, numero, cliente_id, garantia, monto_capital')
          .in('cliente_id', ids).eq('estado', 'activo').limit(30);
        prest = (p || []).map((x) => ({ ...x, cliente: byId.get(x.cliente_id) }));
      }
      setCastigarResultados(prest);
    } catch (e) { toast({ variant: 'destructive', title: 'Error buscando', description: e.message }); }
    setBusy(false);
  };

  const confirmarCastigo = async () => {
    if (!castigarSel) return;
    if (!puedeSinClave && !castigarPass.trim()) {
      toast({ variant: 'destructive', title: 'Autorización requerida', description: 'Ingresa la contraseña del creador de la empresa.' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('castigar_prestamo', {
        p_prestamo_id: castigarSel.id, p_motivo: castigarMotivo,
        p_password: puedeSinClave ? null : castigarPass,
      });
      if (error) throw error;
      toast({ title: 'Cuenta castigada', description: `${castigarSel.numero} pasó a ${motivoLabel(castigarMotivo)}.` });
      setCastigarOpen(false); setCastigarSel(null); setCastigarResultados([]); setCastigarSearch(''); setCastigarPass(''); cargar();
    } catch (e) { toast({ variant: 'destructive', title: 'No se pudo castigar', description: e.message }); }
    setBusy(false);
  };

  const porMotivo = data?.por_motivo || {};

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Helmet><title>Cuentas Incobrables</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center"><ShieldAlert className="w-6 h-6 text-red-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cuentas Incobrables / Vehículos Robados</h1>
            <p className="text-sm text-gray-500">Cartera castigada — fuera de métricas y cobranza. Se puede recuperar.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
          <Button onClick={() => setCastigarOpen(true)}><Gavel className="w-4 h-4 mr-2" />Castigar cuenta</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cuentas castigadas" value={data?.total_cuentas ?? 0} tone="text-slate-700 bg-slate-50" icon={Ban} />
        <Kpi label="Balance castigado" value={money(data?.total_balance || 0)} tone="text-red-700 bg-red-50" icon={ShieldAlert} />
        <Kpi label="Incobrables" value={porMotivo.incobrable || 0} tone="text-slate-700 bg-slate-50" icon={Ban} />
        <Kpi label="Vehículos robados / pérdida" value={(porMotivo.vehiculo_robado || 0) + (porMotivo.perdida_total || 0)} tone="text-red-700 bg-red-50" icon={ShieldAlert} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="p-3 border-b">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="Buscar cliente, código, RNC o préstamo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Préstamo</th>
                <th className="text-left px-3 py-2">Motivo</th>
                <th className="text-left px-3 py-2">Garantía</th>
                <th className="text-right px-3 py-2">Balance</th>
                <th className="text-center px-3 py-2">Castigado</th>
                <th className="text-right px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : cuentas.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center italic text-gray-400">No hay cuentas castigadas.</td></tr>
              ) : cuentas.map((c) => (
                <tr key={c.prestamo_id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{c.cliente_nombre}</div>
                    <div className="text-xs text-gray-500">{c.cliente_codigo || c.rnc || ''}</div>
                  </td>
                  <td className="px-3 py-2 font-bold text-blue-900">{c.numero}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${motivoTone(c.motivo_castigo)}`}>{motivoLabel(c.motivo_castigo)}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[220px] truncate" title={c.garantia || ''}>{c.garantia || '—'}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-700">{money(c.balance)}</td>
                  <td className="px-3 py-2 text-center text-xs text-gray-500">{c.fecha_castigo ? formatFechaDMY(c.fecha_castigo) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirRecuperar(c)}><HandCoins className="w-4 h-4 mr-1" />Recuperar</Button>
                      <Button size="sm" variant="ghost" onClick={() => restaurar(c)} title="Devolver a activo"><Undo2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Recuperación */}
      <Dialog open={!!recuperar} onOpenChange={(o) => !o && setRecuperar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recuperación — {recuperar?.cliente_nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-gray-500">Préstamo {recuperar?.numero} · Balance {money(recuperar?.balance || 0)}</div>
            <div><label className="text-xs font-bold text-gray-500">Monto recibido</label>
              <Input value={recForm.monto} onChange={(e) => setRecForm((f) => ({ ...f, monto: e.target.value }))} inputMode="decimal" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-bold text-gray-500">Fecha</label>
                <Input type="date" value={recForm.fecha} onChange={(e) => setRecForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
              <div><label className="text-xs font-bold text-gray-500">Forma</label>
                <Select value={recForm.forma} onValueChange={(v) => setRecForm((f) => ({ ...f, forma: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div><label className="text-xs font-bold text-gray-500">Comentarios</label>
              <Textarea value={recForm.comentarios} onChange={(e) => setRecForm((f) => ({ ...f, comentarios: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
            <Button onClick={confirmarRecuperacion} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HandCoins className="w-4 h-4 mr-2" />}Registrar recuperación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Castigar cuenta activa */}
      <Dialog open={castigarOpen} onOpenChange={(o) => { setCastigarOpen(o); if (!o) { setCastigarSel(null); setCastigarResultados([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Castigar una cuenta activa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Cliente, código o RNC…" value={castigarSearch}
                onChange={(e) => setCastigarSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarActivos()} />
              <Button variant="outline" onClick={buscarActivos} disabled={busy}><Search className="w-4 h-4" /></Button>
            </div>
            <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
              {castigarResultados.map((p) => (
                <button key={p.id} onClick={() => setCastigarSel(p)}
                  className={`w-full text-left px-3 py-2 text-sm ${castigarSel?.id === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <span className="font-bold text-blue-900">{p.numero}</span> · {p.cliente?.nombre}
                  <span className="text-xs text-gray-500 block">{p.garantia || ''}</span>
                </button>
              ))}
              {!castigarResultados.length && <div className="p-3 text-xs text-gray-400 italic">Busca un préstamo activo para castigar.</div>}
            </div>
            <div><label className="text-xs font-bold text-gray-500">Motivo</label>
              <Select value={castigarMotivo} onValueChange={setCastigarMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select></div>
            {!puedeSinClave && (
              <div><label className="text-xs font-bold text-gray-500">Contraseña del creador de la empresa</label>
                <Input type="password" autoComplete="off" value={castigarPass}
                  onChange={(e) => setCastigarPass(e.target.value)} placeholder="Requerida para autorizar" />
                <p className="text-[11px] text-gray-400 mt-1">Solo el creador (o super-admin) puede castigar sin contraseña.</p></div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancelar</Button></DialogClose>
            <Button onClick={confirmarCastigo} disabled={busy || !castigarSel}><Gavel className="w-4 h-4 mr-2" />Castigar {castigarSel?.numero || ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Kpi = ({ label, value, tone, icon: Icon }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-5 h-5" /></div>
    <div><div className="text-xs text-gray-500 font-bold uppercase">{label}</div><div className="text-lg font-bold text-gray-900">{value}</div></div>
  </div>
);

export default CuentasIncobrablesPage;
