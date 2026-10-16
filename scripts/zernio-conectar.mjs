// ============================================================
// ZERNIO → CRM: registrar el webhook y traer las conversaciones viejas
// ============================================================
// (16/10/2026) Una sola vez (o cuando se reconecte una cuenta):
//   node scripts/zernio-conectar.mjs            registra el webhook y trae el historial
//   node scripts/zernio-conectar.mjs --solo-webhook
// El webhook va LIMITADO a las cuentas de public.zernio_cuentas (un webhook
// sin ese límite recibe los mensajes de todas las cuentas de la llave). El
// historial se manda a la misma función zernio-webhook, firmado: entra por
// el mismo camino que un mensaje nuevo y no se duplica (mismo id de mensaje).
// Llave y secreto: del .env de Hermes (ver scripts/zernio-secretos.mjs).
// ============================================================
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const ENV = 'C:/Users/PC/AppData/Local/hermes/.env';
const URL_WEBHOOK = 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/zernio-webhook';
const NOMBRE = 'MotoFlow CRM';
// Las cuentas que entran al CRM (las mismas de sql/zernio_cuentas.sql).
const CUENTAS = { '6a52c8413ecd8aa344bc4bb4': 'facebook', '6a52c05e3ecd8aa344baf81a': 'instagram' };

const leer = (n) => {
  for (const l of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = l.match(new RegExp(`^\\s*${n}\\s*=\\s*"?([^"\\s]+)"?`));
    if (m) return m[1];
  }
  return null;
};
const KEY = leer('ZERNIO_API_KEY');
const SECRETO = leer('ZERNIO_WEBHOOK_SECRET');
if (!KEY || !SECRETO) { console.error('Falta ZERNIO_API_KEY o ZERNIO_WEBHOOK_SECRET en el .env de Hermes'); process.exit(1); }

const api = async (ruta, { method = 'GET', body } = {}) => {
  const r = await fetch(`https://zernio.com/api/v1${ruta}`, {
    method, headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
};

// 1. El webhook
const lista = await api('/webhooks/settings');
const existentes = lista.j?.webhooks || lista.j?.data || [];
const mio = existentes.find((w) => w.url === URL_WEBHOOK || w.name === NOMBRE);
const config = {
  name: NOMBRE, url: URL_WEBHOOK, secret: SECRETO,
  events: ['message.received', 'message.sent'],
  accountIds: Object.keys(CUENTAS), isActive: true,
};
const w = mio
  ? await api('/webhooks/settings', { method: 'PUT', body: { ...config, _id: mio._id || mio.id, id: mio._id || mio.id } })
  : await api('/webhooks/settings', { method: 'POST', body: config });
console.log(`Webhook ${mio ? 'actualizado' : 'creado'}: HTTP ${w.status}${w.ok ? '' : ` ${JSON.stringify(w.j).slice(0, 300)}`}`);
if (process.argv.includes('--solo-webhook')) process.exit(0);

// 2. El historial, por el mismo webhook (firmado como lo firma Zernio)
const firmar = (cuerpo) => createHmac('sha256', SECRETO).update(cuerpo).digest('hex');
let enviados = 0, fallos = 0;
for (const [accountId, platform] of Object.entries(CUENTAS)) {
  const cuentas = await api('/accounts');
  const acc = (cuentas.j?.accounts || []).find((a) => a._id === accountId);
  if (!acc) { console.log(`· ${platform}: la cuenta no está en Zernio`); continue; }
  if (acc.isActive === false) { console.log(`· ${platform}: DESCONECTADA en Zernio (reconéctala y vuelve a correr esto)`); continue; }
  const convs = await api(`/inbox/conversations?accountId=${accountId}&limit=100`);
  const lista = convs.j?.data || [];
  console.log(`· ${platform}: ${lista.length} conversaciones`);
  for (const c of lista) {
    const msgs = await api(`/inbox/conversations/${encodeURIComponent(c.id)}/messages?accountId=${accountId}&limit=100`);
    for (const m of msgs.j?.data || msgs.j?.messages || []) {
      const ev = {
        id: `historial-${randomUUID()}`,
        event: m.direction === 'outgoing' ? 'message.sent' : 'message.received',
        timestamp: new Date().toISOString(),
        message: { ...m, conversationId: c.id, platform },
        conversation: { id: c.id, platformConversationId: c.id, participantId: c.participantId, participantName: c.participantName, status: c.status },
        account: { id: accountId, platform, username: acc.username },
      };
      const cuerpo = JSON.stringify(ev);
      const r = await fetch(URL_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zernio-Signature': firmar(cuerpo) }, body: cuerpo });
      if (r.ok) enviados++; else { fallos++; console.log(`  fallo ${r.status}: ${(await r.text()).slice(0, 200)}`); }
    }
  }
}
console.log(`Historial: ${enviados} mensajes procesados, ${fallos} fallos`);
