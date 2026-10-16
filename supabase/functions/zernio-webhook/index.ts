// ============================================================
// zernio-webhook — los mensajes de Zernio entran al CRM
// ============================================================
// (16/10/2026) Zernio avisa cada mensaje de Instagram y Messenger
// (message.received) y cada respuesta que sale desde su panel o desde
// Hermes (message.sent). Aquí se guardan en sales_conversations y
// sales_messages con la MISMA clave que pone meta-messages-webhook
// ("plataforma:cuenta:cliente") y el mismo id de mensaje de la red: si un
// mensaje llega por los dos caminos, queda una sola vez.
//
// Sin JWT (lo llama Zernio): se verifica la firma HMAC-SHA256 del cuerpo con
// ZERNIO_WEBHOOK_SECRET (cabecera X-Zernio-Signature). Lo da de alta
// scripts/zernio-conectar.mjs, que también trae las conversaciones viejas.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const PLATAFORMAS = new Set(['instagram', 'facebook']);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const crudo = await req.text();

  const secreto = Deno.env.get('ZERNIO_WEBHOOK_SECRET');
  if (!secreto) return new Response('sin secreto', { status: 500 });
  const firma = (req.headers.get('x-zernio-signature') || req.headers.get('x-late-signature') || '').trim();
  if (!(await firmaValida(crudo, firma, secreto))) return new Response('firma', { status: 401 });

  let ev: any;
  try { ev = JSON.parse(crudo); } catch { return new Response('json', { status: 400 }); }
  if (ev?.test) return json({ ok: true, test: true });
  if (!['message.received', 'message.sent'].includes(ev?.event)) return json({ ok: true, ignorado: ev?.event });

  try {
    const r = await guardar(servicio(), ev);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[zernio-webhook]', e?.message || e);
    // 500: Zernio reintenta. Un error nuestro no debe perder el mensaje.
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

async function guardar(supabase: any, ev: any) {
  const msg = ev.message || {};
  const conv = ev.conversation || {};
  const acc = ev.account || {};
  const platform = String(msg.platform || acc.platform || '');
  if (!PLATAFORMAS.has(platform)) return { ignorado: `plataforma ${platform}` };

  const zernioAccountId = String(acc.id || acc.accountId || '');
  const { data: cuentas } = await supabase.from('zernio_cuentas')
    .select('tenant_id, platform, external_account_id').eq('zernio_account_id', zernioAccountId).eq('activo', true).limit(1);
  const cuenta = cuentas?.[0];
  if (!cuenta) return { ignorado: `cuenta ${zernioAccountId} sin empresa` };

  const entrante = msg.direction !== 'outgoing';
  // El aviso en vivo trae sender{}/text; la lista de mensajes (historial), senderId/message.
  const participante = String(conv.participantId || (entrante ? (msg.sender?.id || msg.senderId) : '') || '');
  if (!participante) return { ignorado: 'sin participante' };
  const claveConv = `${platform}:${cuenta.external_account_id}:${participante}`;

  const texto = String(msg.text ?? msg.message ?? '').trim();
  const adj = Array.isArray(msg.attachments) ? msg.attachments[0] : null;
  const tipoAdj = adj ? String(adj.type || adj.originalType || 'file').toLowerCase() : null;
  const etiquetaAdj = adj ? ({ image: '📎 Imagen', video: '📎 Video', audio: '📎 Audio' }[tipoAdj] || '📎 Archivo') : '';
  if (!texto && !adj) return { ignorado: 'vacío' };
  const nombre = String(conv.participantName || msg.sender?.name || (entrante ? msg.senderName : '') || conv.participantUsername || msg.sender?.username || '').trim();

  // La conversación: si ya existe (vino por Meta o por un mensaje anterior)
  // solo se le añade lo de Zernio y el nombre, si el que tenía era un número.
  const { data: previa } = await supabase.from('sales_conversations')
    .select('id, customer_name, metadata')
    .eq('tenant_id', cuenta.tenant_id).eq('platform', platform).eq('external_conversation_id', claveConv)
    .maybeSingle();
  let conversacionId = previa?.id;
  const metaZernio = { zernio_conversation_id: conv.id || msg.conversationId || null, zernio_account_id: zernioAccountId };
  if (previa) {
    const cambios: any = { metadata: { ...(previa.metadata || {}), ...metaZernio } };
    if (nombre && (!previa.customer_name || /^\d+$/.test(previa.customer_name))) cambios.customer_name = nombre;
    await supabase.from('sales_conversations').update(cambios).eq('id', previa.id);
  } else {
    const { data: canal } = await supabase.from('sales_channels').select('id')
      .eq('tenant_id', cuenta.tenant_id).eq('platform', platform).limit(1);
    const { data: nueva, error } = await supabase.from('sales_conversations').upsert({
      tenant_id: cuenta.tenant_id,
      channel_id: canal?.[0]?.id || null,
      platform,
      external_conversation_id: claveConv,
      customer_name: nombre || participante,
      customer_external_id: participante,
      status: 'nuevo',
      bot_enabled: false,
      last_message_preview: (texto || etiquetaAdj).slice(0, 180),
      metadata: { source: 'zernio', ...metaZernio },
    }, { onConflict: 'tenant_id,platform,external_conversation_id' }).select('id').single();
    if (error) throw new Error(`conversación: ${error.message}`);
    conversacionId = nueva.id;
  }

  // El mensaje, con el id de la red (el mismo que pone el webhook de Meta).
  const idMensaje = String(msg.platformMessageId || msg.id || `${claveConv}:${msg.sentAt || Date.now()}`);
  // Una respuesta que salió desde el CRM (meta-send-queued por Zernio) ya está
  // guardada con el id que devolvió Zernio al enviar, que puede ser el suyo y
  // no el de la red: se busca por los dos para no ponerla dos veces.
  if (!entrante) {
    const ids = [msg.id, msg.platformMessageId].filter(Boolean).map(String);
    const { data: ya } = await supabase.from('sales_messages').select('id')
      .eq('conversation_id', conversacionId).in('external_message_id', ids).limit(1);
    if (ya?.length) return { conversacion: conversacionId, entrante, ya_estaba: true };
  }
  const { error: errMsg } = await supabase.from('sales_messages').upsert({
    tenant_id: cuenta.tenant_id,
    conversation_id: conversacionId,
    platform,
    sender_type: entrante ? 'user' : 'agent',
    // Los tipos que acepta sales_messages (CHECK): un reel compartido o una
    // mención en historia entran como 'unknown' con su etiqueta.
    message_type: adj && !texto ? ({ image: 'image', video: 'video', audio: 'audio', file: 'document', document: 'document', sticker: 'sticker' }[tipoAdj] || 'unknown') : 'text',
    message_text: texto || etiquetaAdj,
    media_url: adj?.url || null,
    external_message_id: idMensaje,
    status: entrante ? 'received' : 'sent',
    raw_data: { source: 'zernio', event: ev.event, event_id: ev.id, zernio_message_id: msg.id, sent_via: msg.sentVia || null },
    created_at: msg.sentAt || undefined,
  }, { onConflict: 'tenant_id,platform,external_message_id', ignoreDuplicates: true });
  if (errMsg) throw new Error(`mensaje: ${errMsg.message}`);

  if (entrante) {
    await supabase.from('sales_notifications').insert({
      tenant_id: cuenta.tenant_id,
      conversation_id: conversacionId,
      type: 'new_message',
      title: `Nuevo mensaje en ${platform === 'instagram' ? 'Instagram' : 'Messenger'}${nombre ? ` · ${nombre}` : ''}`,
      message: (texto || etiquetaAdj).slice(0, 180),
    }).then(() => {}, () => {});
  }
  return { conversacion: conversacionId, entrante };
}

// HMAC-SHA256 del cuerpo crudo; Zernio la manda en hex (con o sin "sha256=").
async function firmaValida(cuerpo: string, firma: string, secreto: string) {
  if (!firma) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(cuerpo)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64 = btoa(String.fromCharCode(...mac));
  const f = firma.replace(/^sha256=/i, '');
  return iguales(f.toLowerCase(), hex) || iguales(f, b64);
}
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function servicio() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}
function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json' } });
}
