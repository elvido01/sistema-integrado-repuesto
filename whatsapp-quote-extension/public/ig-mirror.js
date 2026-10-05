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

  // ══════════════════════════════════════════════════════════════════
  // "COPIAR Y ABRIR INSTAGRAM": ENCONTRAR LA CONVERSACIÓN
  // ══════════════════════════════════════════════════════════════════
  // (05/10/2026) El dueño: "no selecciona la conversación, así no sé a
  // quién responderle". Sin Acceso Avanzado, Meta solo da un número por
  // cliente, así que el panel no puede mandar un enlace al chat. Deja una
  // pista en chrome.storage (el último mensaje del cliente y su hora) y aquí
  // se busca esa vista previa en la lista de Instagram: en Principal y, si
  // no está, en Solicitudes (los que no te siguen caen ahí). Si sale UNA, se
  // abre; si salen varias, se marcan. Siempre queda un cartel con lo que hay
  // que buscar. Solo se hace clic en la lista y solo si el vendedor acaba de
  // pedirlo desde el panel: no se escribe nada.
  const PISTA = 'motoflow_ig_buscar';
  const PISTA_VIVE_MS = 3 * 60 * 1000;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  let buscando = false;

  const horaDe = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-DO', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return ''; }
  };

  const cartel = (pista, estado) => {
    let c = document.getElementById('mf-ig-cartel');
    if (!c) {
      c = document.createElement('div');
      c.id = 'mf-ig-cartel';
      c.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;'
        + 'max-width:520px;background:#0f766e;color:#fff;font:13px/1.4 system-ui,sans-serif;'
        + 'padding:10px 34px 10px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      const x = document.createElement('button');
      x.textContent = '×';
      x.style.cssText = 'position:absolute;top:4px;right:8px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer';
      x.onclick = () => c.remove();
      c.appendChild(x);
      c.appendChild(document.createElement('div'));
      document.body.appendChild(c);
    }
    const cuerpo = c.lastChild;
    cuerpo.textContent = '';
    const t = document.createElement('div');
    t.style.fontWeight = '700';
    t.textContent = `MotoFlow: el cliente escribió “${pista.texto}”${pista.at ? ` (${horaDe(pista.at)})` : ''}`;
    const e = document.createElement('div');
    e.textContent = estado;
    cuerpo.append(t, e);
  };

  const filasQueDicen = (texto) => {
    const trozo = norm(texto).slice(0, 22);
    if (!trozo) return [];
    const todos = [...document.querySelectorAll('a[href^="/direct/t/"], div[role="listitem"], div[role="button"], div[role="link"]')]
      .filter((el) => !el.closest('#mf-ig-cartel'))
      .filter((el) => { const t = el.innerText || ''; return t.length < 400 && norm(t).includes(trozo); });
    // Quedarse con la fila, no con sus envoltorios: fuera lo que contiene otra coincidencia.
    return todos.filter((el) => !todos.some((o) => o !== el && el.contains(o)));
  };

  const irASolicitudes = () => {
    const a = document.querySelector('a[href="/direct/requests/"], a[href^="/direct/requests"]')
      || [...document.querySelectorAll('a, div[role="tab"], div[role="button"]')]
        .find((el) => /^(requests|solicitudes)\b/i.test(String(el.innerText || '').trim()));
    if (a) { a.click(); return true; }
    return false;
  };

  const buscarConversacion = async () => {
    if (buscando || !almacen) return;
    const pista = await leer(PISTA);
    if (!pista?.puesto || Date.now() - pista.puesto > PISTA_VIVE_MS) return;
    buscando = true;
    // La pista se borra al TERMINAR, no al empezar: si esta pestaña ya
    // estaba abierta, el panel la recarga un instante después y la búsqueda
    // tiene que seguir en la página nueva.
    const listo = (estado) => {
      cartel(pista, estado);
      try { almacen.remove(PISTA); } catch { /* nada */ }
      buscando = false;
    };

    if (/\/direct\/t\//.test(location.pathname)) {
      listo('Esta es la conversación. Tu respuesta ya está copiada: pégala con Ctrl+V.');
      return;
    }
    if (!pista.texto) {
      listo('Búscala en la lista (mira también en Solicitudes) y pega tu respuesta con Ctrl+V.');
      return;
    }

    cartel(pista, 'Buscando la conversación…');
    let pasoASolicitudes = false;
    for (let i = 0; i < 24; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const filas = filasQueDicen(pista.texto);
      if (filas.length === 1) {
        filas[0].scrollIntoView({ block: 'center' });
        filas[0].click();
        listo('La abrí. Tu respuesta ya está copiada: pégala con Ctrl+V. Si no es esta, búscala por ese mensaje.');
        return;
      }
      if (filas.length > 1) {
        filas.forEach((f) => { f.style.outline = '3px solid #f59e0b'; f.style.outlineOffset = '-3px'; });
        listo(`Hay ${filas.length} conversaciones con ese mensaje (marcadas en amarillo): es la de esa hora. Tu respuesta ya está copiada: pégala con Ctrl+V.`);
        return;
      }
      // Nada en Principal tras unos segundos: los que no te siguen caen en Solicitudes.
      if (i === 7 && !pasoASolicitudes && !/\/direct\/requests/.test(location.pathname)) {
        pasoASolicitudes = irASolicitudes();
        if (pasoASolicitudes) cartel(pista, 'No está en Principal: buscando en Solicitudes…');
      }
    }
    listo('No la encontré sola. Búscala por ese mensaje (en Principal, General o Solicitudes) y pega tu respuesta con Ctrl+V.');
  };

  try {
    chrome?.storage?.onChanged?.addListener((cambios, area) => {
      if (area === 'local' && cambios[PISTA]?.newValue) buscarConversacion();
    });
  } catch { /* nada */ }
  buscarConversacion();

  refrescarCredenciales();
})();
