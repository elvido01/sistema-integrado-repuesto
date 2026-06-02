// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENERIC_REPLY = 'Gracias por escribirnos. Un vendedor verificara disponibilidad, precio y compatibilidad y te respondera en breve.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method === 'GET') return verifyWebhook(req);
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    const payload = await req.json();
    return handleWebhook(payload);
  } catch (error) {
    console.error('[sales-hub-webhook]', error);
    return json({ ok: false, error: error?.message || String(error) }, 500);
  }
});

function verifyWebhook(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = Deno.env.get('SALES_HUB_VERIFY_TOKEN') || Deno.env.get('WHATSAPP_VERIFY_TOKEN');

  if (mode === 'subscribe' && token && expected && token === expected) {
    return new Response(challenge || '', { status: 200, headers: corsHeaders });
  }
  return new Response('Forbidden', { status: 403, headers: corsHeaders });
}

async function handleWebhook(payload: any) {
  const supabase = serviceClient();
  const object = String(payload?.object || '').toLowerCase();
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  let processed = 0;

  for (const entry of entries) {
    const accountId = String(entry.id || '');
    const platform = object.includes('instagram') ? 'instagram' : 'facebook';

    for (const event of entry.messaging || []) {
      if (event.message) {
        await handleMessagingEvent(supabase, platform, accountId, event);
        processed += 1;
      }
    }

    for (const change of entry.changes || []) {
      const field = String(change.field || '').toLowerCase();
      if (field.includes('messages') || field.includes('messaging')) {
        await handleMessagingEvent(supabase, platform, accountId, change.value);
        processed += 1;
      }
    }
  }

  return json({ ok: true, processed });
}

async function handleMessagingEvent(supabase: any, platform: 'instagram' | 'facebook', accountId: string, event: any) {
  const senderId = String(event.sender?.id || event.from?.id || event.sender_id || '');
  if (!senderId) return;

  const channel = await getChannel(supabase, platform, accountId);
  if (!channel?.tenant_id) {
    console.warn('[sales-hub-webhook] canal no configurado', platform, accountId);
    return;
  }

  const message = event.message || event;
  const text = extractText(message);
  const media = extractMedia(message);
  const messageId = String(message.mid || message.id || event.message_id || `${platform}_${senderId}_${Date.now()}`);
  const externalConversationId = `${platform}:${accountId}:${senderId}`;

  const { data: conversation, error: convError } = await supabase
    .from('sales_conversations')
    .upsert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      platform,
      external_conversation_id: externalConversationId,
      customer_name: event.sender?.name || event.from?.name || null,
      customer_external_id: senderId,
      status: 'nuevo',
      intent: detectBasicIntent(text),
      last_message_preview: (text || media.label || '').slice(0, 180),
      metadata: { account_id: accountId },
    }, { onConflict: 'tenant_id,platform,external_conversation_id' })
    .select('*')
    .single();
  if (convError) throw convError;

  const { data: savedMessage, error: msgError } = await supabase
    .from('sales_messages')
    .upsert({
      tenant_id: channel.tenant_id,
      conversation_id: conversation.id,
      platform,
      sender_type: 'user',
      message_type: media.type || 'text',
      message_text: text || media.label || '',
      media_url: media.url,
      external_message_id: messageId,
      status: 'received',
      raw_data: { event },
    }, { onConflict: 'tenant_id,platform,external_message_id' })
    .select('*')
    .single();
  if (msgError) throw msgError;

  const intent = detectBasicIntent(text);
  const priority = ['precio_cotizacion', 'disponibilidad', 'compatibilidad'].includes(intent) ? 'alta' : 'media';

  const { data: lead } = await supabase
    .from('sales_leads')
    .insert({
      tenant_id: channel.tenant_id,
      conversation_id: conversation.id,
      cliente_nombre: conversation.customer_name,
      cliente_contacto: senderId,
      canal: platform,
      estado: 'nuevo',
      prioridad: priority,
      score: priority === 'alta' ? 70 : 30,
      resumen: text || media.label || 'Mensaje recibido',
      metadata: { external_message_id: messageId },
    })
    .select('id')
    .single();

  await supabase.from('sales_notifications').insert({
    tenant_id: channel.tenant_id,
    conversation_id: conversation.id,
    lead_id: lead?.id || null,
    type: 'new_message',
    title: `Nuevo mensaje en ${platform === 'instagram' ? 'Instagram' : 'Facebook'}`,
    message: (text || media.label || 'Mensaje recibido').slice(0, 180),
    assigned_to: conversation.assigned_to,
  });

  await supabase.from('sales_ai_training_logs').insert({
    tenant_id: channel.tenant_id,
    conversation_id: conversation.id,
    message_id: savedMessage.id,
    platform,
    detected_intent: intent,
    customer_message: text || media.label || '',
    metadata: { beta_mode: true },
  });

  if (channel.metadata?.auto_reply === false) return;
  const reply = buildBetaReply(text, channel.metadata?.generic_reply || GENERIC_REPLY);
  if (!reply || !channel.access_token) return;

  const sent = await sendMetaText(platform, accountId, senderId, reply, channel.access_token);
  await supabase.from('sales_messages').insert({
    tenant_id: channel.tenant_id,
    conversation_id: conversation.id,
    platform,
    sender_type: 'assistant',
    message_type: 'text',
    message_text: reply,
    external_message_id: sent?.message_id || sent?.recipient_id || null,
    status: sent ? 'sent' : 'failed',
    raw_data: { provider_response: sent, beta_mode: true },
  });
}

