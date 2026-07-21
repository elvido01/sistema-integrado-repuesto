import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  Landmark, Plus, Pencil, Star, StarOff, RefreshCw, Loader2, X,
  ArrowDownCircle, ArrowUpCircle, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const n = (v) => Number(v || 0);
const money = (v, mon = 'DOP') =>
  `${mon === 'USD' ? 'US$' : 'RD$'}${n(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFecha = (f) => (f ? String(f).split('T')[0].split('-').reverse().join('/') : '');

const ORIGEN_LABEL = {
  venta: 'Venta', recibo: 'Recibo', cierre_caja: 'Cierre de caja',
  pago_suplidor: 'Pago a suplidor', compromiso: 'Compromiso/gasto', ajuste: 'Ajuste manual', transferencia_interna: 'Transferencia',
};

const CUENTA_VACIA = { banco: '', alias: '', numero_cuenta: '', tipo: 'corriente', moneda: 'DOP', saldo_inicial: '0' };

export default function CuentasBancariasPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();

  const [cuentas, setCuentas] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // cuenta en edición o CUENTA_VACIA
  const [saving, setSaving] = useState(false);
  const [movsDe, setMovsDe] = useState(null);      // cuenta cuyo historial se ve
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(false);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [{ data: saldos, error: e1 }, { data: cfg }] = await Promise.all([
        supabase.from('cuentas_bancarias_saldos').select('*').eq('tenant_id', tenantId).order('orden').order('banco'),
        supabase.from('config_empresa').select('cuenta_bancaria_default_id').eq('tenant_id', tenantId).maybeSingle(),
      ]);
      if (e1) throw e1;
      setCuentas(saldos || []);
      setDefaultId(cfg?.cuenta_bancaria_default_id || null);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al cargar cuentas', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real: cualquier movimiento o cambio de cuenta refresca los saldos.
  useEffect(() => {
    if (!tenantId) return undefined;
    const ch = supabase
      .channel(`bancos-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_bancarios', filter: `tenant_id=eq.${tenantId}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuentas_bancarias', filter: `tenant_id=eq.${tenantId}` }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, cargar]);

  const totalPorMoneda = useMemo(() => {
    const t = {};
    for (const c of cuentas.filter((x) => x.activo)) t[c.moneda] = n(t[c.moneda]) + n(c.saldo);
    return t;
  }, [cuentas]);

  const guardar = async () => {
    if (!modal?.banco?.trim()) { toast({ variant: 'destructive', title: 'Falta el banco' }); return; }
    setSaving(true);
    try {
      const payload = {
        banco: modal.banco.trim(), alias: modal.alias?.trim() || null,
        numero_cuenta: modal.numero_cuenta?.trim() || null, tipo: modal.tipo || null,
        moneda: modal.moneda || 'DOP', saldo_inicial: n(modal.saldo_inicial),
      };
      if (modal.id) {
        const { error } = await supabase.from('cuentas_bancarias').update(payload).eq('id', modal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cuentas_bancarias').insert(payload);
        if (error) throw error;
      }
      toast({ title: modal.id ? 'Cuenta actualizada' : 'Cuenta creada' });
      setModal(null);
      cargar();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (c) => {
    const { error } = await supabase.from('cuentas_bancarias').update({ activo: !c.activo }).eq('id', c.id);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    cargar();
  };

  const hacerDefault = async (c) => {
    const { error } = await supabase.from('config_empresa').update({ cuenta_bancaria_default_id: c.id }).eq('tenant_id', tenantId);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    setDefaultId(c.id);
    toast({ title: 'Cuenta predeterminada', description: `${c.banco}${c.alias ? ` — ${c.alias}` : ''}` });
  };

  const verMovimientos = async (c) => {
    setMovsDe(c);
    setLoadingMovs(true);
    try {
      const { data, error } = await supabase
        .from('movimientos_bancarios').select('*')
        .eq('cuenta_id', c.id).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      setMovs(data || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoadingMovs(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Helmet><title>Cuentas Bancarias — MotoFlow</title></Helmet>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl"><Landmark className="w-6 h-6 text-blue-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cuentas Bancarias</h1>
            <p className="text-sm text-gray-500">Saldos en tiempo real por empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cargar}><RefreshCw className="w-4 h-4 mr-1" />Actualizar</Button>
          <Button size="sm" onClick={() => setModal({ ...CUENTA_VACIA })}><Plus className="w-4 h-4 mr-1" />Nueva cuenta</Button>
        </div>
      </div>

      {/* Totales por moneda */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.keys(totalPorMoneda).length === 0 ? null : Object.entries(totalPorMoneda).map(([mon, tot]) => (
          <div key={mon} className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-bold uppercase tracking-wide"><Wallet className="w-4 h-4" />Total {mon}</div>
            <div className="text-3xl font-black mt-1">{money(tot, mon)}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : cuentas.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed">
          <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aún no hay cuentas bancarias.</p>
          <Button className="mt-4" onClick={() => setModal({ ...CUENTA_VACIA })}><Plus className="w-4 h-4 mr-1" />Agregar la primera</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cuentas.map((c) => (
            <motion.div key={c.id} layout
              className={`bg-white border rounded-2xl p-4 shadow-sm ${c.activo ? '' : 'opacity-60'} ${defaultId === c.id ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 truncate">{c.banco}</span>
                    {defaultId === c.id && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">Predeterminada</Badge>}
                    {!c.activo && <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
                  </div>
                  {c.alias && <div className="text-xs text-gray-500 truncate">{c.alias}</div>}
                  {c.numero_cuenta && <div className="text-xs text-gray-400 font-mono">···{String(c.numero_cuenta).slice(-4)}</div>}
                </div>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">{c.moneda}</Badge>
              </div>

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">Saldo</div>
                <div className={`text-2xl font-black ${n(c.saldo) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{money(c.saldo, c.moneda)}</div>
              </div>

              <div className="flex items-center gap-1 mt-4 pt-3 border-t border-gray-100">
                <Button variant="ghost" size="sm" className="text-xs px-2" onClick={() => verMovimientos(c)}>Movimientos</Button>
                <div className="flex-1" />
                {defaultId !== c.id && c.activo && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Hacer predeterminada" onClick={() => hacerDefault(c)}>
                    <Star className="w-4 h-4 text-amber-500" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar"
                  onClick={() => setModal({ ...c, saldo_inicial: String(c.saldo_inicial ?? 0) })}>
                  <Pencil className="w-4 h-4 text-gray-500" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title={c.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(c)}>
                  {c.activo ? <StarOff className="w-4 h-4 text-gray-400" /> : <RefreshCw className="w-4 h-4 text-emerald-600" />}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{modal?.id ? 'Editar cuenta' : 'Nueva cuenta bancaria'}</DialogTitle></DialogHeader>
          {modal && (
            <div className="space-y-3">
              <div><Label>Banco *</Label><Input value={modal.banco} onChange={(e) => setModal({ ...modal, banco: e.target.value })} placeholder="Banco Popular" /></div>
              <div><Label>Alias / descripción</Label><Input value={modal.alias || ''} onChange={(e) => setModal({ ...modal, alias: e.target.value })} placeholder="Cuenta operativa" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>No. de cuenta</Label><Input value={modal.numero_cuenta || ''} onChange={(e) => setModal({ ...modal, numero_cuenta: e.target.value })} placeholder="0000000000" /></div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={modal.moneda} onValueChange={(v) => setModal({ ...modal, moneda: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="DOP">DOP (RD$)</SelectItem><SelectItem value="USD">USD (US$)</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={modal.tipo || 'corriente'} onValueChange={(v) => setModal({ ...modal, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="corriente">Corriente</SelectItem><SelectItem value="ahorro">Ahorro</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Saldo inicial</Label>
                  <Input type="number" value={modal.saldo_inicial} onChange={(e) => setModal({ ...modal, saldo_inicial: e.target.value })} disabled={!!modal.id} />
                  {!!modal.id && <p className="text-[10px] text-gray-400 mt-1">El saldo actual se calcula de los movimientos.</p>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel de movimientos */}
      <Dialog open={!!movsDe} onOpenChange={(o) => !o && setMovsDe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-blue-700" />
              {movsDe?.banco}{movsDe?.alias ? ` — ${movsDe.alias}` : ''}
              <span className="ml-auto text-lg font-black">{movsDe && money(movsDe.saldo, movsDe.moneda)}</span>
            </DialogTitle>
          </DialogHeader>
          {loadingMovs ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
          ) : movs.length === 0 ? (
            <p className="text-center text-gray-500 py-10">Sin movimientos todavía.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Origen</TableHead><TableHead className="text-right">Monto</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {movs.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">{fmtFecha(m.fecha)}</TableCell>
                      <TableCell className="text-xs">
                        <div>{m.concepto || '—'}</div>
                        {m.referencia && <div className="text-[10px] text-gray-400 font-mono">Ref: {m.referencia}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ORIGEN_LABEL[m.origen_tipo] || m.origen_tipo}</Badge></TableCell>
                      <TableCell className={`text-right font-bold whitespace-nowrap ${m.tipo === 'ENTRADA' ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {m.tipo === 'ENTRADA' ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                          {m.tipo === 'ENTRADA' ? '+' : '−'}{money(m.monto, movsDe?.moneda).replace(/^(RD\$|US\$)/, '')}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
