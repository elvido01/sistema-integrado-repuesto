// =====================================================================
// La voz, en el chat de Hermes
// ---------------------------------------------------------------------
// Dos piezas:
//   BarraVozHermes   graba, deja escuchar antes de mandar, y manda
//   ReproductorVoz   reproduce la respuesta hablada de Hermes
//
// >>> POR QUÉ SE PUEDE ESCUCHAR ANTES DE MANDAR <<<
// Porque una nota de voz no se puede editar. Un mensaje escrito mal se
// corrige antes de pulsar enviar; uno hablado, si se manda directo, ya
// está en la conversación. El botón de descartar es lo que hace que la
// gente se atreva a usarlo.
//
// >>> UN SOLO AUDIO A LA VEZ <<<
// El reproductor es un singleton de módulo a propósito. Con un <audio> por
// burbuja, pulsar dos respuestas seguidas las hace sonar encima. Aquí el
// segundo para al primero.
// =====================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useGrabadoraVoz } from '@/hooks/useGrabadoraVoz';
import { ESTADOS_VOZ, formatearDuracion } from '@/lib/vozFormatos';

// ── El único audio que suena ─────────────────────────────────────────
let audioActivo = null;
let mediaActivo = null;
const oyentes = new Set();

const avisarOyentes = () => { oyentes.forEach((f) => { try { f(mediaActivo); } catch { /* ignorar */ } }); };

export const pararTodoAudio = () => {
  if (audioActivo) {
    try { audioActivo.pause(); audioActivo.currentTime = 0; } catch { /* ya parado */ }
  }
  audioActivo = null;
  mediaActivo = null;
  avisarOyentes();
};

