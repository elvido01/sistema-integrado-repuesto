// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = Deno.env.get('JARVIS_OPENAI_MODEL') || 'gpt-4o-mini';

const SYSTEM_PROMPT = `Eres JARVIS de Motoflow, un asistente administrativo de voz para el dueño/administrador de una tienda de repuestos de motocicletas.

Reglas:
- Responde en español dominicano profesional, claro y breve.
- Solo actúas cuando el administrador te pregunta.
- Por ahora NO ejecutas acciones ni modificas datos. Solo analizas y recomiendas.
- Usa exclusivamente el contexto JSON recibido. Si no hay datos suficientes, dilo claro.
- Responde pensado para voz: 2 a 5 frases, directo, sin tablas largas.
- Si hay riesgo operativo, dilo y sugiere una próxima acción concreta.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'no_auth' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);
    const user = userData.user;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, role, is_superadmin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);

    const isAdmin = profile.role === 'admin' || profile.is_superadmin === true;
    if (!isAdmin) return json({ ok: false, error: 'solo_admin' }, 403);

    if (!profile.is_superadmin) {
      const enterprise = await tenantIsEnterprise(supabase, profile.tenant_id);
      if (!enterprise) return json({ ok: false, error: 'solo_enterprise' }, 403);
    }

    const body = await req.json();
    const message = String(body?.message || '').trim();
    if (!message) return json({ ok: false, error: 'mensaje_vacio' }, 400);
    if (message.length > 1000) return json({ ok: false, error: 'mensaje_muy_largo' }, 400);

    const context = await loadBusinessContext(supabase, profile.tenant_id);
    const llm = await callOpenAI({
      message,
      context,
      tenantId: profile.tenant_id,
    });

    const { error: logError } = await supabase.from('jarvis_admin_logs').insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      input_text: message,
      answer_text: llm.answer,
      provider: 'openai',
      model: llm.model,
      tokens_used: llm.tokens,
      cost_usd: llm.cost_usd,
      status: 'completed',
      metadata: { context_keys: Object.keys(context || {}) },
    });
    if (logError) console.warn('[jarvis-admin-assistant] log skipped', logError.message);

    return json({
      ok: true,
      answer: llm.answer,
      context,
      model: llm.model,
      tokens: llm.tokens,
      cost_usd: llm.cost_usd,
    });
  } catch (error) {
    console.error('[jarvis-admin-assistant]', error);
    return json({ ok: false, error: 'unexpected', mensaje: error?.message || String(error) }, 500);
  }
});

async function tenantIsEnterprise(supabase: any, tenantId: string) {
  const { data: creditPlan } = await supabase
    .from('tenant_credit_plan')
    .select('plan')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (String(creditPlan?.plan || '').toLowerCase() === 'enterprise') return true;

  const { data: sub } = await supabase
    .from('suscripciones')
    .select('estado, fecha_fin, planes(nombre)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .order('fecha_fin', { ascending: false })
    .limit(1)
    .maybeSingle();

  return ['activo', 'trial'].includes(String(sub?.estado || '').toLowerCase())
    && new Date(sub?.fecha_fin || 0) > new Date()
    && String(sub?.planes?.nombre || '').toLowerCase() === 'enterprise';
}

async function loadBusinessContext(supabase: any, tenantId: string) {
  const [chatCtx, ventas, cotizaciones, eventos] = await Promise.all([
    supabase.rpc('ai_chat_context_summary', { p_tenant_id: tenantId }).then((r: any) => r.data).catch(() => null),
    supabase.from('facturas').select('id,total,estado,fecha').eq('estado', 'PAGADA').gte('fecha', new Date(Date.now() - 7 * 86400000).toISOString()).limit(200).then((r: any) => r.data || []).catch(() => []),
    supabase.from('cotizaciones').select('id,numero,total_cotizacion,estado,fecha_cotizacion,manual_cliente_nombre').gte('fecha_cotizacion', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).limit(100).then((r: any) => r.data || []).catch(() => []),
    supabase.from('crm_whatsapp_conversation_events').select('event_type,status,quote_total,customer_name,created_at').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).limit(100).then((r: any) => r.data || []).catch(() => []),
  ]);

  const totalVentas7d = ventas.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
  const totalCotizado7d = cotizaciones.reduce((sum: number, row: any) => sum + Number(row.total_cotizacion || 0), 0);

  return {
    resumen_ai_ceo: chatCtx,
    ventas_7d: { cantidad: ventas.length, total: totalVentas7d },
    cotizaciones_7d: { cantidad: cotizaciones.length, total: totalCotizado7d, ultimas: cotizaciones.slice(0, 8) },
    eventos_whatsapp_7d: eventos,
  };
}

async function callOpenAI({ message, context, tenantId }: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY no esta configurada en Supabase secrets');

  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ contexto_motoflow: context, pregunta: message }) },
      ],
      max_tokens: 450,
      temperature: 0.25,
      user: `motoflow-jarvis:${tenantId}`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err.slice(0, 500)}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content || 'No pude generar una respuesta.';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const tokens = inputTokens + outputTokens;

  return {
    answer,
    model: MODEL,
    tokens,
    cost_usd: 0,
    duration_ms: Date.now() - started,
  };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
