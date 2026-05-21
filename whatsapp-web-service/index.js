// ============================================================
// Canal MANUAL del WhatsApp CRM via WhatsApp Web (Baileys) — SERVIDOR
// ------------------------------------------------------------
// Expone una pequena API para que el CRM (frontend) controle todo desde
// la pantalla: pedir el QR, ver el estado de conexion y enviar mensajes.
// Los mensajes entrantes/salientes se guardan en crm_whatsapp_* para que
// aparezcan en el inbox del CRM.
//
// Endpoints:
//   GET  /status   -> { connected, qr }   (qr = imagen dataURL o null)
//   POST /connect  -> inicia/reinicia la sesion (genera QR)
//   POST /logout   -> cierra la sesion de WhatsApp
//   POST /send     -> { to, text }  envia un mensaje y lo guarda como 'agent'
//
// NOTA: WhatsApp Web no es la API oficial de Meta. Uso para chat manual.
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = process.env.TENANT_ID;
const PORT = process.env.PORT || 3899;

if (!SUPABASE_URL || !SERVICE_KEY || !TENANT_ID) {
  console.error('\n❌ Faltan datos en el archivo .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID)\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Estado global de la conexion ──
let sock = null;
let currentQR = null;     // imagen dataURL del QR (o null si no hay)
let connected = false;
let starting = false;

// ── Guardar mensaje ENTRANTE (del cliente) ──
async function guardarEntrante(phone, name, text, waId) {
  const { data: contact, error: cErr } = await supabase
    .from('crm_whatsapp_contacts')
    .upsert({ tenant_id: TENANT_ID, phone, wa_id: phone, name, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,phone' })
    .select('*').single();
  if (cErr) return console.error('   ⚠️ contacto:', cErr.message);

  const { data: conv, error: vErr } = await supabase
    .from('crm_whatsapp_conversations')
    .upsert({ tenant_id: TENANT_ID, contact_id: contact.id, last_user_message_at: new Date().toISOString() }, { onConflict: 'tenant_id,contact_id' })
    .select('*').single();
  if (vErr) return console.error('   ⚠️ conversacion:', vErr.message);

  const { error: mErr } = await supabase.from('crm_whatsapp_messages').insert({
    tenant_id: TENANT_ID, conversation_id: conv.id, contact_id: contact.id,
    role: 'user', content: text, whatsapp_message_id: waId, status: 'received',
    metadata: { channel: 'whatsapp_web' },
  });
  if (mErr) return console.error('   ⚠️ mensaje:', mErr.message);
  console.log(`   💾 Entrante guardado en el CRM ✅`);
}

// ── Guardar mensaje SALIENTE (respuesta del vendedor) ──
async function guardarSaliente(phone, text, waId) {
  const { data: contact } = await supabase
    .from('crm_whatsapp_contacts').select('id')
    .eq('tenant_id', TENANT_ID).eq('phone', phone).maybeSingle();
  if (!contact) return;
  const { data: conv } = await supabase
    .from('crm_whatsapp_conversations').select('id')
    .eq('tenant_id', TENANT_ID).eq('contact_id', contact.id).maybeSingle();
  if (!conv) return;
  await supabase.from('crm_whatsapp_messages').insert({
    tenant_id: TENANT_ID, conversation_id: conv.id, contact_id: contact.id,
    role: 'agent', content: text, whatsapp_message_id: waId, status: 'sent',
    metadata: { channel: 'whatsapp_web' },
  });
}

// ── Iniciar / reiniciar la sesion de WhatsApp ──
async function startSock() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version, auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['MotoFlow CRM', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        currentQR = await QRCode.toDataURL(qr);
        connected = false;
        console.log('📱 QR generado — escanealo desde el CRM.');
      }
      if (connection === 'open') {
        connected = true; currentQR = null;
        console.log('✅ WhatsApp conectado.');
      }
      if (connection === 'close') {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          currentQR = null; sock = null;
          console.log('🔌 Sesion cerrada (logout).');
        } else {
          console.log(`↻ Conexion cerrada (${code}). Reconectando...`);
          starting = false;
          startSock();
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (m.key.fromMe) continue;
        const jid = m.key.remoteJid || '';
        if (!jid.endsWith('@s.whatsapp.net')) continue;
        const phone = jid.split('@')[0];
        const name = m.pushName || phone;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        if (!text.trim()) continue;
        console.log(`📩 ${name} (${phone}): ${text}`);
        await guardarEntrante(phone, name, text.trim(), m.key.id);
      }
    });
  } finally {
    starting = false;
  }
}

// ── API HTTP para el CRM ──
const app = express();
app.use(cors());
app.use(express.json());

app.get('/status', (req, res) => res.json({ connected, qr: currentQR }));

app.post('/connect', async (req, res) => {
  if (!sock && !connected) await startSock();
  res.json({ ok: true });
});

app.post('/logout', async (req, res) => {
  try { await sock?.logout(); } catch (_) {}
  connected = false; currentQR = null; sock = null;
  res.json({ ok: true });
});

app.post('/send', async (req, res) => {
  const { to, text } = req.body || {};
  if (!connected || !sock) return res.status(400).json({ error: 'WhatsApp no conectado' });
  if (!to || !text) return res.status(400).json({ error: 'Faltan datos (to, text)' });
  try {
    const phone = String(to).replace(/\D/g, '');
    const jid = phone + '@s.whatsapp.net';
    const sent = await sock.sendMessage(jid, { text: String(text) });
    await guardarSaliente(phone, String(text), sent?.key?.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor del canal WhatsApp Web en http://localhost:${PORT}`);
  console.log('   El CRM se conecta aqui para pedir el QR y enviar mensajes.');
  console.log('   (Deja esta ventana abierta.)\n');
});

// Arranca la sesion al iniciar (reusa la sesion guardada si ya escaneaste).
startSock();
