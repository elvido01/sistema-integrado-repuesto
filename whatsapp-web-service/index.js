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
//   POST /send-image -> { to, imageBase64, mime, caption } envia una imagen
//
// NOTA: WhatsApp Web no es la API oficial de Meta. Uso para chat manual.
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
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

const MEDIA_BUCKET = 'whatsapp-media';

// Asegura que exista el bucket de archivos (publico, para mostrarlos en el CRM).
async function ensureBucket() {
  try {
    const { data } = await supabase.storage.getBucket(MEDIA_BUCKET);
    if (!data) await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
  } catch (_) {
    try { await supabase.storage.createBucket(MEDIA_BUCKET, { public: true }); } catch (_) {}
  }
}

// Descarga un archivo (foto/audio/video/doc) de WhatsApp y lo sube al storage.
// Devuelve la URL publica o null si falla.
async function uploadMediaBuffer(buffer, mime, prefix = 'media') {
  const ext = (mime && mime.split('/')[1] ? mime.split('/')[1].split(';')[0] : 'bin');
  const path = `${TENANT_ID}/${Date.now()}_${prefix}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: true });
  if (error) { console.error('   Error subiendo media:', error.message); return null; }
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function subirMedia(m, mime) {
  try {
    const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
    const ext = (mime && mime.split('/')[1] ? mime.split('/')[1].split(';')[0] : 'bin');
    const path = `${TENANT_ID}/${Date.now()}_${(m.key?.id || 'x')}.${ext}`;
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) { console.error('   ⚠️ subir media:', error.message); return null; }
    return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error('   ⚠️ descargar media:', e.message); return null; }
}

// ── Estado global de la conexion ──
async function getContactJid(to) {
  const normalizedTo = normalizeContactPhone(to);
  const normalizedLocal = localPhoneKey(normalizedTo);
  const { data: contact } = await supabase.from('crm_whatsapp_contacts')
    .select('phone, wa_id').eq('tenant_id', TENANT_ID).eq('phone', normalizedTo).maybeSingle();
  if (contact?.wa_id && contact.wa_id.includes('@')) return contact.wa_id;
  if (normalizedLocal) {
    const { data: candidates } = await supabase.from('crm_whatsapp_contacts')
      .select('phone, wa_id')
      .eq('tenant_id', TENANT_ID)
      .limit(5000);
    const matched = (candidates || []).find(row => localPhoneKey(row.phone) === normalizedLocal);
    if (matched?.wa_id && matched.wa_id.includes('@')) return matched.wa_id;
  }
  return normalizedTo + '@s.whatsapp.net';
}

function jidUser(jid) {
  return String(jid || '').split('@')[0] || '';
}

function phoneFromJid(jid) {
  if (!jid || String(jid).endsWith('@lid')) return '';
  return jidUser(jid).replace(/\D/g, '');
}

function phoneFromAny(value) {
  return String(value || '').split('@')[0].replace(/\D/g, '');
}

function normalizeContactPhone(value) {
  const digits = phoneFromAny(value);
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

function localPhoneKey(value) {
  const digits = phoneFromAny(value);
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

// ── Resolver nombre del cliente desde la plataforma (tabla clientes) ──
// El negocio ya tiene a sus clientes grabados con nombres reales. Damos
// prioridad a ese nombre sobre el pushName de WhatsApp (que suele ser un
// apodo, un emoji o el numero). Igual que WhatsApp Web muestra el nombre
// de tu agenda en vez del que el otro puso en su perfil.
// Cache de 5 min para no golpear la DB en cada mensaje entrante.
let _clientesCache = { at: 0, byPhone: new Map() };
const CLIENTES_TTL_MS = 5 * 60 * 1000;

async function getClientesPhoneMap() {
  const now = Date.now();
  if (_clientesCache.byPhone.size && now - _clientesCache.at < CLIENTES_TTL_MS) {
    return _clientesCache.byPhone;
  }
  const byPhone = new Map();
  const { data, error } = await supabase
    .from('clientes')
    .select('nombre, telefono')
    .eq('tenant_id', TENANT_ID)
    .not('telefono', 'is', null);
  if (error) { console.error('   ⚠️ cargar clientes:', error.message); return _clientesCache.byPhone; }
  for (const c of data || []) {
    const key = localPhoneKey(c.telefono);
    const nombre = String(c.nombre || '').trim();
    if (key && nombre && !/^\d+$/.test(nombre) && !byPhone.has(key)) byPhone.set(key, nombre);
  }
  _clientesCache = { at: now, byPhone };
  return byPhone;
}

async function getNombreCliente(normalizedLocal) {
  if (!normalizedLocal) return null;
  const map = await getClientesPhoneMap();
  return map.get(normalizedLocal) || null;
}

function getContactPhoneFromMessage(m, remoteJid, fromMe) {
  const key = m.key || {};
  const candidates = fromMe
    ? [phoneFromJid(remoteJid), key.participantPn, key.senderPn, key.participant]
    : [key.senderPn, key.participantPn, phoneFromJid(remoteJid), key.participant];
  return candidates.map(normalizeContactPhone).find(Boolean) || jidUser(remoteJid);
}

let sock = null;
let currentQR = null;     // imagen dataURL del QR (o null si no hay)
let connected = false;
let starting = false;

// ── Guardar mensaje ENTRANTE (del cliente) ──
function getMessageText(msg) {
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || msg.documentMessage?.fileName
    || '';
}

async function extractMessageContent(m) {
  const msg = m.message || {};
  let text = getMessageText(msg);
  let mediaUrl = null;
  let mediaType = null;

  if (msg.imageMessage) { mediaType = 'image'; mediaUrl = await subirMedia(m, msg.imageMessage.mimetype); }
  else if (msg.audioMessage) { mediaType = 'audio'; mediaUrl = await subirMedia(m, msg.audioMessage.mimetype || 'audio/ogg'); }
  else if (msg.videoMessage) { mediaType = 'video'; mediaUrl = await subirMedia(m, msg.videoMessage.mimetype); }
  else if (msg.documentMessage) { mediaType = 'document'; mediaUrl = await subirMedia(m, msg.documentMessage.mimetype); }
  else if (msg.stickerMessage) { mediaType = 'sticker'; mediaUrl = await subirMedia(m, msg.stickerMessage.mimetype || 'image/webp'); }

  const etiqueta = { audio: '[Nota de voz]', image: '[Imagen]', video: '[Video]', document: '[Documento]', sticker: '[Sticker]' };
  return { content: text.trim() || etiqueta[mediaType] || '', mediaUrl, mediaType };
}

async function guardarMensajeWhatsApp({ phone, name, text, waId, remoteJid, fromMe = false, source = null, mediaUrl = null, mediaType = null, status = null, extraMetadata = {} }) {
  const normalizedPhone = normalizeContactPhone(phone);
  const normalizedLocal = localPhoneKey(normalizedPhone);
  let existingContact = null;

  if (normalizedLocal) {
    const { data: contactCandidates } = await supabase
      .from('crm_whatsapp_contacts')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .limit(5000);
    existingContact = (contactCandidates || []).find(contact => localPhoneKey(contact.phone) === normalizedLocal) || null;
  }

  const phoneForContact = existingContact?.phone || normalizedPhone || phone;
  // Prioridad del nombre que se muestra en el CRM:
  //   1. Cliente grabado en la plataforma (tabla clientes) — match por telefono
  //   2. Nombre real ya guardado en el contacto (si no es solo digitos)
  //   3. pushName de WhatsApp (lo que el cliente puso en su perfil)
  //   4. El numero
  const nombreCliente = await getNombreCliente(normalizedLocal);
  const existingNameIsReal = existingContact?.name && !/^\d+$/.test(String(existingContact.name));
  const contactName = nombreCliente
    || (existingNameIsReal ? existingContact.name : null)
    || name;

  const { data: contact, error: cErr } = await supabase
    .from('crm_whatsapp_contacts')
    .upsert({
      tenant_id: TENANT_ID,
      phone: phoneForContact,
      wa_id: remoteJid || existingContact?.wa_id || phoneForContact,
      name: contactName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone' })
    .select('*').single();
  if (cErr) return console.error('   ⚠️ contacto:', cErr.message);

  const { data: conv, error: vErr } = await supabase
    .from('crm_whatsapp_conversations')
    .upsert({
      tenant_id: TENANT_ID,
      contact_id: contact.id,
      ...(fromMe ? { last_assistant_message_at: new Date().toISOString() } : { last_user_message_at: new Date().toISOString() }),
    }, { onConflict: 'tenant_id,contact_id' })
    .select('*').single();
  if (vErr) return console.error('   ⚠️ conversacion:', vErr.message);

  const role = fromMe ? 'agent' : 'user';
  const messageStatus = status || (fromMe ? 'sent' : 'received');
  const messageSource = source || (fromMe ? 'mobile_or_whatsapp' : 'customer');
  const payload = {
    tenant_id: TENANT_ID, conversation_id: conv.id, contact_id: contact.id,
    role, content: text, whatsapp_message_id: waId, status: messageStatus,
    metadata: {
      channel: 'whatsapp_web',
      source: messageSource,
      from_me: fromMe,
      remote_jid: remoteJid,
      media_url: mediaUrl,
      media_type: mediaType,
      ...extraMetadata,
    },
  };

  const upsertOptions = {
    onConflict: 'tenant_id,whatsapp_message_id',
    ...(messageSource === 'web_crm' ? {} : { ignoreDuplicates: true }),
  };
  const { error: mErr } = waId
    ? await supabase.from('crm_whatsapp_messages').upsert(payload, upsertOptions)
    : await supabase.from('crm_whatsapp_messages').insert(payload);
  if (mErr) return console.error('   ⚠️ mensaje:', mErr.message);
  console.log(`   💾 ${fromMe ? 'Saliente' : 'Entrante'} guardado en el CRM ✅`);
}

// ── Guardar mensaje SALIENTE (respuesta del vendedor) ──
async function guardarSaliente(phone, text, waId, mediaUrl = null, mediaType = null, extraMetadata = {}) {
  const normalizedPhone = normalizeContactPhone(phone);
  const jid = await getContactJid(normalizedPhone);
  await guardarMensajeWhatsApp({
    phone: normalizedPhone,
    name: normalizedPhone,
    text,
    waId,
    remoteJid: jid,
    fromMe: true,
    source: 'web_crm',
    mediaUrl,
    mediaType,
    status: 'sent',
    extraMetadata,
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
      for (const m of messages) {
        const jid = m.key?.remoteJid || '';
        // Solo chats individuales: numeros (@s.whatsapp.net) y el nuevo LID (@lid).
        // Ignorar estados (status@broadcast) y grupos (@g.us).
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) continue;
        if (!m.message) continue;
        const fromMe = m.key?.fromMe === true;
        const phone = getContactPhoneFromMessage(m, jid, fromMe);
        const name = m.pushName || phone;
        const msg = m.message || {};

        let text = msg.conversation || msg.extendedTextMessage?.text || '';
        let mediaUrl = null, mediaType = null;

        // Detectar y descargar multimedia (foto, audio/nota de voz, video, doc, sticker)
        if (msg.imageMessage) { mediaType = 'image'; text = text || msg.imageMessage.caption || ''; mediaUrl = await subirMedia(m, msg.imageMessage.mimetype); }
        else if (msg.audioMessage) { mediaType = 'audio'; mediaUrl = await subirMedia(m, msg.audioMessage.mimetype || 'audio/ogg'); }
        else if (msg.videoMessage) { mediaType = 'video'; text = text || msg.videoMessage.caption || ''; mediaUrl = await subirMedia(m, msg.videoMessage.mimetype); }
        else if (msg.documentMessage) { mediaType = 'document'; text = text || msg.documentMessage.fileName || ''; mediaUrl = await subirMedia(m, msg.documentMessage.mimetype); }
        else if (msg.stickerMessage) { mediaType = 'sticker'; mediaUrl = await subirMedia(m, msg.stickerMessage.mimetype || 'image/webp'); }

        if (!text.trim() && !mediaUrl) continue;

        const etiqueta = { audio: '[Nota de voz]', image: '[Imagen]', video: '[Video]', document: '[Documento]', sticker: '[Sticker]' };
        const contenido = text.trim() || etiqueta[mediaType] || '';

        console.log(`📩 ${name} (${phone}): ${contenido}${mediaUrl ? ' [+media]' : ''}`);
        await guardarMensajeWhatsApp({
          phone,
          name,
          text: contenido,
          waId: m.key.id,
          remoteJid: jid,
          fromMe,
          source: fromMe ? 'mobile_or_whatsapp' : 'customer',
          mediaUrl,
          mediaType,
          status: fromMe ? 'sent' : 'received',
          extraMetadata: {
            sender_pn: m.key?.senderPn || null,
            participant_pn: m.key?.participantPn || null,
            sender_lid: m.key?.senderLid || null,
            participant_lid: m.key?.participantLid || null,
          },
        });
      }
    });
  } finally {
    starting = false;
  }
}

// ── API HTTP para el CRM ──
const app = express();
// Permite que la web (https://tudominio) hable con este servicio en localhost.
// El header de "Private Network Access" evita que Chrome bloquee web -> localhost.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado pesada para enviarla. Reduce el tamano o calidad.' });
  }
  if (err) return res.status(400).json({ error: err.message || 'Solicitud invalida.' });
  return next();
});

app.get('/status', (req, res) => res.json({ connected, qr: currentQR }));
app.get('/capabilities', (req, res) => res.json({
  ok: true,
  features: ['status', 'connect', 'logout', 'send', 'send-audio', 'send-image'],
}));

app.post('/connect', async (req, res) => {
  if (!sock && !connected) await startSock();
  res.json({ ok: true });
});

app.post('/logout', async (req, res) => {
  try { await sock?.logout(); } catch (_) {}
  try { sock?.end?.(undefined); } catch (_) {}
  sock = null; connected = false; currentQR = null;
  // Borrar credenciales para poder re-vincular con un QR limpio.
  try { require('fs').rmSync(require('path').join(__dirname, 'auth_session'), { recursive: true, force: true }); } catch (_) {}
  // Reiniciar la sesion para generar un QR nuevo.
  starting = false;
  startSock();
  res.json({ ok: true });
});

app.post('/send', async (req, res) => {
  const { to, text } = req.body || {};
  if (!connected || !sock) return res.status(400).json({ error: 'WhatsApp no conectado' });
  if (!to || !text) return res.status(400).json({ error: 'Faltan datos (to, text)' });
  try {
    const jid = await getContactJid(to);
    const sent = await sock.sendMessage(jid, { text: String(text) });
    await guardarSaliente(String(to), String(text), sent?.key?.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/send-audio', async (req, res) => {
  const { to, audioBase64, mime } = req.body || {};
  if (!connected || !sock) return res.status(400).json({ error: 'WhatsApp no conectado' });
  if (!to || !audioBase64) return res.status(400).json({ error: 'Faltan datos (to, audioBase64)' });
  try {
    const clean = String(audioBase64).replace(/^data:audio\/[^;]+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const mimetype = mime || 'audio/webm';
    const jid = await getContactJid(to);
    const sent = await sock.sendMessage(jid, { audio: buffer, mimetype, ptt: true });
    const mediaUrl = await uploadMediaBuffer(buffer, mimetype, sent?.key?.id || 'audio');
    await guardarSaliente(String(to), '[Nota de voz]', sent?.key?.id, mediaUrl, 'audio');
    res.json({ ok: true, media_url: mediaUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/send-image', async (req, res) => {
  const { to, imageBase64, mime, caption, metadata } = req.body || {};
  if (!connected || !sock) return res.status(400).json({ error: 'WhatsApp no conectado' });
  if (!to || !imageBase64) return res.status(400).json({ error: 'Faltan datos (to, imageBase64)' });
  try {
    const clean = String(imageBase64).replace(/^data:image\/[^;]+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const mimetype = mime || 'image/jpeg';
    const jid = await getContactJid(to);
    const sent = await sock.sendMessage(jid, {
      image: buffer,
      mimetype,
      caption: caption ? String(caption) : undefined,
    });
    const mediaUrl = await uploadMediaBuffer(buffer, mimetype, sent?.key?.id || 'cotizacion');
    await guardarSaliente(String(to), caption || '[Cotizacion]', sent?.key?.id, mediaUrl, 'image', metadata && typeof metadata === 'object' ? metadata : {});
    res.json({ ok: true, media_url: mediaUrl, message_id: sent?.key?.id });
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
ensureBucket();
startSock();
