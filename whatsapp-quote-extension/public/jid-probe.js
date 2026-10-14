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

  // (14/10/2026) Chats con mensajes SIN LEER, para que entren al CRM sin
  // abrirlos (abrirlos los marcaría leídos en el teléfono). Solo personas:
  // grupos, difusiones y estados fuera. SOLO LECTURA de la lista interna.
  const coleccionDeChats = () => {
    const intentos = [
      () => window.require?.('WAWebChatCollection')?.ChatCollection,
      () => window.require?.('WAWebCollections')?.Chat,
      () => window.Store?.Chat,
    ];
    for (const f of intentos) {
      try {
        const c = f();
        if (c && (c.getModelsArray || c.models)) return c;
      } catch { /* siguiente */ }
    }
    return null;
  };
  const textoDe = (m) => {
    if (!m) return '';
    const tipo = m.type || m.__x_type;
    if (tipo === 'chat') return String(m.body || m.__x_body || '').slice(0, 180);
    const nombres = { image: '[Foto]', video: '[Video]', ptt: '[Nota de voz]', audio: '[Audio]',
      document: '[Documento]', sticker: '[Sticker]', location: '[Ubicación]', vcard: '[Contacto]' };
    return nombres[tipo] || (m.caption ? String(m.caption).slice(0, 180) : '[Mensaje]');
  };
  const leerSinLeer = () => {
    const col = coleccionDeChats();
    if (!col) return null;
    let lista = [];
    try { lista = col.getModelsArray ? col.getModelsArray() : (col.models || []); } catch { return null; }
    const out = [];
    for (const c of lista) {
      try {
        const unread = Number(c.unreadCount ?? c.__x_unreadCount ?? 0);
        if (!(unread > 0)) continue;
        const jid = c.id?._serialized || '';
        if (!jid || /@(g\.us|broadcast|newsletter)$/i.test(jid) || c.isGroup) continue;
        const ultimo = (() => { try { const a = c.msgs?.getModelsArray?.() || []; return a[a.length - 1]; } catch { return null; } })();
        // Solo si lo último lo escribió el cliente (no un mensaje nuestro).
        if (ultimo && (ultimo.id?.fromMe || ultimo.__x_id?.fromMe)) continue;
        out.push({
          jid,
          pn: c.contact?.phoneNumber?._serialized || null,
          nombre: c.formattedTitle || c.name || c.contact?.name || c.contact?.pushname || '',
          cantidad: unread,
          preview: textoDe(ultimo),
          t: Number(c.t || c.__x_t || 0) || null,
        });
        if (out.length >= 30) break;
      } catch { /* chat raro: se salta */ }
    }
    return out;
  };
  window.setInterval(() => {
    const chats = leerSinLeer();
    if (!chats) return;
    try { window.postMessage({ source: 'motoflow-omni', type: 'unread-chats', chats }, '*'); } catch { /* nada */ }
  }, 30000);

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
