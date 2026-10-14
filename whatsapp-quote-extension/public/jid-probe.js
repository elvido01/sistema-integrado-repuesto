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

  // (14/10/2026) Con LID ("...@lid") el número no viene en el id del chat.
  // Si WhatsApp lo conoce, está en el contacto: se lee aparte (solo lectura).
  const leerNumero = () => {
    const intentos = [
      () => window.require?.('WAWebChatCollection')?.ChatCollection?.getActive?.()?.contact?.phoneNumber?._serialized,
      () => window.require?.('WAWebCollections')?.Chat?.getActive?.()?.contact?.phoneNumber?._serialized,
      () => window.Store?.Chat?.getActive?.()?.contact?.phoneNumber?._serialized,
    ];
    for (const f of intentos) {
      try {
        const pn = f();
        if (pn) return String(pn);
      } catch { /* siguiente */ }
    }
    return null;
  };

  // Se anuncia al cambiar de chat Y cada 10 s aunque no cambie: el content
  // script da por vencido el dato a los 20 s, y antes solo se avisaba al
  // cambiar — quedarse más de 20 s en un chat lo dejaba sin número.
  let ultimoAviso = 0;
  window.setInterval(() => {
    const jid = leerJid();
    if (jid === ultimo && Date.now() - ultimoAviso < 10000) return;
    ultimo = jid;
    ultimoAviso = Date.now();
    try {
      window.postMessage({ source: 'motoflow-omni', type: 'active-chat-jid', jid, pn: jid ? leerNumero() : null }, '*');
    } catch { /* nada */ }
  }, 1500);
})();
