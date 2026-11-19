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
    const r = await procesar(servicio(), eventosDelWebhook(payload));
    return json({ ok: true, ...r });
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

  for (const ev of eventos) {
    if (ev.tipo === 'cuenta') { await eventoCuenta(sb, ev); continue; }
    const cx = await conexionDe(ev.phoneNumberId);
    if (!cx?.tenant_id) { ignorados++; console.warn('[whatsapp-oficial] número sin empresa', ev.phoneNumberId); continue; }

    if (ev.tipo === 'mensaje') {
      if (!ev.cliente || !ev.id) { ignorados++; continue; }
      await guardarMensaje(sb, cx, ev);
      guardados++;
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
  return { eventos: eventos.length, guardados, ignorados };
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
