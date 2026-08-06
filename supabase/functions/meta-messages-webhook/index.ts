// ============================================================
// meta-messages-webhook - Recibe DMs de Facebook Messenger e Instagram
// ============================================================
// GET  -> handshake de Meta.
// POST -> guarda SIEMPRE el evento crudo en meta_webhook_events y,
//         cuando encuentra la cuenta conectada, crea conversacion/mensaje
//         en Sales Hub.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const GENERIC_REPLY = 'Gracias por escribirnos. Un vendedor verificara disponibilidad, precio y compatibilidad y te respondera en breve.';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expected = Deno.env.get('META_VERIFY_TOKEN') || Deno.env.get('SALES_HUB_VERIFY_TOKEN') || '';

    if (mode === 'subscribe' && token && token === expected) {
      console.log('[meta-webhook] handshake OK');
      return new Response(challenge || '', { status: 200 });
    }

    console.warn('[meta-webhook] handshake rechazado');
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method', { status: 405 });

  let body: any = {};
  try {
    body = await req.json();
  } catch (error) {
    console.warn('[meta-webhook] JSON invalido', error?.message || error);
    return new Response('OK', { status: 200 });
  }

  try {
    await handleWebhook(body);
  } catch (error) {
    console.error('[meta-webhook] error general', error?.message || error);
  }

  // Meta debe recibir 200 rapido para no reintentar.
  return new Response('OK', { status: 200 });
});

async function handleWebhook(body: any) {
  const supabase = serviceClient();
  const objectType = String(body?.object || '').toLowerCase();
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  console.log('[meta-webhook] POST', JSON.stringify({
    object: objectType,
    entries: entries.map((entry: any) => entry?.id),
    count: entries.length,
  }));

  if (!entries.length) {
    await logEvent(supabase, {
      object_type: objectType || null,
      platform: platformFromObject(objectType),
      event_type: 'empty_payload',
      status: 'ignored',
      payload: body,
    });
    return;
  }

  for (const entry of entries) {
    const entryId = String(entry?.id || '');
    const platform = platformFromObject(objectType);
    const events = [
      ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
      ...(Array.isArray(entry?.standby) ? entry.standby : []),
    ];

    if (!events.length) {
      await logEvent(supabase, {
        object_type: objectType,
        platform,
        entry_id: entryId,
        event_type: 'entry_without_messaging',
        status: 'ignored',
        payload: entry,
      });
      continue;
    }

    for (const event of events) {
      await handleMessagingEvent(supabase, objectType, platform, entryId, event);
    }
  }
}

