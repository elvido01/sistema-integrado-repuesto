// El oído de Jarvis, del lado del navegador.
//
// >>> QUE PROBLEMA RESUELVE <<<
// El modo voz transcribía con window.SpeechRecognition — el motor de
// Chrome. Ese motor no sabe que existe "Pruss 200", ni "millero", ni
// "catalina", así que escribía lo que más se le parecía. Y partía las
// palabras: "autorízalo" llegaba como "autoriza lo", y por una conjugación
// mal oída Jarvis contestó con la cotización de otro cliente.
//
// Ahora el audio va al servidor, se transcribe con un modelo al que se le
// dan las palabras del negocio ANTES de escuchar, y vuelve el texto bueno.
//
// >>> LO IMPORTANTE: ESTO NUNCA PUEDE DEJAR MUDO A JARVIS <<<
// El dictado del navegador SE QUEDA. Sigue corriendo en paralelo y su texto
// es la red de abajo. Si el servidor tarda, falla, no hay internet o no hay
// clave del proveedor, se usa lo que oyó Chrome y el usuario ni se entera.
// Oír mejor es una mejora; poder hablar es el requisito.
//
//   MediaRecorder ──► servidor + glosario ──► texto bueno ─┐
//                                                          ├─► el que llegue
//   SpeechRecognition ─────────────────────► texto flojo ──┘
//
// >>> LA CAPA ES REEMPLAZABLE <<<
// Nada de lo que viene después (contexto, entidades, herramientas,
// seguridad, logs) sabe de dónde salió el texto. El día que esto se cambie
// por una sesión de voz en tiempo real, se cambia este archivo y ya.

import { supabase } from '@/lib/customSupabaseClient';

// Cuánto se espera al servidor antes de tirar del texto del navegador.
// Una nota de voz de 5 segundos se transcribe en 1-2; a los 6 algo va mal
// y es mejor contestar con lo que hay que dejar al usuario mirando.
const ESPERA_MAX_MS = 6000;

const blobABase64 = (blob) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result || '').split(',')[1] || '');
  lector.onerror = () => reject(new Error('no se pudo leer el audio'));
  lector.readAsDataURL(blob);
});

/**
 * Transcribe una nota de voz en el servidor.
 *
 * NUNCA lanza: devuelve null cuando no se pudo, y quien llama sigue con el
 * texto del navegador. Ese contrato es a propósito — si esto pudiera
 * romper la llamada, un fallo del oído tumbaría el modo voz entero.
 *
 * @param {{blob: Blob, mime: string, duracionMs: number}} grabado
 * @param {string} glosario  términos de pantalla (src/lib/glosarioVoz.js)
 * @returns {Promise<{texto: string, modelo: string, ms: number, segundos: number}|null>}
 */
export async function transcribir(grabado, glosario = '') {
  if (!grabado?.blob?.size) return null;

  const reloj = new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_MAX_MS));

  const intento = (async () => {
    try {
      const audio_base64 = await blobABase64(grabado.blob);
      if (!audio_base64) return null;

      // invoke() adjunta el token de la sesión solo. La clave del proveedor
      // vive en la Edge Function y el navegador nunca la ve.
      const { data, error } = await supabase.functions.invoke('jarvis-transcribir', {
        body: {
          audio_base64,
          mime: grabado.mime || 'audio/webm',
          glosario,
          idioma: 'es',
          segundos: Math.round((grabado.duracionMs || 0) / 1000),
        },
      });

      if (error || !data?.ok || !data?.texto) {
        console.warn('[oido] el servidor no transcribió, se usa el dictado del navegador',
                     error?.message || data?.error || '');
        return null;
      }
      return {
        texto: String(data.texto).trim(),
        modelo: data.modelo || null,
        ms: data.ms || null,
        segundos: data.segundos ?? Math.round((grabado.duracionMs || 0) / 1000),
      };
    } catch (e) {
      console.warn('[oido] falló la transcripción, sigue el dictado del navegador', e?.message || e);
      return null;
    }
  })();

  return Promise.race([intento, reloj]);
}

/**
 * Decide con qué texto se queda Jarvis.
 *
 * El del servidor gana casi siempre, pero no a ciegas: si vuelve vacío o
 * ridículamente corto frente a lo que oyó el navegador, es más probable que
 * el audio saliera mal (micrófono tapado, se cortó) que que el usuario
 * dijera una sola sílaba. En ese caso manda el navegador.
 */
export function elegirTexto(delServidor, delNavegador) {
  const s = String(delServidor || '').trim();
  const n = String(delNavegador || '').trim();
  if (!s) return { texto: n, de: 'navegador' };
  if (!n) return { texto: s, de: 'servidor' };
  if (s.length * 3 < n.length) return { texto: n, de: 'navegador' };
  return { texto: s, de: 'servidor' };
}

export const _internos = { ESPERA_MAX_MS };
