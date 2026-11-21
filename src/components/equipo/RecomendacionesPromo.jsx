import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Lightbulb, Loader2, Recycle, ThumbsUp, TriangleAlert } from 'lucide-react';
import { recomendaciones } from '@/lib/recomendacionesPromo';
import { prefillDesdeBundle } from '@/lib/reusoPublicacion';

// QUÉ HACER CON LOS NÚMEROS (21/11/2026)
// Arriba de Resultados: 3-6 consejos en palabras sacados de "¿Qué publicación
// vende?" (los últimos 60 días). Ver src/lib/recomendacionesPromo.js.
export function RecomendacionesPromo({ onReusar }) {
  const { toast } = useToast();
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(false);
  const [abriendo, setAbriendo] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('efectividad_publicaciones', { p_dias: 60 }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) { setError(true); setFilas([]); return; }
      setFilas(data || []);
    });
    return () => { vivo = false; };
  }, []);

  const consejos = useMemo(() => recomendaciones(filas || []), [filas]);

  const aplicar = async (c) => {
    if (c.accion?.tipo !== 'reusar' || !onReusar) return;
    setAbriendo(c.id);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const { prefill, error: e } = await prefillDesdeBundle({
      bundleId: c.accion.bundle_id, productoId: c.accion.producto_id, semilla: hoy,
    });
    setAbriendo(null);
    if (e) { toast({ variant: 'destructive', title: 'No se puede volver a publicar', description: e }); return; }
    onReusar(prefill);
  };

  if (error) return null; // sin medición encendida no hay nada que aconsejar

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-white p-4 shadow-sm" aria-label="Recomendaciones">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Lightbulb className="h-4 w-4 text-amber-500" /> Qué hacer ahora
        </h2>
        <p className="text-[11px] text-slate-500">Sale de tus publicaciones de los últimos 60 días. Solo se compara con 3 o más en cada lado.</p>
      </div>
      {filas === null ? (
        <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Leyendo tus números…</p>
      ) : consejos.length === 0 ? (
        <p className="text-xs text-slate-500">Todavía no hay suficientes publicaciones medidas para aconsejar algo con confianza.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {consejos.map((c) => (
            <div key={c.id} className={`rounded-lg border p-3 ${c.tono === 'ojo' ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50/50'}`}>
              <p className="flex items-start gap-1.5 text-xs font-bold text-slate-800">
                {c.tono === 'ojo'
                  ? <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
                  : <ThumbsUp className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                {c.titulo}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">{c.detalle}</p>
              {c.accion?.tipo === 'reusar' && onReusar && (
                <button type="button" onClick={() => aplicar(c)} disabled={abriendo === c.id}
                  className="mt-2 flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                  {abriendo === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Recycle className="h-3 w-3" />}
                  {c.accion.texto}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default RecomendacionesPromo;
