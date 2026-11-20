// =====================================================================
// "Abrir caja" (19/11/2026)
// ---------------------------------------------------------------------
// Solo en empresas con Modo de Caja = "Una caja con apertura"
// (Configuraciones del Sistema). La caja amanece abierta; después de un
// cierre, el siguiente cajero la abre aquí con su fondo inicial (un solo
// monto, sin desglose — decisión del dueño). abrir_caja() en
// sql/apertura_caja.sql valida que de verdad esté cerrada.
// (20/11/2026) Modo "Varias cajas": el cajero escoge cuál caja abre (las
// ocupadas salen marcadas) y abrir_caja_en() (sql/varias_cajas.sql) valida.
// =====================================================================
import React, { useEffect, useState } from 'react';
import { Loader2, Unlock } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

/** El estado de la caja hoy ({ modo, abierta, requiere_apertura, turno, desde, fondo, ... }). */
export async function consultarEstadoCaja(fecha = null) {
  const { data, error } = await supabase.rpc('estado_caja', fecha ? { p_fecha: fecha } : {});
  if (error) return null;
  return data || null;
}

export default function AbrirCajaModal({ abierta, estado, onAbierta, onCerrar }) {
  const [fondo, setFondo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const varias = estado?.modo === 'varias';
  const libres = (estado?.cajas || []).filter((c) => !c.ocupada);
  const [caja, setCaja] = useState('');
  useEffect(() => { if (abierta) { setFondo(''); setError(''); setCaja(libres.length === 1 ? libres[0].id : ''); } }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (e) => {
    e?.preventDefault();
    if (guardando) return;
    const monto = fondo === '' ? 0 : Number(fondo);
    if (!Number.isFinite(monto) || monto < 0) { setError('Escribe el fondo en números (0 si no hay).'); return; }
    if (varias && !caja) { setError('Escoge la caja que vas a abrir.'); return; }
    setGuardando(true); setError('');
    const { data, error: err } = varias
      ? await supabase.rpc('abrir_caja_en', { p_caja: caja, p_fondo: monto })
      : await supabase.rpc('abrir_caja', { p_fondo: monto });
    setGuardando(false);
    if (err || !data?.ok) { setError(data?.error || err?.message || 'No se pudo abrir la caja.'); return; }
    onAbierta?.(data);
  };

  const hora = estado?.cerrada_at
    ? new Date(estado.cerrada_at).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <Dialog open={abierta} onOpenChange={(v) => { if (!v) onCerrar?.(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Unlock className="h-5 w-5 text-emerald-600" /> Abrir caja</DialogTitle>
          <DialogDescription>
            {varias
              ? 'Esta empresa trabaja con varias cajas. Escoge la tuya y ábrela con el dinero con que empiezas.'
              : <>La caja se cerró{hora ? ` a las ${hora}` : ''} (turno {estado?.turno || 1}). Para seguir vendiendo, ábrela con el dinero con que empiezas.</>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={abrir} className="space-y-3">
          {varias && (
            <div>
              <div className="mb-1 text-xs font-bold text-gray-700">Caja</div>
              {(estado?.cajas || []).length === 0 ? (
                <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">No hay cajas creadas. Un administrador las crea en Configuración del Sistema → Modo de Caja.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(estado?.cajas || []).map((c) => (
                    <button key={c.id} type="button" disabled={c.ocupada} onClick={() => setCaja(c.id)}
                      className={`rounded-lg border px-2 py-2 text-left text-sm font-bold ${c.ocupada ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : caja === c.id ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                      {c.nombre}
                      <span className="block text-[10px] font-normal">{c.ocupada ? 'ocupada' : 'libre'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className="block text-xs font-bold text-gray-700">
            Fondo inicial (RD$)
            <Input autoFocus inputMode="decimal" value={fmtMontoInput(fondo)} onChange={(e) => setFondo(parseMontoInput(e.target.value))}
              placeholder="0.00" className="mt-1 text-lg font-bold" />
          </label>
          <p className="text-[11px] text-gray-500">El cambio que hay en la gaveta al empezar. Escribe 0 si no hay.</p>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <Button type="submit" disabled={guardando} className="w-full bg-emerald-600 font-bold hover:bg-emerald-700">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir caja'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
