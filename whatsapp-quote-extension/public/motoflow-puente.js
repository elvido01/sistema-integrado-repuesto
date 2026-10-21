// ════════════════════════════════════════════════════════════════════════
//  PUENTE MotoFlow → extensión (21/10/2026)
//
//  Corre en las páginas de MotoFlow. Sirve para que un botón de MotoFlow
//  ("WhatsApp", "Abrir chat" del IA CEO) abra el chat del cliente en la
//  pestaña de WhatsApp Web que YA está abierta, sin recargarla: antes iba a
//  wa.me / web.whatsapp.com/send, que carga WhatsApp desde cero.
//
//  1) Marca la página (data-motoflow-omni) para que MotoFlow sepa, sin
//     esperar, que la extensión está instalada. Sin la marca, MotoFlow sigue
//     abriendo el enlace de siempre.
//  2) Pasa el pedido al fondo de la extensión (fondo.js), que trae al frente
//     la pestaña de WhatsApp y le dice qué chat abrir.
// ════════════════════════════════════════════════════════════════════════
(() => {
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
      });
    } catch {
      // La extensión se actualizó y esta pestaña quedó huérfana: se quita la
      // marca para que el próximo clic use el enlace de siempre (o F5).
      delete document.documentElement.dataset.motoflowOmni;
    }
  });
})();
