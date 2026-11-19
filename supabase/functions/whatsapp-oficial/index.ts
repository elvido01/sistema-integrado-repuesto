// ============================================================
// whatsapp-oficial — webhook de WhatsApp oficial (Cloud API + coexistencia)
// ============================================================
// (19/11/2026) Paso 1 del CRM vendible: cada empresa conecta su número una
// vez con el registro integrado de Meta (whatsapp-conectar) y desde ahí Meta
// avisa aquí cada mensaje. Se guarda en sales_conversations / sales_messages,
// lo mismo que el espejo y Zernio, así clasificador, casos, seguimientos y
// Hermes funcionan sin cambios.
//
// Qué llega (lector puro: _shared/whatsappCloud.mjs, probado con los
// ejemplos de Meta en tests/whatsappCloud.test.js):
//   messages            → cliente escribe (entrante) + estados de lo enviado
//   smb_message_echoes  → la tienda contesta desde la APP del teléfono
//   history             → 6 meses de chats, una vez al conectar (sin avisos)
//   smb_app_state_sync  → contactos: solo pone nombre a conversaciones sin nombre
//   account_update      → desconexión / reconexión → whatsapp_conexiones + campanita
//
// La empresa se ubica por phone_number_id (whatsapp_conexiones). Clave de la
// conversación: "whatsapp:<phone_number_id>:<número del cliente>". El número
// es real (no @lid como el espejo): customer_phone sirve para wa.me.
//
// Sin JWT (lo llama Meta). GET = verificación con WHATSAPP_OFICIAL_VERIFY_TOKEN.
// POST = firma X-Hub-Signature-256 (HMAC-SHA256 con WHATSAPP_OFICIAL_APP_SECRET,
// el secreto de la app "MotoFlow" de Meta). Sin secreto → 500, nunca abierto.
// Siempre 200 a Meta salvo error nuestro (500 = Meta reintenta, no se pierde).
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { eventosDelWebhook, estadoTrasEventoCuenta, avisoDesconexion } from '../_shared/whatsappCloud.mjs';

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') return verificar(req);
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const crudo = await req.text();

  const secreto = Deno.env.get('WHATSAPP_OFICIAL_APP_SECRET');
  if (!secreto) return new Response('sin secreto', { status: 500 });
  if (!(await firmaValida(crudo, req.headers.get('x-hub-signature-256') || '', secreto))) {
    return new Response('firma', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(crudo); } catch { return new Response('json', { status: 400 }); }

  try {
    const sb = servicio();
    const { audios, ...r } = await procesar(sb, eventosDelWebhook(payload));
    // Los audios se transcriben DESPUÉS de contestarle a Meta (que no espera
    // más de unos segundos). El texto llega con un UPDATE y la captura de
    // Hermes lo recoge (sql/whatsapp_oficial_aprende_y_apaga_espejo.sql).
    if (audios.length) {
      const tarea = transcribirAudios(sb, audios).catch((e) => console.warn('[whatsapp-oficial] audios', e?.message || e));
      try { EdgeRuntime.waitUntil(tarea); } catch { await tarea; }
    }
    return json({ ok: true, ...r, audios: audios.length });
  } catch (e) {
    console.error('[whatsapp-oficial]', e?.message || e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function verificar(req: Request) {
  const u = new URL(req.url);
  const esperado = Deno.env.get('WHATSAPP_OFICIAL_VERIFY_TOKEN');
  if (u.searchParams.get('hub.mode') === 'subscribe' && esperado && u.searchParams.get('hub.verify_token') === esperado) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

async function procesar(sb: any, eventos: any[]) {
  const conexiones = new Map<string, any>();   // phone_number_id → conexión (cache del POST)
  const conexionDe = async (pnid: string | null) => {
    if (!pnid) return null;
    if (!conexiones.has(pnid)) {
      const { data } = await sb.from('whatsapp_conexiones').select('id, tenant_id, estado')
        .eq('phone_number_id', pnid).maybeSingle();
      conexiones.set(pnid, data || null);
    }
    return conexiones.get(pnid);
  };
  const ahora = new Date().toISOString();
  let guardados = 0, ignorados = 0;
  const audios: { cx: any; ev: any }[] = [];   // notas de voz del cliente, para transcribir

  for (const ev of eventos) {
    if (ev.tipo === 'cuenta') { await eventoCuenta(sb, ev); continue; }
    const cx = await conexionDe(ev.phoneNumberId);
    if (!cx?.tenant_id) { ignorados++; console.warn('[whatsapp-oficial] número sin empresa', ev.phoneNumberId); continue; }

    if (ev.tipo === 'mensaje') {
      if (!ev.cliente || !ev.id) { ignorados++; continue; }
      await guardarMensaje(sb, cx, ev);
      guardados++;
      if (ev.entrante && ev.origen === 'cliente' && ev.clase === 'audio' && ev.mediaId) audios.push({ cx, ev });
      if (ev.origen !== 'historial') {
        await sb.from('whatsapp_conexiones').update({ ultimo_mensaje_at: ahora, ultimo_webhook_at: ahora }).eq('id', cx.id).select('id');
      }
    } else if (ev.tipo === 'estado') {
      // Lo que salió desde MotoFlow: entregado / leído / falló (el motivo del
      // fallo va al log: sales_messages no tiene columna de error).
      const est = ['sent', 'delivered', 'read', 'failed'].includes(ev.estado) ? ev.estado : null;
      if (est) {
        if (ev.error) console.warn('[whatsapp-oficial] no se entregó', ev.id, ev.error);
        await sb.from('sales_messages').update({ status: est })
          .eq('tenant_id', cx.tenant_id).eq('platform', 'whatsapp').eq('external_message_id', ev.id).select('id');
      }
    } else if (ev.tipo === 'historial_progreso') {
      if (ev.progreso != null) {
        await sb.from('whatsapp_conexiones').update({ historial_progreso: ev.progreso, ultimo_webhook_at: ahora }).eq('id', cx.id).select('id');
      }
    } else if (ev.tipo === 'historial_rechazado') {
      await sb.from('whatsapp_conexiones').update({ historial_rechazado: true, ultimo_webhook_at: ahora }).eq('id', cx.id).select('id');
    } else if (ev.tipo === 'contacto') {
      // Solo pone el nombre de la agenda a una conversación que no tiene nombre (o es un número).
      if (ev.accion === 'add' && ev.nombre && ev.numero) {
        const clave = `whatsapp:${ev.phoneNumberId}:${ev.numero}`;
        const { data: c } = await sb.from('sales_conversations').select('id, customer_name')
          .eq('tenant_id', cx.tenant_id).eq('platform', 'whatsapp').eq('external_conversation_id', clave).maybeSingle();
        if (c && (!c.customer_name || /^\+?\d+$/.test(c.customer_name))) {
          await sb.from('sales_conversations').update({ customer_name: ev.nombre }).eq('id', c.id).select('id');
        }
      }
    }
  }
  return { eventos: eventos.length, guardados, ignorados, audios };
}

// ── Notas de voz → texto ─────────────────────────────────────────────
// El archivo se pide a Meta con el permiso de la empresa (GET /{media_id} da
// una URL que vence en minutos y también exige el permiso) y se manda a
// OpenAI. Si algo falla, el mensaje se queda como "🎤 Audio": nunca se pierde.
// Modelo: WHATSAPP_TRANSCRIPCION_MODELO → JARVIS_TRANSCRIPTION_MODEL → gpt-4o-mini-transcribe.
const MAX_AUDIO = 20 * 1024 * 1024;
const PISTA_TRANSCRIPCION = 'Cliente de una tienda de repuestos de motocicletas en República Dominicana. '
  + 'Habla de piezas y modelos: CG150, AX100, Boxer, GN125, Suzuki, Honda, Yamaha, TVS, Bajaj, '
  + 'cadena, piñón, cloche, carburador, bandas de freno, gomas, aros, RD$, pesos.';

async function transcribirAudios(sb: any, audios: { cx: any; ev: any }[]) {
  const clave = Deno.env.get('OPENAI_API_KEY');
  if (!clave) { console.warn('[whatsapp-oficial] sin OPENAI_API_KEY: audios sin transcribir'); return; }
  const graph = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;
  const modelo = Deno.env.get('WHATSAPP_TRANSCRIPCION_MODELO') || Deno.env.get('JARVIS_TRANSCRIPTION_MODEL') || 'gpt-4o-mini-transcribe';
  const tokens = new Map<string, string | null>();

  for (const { cx, ev } of audios) {
    try {
      if (!tokens.has(cx.id)) {
        const { data } = await sb.from('whatsapp_conexion_secretos').select('access_token').eq('conexion_id', cx.id).maybeSingle();
        tokens.set(cx.id, data?.access_token || null);
      }
      const token = tokens.get(cx.id);
      if (!token) { console.warn('[whatsapp-oficial] audio sin permiso de la empresa', cx.id); continue; }
      const auth = { Authorization: `Bearer ${token}` };

      const info = await fetch(`${graph}/${ev.mediaId}`, { headers: auth }).then((r) => r.json()).catch(() => null);
      if (!info?.url) { console.warn('[whatsapp-oficial] Meta no dio el audio', ev.mediaId, info?.error?.message); continue; }
      if (Number(info.file_size) > MAX_AUDIO) continue;
      const archivo = await fetch(info.url, { headers: auth });
      if (!archivo.ok) { console.warn('[whatsapp-oficial] descarga del audio', archivo.status); continue; }
      const bytes = await archivo.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO) continue;

      const mime = String(info.mime_type || 'audio/ogg').split(';')[0];
      const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('amr') ? 'amr' : 'ogg';
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), `nota.${ext}`);
      form.append('model', modelo);
      form.append('language', 'es');
      form.append('prompt', PISTA_TRANSCRIPCION);
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${clave}` }, body: form,
      });
      const j = await r.json().catch(() => null);
      const texto = String(j?.text || '').trim();
      if (!r.ok || !texto) { console.warn('[whatsapp-oficial] transcripción', r.status, j?.error?.message); continue; }

      const nuevo = `🎤 ${texto}`.slice(0, 4000);
      const { data: filas } = await sb.from('sales_messages').update({ message_text: nuevo })
        .eq('tenant_id', cx.tenant_id).eq('platform', 'whatsapp').eq('external_message_id', ev.id)
        .eq('message_type', 'audio').select('id, conversation_id');
      // La vista previa de la lista decía "🎤 Audio": si sigue siendo ese, se cambia.
      const conv = filas?.[0]?.conversation_id;
      if (conv) {
        await sb.from('sales_conversations').update({ last_message_preview: nuevo.slice(0, 180) })
          .eq('id', conv).eq('last_message_preview', String(ev.texto || '').slice(0, 180)).select('id');
      }
    } catch (e) {
      console.warn('[whatsapp-oficial] audio', ev.id, e?.message || e);
    }
  }
}

async function guardarMensaje(sb: any, cx: any, ev: any) {
  const clave = `whatsapp:${ev.phoneNumberId}:${ev.cliente}`;
  const { data: previa } = await sb.from('sales_conversations').select('id, customer_name')
    .eq('tenant_id', cx.tenant_id).eq('platform', 'whatsapp').eq('external_conversation_id', clave).maybeSingle();
  let conversacionId = previa?.id;
  if (previa) {
    if (ev.nombre && (!previa.customer_name || /^\+?\d+$/.test(previa.customer_name))) {
      await sb.from('sales_conversations').update({ customer_name: ev.nombre }).eq('id', previa.id).select('id');
    }
  } else {
    const { data: canal } = await sb.from('sales_channels').select('id')
      .eq('tenant_id', cx.tenant_id).eq('platform', 'whatsapp').order('created_at', { ascending: true }).limit(1);
    const { data: nueva, error } = await sb.from('sales_conversations').upsert({
      tenant_id: cx.tenant_id,
      channel_id: canal?.[0]?.id || null,
      platform: 'whatsapp',
      external_conversation_id: clave,
      customer_name: ev.nombre || ev.cliente,
      customer_phone: ev.cliente,
      customer_external_id: ev.cliente,
      status: 'nuevo',
      bot_enabled: false,
      last_message_preview: String(ev.texto || '').slice(0, 180),
      metadata: { source: 'whatsapp_oficial', conexion_id: cx.id },
    }, { onConflict: 'tenant_id,platform,external_conversation_id' }).select('id').single();
    if (error) throw new Error(`conversación: ${error.message}`);
    conversacionId = nueva.id;
  }

  const { error: errMsg } = await sb.from('sales_messages').upsert({
    tenant_id: cx.tenant_id,
    conversation_id: conversacionId,
    platform: 'whatsapp',
    sender_type: ev.entrante ? 'user' : 'agent',
    message_type: ev.clase,
    message_text: ev.texto,
    media_url: null,                       // el archivo se baja aparte por su media id (audios: transcripción)
    external_message_id: ev.id,
    status: ev.entrante ? 'received' : 'sent',
    raw_data: { source: 'whatsapp_oficial', origen: ev.origen, media_id: ev.mediaId, conexion_id: cx.id },
    created_at: ev.fecha || undefined,
  }, { onConflict: 'tenant_id,platform,external_message_id', ignoreDuplicates: true });
  if (errMsg) throw new Error(`mensaje: ${errMsg.message}`);

  // Aviso solo para lo que el cliente escribe ahora (no historial ni la app).
  if (ev.entrante && ev.origen === 'cliente') {
    await sb.from('sales_notifications').insert({
      tenant_id: cx.tenant_id,
      conversation_id: conversacionId,
      type: 'new_message',
      title: `Nuevo mensaje en WhatsApp${ev.nombre ? ` · ${ev.nombre}` : ''}`,
      message: String(ev.texto || '').slice(0, 180),
    }).then(() => {}, () => {});
  }
}

async function eventoCuenta(sb: any, ev: any) {
  const estado = estadoTrasEventoCuenta(ev.evento);
  if (!estado || !ev.wabaId) return;
  const ahora = new Date().toISOString();
  const cambios = estado === 'desconectado'
    ? { estado, motivo_desconexion: ev.motivo || ev.evento, desconectado_at: ahora, ultimo_webhook_at: ahora, updated_at: ahora }
    : { estado, motivo_desconexion: null, desconectado_at: null, ultimo_webhook_at: ahora, updated_at: ahora };
  const { data: filas } = await sb.from('whatsapp_conexiones').update(cambios)
    .eq('waba_id', ev.wabaId).neq('estado', estado).select('id, tenant_id');
  if (estado !== 'desconectado') return;
  // Campanita a los dueños/administradores de cada empresa afectada.
  for (const f of filas || []) {
    await sb.rpc('_crm_notificar_admins', {
      p_tenant: f.tenant_id, p_tipo: 'whatsapp_desconectado',
      p_titulo: 'WhatsApp se desconectó de MotoFlow', p_mensaje: avisoDesconexion(ev.motivo),
    }).then(() => {}, (e) => console.warn('[whatsapp-oficial] aviso', e?.message || e));
  }
}

async function firmaValida(cuerpo: string, firma: string, secreto: string) {
  const f = firma.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!f) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(cuerpo)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (f.length !== hex.length) return false;
  let d = 0;
  for (let i = 0; i < f.length; i++) d |= f.charCodeAt(i) ^ hex.charCodeAt(i);
  return d === 0;
}

function servicio() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}
function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json' } });
}