// ── REPRODUCTOR DE UNA RESPUESTA ─────────────────────────────────────
export const ReproductorVoz = ({ mediaId, autoplay = false, onInterrumpido }) => {
  const [sonando, setSonando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState('');
  const urlRef = useRef(null);
  const autoRef = useRef(false);

  useEffect(() => {
    const oyente = (activo) => setSonando(activo === mediaId);
    oyentes.add(oyente);
    return () => { oyentes.delete(oyente); };
  }, [mediaId]);

  // La URL firmada se pide al reproducir, no al pintar la burbuja: una URL
  // firmada guardada en el estado de una lista es una credencial viajando
  // por toda la pantalla, y caduca sola.
  const urlFirmada = useCallback(async () => {
    if (urlRef.current && urlRef.current.hasta > Date.now()) return urlRef.current.url;
    const { data: fila, error } = await supabase
      .from('hermes_media').select('storage_path').eq('media_id', mediaId).maybeSingle();
    if (error || !fila) throw new Error('Ese audio ya no está disponible.');
    const { data, error: e2 } = await supabase.storage
      .from('hermes-voz').createSignedUrl(fila.storage_path, 300);
    if (e2 || !data?.signedUrl) throw new Error('No se pudo abrir el audio.');
    urlRef.current = { url: data.signedUrl, hasta: Date.now() + 240000 };
    return data.signedUrl;
  }, [mediaId]);

  const reproducir = useCallback(async () => {
    if (sonando) { pararTodoAudio(); return; }
    setCargando(true); setFallo('');
    try {
      const url = await urlFirmada();
      pararTodoAudio();                       // el anterior se calla
      const a = new Audio(url);
      a.onended = () => { if (mediaActivo === mediaId) pararTodoAudio(); };
      a.onerror = () => { setFallo('No se pudo reproducir.'); pararTodoAudio(); };
      audioActivo = a;
      mediaActivo = mediaId;
      await a.play();
      avisarOyentes();
    } catch (err) {
      // Las políticas de autoplay del navegador tiran aquí cuando todavía
      // no hubo un gesto del usuario. No es un fallo: es que hay que
      // pulsar. Decirlo así evita el "está roto" que no lo está.
      setFallo(err?.name === 'NotAllowedError'
        ? 'Pulsa para escucharla: el navegador no deja sonar sin un toque.'
        : (err.message || 'No se pudo reproducir.'));
      pararTodoAudio();
    } finally {
      setCargando(false);
    }
  }, [sonando, urlFirmada, mediaId]);

  // Reproducción automática, solo si quien llama dice que ya hubo gesto.
  useEffect(() => {
    if (autoplay && !autoRef.current) { autoRef.current = true; reproducir(); }
  }, [autoplay, reproducir]);

  useEffect(() => () => { if (mediaActivo === mediaId) pararTodoAudio(); }, [mediaId]);

  return (
    <span className="mt-1 inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => { if (sonando) onInterrumpido?.(mediaId); reproducir(); }}
        aria-label={sonando ? 'Detener la respuesta hablada' : 'Escuchar la respuesta hablada'}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/15 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      >
        {cargando ? <Loader2 className="h-3 w-3 animate-spin" />
          : sonando ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {sonando ? 'Detener' : 'Escuchar'}
      </button>
      {fallo && <span className="text-[10px] text-amber-300/80">{fallo}</span>}
    </span>
  );
};

// ── LA BARRA DE GRABACIÓN ────────────────────────────────────────────
export const BarraVozHermes = ({ tenantId, onEnviar, onError, deshabilitado, contexto }) => {
  const [enviando, setEnviando] = useState(false);
  const grab = useGrabadoraVoz({ tenantId, onError });
  const { estado, nivel, duracionMs, grabacion, empezar, detener, cancelar, descartar, subir } = grab;

  const etiqueta = ESTADOS_VOZ[estado]?.txt || '';
  const grabando = estado === 'grabando' || estado === 'silencio' || estado === 'permiso';

  const mandar = async () => {
    setEnviando(true);
    try {
      const sub = await subir();
      if (!sub) return;                       // el hook ya explicó por qué
      const { data, error } = await supabase.rpc('hermes_escribir_voz', {
        p_media_id: sub.mediaId,
        p_pantalla: contexto || null,
        p_texto: null,
      });
      if (error) throw new Error(error.message);
      descartar();
      onEnviar?.({ id: data.id, mediaId: sub.mediaId, duracionMs: sub.duracionMs,
                   duplicado: !!data.duplicado });
    } catch (err) {
      onError?.(err.message || 'No se pudo enviar la nota de voz.');
    } finally {
      setEnviando(false);
    }
  };

  // El micrófono se suelta al salir. Lo hace el hook, pero también al
  // cambiar de conversación: por eso se para el audio aquí.
  useEffect(() => () => pararTodoAudio(), []);

  // ── Grabando ───────────────────────────────────────────────────────
  if (grabando) {
    return (
      <div className="flex items-center gap-2 border-t border-red-400/25 bg-red-950/30 p-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-red-100" role="status" aria-live="polite">
            {etiqueta} · {formatearDuracion(duracionMs)}
          </p>
          {/* El nivel no es solo bonito: sin él, un micrófono silenciado por
              hardware se ve igual que uno que funciona. */}
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-red-900/50">
            <div className="h-full rounded-full bg-red-400 transition-[width] duration-75"
                 style={{ width: `${Math.round(nivel * 100)}%` }} />
          </div>
          {nivel < 0.02 && duracionMs > 1800 && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-300">
              <AlertTriangle className="h-3 w-3" /> No se oye nada. ¿Está silenciado el micrófono?
            </p>
          )}
        </div>
        <button type="button" onClick={cancelar} aria-label="Cancelar la grabación"
          className="rounded-md border border-slate-400/30 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700/50">
          Cancelar
        </button>
        <button type="button" onClick={detener} aria-label="Terminar de grabar"
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-500">
          <Square className="h-3 w-3" /> Listo
        </button>
      </div>
    );
  }

  // ── Grabado, sin mandar todavía ────────────────────────────────────
  if (grabacion) {
    return (
      <div className="flex items-center gap-2 border-t border-cyan-300/20 bg-slate-900/60 p-2">
        {/* controls nativo: es teclado-accesible sin que haya que inventarlo */}
        <audio src={grabacion.url} controls className="h-8 min-w-0 flex-1"
               aria-label="Escuchar la grabación antes de enviarla" />
        <span className="shrink-0 text-[10px] text-cyan-200/50">{formatearDuracion(grabacion.duracionMs)}</span>
        <button type="button" onClick={descartar} disabled={enviando}
          aria-label="Descartar la grabación"
          className="rounded-md border border-red-400/30 p-1.5 text-red-300 hover:bg-red-500/15 disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={mandar} disabled={enviando}
          aria-label="Enviar la nota de voz"
          className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-cyan-500 disabled:opacity-40">
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {enviando ? (estado === 'subiendo' ? 'Subiendo…' : 'Enviando…') : 'Enviar'}
        </button>
      </div>
    );
  }

  // ── En reposo ──────────────────────────────────────────────────────
  // Con la explicación al lado, y corta. El micrófono de un navegador
  // pone a la gente en guardia: decir qué se hace con lo que se graba
  // cuesta una línea y es la diferencia entre que se use y que no.
  return (
    <div className="flex items-center gap-2 border-t border-cyan-300/15 px-2 pt-2">
      <button
        type="button"
        onClick={() => empezar()}
        disabled={deshabilitado}
        aria-label="Grabar una nota de voz para Hermes"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-300/25 bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/15 focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:opacity-40"
      >
        <Mic className="h-3.5 w-3.5" /> Nota de voz
      </button>
      <p className="truncate text-[10px] text-cyan-200/40">
        Se graba, la escuchas y decides si la mandas. La transcribe Hermes.
      </p>
    </div>
  );
};

export default BarraVozHermes;
