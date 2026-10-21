// ════════════════════════════════════════════════════════════════════════
//  FONDO de la extensión (21/10/2026)
//
//  Recibe "abre el chat de este cliente" desde MotoFlow (motoflow-puente.js)
//  y lo lleva a WhatsApp Web:
//    · Si ya hay una pestaña de WhatsApp abierta: la trae al frente y le pide
//      al panel que abra el chat ahí mismo, SIN recargar.
//    · Si no hay ninguna (o su panel no contesta porque la extensión se
//      actualizó después de abrirla): deja el pedido guardado y abre/recarga
//      WhatsApp; el panel lo atiende en cuanto carga.
// ════════════════════════════════════════════════════════════════════════
const CLAVE_PEDIDO = 'motoflow_abrir_chat';

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'abrir-chat') return undefined;
  (async () => {
    const pedido = { phone: msg.phone || null, nombre: msg.nombre || null, at: Date.now() };
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    const tab = tabs.find((t) => t.active) || tabs[0];

    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* sin ventana */ }
      try {
        await chrome.tabs.sendMessage(tab.id, { tipo: 'motoflow-abrir-chat', ...pedido });
        responder({ ok: true, como: 'pestana_abierta' });
        return;
      } catch {
        // El panel de esa pestaña no contesta (la abrieron antes de
        // actualizar la extensión): se recarga una vez y atiende el pedido.
      }
    }

    await chrome.storage.local.set({ [CLAVE_PEDIDO]: pedido });
    if (tab) await chrome.tabs.reload(tab.id);
    else await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    responder({ ok: true, como: tab ? 'recargada' : 'nueva' });
  })().catch((e) => responder({ ok: false, error: String(e?.message || e) }));
  return true;
});