async function handleMessagingEvent(supabase: any, objectType: string, platform: 'instagram' | 'facebook', entryId: string, event: any) {
  const senderId = String(event?.sender?.id || event?.from?.id || event?.sender_id || '');
  const recipientId = String(event?.recipient?.id || event?.to?.id || entryId || '');
  const message = event?.message || event?.postback || event;
  const messageId = String(message?.mid || message?.id || event?.message_id || '');
  const eventType = detectEventType(event);

  const logId = await logEvent(supabase, {
    object_type: objectType,
    platform,
    entry_id: entryId,
    event_type: eventType,
    sender_id: senderId || null,
    recipient_id: recipientId || null,
    message_id: messageId || null,
    status: eventType === 'message' || eventType === 'postback' ? 'received' : 'ignored',
    payload: event,
  });

  if (event?.read || event?.delivery) return;
  if (!senderId || senderId === entryId || senderId === recipientId) {
    await markEvent(supabase, logId, { status: 'ignored', error_message: 'echo_or_missing_sender' });
    return;
  }

  const text = extractText(message);
  const media = extractMedia(message);
  if (!text && !media.url && !media.label) {
    await markEvent(supabase, logId, { status: 'ignored', error_message: 'empty_message' });
    return;
  }

  const account = await resolveAccount(supabase, platform, [entryId, recipientId]);
  if (!account?.tenant_id) {
    await markEvent(supabase, logId, {
      status: 'unmatched_account',
      error_message: `No existe cuenta para ${platform} entry=${entryId} recipient=${recipientId}`,
    });
    console.warn('[meta-webhook] cuenta no configurada', { platform, entryId, recipientId, senderId });
    return;
  }

  await markEvent(supabase, logId, {
    tenant_id: account.tenant_id,
    channel_id: account.channel_id || null,
    social_account_id: account.social_account_id || null,
  });

  const accountExternalId = account.external_account_id || entryId || recipientId;
  const externalConversationId = `${platform}:${accountExternalId}:${senderId}`;
  const intent = detectBasicIntent(text);

  const { data: conversation, error: convError } = await supabase
    .from('sales_conversations')
    .upsert({
      tenant_id: account.tenant_id,
      channel_id: account.channel_id || null,
      platform,
      external_conversation_id: externalConversationId,
      customer_name: senderId,
      customer_external_id: senderId,
      status: 'nuevo',
      intent,
      bot_enabled: false,
      last_message_preview: (text || media.label || '').slice(0, 180),
      metadata: { source: 'meta_messages_webhook', entry_id: entryId, recipient_id: recipientId },
    }, { onConflict: 'tenant_id,platform,external_conversation_id' })
    .select('id, assigned_to')
    .single();

  if (convError) {
    await markEvent(supabase, logId, { status: 'error', error_message: convError.message });
    return;
  }

  const externalMessageId = messageId || `${platform}:${accountExternalId}:${senderId}:${event?.timestamp || Date.now()}`;
  const { data: savedMessage, error: msgError } = await supabase
    .from('sales_messages')
    .upsert({
      tenant_id: account.tenant_id,
      conversation_id: conversation.id,
      platform,
      sender_type: 'user',
      message_type: media.type || 'text',
      message_text: text || media.label || '',
      media_url: media.url,
      external_message_id: externalMessageId,
      status: 'received',
      raw_data: event,
    }, { onConflict: 'tenant_id,platform,external_message_id' })
    .select('id')
    .single();

  if (msgError) {
    await markEvent(supabase, logId, { status: 'error', error_message: msgError.message });
    return;
  }

  const priority = ['precio_cotizacion', 'disponibilidad', 'compatibilidad'].includes(intent) ? 'alta' : 'media';
  const { data: lead } = await supabase
    .from('sales_leads')
    .insert({
      tenant_id: account.tenant_id,
      conversation_id: conversation.id,
      cliente_nombre: senderId,
      cliente_contacto: senderId,
      canal: platform,
      estado: 'nuevo',
      prioridad: priority,
      score: priority === 'alta' ? 70 : 30,
      resumen: (text || media.label || 'Mensaje recibido').slice(0, 240),
      metadata: { external_message_id: externalMessageId },
    })
    .select('id')
    .single();

  await supabase.from('sales_notifications').insert({
    tenant_id: account.tenant_id,
    conversation_id: conversation.id,
    lead_id: lead?.id || null,
    type: 'new_message',
    title: `Nuevo mensaje en ${platform === 'instagram' ? 'Instagram' : 'Facebook'}`,
    message: (text || media.label || 'Mensaje recibido').slice(0, 180),
    assigned_to: conversation.assigned_to,
  });

  await supabase.from('sales_ai_training_logs').insert({
    tenant_id: account.tenant_id,
    conversation_id: conversation.id,
    message_id: savedMessage?.id || null,
    platform,
    detected_intent: intent,
    customer_message: text || media.label || '',
    metadata: { source: 'meta_messages_webhook', beta_mode: true },
  });

  await markEvent(supabase, logId, { status: 'processed' });

  if (account.auto_reply === false || !account.access_token) return;
  const reply = buildBetaReply(text, account.generic_reply || GENERIC_REPLY);
  if (!reply) return;

  // Instagram se responde por el id de la PAGINA, no por el de la cuenta de
  // Instagram: contra /{ig-id}/messages Meta contesta "(#3) Application does
  // not have the capability to make this API call". Si no hay pagina ligada
  // se intenta igual con el id de IG, que es mejor que no intentar.
  const sendId = (platform === 'instagram'
    ? await resolvePageId(supabase, account.tenant_id)
    : null) || accountExternalId;

  const sent = await sendMetaText(platform, sendId, senderId, reply, account.access_token);
  await supabase.from('sales_messages').insert({
    tenant_id: account.tenant_id,
    conversation_id: conversation.id,
    platform,
    sender_type: 'assistant',
    message_type: 'text',
    message_text: reply,
    external_message_id: sent.data?.message_id || sent.data?.recipient_id || null,
    status: sent.ok ? 'sent' : 'failed',
    // El motivo del fallo SE GUARDA. Antes aqui iba `provider_response: null`
    // y el error de Meta solo quedaba en un console.warn: la pantalla decia
    // "failed" sin decir por que, y habia que salir a preguntarselo a la API.
    raw_data: {
      provider_response: sent.data,
      error: sent.ok ? null : (sent.data?.error?.message || `HTTP ${sent.status}`),
      endpoint: sendId,
      beta_mode: true,
    },
  });

  if (!sent.ok) {
    await supabase.from('meta_webhook_events').update({
      error_message: `respuesta no enviada: ${sent.data?.error?.message || sent.status}`,
    }).eq('id', logId);
  }
}

