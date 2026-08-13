// =====================================================================
// El espejo de voz — guardar el original mientras el navegador dicta
// ---------------------------------------------------------------------
// El modo voz de la esfera transcribe con SpeechRecognition y manda TEXTO.
// Funciona, pero tiene tres agujeros: transcribe Chrome y no el STT de
// Hermes, Safari se queda fuera, y NO QUEDA EL AUDIO — si entendió mal,
// no hay a qué volver.
//
// >>> POR QUÉ UN ESPEJO Y NO UN REEMPLAZO <<<
// Lo obvio sería quitar SpeechRecognition y mandar solo el audio. Sería un
// paso atrás HOY: el adaptador de Hermes todavía lee v4 y solo entiende
// texto. El modo voz dejaría de contestar hasta que alguien termine el
// otro lado.
//
// Así que se hacen las dos cosas a la vez:
//
//   SpeechRecognition ─► texto  ─┐
//                                ├─► UN mensaje 'mixed'
//   MediaRecorder ────► audio ───┘
//
//   · Hoy:      Hermes lee el texto y contesta. Nada cambia para el usuario.
//   · Mañana:   descarga el audio, lo pasa por su STT y manda la
//               transcripción de verdad con chat_transcripcion().
//
// El texto que viaja es PROVISIONAL y así se marca en `pantalla`: el que
// oye el audio es quien tiene derecho a decir qué se dijo.
//
// >>> EL MICRÓFONO SE SUELTA SIEMPRE <<<
// SpeechRecognition abre el suyo por dentro; este abre otro. Dos flujos
// sobre el mismo micrófono es justo la forma de dejar uno encendido. Todo
// lo que se abre aquí se cierra en cerrar() y en cancelar().
// =====================================================================

import { supabase } from '@/lib/customSupabaseClient';
import { elegirFormato, validarGrabacion, rutaAudio } from '@/lib/vozFormatos';

let stream = null;
let recorder = null;
let trozos = [];
let formato = null;
let inicio = 0;
let cancelado = false;

export const espejoActivo = () => !!recorder;

const soltar = () => {
  if (stream) {
    stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ya parado */ } });
    stream = null;
  }
  recorder = null;
  trozos = [];
};

// Se llama a la vez que el dictado. Si falla, NO se propaga: el modo voz
// tiene que seguir funcionando aunque no se pueda guardar el original.
export const iniciar = async () => {
  if (recorder) return true;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;

  try {
    cancelado = false;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    formato = elegirFormato();
    try {
      recorder = new MediaRecorder(stream, formato ? { mimeType: formato.mime, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    trozos = [];
    recorder.ondataavailable = (e) => { if (e.data?.size > 0) trozos.push(e.data); };
    inicio = Date.now();
    recorder.start(250);
    return true;
  } catch {
    // Permiso denegado, micrófono ocupado, contexto inseguro… El dictado
    // sigue su camino; simplemente no habrá original que guardar.
    soltar();
    return false;
  }
};

export const cerrar = () => new Promise((resolve) => {
  if (!recorder) { resolve(null); return; }
  const dur = Date.now() - inicio;
  const tipo = recorder.mimeType || formato?.mime || 'audio/webm';

  recorder.onstop = () => {
    const blob = new Blob(trozos, { type: tipo.split(';')[0] });
    soltar();
    if (cancelado) { resolve(null); return; }
    if (validarGrabacion({ size: blob.size, duracionMs: dur })) { resolve(null); return; }
    resolve({ blob, duracionMs: dur, mime: blob.type, ext: formato?.ext || 'webm', codec: formato?.codec || null });
  };
  try { recorder.stop(); } catch { soltar(); resolve(null); }
});

export const cancelar = () => {
  cancelado = true;
  if (recorder) { try { recorder.stop(); } catch { /* ya parado */ } }
  soltar();
};

const sha256Hex = async (blob) => {
  if (!globalThis.crypto?.subtle) throw new Error('sin contexto seguro');
  const h = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Sube el audio y crea UN mensaje con el audio y el texto provisional.
// Devuelve el id del mensaje, o null si algo falló — y entonces quien
// llama manda solo el texto, que es lo que hacía antes.
export const mandarConAudio = async (tenantId, grabado, transcript, pantalla) => {
  if (!tenantId || !grabado?.blob) return null;
  try {
    const sha = await sha256Hex(grabado.blob);
    const ruta = rutaAudio(tenantId, sha.slice(0, 32), grabado.ext);

    const { error: eSubir } = await supabase.storage
      .from('hermes-voz')
      .upload(ruta, grabado.blob, { contentType: grabado.mime, upsert: true });
    if (eSubir) throw new Error(eSubir.message);

    const { data: reg, error: eReg } = await supabase.rpc('hermes_voz_registrar', {
      p_storage_path: ruta,
      p_mime_type: grabado.mime,
      p_size_bytes: grabado.blob.size,
      p_duration_ms: Math.round(grabado.duracionMs),
      p_sha256: sha,
      p_codec: grabado.codec,
      p_metricas: { origen: 'modo_voz_web' },
    });
    if (eReg) throw new Error(eReg.message);

    const { data, error } = await supabase.rpc('hermes_escribir_voz', {
      p_media_id: reg.media_id,
      // Se le dice a Hermes, en su propio contexto, que ese texto es
      // provisional. Sin esta línea trataría la transcripción del
      // navegador como si fuera la buena y nunca miraría el audio.
      p_pantalla: {
        ...(pantalla || {}),
        transcripcion_provisional: true,
        transcripcion_hecha_por: 'navegador (Web Speech API)',
        nota: 'El audio original va adjunto. Si tienes STT, la transcripcion buena es la tuya: usala y registrala con chat_transcripcion().',
      },
      p_texto: transcript || null,
    });
    if (error) throw new Error(error.message);
    return data?.id || null;
  } catch (e) {
    console.warn('[voz] no se pudo adjuntar el audio:', e.message);
    return null;
  }
};