async function getChannel(supabase: any, platform: string, accountId: string) {
  const { data } = await supabase
    .from('sales_channels')
    .select('*')
    .eq('platform', platform)
    .eq('external_account_id', accountId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

function extractText(message: any) {
  return String(message?.text || message?.message?.text || '').trim();
}

function extractMedia(message: any) {
  const attachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  if (!attachment) return { type: null, url: null, label: null };
  const type = attachment.type || 'unknown';
  const url = attachment.payload?.url || null;
  const labels: Record<string, string> = {
    image: '[Imagen]',
    audio: '[Audio]',
    video: '[Video]',
    file: '[Archivo]',
  };
  return { type: type === 'file' ? 'document' : type, url, label: labels[type] || '[Adjunto]' };
}

function detectBasicIntent(text: string) {
  const t = String(text || '').toLowerCase();
  if (/precio|cu[aá]nto|cotiza|cotizaci[oó]n/.test(t)) return 'precio_cotizacion';
  if (/disponible|tiene|tienes|hay|existencia|stock/.test(t)) return 'disponibilidad';
  if (/compatible|le cae|sirve|modelo|a[nñ]o/.test(t)) return 'compatibilidad';
  if (/env[ií]o|delivery|mandar|ubicaci[oó]n|direcci[oó]n/.test(t)) return 'envio_ubicacion';
  if (/garant[ií]a|cambio|devoluci[oó]n/.test(t)) return 'garantia';
  return 'general';
}

function buildBetaReply(text: string, configuredReply: string) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (!/precio|cu[aá]nto|tiene|tienes|busco|necesito|cotiza|cotizaci[oó]n|disponible|stock|existencia|compatible|sirve|modelo|pieza|repuesto/i.test(value)) {
    return null;
  }
  return String(configuredReply || GENERIC_REPLY).slice(0, 1000);
}

async function sendMetaText(platform: string, accountId: string, recipientId: string, text: string, token: string) {
  const product = platform === 'instagram' ? 'instagram' : 'messenger';
  const response = await fetch(`https://graph.facebook.com/v21.0/${accountId}/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text: text.slice(0, 1000) },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn(`[sales-hub-webhook] ${product} send failed`, response.status, data);
    return null;
  }
  return data;
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
