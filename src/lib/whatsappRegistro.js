// Registro integrado de Meta (Embedded Signup v4) para "Conectar WhatsApp".
// La ventana de Meta avisa a la página con postMessage (session logging):
//   { type:'WA_EMBEDDED_SIGNUP', event:'FINISH' | 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
//     | 'FINISH_ONLY_WABA' | 'CANCEL' | 'ERROR', data:{ waba_id, phone_number_id, current_step, error_message } }
// y FB.login devuelve aparte el código (authResponse.code). Con los dos, la
// página llama a la función whatsapp-conectar.

export const META_APP_ID = import.meta.env.VITE_META_APP_ID || '';
export const WHATSAPP_CONFIG_ID = import.meta.env.VITE_WHATSAPP_ES_CONFIG_ID || '';
export const META_SDK_VERSION = import.meta.env.VITE_META_SDK_VERSION || 'v23.0';

/** ¿Está MotoFlow listo para conectar? (la app de Meta y su configuración). */
export const registroDisponible = () => !!(META_APP_ID && WHATSAPP_CONFIG_ID);

/** Lee un mensaje de la ventana de Meta. null = no es del registro de WhatsApp. */
export function leerAvisoRegistro(origin, data) {
  let host = '';
  try { host = new URL(String(origin || '')).hostname; } catch { return null; }
  if (!(host === 'facebook.com' || host.endsWith('.facebook.com'))) return null;
  let d = data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
  if (!d || d.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const ev = String(d.event || '');
  const info = d.data || {};
  if (ev === 'CANCEL') return { estado: 'cancelado', paso: info.current_step || null };
  if (ev === 'ERROR') return { estado: 'error', mensaje: info.error_message || 'Meta devolvió un error' };
  if (ev.startsWith('FINISH')) {
    return {
      estado: 'terminado',
      wabaId: info.waba_id ? String(info.waba_id) : null,
      phoneNumberId: info.phone_number_id ? String(info.phone_number_id) : null,
      coexistencia: ev === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      soloCuenta: ev === 'FINISH_ONLY_WABA',
    };
  }
  return null;
}

/** Opciones de FB.login para el registro con coexistencia. */
export const opcionesLogin = (configId = WHATSAPP_CONFIG_ID) => ({
  config_id: configId,
  response_type: 'code',
  override_default_response_type: true,
  extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
});

/** Carga el SDK de Facebook una sola vez. */
let sdk = null;
export function cargarSdkMeta() {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin navegador'));
  if (window.FB) return Promise.resolve(window.FB);
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: META_SDK_VERSION });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/es_LA/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onerror = () => { sdk = null; reject(new Error('No se pudo cargar la ventana de Meta. Revisa la conexión o un bloqueador de anuncios.')); };
    document.body.appendChild(s);
  });
  return sdk;
}

/** Texto del estado de una conexión para la pantalla. */
export function estadoConexionTexto(cx) {
  if (!cx) return { tono: 'gris', texto: 'Sin conectar' };
  if (cx.estado === 'conectado') return { tono: 'verde', texto: 'Conectado' };
  if (cx.estado === 'error') return { tono: 'rojo', texto: 'Con error' };
  return { tono: 'rojo', texto: 'Desconectado' };
}
