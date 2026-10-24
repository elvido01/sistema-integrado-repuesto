// =====================================================================
// Efectivo del día → a una cuenta (24/10/2026)
// ---------------------------------------------------------------------
// MotoPréstamos toma efectivo de la gaveta durante el día para comprar
// dólares o depositarlo. NO es un gasto: el dinero cambia de lugar. Aquí se
// ve cuánto efectivo hay hoy en la caja (el mismo número del tablero y del
// Cierre de Caja) y se mueve a una cuenta. El Cierre lo resta en su propia
// línea "Efectivo movido a cuentas". Ver sql/efectivo_caja_a_cuenta.sql.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, ArrowRight, Loader2, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const n = (v) => Number(v || 0);
const money = (v, mon = 'DOP') =>
  `${mon === 'USD' ? 'US$' : 'RD$'}${n(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const nombreCuenta = (c) => (c ? `${c.banco}${c.alias ? ` — ${c.alias}` : ''}` : '');

export default function EfectivoDelDia({ tenantId, cuentas, onCambio }) {
  const { toast } = useToast();
  const [cajaHoy, setCajaHoy] = useState(null);
  const [movidos, setMovidos] = useState([]);
  const [form, setForm] = useState(null);   // { cuentaId, monto, tasa, concepto }
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState(null);

  const activas = useMemo(() => (cuentas || []).filter((c) => c.activo), [cuentas]);
  const porId = useMemo(() => Object.fromEntries((cuentas || []).map((c) => [c.id, c])), [cuentas]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    const [{ data: caja }, { data: deps, error }] = await Promise.all([
      supabase.rpc('get_caja_excedente_dashboard'),
      supabase.from('caja_depositos')
        .select('id, monto_caja, cuenta_id, moneda, tasa, monto_cuenta, concepto, created_at')
        .eq('tenant_id', tenantId).eq('fecha', hoyRD()).eq('anulado', false)
        .order('created_at', { ascending: false }),
    ]);
    setCajaHoy(caja?.caja_hoy ?? null);
    // Sin la tabla (SQL todavía sin correr) la tarjeta se ve igual, sin lista.
    setMovidos(error ? [] : (deps || []));
  }, [tenantId]);

  useEffect(() => { cargar(); }, [cargar]);
  // Las ventas y los recibos mueven la caja todo el día: se refresca junto
  // con los saldos de las cuentas.
  useEffect(() => { cargar(); }, [cuentas, cargar]);

  const cuentaSel = form ? porId[form.cuentaId] : null;
  const esDivisa = cuentaSel && String(cuentaSel.moneda || 'DOP').toUpperCase() !== 'DOP';
  const recibe = form && n(form.monto) > 0
    ? (esDivisa ? (n(form.tasa) > 0 ? n(form.monto) / n(form.tasa) : null) : n(form.monto))
    : null;

  const abrir = () => {
    const usd = activas.find((c) => String(c.moneda).toUpperCase() === 'USD');
    setForm({ cuentaId: (usd || activas[0])?.id || '', monto: '', tasa: '', concepto: '' });
  };

  const guardar = async () => {
    if (!form?.cuentaId) { toast({ variant: 'destructive', title: 'Elige la cuenta a donde va' }); return; }
    if (!(n(form.monto) > 0)) { toast({ variant: 'destructive', title: 'Escribe cuánto efectivo sale de la caja' }); return; }
    if (esDivisa && !(n(form.tasa) > 0)) { toast({ variant: 'destructive', title: 'Falta la tasa a la que se compraron' }); return; }
    setGuardando(true);
    try {
      const { data, error } = await supabase.rpc('mover_efectivo_caja_a_cuenta', {
        p_cuenta_id: form.cuentaId,
        p_monto_caja: n(form.monto),
        p_tasa: esDivisa ? n(form.tasa) : null,
        p_concepto: form.concepto || null,
        p_fecha: hoyRD(),
      });
      if (error) throw error;
      toast({
        title: 'Efectivo movido',
        description: `Salen ${money(data?.monto_caja)} de la caja y entran ${money(data?.monto_cuenta, data?.moneda)} a ${nombreCuenta(cuentaSel)}. Sale en el cierre de hoy.`,
      });
      setForm(null);
      await cargar();
      onCambio?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo mover', description: err.message });
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (d) => {
    if (!window.confirm(`¿Anular este movimiento? Los ${money(d.monto_caja)} vuelven a la caja y salen de ${nombreCuenta(porId[d.cuenta_id]) || 'la cuenta'}.`)) return;
    setAnulando(d.id);
    try {
      const { error } = await supabase.rpc('anular_efectivo_caja_a_cuenta', { p_id: d.id });
      if (error) throw error;
      await cargar();
      onCambio?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo anular', description: err.message });
    } finally {
      setAnulando(null);
    }
  };

  const totalMovido = movidos.reduce((s, d) => s + n(d.monto_caja), 0);

  return (
    <>
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl px-5 py-4 shadow-sm min-w-[260px]">
        <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-wide">
          <Banknote className="w-4 h-4" />Efectivo del día (caja)
        </div>
        <div className="text-3xl font-black mt-1">{cajaHoy === null ? '—' : money(cajaHoy)}</div>
        {totalMovido > 0 && (
          <div className="text-[11px] text-emerald-100 mt-0.5">Ya movido hoy: {money(totalMovido)}</div>
        )}
        <Button size="sm" variant="secondary" className="mt-2 h-7 text-xs font-bold" onClick={abrir} disabled={!activas.length}>
          Mover a cuenta <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {movidos.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-2xl px-4 py-3 shadow-sm text-xs min-w-[260px] max-w-sm">
          <div className="font-bold text-emerald-800 mb-1">Movido hoy de la caja</div>
          <ul className="space-y-1">
            {movidos.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <b>{money(d.monto_caja)}</b> → {nombreCuenta(porId[d.cuenta_id]) || 'cuenta'}
                  {d.moneda !== 'DOP' && <> ({money(d.monto_cuenta, d.moneda)} a {n(d.tasa)})</>}
                </span>
                <button type="button" onClick={() => anular(d)} disabled={anulando === d.id}
                  className="shrink-0 inline-flex items-center gap-0.5 text-red-600 hover:underline disabled:opacity-50">
                  {anulando === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}Anular
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-emerald-600" />Mover efectivo de la caja
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                No es un gasto: sale de la caja del día y entra a la cuenta. En el cierre sale como
                <b> “Efectivo movido a cuentas”</b>.
              </p>
              <div>
                <Label>¿A dónde va?</Label>
                <Select value={form.cuentaId} onValueChange={(v) => setForm((f) => ({ ...f, cuentaId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Elige la cuenta" /></SelectTrigger>
                  <SelectContent>
                    {activas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{nombreCuenta(c)} · {c.moneda}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sale de la caja (RD$)</Label>
                  <Input type="text" inputMode="decimal" className="text-right" autoFocus value={fmtMontoInput(form.monto)}
                    onChange={(e) => setForm((f) => ({ ...f, monto: parseMontoInput(e.target.value) }))} />
                </div>
                {esDivisa && (
                  <div>
                    <Label>Tasa (RD$ por {cuentaSel.moneda})</Label>
                    <Input type="text" inputMode="decimal" className="text-right" value={form.tasa}
                      onChange={(e) => setForm((f) => ({ ...f, tasa: e.target.value.replace(/[^0-9.]/g, '') }))} />
                  </div>
                )}
              </div>
              {recibe !== null && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                  Entran a la cuenta: <b>{money(recibe, cuentaSel?.moneda)}</b>
                </div>
              )}
              {cajaHoy !== null && n(form.monto) > n(cajaHoy) && (
                <p className="text-xs text-amber-700">Ojo: es más de lo que marca la caja hoy ({money(cajaHoy)}).</p>
              )}
              <div>
                <Label>Concepto (opcional)</Label>
                <Input value={form.concepto} placeholder={esDivisa ? 'Ej. Compra de dólares' : 'Ej. Depósito en el banco'}
                  onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
