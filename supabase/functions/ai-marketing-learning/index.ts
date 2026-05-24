// ============================================================
// ai-marketing-learning — Aprendizaje del agente de Marketing
// ============================================================
// Analiza publicaciones + métricas + impacto en ventas y genera
// el reporte de aprendizaje y recomendaciones (1 llamado LLM).
// Se ejecuta bajo demanda (botón) o por cron semanal.
//
// POST /functions/v1/ai-marketing-learning  Body: { action }
//   action = 'generate_learning'
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { callLLM } from './llm.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SYSTEM_PROMPT = `Eres el agente de Marketing Intelligence de MotoFlow / Repuestos Morla.
Analizas métricas de redes (YouTube, Instagram, TikTok, Facebook, WhatsApp), publicaciones, productos, ventas e inventario para recomendar mejores estrategias de contenido.

Reglas:
- NUNCA digas que una venta fue causada 100% por una publicación. Usa "impacto estimado".
- Prioriza recomendaciones que generen ventas, rotación de inventario y mejor margen.
- Si un video tiene muchas vistas pero pocas ventas, recomienda mejorar el llamado a la acción.
- Si un producto tiene pocas vistas pero muchas ventas, recomienda repetirlo con mejor miniatura/título.
- Si un producto tiene alta existencia y bajo movimiento, recomienda campaña de rotación.
- Si un producto está agotado, no recomiendes promoción directa salvo para captar pedidos.
- Si un canal no tiene suficientes datos, indícalo claramente y baja el nivel de confianza.
- Tono dominicano, profesional y práctico.`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const CRON_SECRET = Deno.env.get('DAILY_INSIGHTS_CRON_SECRET') || '';
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const authHeader = req.headers.get('Authorization') || '';
        const cronSecret = req.headers.get('x-cron-secret') || '';
        const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
        const isCron = CRON_SECRET && cronSecret === CRON_SECRET;

        const body = await req.json().catch(() => ({}));
        let tenant_id = body?.tenant_id || null;
        let uid = null;

        if (!isServiceRole && !isCron) {
            const token = authHeader.replace(/^Bearer\s+/i, '');
            const { data: userData, error: userErr } = await supabase.auth.getUser(token);
            if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);
            uid = userData.user.id;
            const { data: prof } = await supabase
                .from('profiles').select('role, tenant_id').eq('id', uid).maybeSingle();
            if (!prof?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);
            if (!['owner', 'admin'].includes(prof.role)) return json({ ok: false, error: 'forbidden' }, 403);
            tenant_id = prof.tenant_id;
        }
        if (!tenant_id) return json({ ok: false, error: 'sin_tenant' }, 400);

        return await generateLearning(supabase, tenant_id, uid);
    } catch (err: any) {
        console.error('[ai-marketing-learning]', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

async function generateLearning(supabase: any, tenant_id: string, uid: string | null) {
    // 1. Publicaciones recientes (60d) con producto
    const desde = new Date(Date.now() - 60 * 864e5).toISOString();
    const { data: posts } = await supabase
        .from('social_posts')
        .select('id, platform, post_type, estilo_guion, title, producto_id, published_at, productos(codigo, descripcion, precio, costo)')
        .eq('tenant_id', tenant_id).eq('status', 'publicado')
        .gte('published_at', desde)
        .order('published_at', { ascending: false })
        .limit(40);

    if (!posts || posts.length === 0) {
        return json({ ok: true, vacio: true, mensaje: 'Aún no hay publicaciones registradas para analizar. Registra publicaciones y métricas primero.' });
    }

    const postIds = posts.map((p: any) => p.id);
    const { data: metrics } = await supabase
        .from('social_post_metrics')
        .select('post_id, views, likes, comments, shares, saves, clicks, performance_score, captured_at')
        .in('post_id', postIds).order('captured_at', { ascending: false });
    const { data: impacts } = await supabase
        .from('ai_marketing_sales_impact')
        .select('post_id, sales_impact_score, clasificacion, units_before, units_after, wa_quotes_after')
        .in('post_id', postIds);

    const lastMetric: Record<string, any> = {};
    for (const m of metrics || []) if (!lastMetric[m.post_id]) lastMetric[m.post_id] = m;
    const impactByPost: Record<string, any> = {};
    for (const im of impacts || []) impactByPost[im.post_id] = im;

    // 2. Resumen compacto para el LLM
    const compact = posts.map((p: any) => {
        const m = lastMetric[p.id] || {};
        const im = impactByPost[p.id] || {};
        return {
            plataforma: p.platform, tipo: p.post_type, estilo: p.estilo_guion,
            producto: p.productos?.descripcion || (p.producto_id ? p.producto_id : 'general'),
            views: m.views || 0, likes: m.likes || 0, comments: m.comments || 0,
            shares: m.shares || 0, clicks: m.clicks || 0,
            performance: m.performance_score || 0,
            impacto_ventas: im.sales_impact_score ?? null,
            clasificacion: im.clasificacion ?? 'sin_calcular',
            unidades_despues: im.units_after ?? null,
            cotizaciones_despues: im.wa_quotes_after ?? null,
        };
    });

    const llm = await callLLM({
        system: SYSTEM_PROMPT,
        json: true, user_tag: tenant_id, max_tokens: 1800, temperature: 0.4,
        user: `Analiza estas publicaciones (con métricas e impacto estimado en ventas) y devuelve SOLO JSON con esta estructura:
{
 "resumen": "<resumen ejecutivo, 2-3 frases>",
 "top_contenidos": [{"detalle":"","por_que":""}],
 "top_productos": [{"producto":"","impacto":""}],
 "no_funcionaron": [{"detalle":"","sugerencia":""}],
 "recomendaciones": [{"accion":"","por_que":""}],
 "productos_recomendados": [{"producto":"","motivo":""}],
 "estilo_recomendado": "",
 "canal_recomendado": "",
 "confianza": "alta|media|baja"
}
Si hay pocos datos, di que la confianza es baja. Recuerda: "impacto estimado", nunca causa 100%.
Datos (${compact.length} publicaciones): ${JSON.stringify(compact)}`,
    });

    let parsed: any = {};
    try { parsed = JSON.parse(llm.content); } catch { parsed = {}; }

    const { data: saved } = await supabase.from('ai_marketing_learning').insert({
        tenant_id,
        periodo: new Date().toISOString().slice(0, 10),
        resumen: parsed.resumen || null,
        top_contenidos: parsed.top_contenidos || [],
        top_productos: parsed.top_productos || [],
        no_funcionaron: parsed.no_funcionaron || [],
        recomendaciones: parsed.recomendaciones || [],
        productos_recomendados: parsed.productos_recomendados || [],
        estilo_recomendado: parsed.estilo_recomendado || null,
        canal_recomendado: parsed.canal_recomendado || null,
        confianza: parsed.confianza || 'baja',
        provider: llm.provider, model: llm.model, cost_usd: llm.cost_usd,
        raw: parsed,
    }).select('*').single();

    await supabase.from('ai_agent_runs').insert({
        tenant_id, user_id: uid, agent_key: 'ai_marketing_learning', agent_name: 'ai_marketing_learning',
        run_type: 'learning', credits_used: 1, provider: llm.provider, model: llm.model,
        input_tokens: llm.input_tokens, output_tokens: llm.output_tokens,
        cost_usd: llm.cost_usd, status: 'completed', duration_ms: llm.duration_ms,
        metadata: { posts: compact.length },
    });

    return json({ ok: true, learning: saved, cost_usd: llm.cost_usd });
}

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
