// ============================================================
// meta-send-queued - Despacha respuestas agent/queued a Meta
// ============================================================
// Entrada normal: la UI inserta sales_messages.status='queued' y llama
// esta funcion con { message_id }. La funcion valida el JWT del usuario,
// confirma tenant_id y usa tokens guardados solo del lado backend.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const META_GRAPH_VERSION = 'v21.0';
const META_PLATFORMS = new Set(['instagram', 'facebook']);
const SUPPORTED_TYPES = new Set(['text', 'comment']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, error: 'json_invalido' }, 400);
  }

  const supabase = serviceClient();
  const auth = await authenticateCaller(supabase, req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const messageId = String(body?.message_id || '').trim();
  if (!messageId) return json({ ok: false, error: 'message_id_requerido' }, 400);

  try {
    const result = await dispatchMessage(supabase, auth.tenant_id, messageId, auth.user_id);
    return json({ ok: result.status === 'sent', message: result });
  } catch (error) {
    console.error('[meta-send-queued] error', error?.message || error);
    return json({ ok: false, error: error?.message || String(error) }, 500);
  }
});

async function authenticateCaller(supabase: any, req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'no_auth' };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { ok: false, status: 401, error: 'invalid_token' };

  const userId = userData.user.id;
  const tenantId = await getTenantId(supabase, userId);
  if (!tenantId) return { ok: false, status: 403, error: 'sin_tenant' };

  return { ok: true, user_id: userId, tenant_id: tenantId };
}

async function getTenantId(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.tenant_id) return profile.tenant_id;

  const { data: empresa } = await supabase
    .from('usuarios_empresas')
    .select('tenant_id')
    .eq('user_id', userId)
    .maybeSingle();
  return empresa?.tenant_id || null;
}

