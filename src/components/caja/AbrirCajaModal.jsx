// =====================================================================
// "Abrir caja" (19/11/2026)
// ---------------------------------------------------------------------
// Solo en empresas con Modo de Caja = "Una caja con apertura"
// (Configuraciones del Sistema). La caja amanece abierta; después de un
// cierre, el siguiente cajero la abre aquí con su fondo inicial (un solo
// monto, sin desglose — decisión del dueño). abrir_caja() en
// sql/apertura_caja.sql valida que de verdad esté cerrada.
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
  useEffect(() => { if (abierta) { setFondo(''); setError(''); } }, [abierta]);

  const abrir = async (e) => {
    e?.preventDefault();
    if (guardando) return;
    const monto = fondo === '' ? 0 : Number(fondo);
    if (!Number.isFinite(monto) || monto < 0) { setError('Escribe el fondo en números (0 si no hay).'); return; }
    setGuardando(true); setError('');
    const { data, error: err } = await supabase.rpc('abrir_caja', { p_fondo: monto });
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
            La caja se cerró{hora ? ` a las ${hora}` : ''} (turno {estado?.turno || 1}). Para seguir vendiendo, ábrela con el dinero con que empiezas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={abrir} className="space-y-3">
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
