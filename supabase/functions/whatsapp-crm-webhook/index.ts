// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProductHit = {
  id: string;
  codigo: string;
  descripcion: string;
  precio: number;
  itbis_pct: number;
  existencia: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method === 'GET') return verifyWebhook(req);
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    const body = await req.json();
    if (body?.action === 'send_message') return sendManualMessage(req, body);

    return handleMetaWebhook(body);
  } catch (error) {
    console.error('[whatsapp-crm-webhook]', error);
    return json({ ok: false, error: error?.message || String(error) }, 500);
  }
});

function verifyWebhook(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');

  if (mode === 'subscribe' && token && expected && token === expected) {
    return new Response(challenge || '', { status: 200, headers: corsHeaders });
  }
  return new Response('Forbidden', { status: 403, headers: corsHeaders });
}

async function handleMetaWebhook(payload: any) {
  const supabase = serviceClient();
  const changes = payload?.entry?.flatMap((e: any) => e.changes || []) || [];

  for (const change of changes) {
    const value = change?.value || {};
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) continue;

    const { data: settings } = await supabase
      .from('crm_whatsapp_settings')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    if (!settings?.tenant_id) {
      console.warn('[whatsapp-crm-webhook] phone_number_id sin tenant', phoneNumberId);
      continue;
    }

    if (Array.isArray(value.statuses)) {
      await updateStatuses(supabase, settings.tenant_id, value.statuses);
    }

    for (const message of value.messages || []) {
      await handleInboundMessage(supabase, settings, value.contacts?.[0], message);
    }
  }

  return json({ ok: true });
}

async function updateStatuses(supabase: any, tenantId: string, statuses: any[]) {
  for (const st of statuses) {
    if (!st?.id || !st?.status) continue;
    await supabase
      .from('crm_whatsapp_messages')
      .update({ status: normalizeStatus(st.status), metadata: { whatsapp_status: st } })
      .eq('tenant_id', tenantId)
      .eq('whatsapp_message_id', st.id);
  }
}

async function handleInboundMessage(supabase: any, settings: any, metaContact: any, message: any) {
  const text = extractText(message);
  if (!text) return;

  const phone = normalizePhone(message.from || metaContact?.wa_id);
  const name = metaContact?.profile?.name || null;
  const tenantId = settings.tenant_id;

  const { data: contact } = await supabase
    .from('crm_whatsapp_contacts')
    .upsert({
      tenant_id: tenantId,
      phone,
      wa_id: metaContact?.wa_id || message.from,
      name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone' })
    .select('*')
    .single();

  const { data: conversation } = await supabase
    .from('crm_whatsapp_conversations')
    .upsert({
      tenant_id: tenantId,
      contact_id: contact.id,
      last_user_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 180),
    }, { onConflict: 'tenant_id,contact_id' })
    .select('*')
    .single();

  const { data: savedMessage } = await supabase
    .from('crm_whatsapp_messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      role: 'user',
      content: text,
      whatsapp_message_id: message.id,
      status: 'received',
      metadata: { raw_type: message.type },
    })
    .select('*')
    .single();

  const productHits = await findProducts(supabase, tenantId, text);
  if (productHits.length) {
    await saveQuoteItems(supabase, tenantId, conversation.id, savedMessage.id, productHits);
  }

  await updateLeadScore(supabase, tenantId, contact.id, text, productHits.length);

  if (!settings.bot_enabled || !conversation.bot_enabled || contact.blocked) return;

  const reply = buildAssistantReply(text, productHits);
  if (!reply) return;

  const sent = await sendWhatsAppText(settings.phone_number_id, phone, reply);
  await supabase.from('crm_whatsapp_messages').insert({
    tenant_id: tenantId,
    conversation_id: conversation.id,
    contact_id: contact.id,
    role: 'assistant',
    content: reply,
    whatsapp_message_id: sent?.messages?.[0]?.id || null,
    status: sent?.messages?.[0]?.id ? 'sent' : 'failed',
    metadata: { provider_response: sent || null, product_hits: productHits.map(p => p.id) },
  });
}

