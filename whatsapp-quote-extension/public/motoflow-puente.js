// ════════════════════════════════════════════════════════════════════════
//  PUENTE MotoFlow → extensión (21/10/2026)
//
//  Corre en las páginas de MotoFlow. Sirve para que un botón de MotoFlow
//  ("WhatsApp", "Abrir chat" del IA CEO) abra el chat del cliente en la
//  pestaña de WhatsApp Web que YA está abierta, sin recargarla, igual que
//  Gestión de cobro dentro del panel. El enlace de siempre (wa.me /
//  web.whatsapp.com/send) carga WhatsApp desde cero.
//
//  1) Marca la página (data-motoflow-omni).
//  2) Recibe el pedido de MotoFlow, CONFIRMA que lo recibió (MotoFlow espera
//     esa confirmación; sin ella usa el enlace de siempre) y lo pasa al
//     fondo de la extensión (fondo.js).
//
//  fondo.js también lo inyecta en las pestañas de MotoFlow que ya estaban
//  abiertas al instalar/actualizar: de ahí la guarda contra doble carga.
// ════════════════════════════════════════════════════════════════════════
(() => {
  if (window.__motoflowPuente) return;
  window.__motoflowPuente = true;

  try {
    document.documentElement.dataset.motoflowOmni = chrome.runtime.getManifest().version;
  } catch { /* extensión recargada: esta pestaña ya no tiene contexto */ }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.tipo !== 'motoflow-omni-abrir-chat') return;
    try {
      chrome.runtime.sendMessage({
        tipo: 'abrir-chat',
        phone: d.phone ? String(d.phone).replace(/\D/g, '') : null,
        nombre: d.nombre ? String(d.nombre).slice(0, 120) : null,
        // (22/10/2026) Instagram/Facebook: se abre ESA conversación en la
        // bandeja del panel (no hay chat de WhatsApp que buscar).
        conversationId: d.conversationId ? String(d.conversationId).slice(0, 64) : null,
        canal: d.canal ? String(d.canal).slice(0, 20) : null,
      });
      window.postMessage({ tipo: 'motoflow-omni-recibido', id: d.id || null }, window.location.origin);
    } catch {
      // La extensión se actualizó y esta pestaña quedó huérfana: sin
      // confirmación, MotoFlow abre el enlace de siempre.
      delete document.documentElement.dataset.motoflowOmni;
    }
  });
})();
