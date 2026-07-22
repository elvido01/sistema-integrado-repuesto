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
  pago_suplidor: 'Pago a suplidor', compromiso: 'Compromiso/gasto', san: 'Abono SAN', ajuste: 'Ajuste manual', transferencia_interna: 'Transferencia',
  san_completado: 'SAN completado', apertura: 'Apertura', ingreso: 'Ingreso', retiro: 'Retiro',
};

const CUENTA_VACIA = { banco: '', alias: '', numero_cuenta: '', tipo: 'corriente', moneda: 'DOP', saldo_inicial: '0' };

// Módulos que pueden tener su propia cuenta predeterminada.
const MODULOS = [
  { key: 'ventas', label: 'Ventas por transferencia' },
  { key: 'recibo', label: 'Recibos de pago' },
  { key: 'cierre_caja', label: 'Cierre de caja' },
  { key: 'pago_suplidor', label: 'Pago a suplidores' },
  { key: 'compromiso', label: 'Compromisos / gastos' },
  { key: 'san', label: 'SAN (ahorro programado)' },
];

export default function CuentasBancariasPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();

  const [cuentas, setCuentas] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [defaultsMod, setDefaultsMod] = useState({}); // { modulo: cuenta_id }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // cuenta en edición o CUENTA_VACIA
  const [saving, setSaving] = useState(false);
  const [movsDe, setMovsDe] = useState(null);      // cuenta cuyo historial se ve
  const [manual, setManual] = useState(null);      // { cuenta, tipo, monto, fecha, concepto }
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(false);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [{ data: saldos, error: e1 }, { data: cfg }, { data: defs }] = await Promise.all([
        supabase.from('cuentas_bancarias_saldos').select('*').eq('tenant_id', tenantId).order('orden').order('banco'),
        supabase.from('config_empresa').select('cuenta_bancaria_default_id').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('cuentas_bancarias_default').select('modulo, cuenta_id').eq('tenant_id', tenantId),
      ]);
      if (e1) throw e1;
      setCuentas(saldos || []);
      setDefaultId(cfg?.cuenta_bancaria_default_id || null);
      setDefaultsMod(Object.fromEntries((defs || []).map((d) => [d.modulo, d.cuenta_id])));
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

  const guardarDefaultModulo = async (modulo, cuentaId) => {
    const val = cuentaId === '__none__' ? null : cuentaId;
    try {
      if (!val) {
        await supabase.from('cuentas_bancarias_default').delete().eq('tenant_id', tenantId).eq('modulo', modulo);
      } else {
        await supabase.from('cuentas_bancarias_default').upsert(
          { tenant_id: tenantId, modulo, cuenta_id: val }, { onConflict: 'tenant_id,modulo' });
      }
      setDefaultsMod((prev) => ({ ...prev, [modulo]: val }));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const verMovimientos = async (c) => {
    setMovsDe(c);
    setLoadingMovs(true);
    try {
      // Solo los últimos 30 días (fecha del movimiento en hora RD).
      const hoyRD = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
      const desde = new Date(hoyRD.getTime() - 30 * 86400000).toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from('movimientos_bancarios').select('*')
        .eq('cuenta_id', c.id).gte('fecha', desde)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      const lista = data || [];
      // El FONDO INICIAL (saldo_inicial) se muestra como la línea más antigua,
      // siempre (aunque quede fuera de los 30 días) para que el saldo cuadre a
      // la vista. Es sintético: no vive en movimientos_bancarios.
      const ini = Number(c.saldo_inicial) || 0;
      if (ini !== 0) {
        const { data: cta } = await supabase
          .from('cuentas_bancarias').select('created_at').eq('id', c.id).maybeSingle();
        lista.push({
          id: `fondo-inicial-${c.id}`,
          fecha: cta?.created_at ? String(cta.created_at).slice(0, 10) : null,
          tipo: ini >= 0 ? 'ENTRADA' : 'SALIDA',
          monto: Math.abs(ini),
          concepto: 'FONDO INICIAL',
          origen_tipo: 'apertura',
          referencia: null,
        });
      }
      setMovs(lista);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoadingMovs(false);
    }
  };

  const abrirManual = (c, tipo) => setManual({
    cuenta: c, tipo, monto: '', concepto: '',
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }),
  });

  const guardarManual = async () => {
    const monto = Number(String(manual.monto).replace(/,/g, '')) || 0;
    if (monto <= 0) { toast({ variant: 'destructive', title: 'Monto inválido' }); return; }
    if (!manual.concepto.trim()) { toast({ variant: 'destructive', title: 'Escribe el concepto (ej. Alquiler local)' }); return; }
    setSaving(true);
    try {
      // Ingreso = ENTRADA (origen 'ingreso'); Retiro = SALIDA (origen 'retiro').
      // Cada uno es independiente (origen_id null). Usa el RPC compartido por
      // si la cuenta es la de la financiera vinculada.
      const esIngreso = manual.tipo === 'ingreso';
      const { error } = await supabase.rpc('registrar_movimiento_bancario_compartido', {
        p_cuenta_id: manual.cuenta.id,
        p_tipo: esIngreso ? 'ENTRADA' : 'SALIDA',
        p_monto: monto,
        p_concepto: manual.concepto.trim(),
        p_referencia: null,
        p_origen_tipo: manual.tipo,
        p_origen_id: null,
        p_fecha: manual.fecha || null,
      });
      if (error) throw error;
      toast({ title: esIngreso ? '↓ Ingreso registrado' : '↑ Retiro registrado', description: `${money(monto, manual.cuenta.moneda)} · ${manual.concepto.trim()}` });
      setManual(null);
      await cargar();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: err.message });
    } finally {
      setSaving(false);
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
                {c.activo && (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs px-2 text-emerald-700" title="Registrar un ingreso (alquiler, aporte…)"
                      onClick={() => abrirManual(c, 'ingreso')}>
                      <ArrowDownCircle className="w-3.5 h-3.5 mr-1" />Ingreso
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs px-2 text-red-600" title="Registrar un retiro (uso personal…)"
                      onClick={() => abrirManual(c, 'retiro')}>
                      <ArrowUpCircle className="w-3.5 h-3.5 mr-1" />Retiro
                    </Button>
                  </>
                )}
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

      {/* Cuenta predeterminada por módulo */}
      {cuentas.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-1"><Landmark className="w-4 h-4 text-blue-700" />Cuenta predeterminada por módulo</h2>
          <p className="text-xs text-gray-500 mb-3">Cada flujo trae preseleccionada su cuenta. Si un módulo no tiene una asignada, usa la ⭐ general.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODULOS.map((mod) => (
              <div key={mod.key} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-700">{mod.label}</span>
                <Select value={defaultsMod[mod.key] || '__none__'} onValueChange={(v) => guardarDefaultModulo(mod.key, v)}>
                  <SelectTrigger className="w-[190px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">General ⭐ (por defecto)</SelectItem>
                    {cuentas.filter((c) => c.activo).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.banco}{c.alias ? ` — ${c.alias}` : ''} ({c.moneda})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
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

      {/* Ingreso / Retiro manual */}
      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {manual?.tipo === 'ingreso'
                ? <><ArrowDownCircle className="w-5 h-5 text-emerald-600" />Registrar ingreso</>
                : <><ArrowUpCircle className="w-5 h-5 text-red-600" />Registrar retiro</>}
            </DialogTitle>
          </DialogHeader>
          {manual && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {manual.tipo === 'ingreso' ? 'Entra a' : 'Sale de'}{' '}
                <b>{manual.cuenta.banco}{manual.cuenta.alias ? ` — ${manual.cuenta.alias}` : ''}</b>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monto ({manual.cuenta.moneda})</Label>
                  <Input type="number" autoFocus value={manual.monto}
                    onChange={(e) => setManual((m) => ({ ...m, monto: e.target.value }))} />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={manual.fecha}
                    onChange={(e) => setManual((m) => ({ ...m, fecha: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Concepto</Label>
                <Input value={manual.concepto}
                  placeholder={manual.tipo === 'ingreso' ? 'Ej. Alquiler local 2, aporte de socio…' : 'Ej. Uso personal, retiro de socio…'}
                  onChange={(e) => setManual((m) => ({ ...m, concepto: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManual(null)}>Cancelar</Button>
            <Button onClick={guardarManual} disabled={saving}
              className={manual?.tipo === 'ingreso' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
            </Button>
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
              <span className="text-[11px] font-normal text-gray-400">· últimos 30 días</span>
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
