// =====================================================================
// Descripción propia de un préstamo (20/11/2026) — como en el SiiF.
// Sale en el Recibo de Pago (columna Descripción y recibo impreso) en vez
// de "Financiamiento". Vacía = "Financiamiento".
// =====================================================================
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export const MAX_DESCRIPCION_PRESTAMO = 100;

/** La descripción propia (sin el "Financiamiento" por defecto), o null. */
export const descripcionPropia = (desc) => String(desc || '').trim() || null;

/** Lo que se ve en el recibo: la descripción del préstamo o "Financiamiento". */
export const descripcionPrestamo = (desc) => descripcionPropia(desc) || 'Financiamiento';

/** Lee las descripciones de esos préstamos: { id: texto|'' }. Lanza si falla. */
export async function leerDescripcionesPrestamos(ids) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await supabase.from('prestamos').select('id, descripcion').in('id', unicos);
  if (error) throw error;
  return Object.fromEntries((data || []).map((p) => [p.id, p.descripcion || '']));
}

/**
 * Descripciones de los préstamos de la lista (se leen aparte de
 * get_prestamos_cliente, que no se toca). Devuelve [mapa, setMapa].
 */
export function useDescripcionesPrestamos(ids) {
  const [mapa, setMapa] = useState({});
  const clave = [...new Set((ids || []).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!clave) { setMapa({}); return undefined; }
    let vivo = true;
    leerDescripcionesPrestamos(clave.split(','))
      .then((m) => { if (vivo) setMapa(m); })
      .catch((e) => console.warn('No se leyeron las descripciones de los préstamos:', e.message));
    return () => { vivo = false; };
  }, [clave]);
  return [mapa, setMapa];
}

/**
 * prestamo: { id, numero, descripcion } · onClose(guardada?: string|null)
 * (undefined = se canceló; string o null = lo que quedó guardado).
 */
export default function EditarDescripcionPrestamo({ prestamo, onClose }) {
  const { toast } = useToast();
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setValor(prestamo?.descripcion || ''); }, [prestamo]);

  const guardar = async () => {
    if (guardando) return; // Enter dos veces no guarda dos veces
    const limpio = valor.trim().slice(0, MAX_DESCRIPCION_PRESTAMO) || null;
    setGuardando(true);
    try {
      const { data, error } = await supabase.from('prestamos').update({ descripcion: limpio }).eq('id', prestamo.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No se pudo guardar: el préstamo no es de esta empresa.');
      toast({ title: 'Descripción guardada', description: `${prestamo.numero}: ${descripcionPrestamo(limpio)}` });
      onClose(limpio);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!prestamo} onOpenChange={(o) => { if (!o && !guardando) onClose(undefined); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Descripción del préstamo {prestamo?.numero}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>Descripción (sale en el recibo de pago)</Label>
          <Input
            autoFocus
            disabled={guardando}
            value={valor}
            maxLength={MAX_DESCRIPCION_PRESTAMO}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } }}
            placeholder="Ej: Moto Yamaha AG 125 roja"
          />
          <p className="text-[11px] text-slate-500">Vacía, el recibo dice "Financiamiento". Máximo {MAX_DESCRIPCION_PRESTAMO} letras.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onClose(undefined)} disabled={guardando}>Cancelar</Button>
          <Button type="button" onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
