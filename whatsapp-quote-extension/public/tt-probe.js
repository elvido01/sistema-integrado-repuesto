// MotoFlow Omni — sonda de mensajes directos de TikTok.
//
// Corre en el contexto de la PÁGINA (world: MAIN) porque desde el content
// script no se ven las respuestas que TikTok se pide a sí mismo.
//
// SOLO LECTURA, y aquí importa mucho el matiz: NO le pide nada a TikTok, NO
// manda mensajes, NO navega, NO toca el DOM. Se limita a mirar lo que la
// propia página YA recibió cuando el vendedor abrió su bandeja, y a
// anunciarlo por window.postMessage. Es el mismo criterio de ig-probe.js.
//
// >>> POR QUÉ ESTO NO ES COMO INSTAGRAM <<<
// Instagram contesta JSON y se lee de una. TikTok contesta protobuf crudo,
// así que hace falta tt-protobuf.js delante para traducirlo. Ese archivo se
// carga antes que este y deja MFTikTok colgado del global.
//
// >>> ESTO ENTRA, PERO NO SALE <<<
// De momento el puente es de una sola dirección: los mensajes de TikTok
// llegan al CRM, pero desde el CRM todavía no se contesta. El motivo está
// escrito en sql/omni_espejo_tiktok.sql — resumido: la bandeja de TikTok Web
// es un panel encima de la página, no una dirección propia, así que no hay
// forma segura de saber QUÉ conversación tiene el vendedor delante. Escribir
// en la equivocada es mandarle a un cliente el precio de otro.
(() => {
  'use strict';

  const ANUNCIO = 'motoflow-omni';

  // Los endpoints de la mensajería. TikTok los sirve desde su propio
  // dominio de IM; el resto del sitio (videos, perfiles) ni se mira, que es
  // lo que evita que la sonda pese en una página llena de video.
  const ES_IM = /im-api|\bim\.tiktok\.com|\/v\d+\/(message|conversation)\b/i;
  const ES_GENTE = /\/(api|aweme)\/.*\b(user|im|recommend)\b/i;
  const ES_WS = /im-ws|frontier|websocket/i;

  const MFT = () => (typeof MFTikTok !== 'undefined' ? MFTikTok : null);

  // Lo que se va sabiendo entre respuesta y respuesta. TikTok reparte los
  // datos: los mensajes vienen en binario y los nombres en JSON aparte.
  const nombres = Object.create(null);
  let miId = null;

  const diag = {
    respuestas: 0, binarias: 0, registros: 0, hilos: 0, mensajes: 0,
    sinIdentidad: 0, ultimoError: null,
  };
  let ultimaMuestra = null;

  const anunciar = (hilos) => {
    if (!hilos || !hilos.length) return;
    diag.hilos += hilos.length;
    for (const h of hilos) diag.mensajes += h.messages.length;
    try {
      window.postMessage({ source: ANUNCIO, type: 'tt-threads', hilos }, '*');
    } catch (e) { /* nada */ }
  };

  // Quién soy yo, si TikTok lo dejó escrito en la página. Es la vía más
  // barata; si no está, tt-protobuf.js lo deduce solo.
  const miIdDeLaPagina = () => {
    try {
      const bruto = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!bruto) return null;
      const d = JSON.parse(bruto.textContent || '{}');
      const u = d?.__DEFAULT_SCOPE__?.['webapp.app-context']?.user;
      const id = u?.userId || u?.uid || u?.secUid;
      return /^\d{6,}$/.test(String(id)) ? String(id) : null;
    } catch (e) { return null; }
  };

  const mirarBinario = (bytes) => {
    const api = MFT();
    if (!api) return;
    diag.binarias++;
    const r = api.extraerHilos(bytes, { miId, nombres });
    diag.registros += r.registros;
    if (r.miId && !miId) miId = r.miId;

    // Sin saber quién soy yo, el interlocutor de cada hilo es una moneda al
    // aire — y equivocarse crea la conversación con el nombre cambiado y
    // marca como míos los mensajes del cliente. Se prefiere no espejar nada
    // y volver a intentarlo cuando TikTok mande la segunda conversación.
    if (!miId) { diag.sinIdentidad++; return; }
    anunciar(r.hilos);
    // Se guarda la última respuesta que NO dio nada, para poder mirarla
    // luego sin tener que reproducir el momento.
    if (!r.hilos.length && bytes.length > 32) ultimaMuestra = bytes.slice(0, 8192);
  };

  const mirarJson = (texto) => {
    const api = MFT();
    if (!api) return;
    try {
      const j = JSON.parse(texto);
      api.cosecharNombres(j, nombres);
    } catch (e) { /* no era JSON */ }
  };

  const mirar = (url, buffer) => {
    try {
      diag.respuestas++;
      const bytes = new Uint8Array(buffer);
      if (!bytes.length) return;
      // Un mismo endpoint puede contestar JSON o protobuf según el caso, así
      // que se decide por lo que hay dentro y no por la dirección.
      const primero = bytes[0];
      if (primero === 0x7b || primero === 0x5b) {           // '{' o '['
        mirarJson(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
      } else if (ES_IM.test(String(url || '')) || !url) {
        mirarBinario(bytes);
      }
    } catch (e) { diag.ultimoError = String(e && e.message || e); }
  };

  const interesa = (url) => {
    const s = String(url || '');
    return ES_IM.test(s) || ES_GENTE.test(s);
  };

  // ── fetch ───────────────────────────────────────────────────────────
  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const respuesta = await fetchOriginal.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (interesa(url)) {
        // .clone() es obligatorio: leer el cuerpo original se lo quitaría a
        // TikTok y su bandeja se quedaría en blanco.
        respuesta.clone().arrayBuffer().then((b) => mirar(url, b)).catch(() => {});
      }
    } catch (e) { /* nada */ }
    return respuesta;
  };

  // ── XMLHttpRequest ──────────────────────────────────────────────────
  // TikTok pide su bandeja con responseType 'arraybuffer'. Tocar
  // .responseText en ese caso lanza una excepción — fue el error que delató
  // que la respuesta no era texto.
  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__mfUrl = url;
    return abrirOriginal.call(this, metodo, url, ...resto);
  };
  const enviarOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (interesa(this.__mfUrl)) {
        this.addEventListener('load', () => {
          try {
            const r = this.response;
            if (r instanceof ArrayBuffer) mirar(this.__mfUrl, r);
            else if (typeof r === 'string') mirar(this.__mfUrl, new TextEncoder().encode(r).buffer);
            else if (r instanceof Blob) r.arrayBuffer().then((b) => mirar(this.__mfUrl, b)).catch(() => {});
          } catch (e) { /* nada */ }
        });
      }
    } catch (e) { /* nada */ }
    return enviarOriginal.apply(this, args);
  };

  // ── El canal en vivo ────────────────────────────────────────────────
  // Los mensajes nuevos no llegan por fetch: llegan por el websocket de
  // ByteDance (im-ws-sg.tiktok.com). Sin esto, un DM solo aparecería en el
  // CRM cuando el vendedor recargara la bandeja.
  //
  // Se envuelve el constructor conservando prototipo y constantes, para que
  // `instanceof WebSocket` y `WebSocket.OPEN` sigan valiendo dentro de
  // TikTok. Si se rompe eso, se rompe la página entera.
  try {
    const WSOriginal = window.WebSocket;
    const alLlegar = (ev) => {
      try {
        const d = ev.data;
        if (d instanceof ArrayBuffer) mirar(null, d);
        else if (typeof Blob !== 'undefined' && d instanceof Blob) {
          d.arrayBuffer().then((b) => mirar(null, b)).catch(() => {});
        }
      } catch (e) { /* nada */ }
    };
    function WSEspejo(url, protocolos) {
      const ws = protocolos === undefined ? new WSOriginal(url) : new WSOriginal(url, protocolos);
      try {
        if (ES_WS.test(String(url))) ws.addEventListener('message', alLlegar);
      } catch (e) { /* nada */ }
      return ws;
    }
    WSEspejo.prototype = WSOriginal.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WSEspejo[k] = WSOriginal[k];
    window.WebSocket = WSEspejo;
  } catch (e) { /* si no se puede envolver, se vive con la bandeja al abrirla */ }

  // ── Diagnóstico ─────────────────────────────────────────────────────
  // La lección del espejo de WhatsApp: cuando se rompe, no avisa. Estas dos
  // funciones se escriben en la consola de TikTok (F12) y dicen si la sonda
  // está viendo algo y, si no lo entiende, qué forma tiene lo que ve.
  window.mfTikTok = () => ({
    ...diag,
    miId: miId || miIdDeLaPagina() || null,
    nombresConocidos: Object.keys(nombres).length,
    hayTraductor: !!MFT(),
  });

  // Enseña la FORMA de la última respuesta que la sonda no supo leer:
  // número de campo, tipo y tamaño. Los textos salen recortados a propósito
  // — sirve para arreglar el lector, no para leer conversaciones.
  window.mfTikTokMuestra = () => {
    const api = MFT();
    if (!api || !ultimaMuestra) return 'nada que mirar todavía';
    const filas = [];
    api.recorrer(ultimaMuestra, (campos, prof) => {
      for (const c of campos) {
        let v = '';
        if (c.w === 0) v = String(c.v);
        else if (c.w === 2) {
          const s = api.aTexto(c.v);
          v = s === null ? `<${c.v.length} bytes>` : JSON.stringify(s.slice(0, 40));
        }
        filas.push(`${'  '.repeat(prof)}#${c.n} t${c.w} ${v}`);
      }
    });
    return filas.slice(0, 300).join('\n');
  };

  miId = miIdDeLaPagina();
  window.postMessage({ source: ANUNCIO, type: 'tt-probe-listo' }, '*');
})();
