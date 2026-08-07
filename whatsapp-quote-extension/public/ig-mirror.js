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