async function sendManualMessage(req: Request, body: any) {
  const supabase = serviceClient();
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return json({ ok: false, error: 'no_auth' }, 401);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);

  const conversationId = String(body.conversation_id || '');
  const content = String(body.content || '').trim();
  if (!conversationId || !content) return json({ ok: false, error: 'datos_incompletos' }, 400);

  const { data: conversation } = await supabase
    .from('crm_whatsapp_conversations')
    .select('*, crm_whatsapp_contacts!inner(phone)')
    .eq('id', conversationId)
    .eq('tenant_id', profile.tenant_id)
    .single();

  const { data: settings } = await supabase
    .from('crm_whatsapp_settings')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();

  if (!settings?.phone_number_id) return json({ ok: false, error: 'whatsapp_no_configurado' }, 400);

  const sent = await sendWhatsAppText(settings.phone_number_id, conversation.crm_whatsapp_contacts.phone, content);
  const { error } = await supabase.from('crm_whatsapp_messages').insert({
    tenant_id: profile.tenant_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    role: 'agent',
    content,
    whatsapp_message_id: sent?.messages?.[0]?.id || null,
    status: sent?.messages?.[0]?.id ? 'sent' : 'failed',
    metadata: { sent_by: userData.user.id, provider_response: sent || null },
  });
  if (error) throw error;

  return json({ ok: true, whatsapp_message_id: sent?.messages?.[0]?.id || null });
}

async function findProducts(supabase: any, tenantId: string, text: string): Promise<ProductHit[]> {
  const cleaned = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3).slice(0, 6);
  if (!words.length) return [];

  const codeCandidate = words.find(w => /[a-zA-Z]*\d+[a-zA-Z0-9-]*/.test(w));
  let query = supabase
    .from('productos')
    .select('id,codigo,descripcion,precio,itbis_pct')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .limit(5);

  if (codeCandidate) {
    query = query.or(`codigo.ilike.%${codeCandidate}%,descripcion.ilike.%${codeCandidate}%`);
  } else {
    query = query.ilike('descripcion', `%${words.join('%')}%`);
  }

  const { data } = await query;
  const products = data || [];
  const hits: ProductHit[] = [];
  for (const p of products) {
    let existencia = 0;
    try {
      const stock = await supabase.rpc('get_stock_actual', { producto_uuid: p.id });
      existencia = Number(stock.data || 0);
    } catch (_) {
      existencia = 0;
    }
    hits.push({
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      precio: Number(p.precio || 0),
      itbis_pct: Number(p.itbis_pct || 0.18),
      existencia,
    });
  }
  return hits;
}

async function saveQuoteItems(supabase: any, tenantId: string, conversationId: string, messageId: string, products: ProductHit[]) {
  const rows = products.map(p => ({
    tenant_id: tenantId,
    conversation_id: conversationId,
    producto_id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    cantidad: 1,
    precio_unitario: p.precio,
    itbis_pct: p.itbis_pct,
    existencia: p.existencia,
    source_message_id: messageId,
  }));
  await supabase.from('crm_whatsapp_quote_items').insert(rows);
}

async function updateLeadScore(supabase: any, tenantId: string, contactId: string, text: string, productCount: number) {
  const lower = text.toLowerCase();
  const hotWords = ['precio', 'cuanto', 'cotiza', 'cotizacion', 'disponible', 'tienes', 'necesito', 'comprar', 'envio'];
  const warmWords = ['busco', 'quiero', 'hay', 'llega', 'compatible'];
  const score = productCount || hotWords.some(w => lower.includes(w)) ? 'hot' : warmWords.some(w => lower.includes(w)) ? 'warm' : 'sin_calificar';
  if (score === 'sin_calificar') return;
  await supabase
    .from('crm_whatsapp_contacts')
    .update({ lead_score: score, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', contactId);
}

function buildAssistantReply(text: string, products: ProductHit[]) {
  if (!products.length) {
    if (/precio|tiene|tienes|busco|necesito|cotiza|cotizacion|disponible/i.test(text)) {
      return 'Para verificarte bien, pasame el codigo de la pieza o el modelo de la moto.';
    }
    return null;
  }

  const p = products[0];
  const stockText = p.existencia > 0 ? `Disponible: ${p.existencia}.` : 'Ahora mismo no me figura existencia.';
  const priceText = p.precio > 0 ? `Precio RD$ ${p.precio.toFixed(2)}.` : 'El precio lo confirma un vendedor.';
  return `${p.codigo} - ${p.descripcion}. ${stockText} ${priceText} Te puedo preparar una cotizacion.`;
}

async function sendWhatsAppText(phoneNumberId: string, to: string, text: string) {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN no configurado');

  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 1000) },
    }),
  });

  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

function extractText(message: any) {
  if (message?.type === 'text') return String(message.text?.body || '').trim();
  if (message?.type === 'button') return String(message.button?.text || '').trim();
  if (message?.type === 'interactive') return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '').trim();
  return '';
}

function normalizePhone(phone: string) {
  return String(phone || '').replace(/[^\d]/g, '');
}

function normalizeStatus(status: string) {
  if (['sent', 'delivered', 'read', 'failed'].includes(status)) return status;
  return 'sent';
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