async function dispatchMessage(supabase: any, tenantId: string, messageId: string, userId: string) {
  const { data: message, error: messageError } = await supabase
    .from('sales_messages')
    .select('id, tenant_id, conversation_id, platform, sender_type, message_type, message_text, external_message_id, status, raw_data')
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .single();

  if (messageError || !message) throw new Error(messageError?.message || 'mensaje_no_encontrado');
  if (message.status !== 'queued') return compactMessage(message);
  if (message.sender_type !== 'agent') return failMessage(supabase, message, 'sender_no_soportado');
  if (!META_PLATFORMS.has(message.platform)) return failMessage(supabase, message, 'canal_no_meta');
  if (!SUPPORTED_TYPES.has(message.message_type)) return failMessage(supabase, message, 'tipo_no_soportado');

  const text = String(message.message_text || '').trim();
  if (!text) return failMessage(supabase, message, 'texto_vacio');

  // Un comentario no se contesta por donde se contesta un mensaje: va a
  // /{comentario}/replies, sale publico debajo de la publicacion, y no
  // gasta la ventana de 24h porque no es mensajeria. Ademas es lo unico
  // que hoy se puede responder: el privado a un desconocido sigue
  // esperando el Acceso Avanzado de Meta.
  if (message.message_type === 'comment') {
    return await dispatchCommentReply(supabase, tenantId, message, text, userId);
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('sales_conversations')
    .select('id, tenant_id, channel_id, platform, external_conversation_id, customer_external_id')
    .eq('id', message.conversation_id)
    .eq('tenant_id', tenantId)
    .single();

  if (conversationError || !conversation) {
    return failMessage(supabase, message, conversationError?.message || 'conversacion_no_encontrada');
  }
  if (conversation.platform !== message.platform) {
    return failMessage(supabase, message, 'canal_inconsistente');
  }

  const parsed = parseExternalConversationId(conversation.external_conversation_id);
  const recipientId = conversation.customer_external_id || parsed?.recipient_id;
  const accountId = parsed?.account_id || await accountIdFromChannel(supabase, tenantId, conversation.channel_id);
  if (!recipientId || !accountId) return failMessage(supabase, message, 'identidad_meta_incompleta');

  const token = await resolveAccessToken(supabase, tenantId, message.platform, accountId, conversation.channel_id);
  if (!token) return failMessage(supabase, message, 'token_meta_no_configurado');

  // Instagram se responde por el id de la PAGINA cuando el token es de
  // pagina (EAG...). Contra /{ig-id}/messages Meta contesta "(#3) Application
  // does not have the capability to make this API call"; contra
  // /{page-id}/messages la llamada se reconoce. Verificado contra la API.
  const senderId = (message.platform === 'instagram' && !String(token).startsWith('IGAA'))
    ? (await pageIdDelTenant(supabase, tenantId)) || accountId
    : accountId;

  const sent = await sendMetaText(message.platform, senderId, recipientId, text.slice(0, 1000), token);
  if (!sent.ok) {
    return failMessage(supabase, message, `meta_${sent.status}`, {
      meta: sent.body,
      account_id: accountId,
      recipient_id: recipientId,
      sent_by: userId,
    });
  }

  const providerId = sent.body?.message_id || sent.body?.recipient_id || null;
  const rawData = {
    ...(message.raw_data || {}),
    source: 'meta_send_queued',
    sent_by: userId,
    provider_response: sent.body,
    account_id: accountId,
    recipient_id: recipientId,
  };

  const { data: updated, error: updateError } = await supabase
    .from('sales_messages')
    .update({
      status: 'sent',
      external_message_id: providerId,
      raw_data: rawData,
    })
    .eq('id', message.id)
    .eq('tenant_id', tenantId)
    .select('id, status, external_message_id')
    .single();

  if (updateError) throw new Error(updateError.message);
  return updated;
}

// ------------------------------------------------------------
// Responder un comentario publico
// ------------------------------------------------------------
// A que comentario se contesta: si la pantalla lo dijo, a ese. Si no,
// al ultimo que escribio el cliente en esa conversacion. Nunca se
// adivina mas alla de eso — antes que publicar debajo de la
// publicacion equivocada, falla y lo dice.
async function dispatchCommentReply(supabase: any, tenantId: string, message: any, text: string, userId: string) {
  const { data: conversation, error: conversationError } = await supabase
    .from('sales_conversations')
    .select('id, tenant_id, channel_id, platform, external_conversation_id')
    .eq('id', message.conversation_id)
    .eq('tenant_id', tenantId)
    .single();

  if (conversationError || !conversation) {
    return failMessage(supabase, message, conversationError?.message || 'conversacion_no_encontrada');
  }

  let commentId = String(message.raw_data?.responder_a || '').trim();

  if (!commentId) {
    const { data: ultimo } = await supabase
      .from('sales_messages')
      .select('external_message_id, raw_data')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'user')
      .eq('message_type', 'comment')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    commentId = String(ultimo?.external_message_id || '').trim();
  }

  if (!commentId) return failMessage(supabase, message, 'sin_comentario_al_que_responder');

  const parsed = parseExternalConversationId(conversation.external_conversation_id);
  const accountId = parsed?.account_id || await accountIdFromChannel(supabase, tenantId, conversation.channel_id);
  if (!accountId) return failMessage(supabase, message, 'identidad_meta_incompleta');

  const token = await resolveAccessToken(supabase, tenantId, message.platform, accountId, conversation.channel_id);
  if (!token) return failMessage(supabase, message, 'token_meta_no_configurado');

  const isInstagramLoginToken = message.platform === 'instagram' && String(token || '').startsWith('IGAA');
  const host = isInstagramLoginToken ? 'graph.instagram.com' : 'graph.facebook.com';

  const response = await fetch(`https://${host}/${META_GRAPH_VERSION}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text.slice(0, 2200), access_token: token }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return failMessage(supabase, message, `meta_${response.status}`, {
      meta: body,
      responder_a: commentId,
      sent_by: userId,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from('sales_messages')
    .update({
      status: 'sent',
      external_message_id: body?.id || null,
      raw_data: {
        ...(message.raw_data || {}),
        source: 'meta_send_queued',
        tipo: 'respuesta_a_comentario',
        responder_a: commentId,
        sent_by: userId,
        provider_response: body,
      },
    })
    .eq('id', message.id)
    .eq('tenant_id', tenantId)
    .select('id, status, external_message_id')
    .single();

  if (updateError) throw new Error(updateError.message);
  return updated;
}

function compactMessage(message: any) {
  return {
    id: message.id,
    status: message.status,
    external_message_id: message.external_message_id || null,
  };
}

async function failMessage(supabase: any, message: any, reason: string, extra: Record<string, unknown> = {}) {
  const rawData = {
    ...(message.raw_data || {}),
    source: 'meta_send_queued',
    dispatch_error: reason,
    ...extra,
  };

  const { data } = await supabase
    .from('sales_messages')
    .update({ status: 'failed', raw_data: rawData })
    .eq('id', message.id)
    .eq('tenant_id', message.tenant_id)
    .select('id, status, external_message_id, raw_data')
    .single();

  return data || { id: message.id, status: 'failed', error: reason };
}

function parseExternalConversationId(value: string) {
  const [platform, accountId, recipientId] = String(value || '').split(':');
  if (!META_PLATFORMS.has(platform) || !accountId || !recipientId) return null;
  return { platform, account_id: accountId, recipient_id: recipientId };
}

async function accountIdFromChannel(supabase: any, tenantId: string, channelId: string | null) {
  if (!channelId) return null;
  const { data: channel } = await supabase
    .from('sales_channels')
    .select('external_account_id')
    .eq('id', channelId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return channel?.external_account_id || null;
}

// Id de la pagina de Facebook del tenant: es la que emite los DM de Instagram.
async function pageIdDelTenant(supabase: any, tenantId: string) {
  const { data: canal } = await supabase
    .from('sales_channels')
    .select('external_account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'facebook')
    .eq('status', 'active')
    .maybeSingle();
  if (canal?.external_account_id) return canal.external_account_id;

  const { data: social } = await supabase
    .from('social_accounts')
    .select('external_account_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'facebook')
    .maybeSingle();
  return social?.external_account_id || null;
}

async function resolveAccessToken(supabase: any, tenantId: string, platform: string, accountId: string, channelId: string | null) {
  const { data: social } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .eq('external_account_id', accountId)
    .maybeSingle();

  if (social?.id) {
    const { data: secret } = await supabase
      .from('social_account_secrets')
      .select('access_token')
      .eq('account_id', social.id)
      .maybeSingle();
    if (secret?.access_token) return secret.access_token;
  }

  if (!channelId) return null;
  const { data: channel } = await supabase
    .from('sales_channels')
    .select('access_token')
    .eq('id', channelId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return channel?.access_token || null;
}

async function sendMetaText(platform: string, accountId: string, recipientId: string, text: string, token: string) {
  const isInstagramLoginToken = platform === 'instagram' && String(token || '').startsWith('IGAA');
  const host = isInstagramLoginToken ? 'graph.instagram.com' : 'graph.facebook.com';
  const actorId = isInstagramLoginToken ? 'me' : accountId;
  const response = await fetch(`https://${host}/${META_GRAPH_VERSION}/${actorId}/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
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
