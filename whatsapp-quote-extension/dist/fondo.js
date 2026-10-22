// ════════════════════════════════════════════════════════════════════════
//  FONDO de la extensión (21/10/2026)
//
//  Recibe "abre el chat de este cliente" desde MotoFlow (motoflow-puente.js)
//  y lo lleva a WhatsApp Web:
//    · Pregunta a CADA pestaña de WhatsApp si su panel está vivo y con
//      WhatsApp cargado; la primera que dice que sí se trae al frente y abre
//      el chat ahí mismo, SIN recargar. (Con dos pestañas de WhatsApp, una
//      queda en "usar aquí": esa contesta que no y se salta.)
//    · Si ninguna contesta: deja el pedido guardado y abre/recarga WhatsApp;
//      el panel lo atiende en cuanto carga.
// ════════════════════════════════════════════════════════════════════════
const CLAVE_PEDIDO = 'motoflow_abrir_chat';
const PAGINAS_MOTOFLOW = [
  'https://motoflow.pages.dev/*', 'https://*.motoflow.pages.dev/*',
  'https://repuestos-morla.pages.dev/*', 'https://*.repuestos-morla.pages.dev/*',
  'http://localhost:5173/*',
];

const preguntar = (tabId, msg) => new Promise((resolve) => {
  try {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(r || null);
    });
  } catch { resolve(null); }
});

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'abrir-chat') return undefined;
  (async () => {
    const pedido = { phone: msg.phone || null, nombre: msg.nombre || null,
      conversationId: msg.conversationId || null, canal: msg.canal || null, at: Date.now() };
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    tabs.sort((a, b) => Number(b.active) - Number(a.active));

    for (const tab of tabs) {
      const r = await preguntar(tab.id, { tipo: 'motoflow-abrir-chat', ...pedido });
      if (r?.ok) {
        await chrome.tabs.update(tab.id, { active: true });
        try { await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* sin ventana */ }
        responder({ ok: true, como: 'pestana_abierta' });
        return;
      }
    }

    // Ningún panel vivo: se guarda el pedido y WhatsApp lo atiende al cargar.
    await chrome.storage.local.set({ [CLAVE_PEDIDO]: pedido });
    const tab = tabs[0];
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* sin ventana */ }
      await chrome.tabs.reload(tab.id);
    } else {
      await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    }
    responder({ ok: true, como: tab ? 'recargada' : 'nueva' });
  })().catch((e) => responder({ ok: false, error: String(e?.message || e) }));
  return true;
});

// Chrome no mete los content scripts en las pestañas que ya estaban abiertas
// al instalar o actualizar la extensión: sin esto, MotoFlow abierto de antes
// no ve el puente y usa el enlace que recarga WhatsApp.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({ url: PAGINAS_MOTOFLOW });
    for (const t of tabs) {
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['motoflow-puente.js'] }).catch(() => {});
    }
  } catch { /* sin permiso: queda el F5 */ }
});