// Id de la pagina de Facebook del mismo tenant (la que manda los DM de IG).
async function resolvePageId(supabase: any, tenantId: string) {
  const { data } = await supabase
    .from('sales_channels')
    .select('external_account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'facebook')
    .eq('status', 'active')
    .maybeSingle();
  if (data?.external_account_id) return data.external_account_id;

  const { data: social } = await supabase
    .from('social_accounts')
    .select('external_account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'facebook')
    .maybeSingle();
  return social?.external_account_id || null;
}

async function resolveAccount(supabase: any, platform: string, ids: string[]) {
  const candidates = [...new Set(ids.filter(Boolean))];

  for (const externalId of candidates) {
    const { data: channel } = await supabase
      .from('sales_channels')
      .select('id, tenant_id, account_name, external_account_id, access_token, metadata')
      .eq('platform', platform)
      .eq('external_account_id', externalId)
      .eq('status', 'active')
      .maybeSingle();

    if (channel?.tenant_id) {
      return {
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        external_account_id: channel.external_account_id,
        access_token: channel.access_token,
        auto_reply: channel.metadata?.auto_reply,
        generic_reply: channel.metadata?.generic_reply,
      };
    }
  }

  for (const externalId of candidates) {
    const { data: social } = await supabase
      .from('social_accounts')
      .select('id, tenant_id, account_name, external_account_id')
      .eq('platform', platform)
      .eq('external_account_id', externalId)
      .maybeSingle();

    if (!social?.tenant_id) continue;

    const { data: secret } = await supabase
      .from('social_account_secrets')
      .select('access_token')
      .eq('account_id', social.id)
      .maybeSingle();

    const { data: channel } = await supabase
      .from('sales_channels')
      .upsert({
        tenant_id: social.tenant_id,
        platform,
        account_name: social.account_name,
        external_account_id: social.external_account_id,
        access_token: secret?.access_token || null,
        status: 'active',
        metadata: { source: 'social_accounts', auto_reply: true },
      }, { onConflict: 'tenant_id,platform,external_account_id' })
      .select('id')
      .single();

    return {
      tenant_id: social.tenant_id,
      channel_id: channel?.id || null,
      social_account_id: social.id,
      external_account_id: social.external_account_id,
      access_token: secret?.access_token || null,
      auto_reply: true,
    };
  }

  return null;
}

async function logEvent(supabase: any, event: Record<string, unknown>) {
  try {
    const { data } = await supabase
      .from('meta_webhook_events')
      .insert(event)
      .select('id')
      .single();
    return data?.id || null;
  } catch (error) {
    console.warn('[meta-webhook] no se pudo guardar log', error?.message || error);
    return null;
  }
}

async function markEvent(supabase: any, id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  try {
    await supabase.from('meta_webhook_events').update(patch).eq('id', id);
  } catch (error) {
    console.warn('[meta-webhook] no se pudo actualizar log', error?.message || error);
  }
}

function platformFromObject(objectType: string): 'instagram' | 'facebook' {
  return String(objectType || '').includes('instagram') ? 'instagram' : 'facebook';
}

function detectEventType(event: any) {
  if (event?.message) return 'message';
  if (event?.postback) return 'postback';
  if (event?.read) return 'read';
  if (event?.delivery) return 'delivery';
  return 'unknown';
}

function extractText(message: any) {
  return String(message?.text || message?.title || message?.message?.text || '').trim();
}

function extractMedia(message: any) {
  const attachment = Array.isArray(message?.attachments) ? message.attachments[0] : null;
  if (!attachment) return { type: null, url: null, label: null };
  const rawType = String(attachment.type || 'unknown');
  const labels: Record<string, string> = {
    image: '[Imagen]',
    audio: '[Audio]',
    video: '[Video]',
    file: '[Archivo]',
    sticker: '[Sticker]',
  };
  return {
    type: rawType === 'file' ? 'document' : rawType,
    url: attachment?.payload?.url || null,
    label: labels[rawType] || '[Adjunto]',
  };
}

function detectBasicIntent(text: string) {
  const t = String(text || '').toLowerCase();
  if (/precio|cu[a\u00e1]nto|cotiza|cotizaci[o\u00f3]n/.test(t)) return 'precio_cotizacion';
  if (/disponible|tiene|tienes|hay|existencia|stock/.test(t)) return 'disponibilidad';
  if (/compatible|le cae|sirve|modelo|a[n\u00f1]o/.test(t)) return 'compatibilidad';
  if (/env[i\u00ed]o|delivery|mandar|ubicaci[o\u00f3]n|direcci[o\u00f3]n/.test(t)) return 'envio_ubicacion';
  if (/garant[i\u00ed]a|cambio|devoluci[o\u00f3]n/.test(t)) return 'garantia';
  return 'general';
}

function buildBetaReply(text: string, configuredReply: string) {
  const value = String(text || '').trim();
  if (!value) return null;
  return String(configuredReply || GENERIC_REPLY).slice(0, 1000);
}

// Devuelve SIEMPRE {ok, status, data} para que quien llama pueda guardar el
// motivo del fallo. Antes devolvia null y el error de Meta se perdia.
async function sendMetaText(platform: string, accountId: string, recipientId: string, text: string, token: string) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${accountId}/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn(`[meta-webhook] respuesta ${platform} fallo`, response.status, JSON.stringify(data));
  }
  return { ok: response.ok, status: response.status, data };
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
