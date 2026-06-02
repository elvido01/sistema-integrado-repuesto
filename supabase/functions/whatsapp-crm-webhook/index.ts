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

const MEDIA_BUCKET = 'whatsapp-media';
const BETA_GENERIC_REPLY = 'Gracias por escribirnos. Un vendedor verificara disponibilidad, precio y compatibilidad y te respondera en breve.';

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
  const phone = normalizePhone(message.from || metaContact?.wa_id);
  const name = metaContact?.profile?.name || null;
  const tenantId = settings.tenant_id;
  const media = await extractAndStoreMedia(supabase, tenantId, message);
  const text = extractText(message) || media?.label || '';
  if (!text && !media?.url) return;

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
      metadata: {
        raw_type: message.type,
        media_url: media?.url || null,
        media_type: media?.type || null,
        media_mime: media?.mime || null,
        media_id: media?.id || null,
        media_filename: media?.filename || null,
      },
    })
    .select('*')
    .single();

  const betaMode = settings.sales_hub_beta_mode !== false;
  const productHits = betaMode ? [] : await findProducts(supabase, tenantId, text);
  if (!betaMode && productHits.length) {
    await saveQuoteItems(supabase, tenantId, conversation.id, savedMessage.id, productHits);
  }

  await updateLeadScore(supabase, tenantId, contact.id, text, productHits.length);

  if (!settings.bot_enabled || !conversation.bot_enabled || contact.blocked) return;

  const reply = betaMode
    ? buildBetaReply(text, settings.sales_hub_generic_reply)
    : buildAssistantReply(text, productHits);
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
    metadata: {
      provider_response: sent || null,
      product_hits: productHits.map(p => p.id),
      sales_hub_beta_mode: betaMode,
      detected_intent: detectBasicIntent(text),
    },
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

function buildBetaReply(text: string, configuredReply?: string) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  if (!/precio|cu[aá]nto|tiene|tienes|busco|necesito|cotiza|cotizaci[oó]n|disponible|stock|existencia|compatible|sirve|modelo|pieza|repuesto/i.test(normalized)) {
    return null;
  }
  return String(configuredReply || BETA_GENERIC_REPLY).slice(0, 1000);
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
  if (message?.type === 'image') return String(message.image?.caption || '').trim();
  if (message?.type === 'video') return String(message.video?.caption || '').trim();
  if (message?.type === 'document') return String(message.document?.caption || message.document?.filename || '').trim();
  if (message?.type === 'button') return String(message.button?.text || '').trim();
  if (message?.type === 'interactive') return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '').trim();
  return '';
}

async function extractAndStoreMedia(supabase: any, tenantId: string, message: any) {
  const type = message?.type;
  const source = message?.[type];
  if (!source?.id || !['audio', 'image', 'video', 'document', 'sticker'].includes(type)) return null;

  const labels: Record<string, string> = {
    audio: '[Nota de voz]',
    image: '[Imagen]',
    video: '[Video]',
    document: '[Documento]',
    sticker: '[Sticker]',
  };

  try {
    const stored = await downloadWhatsAppMedia(supabase, tenantId, source.id, type, source.mime_type);
    return {
      id: source.id,
      type,
      url: stored?.url || null,
      mime: stored?.mime || source.mime_type || null,
      filename: source.filename || null,
      label: labels[type] || '[Archivo]',
    };
  } catch (error) {
    console.error('[whatsapp-crm-webhook] media', error);
    return {
      id: source.id,
      type,
      url: null,
      mime: source.mime_type || null,
      filename: source.filename || null,
      label: labels[type] || '[Archivo]',
    };
  }
}

async function downloadWhatsAppMedia(supabase: any, tenantId: string, mediaId: string, mediaType: string, fallbackMime?: string) {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN no configurado');

  const metaResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaResponse.json().catch(() => null);
  if (!metaResponse.ok || !meta?.url) throw new Error(`No se pudo obtener media ${mediaId}`);

  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) throw new Error(`No se pudo descargar media ${mediaId}`);

  await ensureMediaBucket(supabase);
  const mime = meta.mime_type || fallbackMime || fileResponse.headers.get('content-type') || 'application/octet-stream';
  const ext = extensionFromMime(mime, mediaType);
  const path = `${tenantId}/${Date.now()}_${mediaId}.${ext}`;
  const bytes = new Uint8Array(await fileResponse.arrayBuffer());

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || null, mime };
}

async function ensureMediaBucket(supabase: any) {
  const { data } = await supabase.storage.getBucket(MEDIA_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
  if (error && !String(error.message || '').toLowerCase().includes('already')) throw error;
}

function extensionFromMime(mime: string, mediaType: string) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return mediaType === 'audio' ? 'm4a' : 'mp4';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  const subtype = mime.split('/')[1]?.split(';')[0];
  return subtype || 'bin';
}

function normalizePhone(phone: string) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
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
