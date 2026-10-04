import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Clapperboard, Loader2, RotateCcw } from 'lucide-react';
import { FORMATOS_REEL } from '@/components/equipo/ReelsModelo';

// EL GUION DEL REEL, ANTES DE GASTAR — Paso 2.
//
// (04/10/2026) El dueño: "voy a tener que ver el guion del video antes de
// realizarlos porque hay errores" (el del Motul 5100 decía "compatible con
// modelos 5,100") "y así no gastar créditos de más". Con las imágenes el
// Creativo trae SOLO el guion; aquí se lee y se corrige, y "Hacer el reel"
// lo manda a armar con ESE texto (sql/reels_con_guion_aprobado.sql). Las
// tomas y la voz se pagan solo entonces.

const CADA_MS = 5000;
const palabras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

export function GuionReel({ trabajoId, reelGuion, onPedido }) {
  const { toast } = useToast();
  const [g, setG] = useState(() => JSON.parse(JSON.stringify(reelGuion.guion || {})));
  const [pedido, setPedido] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(true);

  const mirar = useCallback(async () => {
    const { data } = await supabase.from('equipo_reels_pedidos')
      .select('id, estado, video_url, duracion, error, avisos, guion, created_at')
      .eq('trabajo_id', trabajoId).order('created_at', { ascending: false }).limit(1);
    const p = data?.[0] || null;
    setPedido(p);
    if (onPedido) onPedido(p);
    if (p && ['pendiente', 'armando', 'listo'].includes(p.estado)) setEditando(false);
  }, [trabajoId, onPedido]);

  useEffect(() => { mirar(); }, [mirar]);
  const trabajandoReel = pedido && ['pendiente', 'armando'].includes(pedido.estado);
  useEffect(() => {
    if (!trabajandoReel) return undefined;
    const t = setInterval(mirar, CADA_MS);
    return () => clearInterval(t);
  }, [trabajandoReel, mirar]);

  const cambiarToma = (i, campo, valor) => setG((x) => ({
    ...x, tomas: x.tomas.map((t, k) => (k === i ? { ...t, [campo]: valor } : t)),
  }));

  const hacer = async () => {
    setEnviando(true);
    const { error } = await supabase.rpc('equipo_reel_pedir', { p_trabajo_id: trabajoId, p_guion: g });
    setEnviando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo pedir el reel', description: error.message }); return; }
    toast({ title: 'Reel encargado', description: 'El Creativo lo arma con tu guion en 2 o 3 minutos (la PC encendida).' });
    mirar();
  };

  const n = palabras(g.voz);
  const seg = Math.round(n / 2.4);   // locutor de anuncio: ~2.4 palabras por segundo
  const formato = FORMATOS_REEL[reelGuion.para?.formato]?.nombre || 'reel';

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Clapperboard className="h-4 w-4 text-red-600" /> Guion del reel
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{formato}</span>
        <span className="flex-1 text-[10px] text-slate-500">
          Revísalo y corrige lo que esté mal. Las tomas y la voz se pagan solo al pulsar "Hacer el reel" (unos US$0.25).
        </span>
      </div>

      {/* El video, cuando ya está */}
      {pedido?.estado === 'listo' && pedido.video_url && (
        <div className="mb-2 flex flex-wrap items-start gap-3">
          <video src={pedido.video_url} controls playsInline preload="metadata" className="max-h-72 rounded border bg-black" />
          <div className="text-[11px] text-slate-600">
            <p className="font-semibold text-emerald-700">Reel listo · {Math.round(pedido.duracion || 0)} s</p>
            {Array.isArray(pedido.avisos) && pedido.avisos.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-amber-800">{pedido.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            )}
            <p className="mt-1">Al aprobar la imagen, este reel va como video para TikTok, YouTube e Instagram.</p>
            {!editando && (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => setEditando(true)}>
                <RotateCcw className="mr-1 h-3 w-3" /> Cambiar el guion y rehacerlo
              </Button>
            )}
          </div>
        </div>
      )}

      {trabajandoReel && (
        <p className="mb-2 flex items-center gap-2 text-[11px] text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
          {pedido.estado === 'pendiente' ? 'En cola: el Creativo lo toma en cuanto termine lo que está haciendo…'
            : 'El Creativo está haciendo las tomas, la voz y el montaje (2 o 3 minutos)…'}
        </p>
      )}
      {pedido?.estado === 'error' && (
        <p className="mb-2 text-[11px] text-red-700">No se pudo hacer el reel: {pedido.error}. Puedes intentarlo otra vez.</p>
      )}

      {editando && (
        <div className="space-y-2 text-[11px]">
          <label className="block">
            <span className="font-semibold text-slate-600">Titular de apertura</span>
            <input value={g.titular || ''} onChange={(e) => setG({ ...g, titular: e.target.value.toUpperCase() })}
              className="mt-0.5 h-7 w-full rounded border px-2 text-xs font-bold" />
          </label>

          <label className="block">
            <span className="font-semibold text-slate-600">Lo que dice el locutor</span>
            <span className={`ml-2 ${seg > 24 ? 'text-red-600' : 'text-slate-400'}`}>
              {n} palabras · unos {seg} s {seg > 24 ? '(largo: se acelerará para no pasar de 30 s)' : ''}
            </span>
            <Textarea value={g.voz || ''} onChange={(e) => setG({ ...g, voz: e.target.value })} rows={4} className="mt-0.5 text-xs" />
            <span className="text-[10px] text-slate-400">El precio nunca se dice en voz: si lo escribes aquí, se quita solo.</span>
          </label>

          <div>
            <span className="font-semibold text-slate-600">Tomas</span>
            <div className="mt-1 space-y-1.5">
              {(g.tomas || []).map((t, i) => (
                <div key={i} className="rounded border border-slate-100 bg-slate-50 p-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-bold text-slate-500">Toma {i + 1}</span>
                    <input value={t.texto || ''} placeholder="letras en pantalla (o vacío)"
                      onChange={(e) => cambiarToma(i, 'texto', e.target.value.toUpperCase() || null)}
                      className="h-6 flex-1 rounded border px-1.5 text-[11px] font-bold" />
                  </div>
                  <textarea value={t.escena || ''} onChange={(e) => cambiarToma(i, 'escena', e.target.value)} rows={2}
                    title="Lo que se ve (va para la IA de imágenes, en inglés)"
                    className="mt-1 w-full rounded border bg-white px-1.5 py-1 text-[10px] text-slate-500" />
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="font-semibold text-slate-600">Frase del cierre</span>
            <input value={g.cierre || ''} onChange={(e) => setG({ ...g, cierre: e.target.value.toUpperCase() })}
              className="mt-0.5 h-7 w-full rounded border px-2 text-xs font-bold" />
          </label>

          <label className="block">
            <span className="font-semibold text-slate-600">Texto para TikTok y YouTube</span>
            <Textarea value={g.descripcion_redes || ''} onChange={(e) => setG({ ...g, descripcion_redes: e.target.value })}
              rows={2} className="mt-0.5 text-xs" />
          </label>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={enviando || trabajandoReel || (g.tomas || []).length < 2} onClick={hacer}
              className="bg-red-600 text-white hover:bg-red-700">
              {enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="mr-1 h-3.5 w-3.5" />}
              {pedido?.estado === 'listo' ? 'Rehacer el reel con este guion' : 'Hacer el reel'}
            </Button>
            {pedido?.estado === 'listo' && (
              <button type="button" className="text-[11px] text-slate-500 hover:underline" onClick={() => setEditando(false)}>cancelar</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GuionReel;
