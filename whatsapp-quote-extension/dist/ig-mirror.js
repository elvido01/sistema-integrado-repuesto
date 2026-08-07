// MotoFlow Omni — puente Instagram → Sales Hub.
//
// Escucha lo que anuncia ig-probe.js y lo manda a la RPC omni_mirror_instagram.
// Vive en el mundo aislado del content script, que es el único que puede leer
// chrome.storage (donde está la sesión) y hablar con Supabase sin que la
// página se entere.
//
// La sesión y la configuración las escribe el panel de WhatsApp cuando el
// vendedor entra: aquí no se pide clave ni se guarda ninguna credencial de
// Instagram. Si nunca ha entrado al panel, este puente se queda callado.
(() => {
  'use strict';

  const CLAVE_SESION = 'motoflow_quote_extension_session';
  const CLAVE_CONFIG = 'motoflow_omni_config';
  const ESPERA_MS = 4000;   // se juntan los hilos antes de mandar
  const REPETIR_MS = 60000; // no se re-espeja el mismo hilo sin cambios

  const pendientes = new Map();
  const yaMandado = new Map();
  let temporizador = null;
  let config = null;
  let sesion = null;

  const almacen = (() => {
    try { return chrome?.storage?.local || null; } catch { return null; }
  })();

  const leer = (clave) => new Promise((resolve) => {
    if (!almacen) return resolve(null);
    try { almacen.get(clave, (r) => resolve(r?.[clave] || null)); } catch { resolve(null); }
  });

  const refrescarCredenciales = async () => {
    sesion = await leer(CLAVE_SESION);
    config = await leer(CLAVE_CONFIG);
    return !!(sesion?.access_token && config?.url && config?.anon);
  };

  // Huella del hilo: si no cambió nada, no se vuelve a mandar. Evita repetir
  // el mismo hilo cada vez que Instagram refresca su bandeja.
  const huella = (h) => `${h.thread_id}|${h.messages.length}|${h.messages[h.messages.length - 1]?.id || ''}`;

  const enviar = async () => {
    temporizador = null;
    if (!pendientes.size) return;
    if (!(await refrescarCredenciales())) {
      // Sin sesión de MotoFlow no hay nada que hacer: se descarta en silencio
      // para no acumular conversaciones en memoria indefinidamente.
      pendientes.clear();
      return;
    }

    const lote = [...pendientes.values()];
    pendientes.clear();

    for (const hilo of lote) {
      const f = huella(hilo);
      const visto = yaMandado.get(hilo.thread_id);
      if (visto?.f === f && Date.now() - visto.t < REPETIR_MS) continue;

      try {
        const r = await fetch(`${config.url}/rest/v1/rpc/omni_mirror_instagram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: config.anon,
            Authorization: `Bearer ${sesion.access_token}`,
          },
          body: JSON.stringify({ p_payload: hilo }),
        });
        if (r.ok) {
          yaMandado.set(hilo.thread_id, { f, t: Date.now() });
        } else if (r.status === 401) {
          // Sesión vencida: se limpia para releerla en la próxima vuelta.
          sesion = null;
        }
      } catch { /* el espejo nunca debe estorbar el uso normal de Instagram */ }
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // SALIDA: escribir en el chat ABIERTO lo que el vendedor dejó en cola
  // ══════════════════════════════════════════════════════════════════
  // Solo se escribe en la conversación que el vendedor ya tiene delante.
  // Si no está abierta, el mensaje se queda en cola. Es deliberado: un
  // programa que navega solo por Instagram, abre chats y escribe se
  // comporta como un robot y se le trata como tal. Así, lo único que hace
  // la extensión es pegar un texto que una persona ya redactó, en una
  // ventana que esa persona ya tiene abierta.

  const ENTRE_ENVIOS_MS = 9000;   // respiro entre un mensaje y el siguiente
  const REVISAR_COLA_MS = 8000;
  let ultimoEnvio = 0;
  let enviando = false;

  const hiloAbierto = () => {
    const m = String(location.pathname || '').match(/\/direct\/t\/(\d+)/);
    return m ? m[1] : null;
  };

  // El cuadro de texto de Instagram. Varias vías porque cambia de versión;
  // la primera que aparezca gana.
  const buscarCuadro = () => {
    const intentos = [
      () => document.querySelector('div[role="textbox"][contenteditable="true"]'),
      () => document.querySelector('textarea[placeholder]'),
      () => document.querySelector('form div[contenteditable="true"]'),
      () => [...document.querySelectorAll('[contenteditable="true"]')].pop(),
    ];
    for (const f of intentos) {
      try { const el = f(); if (el) return el; } catch { /* siguiente */ }
    }
    return null;
  };

  const escribir = async (cuadro, texto) => {
    cuadro.focus();
    // execCommand es el camino que respeta React: cambiar .textContent a mano
    // no dispara los eventos internos de Instagram y el botón de enviar se
    // queda apagado, con el texto en pantalla pero imposible de mandar.
    const ok = document.execCommand('insertText', false, texto);
    if (!ok) {
      cuadro.textContent = texto;
      cuadro.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto }));
    }
    await new Promise((r) => setTimeout(r, 400));
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      cuadro.dispatchEvent(new KeyboardEvent(tipo, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
    }
    await new Promise((r) => setTimeout(r, 600));
    // Si el cuadro quedó vacío, el mensaje salió.
    return !String(cuadro.textContent || '').trim();
  };

  const rpc = async (nombre, cuerpo) => {
    const r = await fetch(`${config.url}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anon,
        Authorization: `Bearer ${sesion.access_token}`,
      },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status}`);
    return r.json();
  };

  const revisarCola = async () => {
    if (enviando) return;
    if (Date.now() - ultimoEnvio < ENTRE_ENVIOS_MS) return;
    const hilo = hiloAbierto();
    if (!hilo) return;                       // no hay chat abierto
    if (document.hidden) return;             // pestaña en segundo plano
    if (!(await refrescarCredenciales())) return;

    enviando = true;
    try {
      const cola = await rpc('omni_ig_pendientes', { p_thread: hilo });
      if (!Array.isArray(cola) || !cola.length) return;

      const cuadro = buscarCuadro();
      if (!cuadro) {
        // Se avisa UNA vez y se deja en cola: no se descarta el mensaje del
        // vendedor porque Instagram cambió su cuadro de texto.
        await rpc('omni_ig_marcar', {
          p_id: cola[0].id, p_ok: false,
          p_error: 'No se encontró el cuadro de texto de Instagram',
        });
        return;
      }

      // Uno por vuelta: ráfagas de mensajes son lo que dispara las alarmas.
      const msg = cola[0];
      let salio = false;
      let motivo = null;
      try {
        salio = await escribir(cuadro, msg.message_text);
        if (!salio) motivo = 'El texto se escribió pero Instagram no lo envió';
      } catch (e) {
        motivo = String(e?.message || e);
      }
      await rpc('omni_ig_marcar', { p_id: msg.id, p_ok: salio, p_error: motivo });
      ultimoEnvio = Date.now();
    } catch { /* nunca estorbar el uso normal */ } finally {
      enviando = false;
    }
  };

  window.setInterval(revisarCola, REVISAR_COLA_MS);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== 'motoflow-omni' || d.type !== 'ig-threads') return;

    for (const hilo of d.hilos || []) {
      if (!hilo?.thread_id) continue;
      // Si el mismo hilo llega dos veces antes de mandar, gana el que trae
      // más mensajes.
      const previo = pendientes.get(hilo.thread_id);
      if (!previo || hilo.messages.length >= previo.messages.length) {
        pendientes.set(hilo.thread_id, hilo);
      }
    }

    if (!temporizador) temporizador = window.setTimeout(enviar, ESPERA_MS);
  });

  refrescarCredenciales();
})();
