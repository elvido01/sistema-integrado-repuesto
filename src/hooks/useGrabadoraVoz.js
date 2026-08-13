// =====================================================================
// useGrabadoraVoz — grabar, medir, subir
// ---------------------------------------------------------------------
// Lo que sustituye al dictado del navegador. Hasta ahora MotoFlow usaba
// SpeechRecognition: el audio nunca salía de la máquina y lo que llegaba
// a Hermes era texto ya transcrito por Chrome. Aquí se graba de verdad y
// el que transcribe es el STT de Hermes, que es quien oye el audio.
//
// >>> LO QUE ESTE HOOK NO HACE <<<
// No transcribe. No sintetiza. No decide si mandar. Graba, valida, sube y
// devuelve un media_id. Quien lo usa decide qué hacer con él.
//
// >>> SOLTAR EL MICRÓFONO <<<
// La luz del micrófono encendida cuando ya nadie graba es lo que hace que
// la gente desconfíe de una aplicación. Todo lo que se abre aquí se cierra
// en `soltar()`, y `soltar()` se llama al desmontar, al terminar, al
// cancelar y al fallar.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  elegirFormato, validarGrabacion, rutaAudio, LIMITES,
  explicarErrorMicrofono,
} from '@/lib/vozFormatos';

const sha256Hex = async (blob) => {
  const buf = await blob.arrayBuffer();
  // crypto.subtle solo existe en contextos seguros (https o localhost).
  // En http sin más, esto no está: mejor decirlo que subir sin integridad.
  if (!globalThis.crypto?.subtle) {
    throw new Error('El navegador no permite calcular la firma del audio fuera de una conexión segura (https).');
  }
  const h = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const useGrabadoraVoz = ({ tenantId, onError } = {}) => {
  const [estado, setEstado] = useState('inactivo');
  const [nivel, setNivel] = useState(0);          // 0..1, para el indicador
  const [duracionMs, setDuracionMs] = useState(0);
  const [grabacion, setGrabacion] = useState(null); // { blob, url, duracionMs, formato }

  const streamRef    = useRef(null);
  const recorderRef  = useRef(null);
  const trozosRef    = useRef([]);
  const audioCtxRef  = useRef(null);
  const analizadorRef= useRef(null);
  const rafRef       = useRef(null);
  const inicioRef    = useRef(0);
  const silencioRef  = useRef(0);
  const topeRef      = useRef(null);
  const resolverRef  = useRef(null);
  // Cancelar no es parar: parar entrega el audio, cancelar lo tira.
  const canceladoRef = useRef(false);
  const montadoRef   = useRef(true);
  // `medir` y el tope de duración se memorizan una sola vez y necesitan
  // llamar a `detener`, que se define más abajo y se recrea en cada render.
  // Capturarlo directo dejaría clavada la versión del primer render — el
  // clásico cierre viejo que funciona hasta que deja de funcionar.
  const detenerRef   = useRef(null);

  const avisar = useCallback((msg) => { onError?.(msg); }, [onError]);

  // ── Soltarlo todo ────────────────────────────────────────────────────
  const soltar = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (topeRef.current) { clearTimeout(topeRef.current); topeRef.current = null; }
    try { analizadorRef.current?.disconnect(); } catch { /* ya estaba suelto */ }
    analizadorRef.current = null;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ya cerrado */ }
      audioCtxRef.current = null;
    }
    // Esto es lo que apaga la luz roja del navegador.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* ya parado */ } });
      streamRef.current = null;
    }
    recorderRef.current = null;
    setNivel(0);
  }, []);

  // El micrófono NO sobrevive a la pantalla que lo abrió.
  useEffect(() => () => { montadoRef.current = false; soltar(); }, [soltar]);

  // ── El medidor ───────────────────────────────────────────────────────
  // Sirve para dos cosas a la vez: pintar el nivel y decidir cuándo se
  // dejó de hablar. Una sola pasada por fotograma para las dos.
  const medir = useCallback((silencioMs) => {
    const an = analizadorRef.current;
    if (!an) return;
    const datos = new Uint8Array(an.fftSize);

    const paso = () => {
      if (!analizadorRef.current) return;
      analizadorRef.current.getByteTimeDomainData(datos);
      // RMS sobre la onda centrada en 128. Más honesto que el pico: un
      // golpe en la mesa no cuenta como "está hablando".
      let suma = 0;
      for (let i = 0; i < datos.length; i += 1) {
        const v = (datos[i] - 128) / 128;
        suma += v * v;
      }
      const rms = Math.sqrt(suma / datos.length);
      setNivel(Math.min(1, rms * 4));
      setDuracionMs(Date.now() - inicioRef.current);

      if (rms >= LIMITES.umbralSilencio) {
        silencioRef.current = 0;
        setEstado((e) => (e === 'silencio' ? 'grabando' : e));
      } else if (silencioMs > 0) {
        if (!silencioRef.current) silencioRef.current = Date.now();
        const callado = Date.now() - silencioRef.current;
        if (callado > silencioMs * 0.4) setEstado((e) => (e === 'grabando' ? 'silencio' : e));
        // Solo corta si YA habló: abrir el micrófono y esperar en silencio
        // no debe cerrarlo antes de que a la persona le dé tiempo.
        if (callado > silencioMs && Date.now() - inicioRef.current > silencioMs + 700) {
          detenerRef.current?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
  }, []);

  // ── Empezar ──────────────────────────────────────────────────────────
  const empezar = useCallback(async ({ silencioMs = LIMITES.silencioMs } = {}) => {
    if (recorderRef.current) return null;

    if (!navigator.mediaDevices?.getUserMedia) {
      avisar('Este navegador no permite grabar audio. Escribe el mensaje.');
      setEstado('error_micro');
      return null;
    }
    if (typeof MediaRecorder === 'undefined') {
      avisar('Este navegador no tiene MediaRecorder. Escribe el mensaje o prueba con Chrome.');
      setEstado('error_micro');
      return null;
    }

    canceladoRef.current = false;
    setGrabacion(null);
    setDuracionMs(0);
    setEstado('permiso');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      setEstado('error_micro');
      avisar(explicarErrorMicrofono(err));
      return null;
    }

    // Puede haberse desmontado mientras el navegador preguntaba. Sin esto
    // el micrófono se queda abierto en una pantalla que ya no existe.
    if (!montadoRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }

    streamRef.current = stream;
    const formato = elegirFormato();

    try {
      recorderRef.current = new MediaRecorder(
        stream, formato ? { mimeType: formato.mime, audioBitsPerSecond: 32000 } : undefined,
      );
    } catch {
      // El navegador dijo que soportaba el formato y luego no. Se reintenta
      // dejándole elegir a él.
      try {
        recorderRef.current = new MediaRecorder(stream);
      } catch (err2) {
        soltar();
        setEstado('error_micro');
        avisar(`No se pudo iniciar la grabación: ${err2?.message || 'formato no admitido'}`);
        return null;
      }
    }

    trozosRef.current = [];
    recorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) trozosRef.current.push(e.data);
    };

    const listo = new Promise((resolve) => { resolverRef.current = resolve; });

    recorderRef.current.onstop = () => {
      const tipoReal = recorderRef.current?.mimeType || formato?.mime || 'audio/webm';
      const dur = Date.now() - inicioRef.current;
      const blob = new Blob(trozosRef.current, { type: tipoReal.split(';')[0] });
      trozosRef.current = [];
      soltar();

      if (canceladoRef.current) {
        setEstado('inactivo');
        resolverRef.current?.(null);
        return;
      }

      const problema = validarGrabacion({ size: blob.size, duracionMs: dur });
      if (problema) {
        setEstado('error_micro');
        avisar(problema);
        resolverRef.current?.(null);
        return;
      }

      const res = {
        blob,
        url: URL.createObjectURL(blob),   // para escucharla antes de mandarla
        duracionMs: dur,
        mime: blob.type,
        codec: formato?.codec || null,
        ext: formato?.ext || 'webm',
      };
      setGrabacion(res);
      setEstado('preparando');
      resolverRef.current?.(res);
    };

    // El medidor va por Web Audio, aparte del grabador: MediaRecorder no
    // dice cuánto suena.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
      const fuente = audioCtxRef.current.createMediaStreamSource(stream);
      analizadorRef.current = audioCtxRef.current.createAnalyser();
      analizadorRef.current.fftSize = 512;
      fuente.connect(analizadorRef.current);
    } catch {
      // Sin medidor se graba igual: se pierde el indicador y el corte por
      // silencio, no la grabación.
      analizadorRef.current = null;
    }

    inicioRef.current = Date.now();
    silencioRef.current = 0;
    recorderRef.current.start(250);
    setEstado('grabando');
    if (analizadorRef.current) medir(silencioMs);

    // El tope duro. Aunque nadie deje de hablar, a los dos minutos se corta:
    // es el límite que valida la base y llegar con 3 MB para que lo rechacen
    // es tirar la grabación entera.
    topeRef.current = setTimeout(() => { detenerRef.current?.(); }, LIMITES.maxDuracionMs);

    return listo;
  }, [avisar, medir, soltar]);

  // ── Parar ────────────────────────────────────────────────────────────
  const detener = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return;
    setEstado('preparando');
    try { recorderRef.current.stop(); } catch { soltar(); setEstado('inactivo'); }
  }, [soltar]);

  useEffect(() => { detenerRef.current = detener; }, [detener]);

  const cancelar = useCallback(() => {
    canceladoRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ya parado */ }
    } else {
      soltar();
      setEstado('inactivo');
    }
    setGrabacion((g) => { if (g?.url) URL.revokeObjectURL(g.url); return null; });
  }, [soltar]);

  const descartar = useCallback(() => {
    setGrabacion((g) => { if (g?.url) URL.revokeObjectURL(g.url); return null; });
    setEstado('inactivo');
    setDuracionMs(0);
  }, []);

  // ── Subir ────────────────────────────────────────────────────────────
  // Dos pasos: el archivo va directo al bucket con la sesión del usuario
  // —las políticas del bucket lo encierran en la carpeta de su empresa— y
  // después se registra en la base, que es donde se valida de verdad.
  //
  // El orden importa: registrar primero dejaría filas apuntando a archivos
  // que quizá nunca lleguen.
  const subir = useCallback(async (rec) => {
    const g = rec || grabacion;
    if (!g?.blob) { avisar('No hay ninguna grabación que enviar.'); return null; }
    if (!tenantId) { avisar('No se pudo determinar la empresa.'); return null; }

    setEstado('subiendo');
    try {
      const sha = await sha256Hex(g.blob);
      // El nombre lo pone el cliente pero NO lo elige el usuario: es el
      // hash. Un nombre escrito por una persona acaba con barras, tildes o
      // rutas relativas dentro.
      const ruta = rutaAudio(tenantId, sha.slice(0, 32), g.ext);

      const { error: eSubir } = await supabase.storage
        .from('hermes-voz')
        .upload(ruta, g.blob, { contentType: g.mime, upsert: true });

      if (eSubir) throw new Error(`No se pudo subir el audio: ${eSubir.message}`);

      const { data, error } = await supabase.rpc('hermes_voz_registrar', {
        p_storage_path: ruta,
        p_mime_type: g.mime,
        p_size_bytes: g.blob.size,
        p_duration_ms: Math.round(g.duracionMs),
        p_sha256: sha,
        p_codec: g.codec,
        p_metricas: {
          recording_started_at: new Date(Date.now() - g.duracionMs).toISOString(),
          recording_finished_at: new Date().toISOString(),
          upload_finished_at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error.message);

      setEstado('subido');
      return { mediaId: data.media_id, duplicado: !!data.duplicado, duracionMs: g.duracionMs };
    } catch (err) {
      setEstado('error_carga');
      avisar(err.message || 'No se pudo subir el audio.');
      return null;
    }
  }, [grabacion, tenantId, avisar]);

  return {
    estado, setEstado, nivel, duracionMs, grabacion,
    empezar, detener, cancelar, descartar, subir, soltar,
    grabando: estado === 'grabando' || estado === 'silencio' || estado === 'escuchando',
  };
};

export default useGrabadoraVoz;
