// MotoFlow Omni — sonda de JID del chat activo.
// Corre en el contexto de la PÁGINA (world: MAIN del manifest) porque los
// módulos internos de WhatsApp Web no son visibles desde el content script.
// SOLO LECTURA: no envía mensajes, no modifica nada de WhatsApp. Anuncia el
// JID del chat abierto por window.postMessage; el content script lo escucha
// para guardar el teléfono real aunque el contacto esté guardado con nombre.
(() => {
  'use strict';
  let ultimo = '__init__';

  const leerJid = () => {
    // Varias vías porque WhatsApp Web cambia de build; la primera que
    // funcione gana. Todas son de solo lectura.
    const intentos = [
      () => window.require?.('WAWebChatCollection')?.ChatCollection?.getActive?.()?.id?._serialized,
      () => window.require?.('WAWebCollections')?.Chat?.getActive?.()?.id?._serialized,
      () => window.Store?.Chat?.getActive?.()?.id?._serialized,
      () => {
        // último recurso: algún nodo del panel con atributo data-id que
        // contenga el JID (builds viejos)
        const el = document.querySelector('#main [data-id*="@c.us"], #main [data-id*="@g.us"]');
        const m = el?.getAttribute('data-id')?.match(/(\d{5,20}(?:-\d+)?@(?:c|g)\.us)/i);
        return m ? m[1] : null;
      },
    ];
    for (const f of intentos) {
      try {
        const jid = f();
        if (jid) return String(jid);
      } catch { /* siguiente estrategia */ }
    }
    return null;
  };

  window.setInterval(() => {
    const jid = leerJid();
    if (jid === ultimo) return;
    ultimo = jid;
    try {
      window.postMessage({ source: 'motoflow-omni', type: 'active-chat-jid', jid }, '*');
    } catch { /* nada */ }
  }, 1500);
})();
