// MotoFlow Omni — sonda de mensajes directos de Instagram.
//
// Corre en el contexto de la PÁGINA (world: MAIN) porque desde el content
// script no se ven las respuestas que Instagram se pide a sí mismo.
//
// SOLO LECTURA, y conviene entender bien qué significa aquí: NO le pide nada
// a Instagram, NO manda mensajes, NO toca el DOM. Se limita a mirar las
// respuestas que la propia página YA recibió cuando el vendedor abrió su
// bandeja, y a anunciarlas por window.postMessage.
//
// Por qué mirar la red y no el HTML: Instagram genera sus nombres de clase
// al compilar y los cambia sin avisar, así que un lector de HTML se rompe
// cada pocas semanas. La forma de sus respuestas (direct_v2) es estable
// porque su propia aplicación depende de ella. Es el mismo criterio de
// jid-probe.js, que lee los módulos internos de WhatsApp en vez del DOM.
(() => {
  'use strict';

  const ANUNCIO = 'motoflow-omni';
  const ES_DIRECTO = /\/direct_v2\/|\/api\/v1\/direct_v2\//i;

  const anunciar = (hilos) => {
    if (!hilos || !hilos.length) return;
    try {
      window.postMessage({ source: ANUNCIO, type: 'ig-threads', hilos }, '*');
    } catch { /* nada */ }
  };

  // ── Traducción del formato de Instagram al del espejo ──────────────
  // Se toca solo lo que existe; cualquier campo que Instagram renombre
  // deja ese mensaje fuera, pero no rompe los demás.
  const normalizarHilo = (hilo, miUserId) => {
    if (!hilo) return null;
    const otros = (hilo.users || []).filter((u) => String(u.pk) !== String(miUserId));
    const otro = otros[0] || (hilo.users || [])[0] || {};

    const mensajes = (hilo.items || []).map((it) => {
      const mio = String(it.user_id) === String(miUserId);
      let texto = it.text || '';
      let tipo = 'text';
      let media = null;

      if (!texto && it.item_type) {
        // Lo que no es texto se anota por su tipo, para que el vendedor sepa
        // que llegó algo aunque el contenido no viaje.
        const etiquetas = {
          media: '[Imagen]', voice_media: '[Audio]', video_call_event: '[Llamada]',
          animated_media: '[GIF]', media_share: '[Publicación compartida]',
          story_share: '[Historia compartida]', link: '[Enlace]',
        };
        texto = etiquetas[it.item_type] || `[${it.item_type}]`;
        tipo = it.item_type === 'voice_media' ? 'audio'
             : it.item_type === 'media' ? 'image' : 'text';
        media = it?.media?.image_versions2?.candidates?.[0]?.url
             || it?.voice_media?.media?.audio?.audio_src || null;
      }
      if (it.link?.text) texto = it.link.text;

      return {
        id: String(it.item_id || ''),
        de: mio ? 'agent' : 'user',
        texto,
        tipo,
        media_url: media,
        // Instagram marca el tiempo en MICROsegundos.
        ts: it.timestamp ? new Date(Number(it.timestamp) / 1000).toISOString() : null,
      };
    }).filter((x) => x.id && (x.texto || x.media_url));

    if (!mensajes.length) return null;

    return {
      thread_id: String(hilo.thread_id || hilo.thread_v2_id || ''),
      user_id: otro.pk ? String(otro.pk) : null,
      handle: otro.username || null,
      nombre: otro.full_name || otro.username || null,
      messages: mensajes,
    };
  };

  const extraer = (datos) => {
    if (!datos) return [];
    const miId = datos?.viewer?.pk || datos?.user?.pk || window._sharedData?.config?.viewerId || null;
    const crudos = datos.inbox?.threads || (datos.thread ? [datos.thread] : []) || [];
    return crudos.map((h) => normalizarHilo(h, miId)).filter(Boolean);
  };

  const mirar = (url, cuerpo) => {
    if (!ES_DIRECTO.test(String(url || ''))) return;
    try {
      const datos = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo;
      anunciar(extraer(datos));
    } catch { /* respuesta que no es JSON del inbox */ }
  };

  // ── fetch ──────────────────────────────────────────────────────────
  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const respuesta = await fetchOriginal.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (ES_DIRECTO.test(String(url || ''))) {
        // .clone() es obligatorio: leer el cuerpo original se lo quitaría a
        // Instagram y su bandeja se quedaría en blanco.
        respuesta.clone().text().then((t) => mirar(url, t)).catch(() => {});
      }
    } catch { /* nada */ }
    return respuesta;
  };

  // ── XMLHttpRequest (Instagram todavía lo usa en varias vistas) ──────
  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__mfUrl = url;
    return abrirOriginal.call(this, metodo, url, ...resto);
  };
  const enviarOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (ES_DIRECTO.test(String(this.__mfUrl || ''))) {
        this.addEventListener('load', () => {
          try { mirar(this.__mfUrl, this.responseText); } catch { /* nada */ }
        });
      }
    } catch { /* nada */ }
    return enviarOriginal.apply(this, args);
  };

  window.postMessage({ source: ANUNCIO, type: 'ig-probe-listo' }, '*');
})();
