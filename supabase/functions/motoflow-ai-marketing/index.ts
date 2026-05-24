// ============================================================
// motoflow-ai-marketing — Agente de Marketing IA (Fase 1)
// ============================================================
// Flujo guiado (no publica automáticamente):
//   1. suggest_today      -> analiza catálogo y propone 3 productos
//   2. generate_proposal  -> guion/copys completos de 1 producto (borrador)
//   3. regenerate_proposal-> otra versión del contenido
//   4. generate_image     -> imagen/miniatura real (opt-in, con tope diario)
//
// Auth: usuario admin/owner autenticado (se fuerza su tenant).
// POST /functions/v1/motoflow-ai-marketing
// Body: { action, ...payload }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { callLLM, generateImage } from './llm.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres el agente de Marketing IA de Repuestos Morla / MotoFlow.
Tu trabajo es ayudar al negocio a vender más con contenido estratégico para YouTube, Reels, TikTok, Instagram, Facebook y WhatsApp.

Reglas:
1. Si el producto tiene existencia, puedes promocionarlo normalmente.
2. Si el producto NO tiene existencia (modo "encargo"), NO digas "disponible"; usa "pedido por encargo" o "próximamente disponible".
3. Si el producto no tiene precio, marca el contenido como incompleto.
4. No prometas mano de obra gratis salvo que el producto sea cambio de aceite o el negocio lo indique.
5. Usa tono dominicano, cercano, profesional y vendedor.
6. Para videos tipo Veo 3, divide los guiones en escenas de máximo 8 segundos.
7. No inventes datos que no estén en el contexto entregado.
8. Sé claro, corto y persuasivo. Incluye llamada a la acción a WhatsApp cuando haya existencia.`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ── Auth: usuario admin/owner ──
        const authHeader = req.headers.get('Authorization') || '';
        if (!authHeader) return json({ ok: false, error: 'no_auth' }, 401);
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);
        const user = userData.user;

        const { data: prof } = await supabase
            .from('profiles').select('role, tenant_id').eq('id', user.id).maybeSingle();
        if (!prof?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);
        if (!['owner', 'admin'].includes(prof.role)) {
            return json({ ok: false, error: 'forbidden', mensaje: 'Solo administradores pueden usar Marketing IA.' }, 403);
        }
        const tenant_id = prof.tenant_id;

        const body = await req.json().catch(() => ({}));
        const action = String(body?.action || '');

        // Settings del tenant (crea defaults si no existen)
        const settings = await getSettings(supabase, tenant_id);

        switch (action) {
            case 'suggest_today':
                return await suggestToday(supabase, tenant_id, user.id, settings, body);
            case 'generate_proposal':
                return await generateProposal(supabase, tenant_id, user.id, settings, body);
            case 'regenerate_proposal':
                return await generateProposal(supabase, tenant_id, user.id, settings, { ...body, regenerar: true });
            case 'generate_image':
                return await genImage(supabase, tenant_id, user.id, settings, body);
            default:
                return json({ ok: false, error: 'accion_desconocida', mensaje: `Acción no válida: ${action}` }, 400);
        }
    } catch (err: any) {
        console.error('[motoflow-ai-marketing]', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

// ────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────
async function getSettings(supabase: any, tenant_id: string) {
    const { data } = await supabase
        .from('ai_marketing_settings').select('*').eq('tenant_id', tenant_id).maybeSingle();
    if (data) return data;
    const def = {
        tenant_id,
        negocio_nombre: 'Repuestos Morla',
        tono: 'dominicano, cercano, profesional y vendedor',
        permitir_sin_imagen: false,
        max_imagenes_por_dia: 5,
        canales_default: ['reel', 'whatsapp', 'instagram'],
    };
    await supabase.from('ai_marketing_settings').upsert(def);
    return def;
}

// ────────────────────────────────────────────────
// 1) suggest_today — 3 productos recomendados para hoy
// ────────────────────────────────────────────────
async function suggestToday(supabase: any, tenant_id: string, uid: string, settings: any, body: any) {
    const { data: cands, error } = await supabase.rpc('get_marketing_candidates', {
        p_tenant_id: tenant_id,
        p_permitir_sin_imagen: !!settings.permitir_sin_imagen,
        p_limit: 8,
    });
    if (error) throw new Error('candidatos: ' + error.message);

    // Aplanar y deduplicar el pool de candidatos
    const pool: any[] = [];
    const seen = new Set<string>();
    for (const grupo of ['mas_vendidos', 'buen_margen', 'baja_rotacion', 'alta_existencia', 'recien_llegados']) {
        for (const p of (cands?.[grupo] || [])) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            pool.push({ ...p, _grupo: grupo });
        }
    }
    if (pool.length === 0) {
        return json({ ok: true, sugerencias: [], mensaje: 'No hay productos que cumplan los criterios (precio/imagen). Revisa el catálogo o activa "permitir sin imagen".' });
    }

    // 1 llamado IA: elegir los 3 mejores para HOY con una razón corta
    const compact = pool.slice(0, 12).map((p) => ({
        id: p.id, codigo: p.codigo, descripcion: p.descripcion,
        precio: p.precio, margen_pct: p.margen_pct, existencia: p.existencia,
        vendidos_30d: p.vendidos_30d, modo: p.modo, grupo: p._grupo,
    }));

    const llm = await callLLM({
        system: SYSTEM_PROMPT,
        json: true,
        user_tag: tenant_id,
        max_tokens: 700,
        temperature: 0.5,
        user: `De esta lista de productos candidatos, elige los 3 MEJORES para publicar HOY y prioriza: alta existencia, buen margen o baja rotación. Devuelve JSON:
{"seleccionados":[{"producto_id":"<id>","razon":"<por qué publicar hoy, 1 frase>","canal_sugerido":"<reel|youtube|whatsapp|instagram|facebook>"}]}
Candidatos: ${JSON.stringify(compact)}`,
    });

    let picks: any[] = [];
    try { picks = (JSON.parse(llm.content)?.seleccionados || []).slice(0, 3); } catch { picks = []; }

    // Mapear de vuelta a los datos completos del producto
    const sugerencias = picks
        .map((s: any) => {
            const prod = pool.find((p) => p.id === s.producto_id);
            if (!prod) return null;
            return { ...prod, razon: s.razon, canal_sugerido: s.canal_sugerido };
        })
        .filter(Boolean);

    // Fallback: si la IA no devolvió ids válidos, usar los 3 primeros del pool
    const final = sugerencias.length > 0 ? sugerencias : pool.slice(0, 3).map((p) => ({
        ...p, razon: 'Candidato destacado del catálogo', canal_sugerido: 'reel',
    }));

    // Crear la campaña/sesión del día (modo prueba)
    const { data: campaign } = await supabase
        .from('ai_marketing_campaigns')
        .insert({
            tenant_id,
            nombre: `Sugerencias ${new Date().toISOString().slice(0, 10)}`,
            estado: 'borrador',
            producto_ids: final.map((p: any) => p.id),
            modo_prueba: body?.modo_prueba !== false,
            created_by: uid,
        })
        .select('id').single();

    await logRun(supabase, tenant_id, uid, 'suggest_today', llm);

    return json({ ok: true, campaign_id: campaign?.id, sugerencias: final, cost_usd: llm.cost_usd });
}

// ────────────────────────────────────────────────
// 2/3) generate_proposal / regenerate_proposal
// ────────────────────────────────────────────────
async function generateProposal(supabase: any, tenant_id: string, uid: string, settings: any, body: any) {
    const producto_id = body?.producto_id;
    if (!producto_id) return json({ ok: false, error: 'falta_producto' }, 400);

    const { data: p } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, precio, costo, imagen_url')
        .eq('id', producto_id).eq('tenant_id', tenant_id).maybeSingle();
    if (!p) return json({ ok: false, error: 'producto_no_encontrado' }, 404);

    const { data: stock } = await supabase.rpc('get_stock_actual', { producto_uuid: producto_id });
    const existencia = Number(stock || 0);
    const tiene_imagen = !!(p.imagen_url && p.imagen_url !== '');
    const sin_precio = !(p.precio > 0);
    const modo = existencia > 0 ? 'normal' : 'encargo';
    const margen_pct = (p.precio > 0 && p.costo > 0)
        ? Math.round(((p.precio - p.costo) / p.precio) * 1000) / 10 : null;

    const contexto = {
        negocio: settings.negocio_nombre,
        whatsapp: settings.whatsapp_numero || null,
        producto: {
            codigo: p.codigo, descripcion: p.descripcion, precio: p.precio,
            margen_pct, existencia, modo, tiene_imagen,
        },
        feedback_usuario: body?.feedback || null,
    };

    const llm = await callLLM({
        system: SYSTEM_PROMPT + `\nTono: ${settings.tono}.` + (settings.reglas_extra ? `\nReglas del negocio: ${settings.reglas_extra}` : ''),
        json: true,
        user_tag: tenant_id,
        max_tokens: 1600,
        temperature: body?.regenerar ? 0.85 : 0.6,
        user: `Genera una propuesta de contenido comercial COMPLETA para este producto. ${body?.regenerar ? 'Es una NUEVA versión, hazla distinta a lo anterior.' : ''}
Responde SOLO con JSON válido en este formato exacto:
{
 "titulo_youtube": "",
 "descripcion_seo": "",
 "guion_8s": [{"escena":1,"texto":"","visual":""}],
 "guion_15s": [{"escena":1,"texto":"","visual":""}],
 "guion_30s": [{"escena":1,"texto":"","visual":""}],
 "copy_instagram": "",
 "copy_facebook": "",
 "texto_whatsapp": "",
 "cta": "",
 "sugerencia_visual": "",
 "idea_miniatura": "",
 "canal_recomendado": "",
 "prompt_imagen": "<prompt en inglés, descriptivo, para generar una miniatura llamativa de este producto>"
}
Cada escena de los guiones debe durar máximo 8 segundos. Si modo='encargo', NO digas 'disponible'.
Contexto real: ${JSON.stringify(contexto)}`,
    });

    let parsed: any = {};
    try { parsed = JSON.parse(llm.content); } catch { parsed = {}; }

    const incompleto = sin_precio || (!tiene_imagen && !settings.permitir_sin_imagen);
    const flags = {
        sin_precio, sin_imagen: !tiene_imagen, modo_encargo: modo === 'encargo',
        prompt_imagen: parsed.prompt_imagen || null,
    };

    // ¿Regenerar reemplaza la versión previa? Creamos fila nueva y guardamos versión.
    let version = 1;
    if (body?.content_id) {
        const { data: prev } = await supabase
            .from('ai_marketing_content').select('version').eq('id', body.content_id).maybeSingle();
        version = (prev?.version || 1) + 1;
    }

    const row = {
        tenant_id,
        campaign_id: body?.campaign_id || null,
        producto_id,
        titulo_youtube: parsed.titulo_youtube || null,
        descripcion_seo: parsed.descripcion_seo || null,
        guion_8s: parsed.guion_8s || [],
        guion_15s: parsed.guion_15s || [],
        guion_30s: parsed.guion_30s || [],
        copy_instagram: parsed.copy_instagram || null,
        copy_facebook: parsed.copy_facebook || null,
        texto_whatsapp: parsed.texto_whatsapp || null,
        cta: parsed.cta || null,
        sugerencia_visual: parsed.sugerencia_visual || null,
        idea_miniatura: parsed.idea_miniatura || null,
        canal_recomendado: parsed.canal_recomendado || null,
        estado: 'borrador',
        incompleto,
        flags,
        version,
        provider: llm.provider,
        model: llm.model,
        cost_usd: llm.cost_usd,
        created_by: uid,
    };

    const { data: saved, error: insErr } = await supabase
        .from('ai_marketing_content').insert(row).select('*').single();
    if (insErr) throw new Error('guardar contenido: ' + insErr.message);

    await supabase.from('ai_product_content_history').insert({
        tenant_id, producto_id, content_id: saved.id,
        accion: body?.regenerar ? 'regenerado' : 'generado',
        snapshot: { titulo: saved.titulo_youtube, version }, created_by: uid,
    });
    await logRun(supabase, tenant_id, uid, body?.regenerar ? 'regenerate_proposal' : 'generate_proposal', llm);

    return json({ ok: true, content: saved, incompleto, cost_usd: llm.cost_usd });
}

// ────────────────────────────────────────────────
// 4) generate_image — imagen/miniatura real (opt-in + tope diario)
// ────────────────────────────────────────────────
async function genImage(supabase: any, tenant_id: string, uid: string, settings: any, body: any) {
    const content_id = body?.content_id;
    if (!content_id) return json({ ok: false, error: 'falta_content' }, 400);

    const { data: content } = await supabase
        .from('ai_marketing_content').select('*').eq('id', content_id).eq('tenant_id', tenant_id).maybeSingle();
    if (!content) return json({ ok: false, error: 'contenido_no_encontrado' }, 404);

    // Tope diario de imágenes
    const hoy = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
        .from('ai_product_content_history')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id).eq('accion', 'imagen_generada')
        .gte('created_at', hoy + 'T00:00:00Z');
    const max = settings.max_imagenes_por_dia ?? 5;
    if ((count || 0) >= max) {
        return json({ ok: false, error: 'tope_imagenes', mensaje: `Llegaste al tope de ${max} imágenes por hoy. Ajústalo en Configuración si necesitas más.` }, 429);
    }

    const prompt = body?.prompt
        || content?.flags?.prompt_imagen
        || `Eye-catching social media thumbnail for an auto parts product: ${content?.idea_miniatura || content?.titulo_youtube || 'motorcycle spare part'}. Bold, high contrast, clean background, professional product photo style.`;

    const img = await generateImage({ prompt, size: body?.size || '1024x1024', quality: body?.quality || 'medium' });

    // Subir a Storage
    const bytes = Uint8Array.from(atob(img.b64), (c) => c.charCodeAt(0));
    const path = `${tenant_id}/${content_id}/${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from('ai-marketing').upload(path, bytes, {
        contentType: 'image/png', upsert: true,
    });
    if (upErr) throw new Error('subir imagen: ' + upErr.message);
    const { data: pub } = supabase.storage.from('ai-marketing').getPublicUrl(path);
    const url = pub.publicUrl;

    const nuevasImagenes = [...(content.imagenes || []), {
        url, tipo: body?.tipo || 'miniatura', cost_usd: img.cost_usd, created_at: new Date().toISOString(),
    }];
    await supabase.from('ai_marketing_content')
        .update({ imagenes: nuevasImagenes, cost_usd: Number(content.cost_usd || 0) + img.cost_usd })
        .eq('id', content_id);

    await supabase.from('ai_product_content_history').insert({
        tenant_id, producto_id: content.producto_id, content_id,
        accion: 'imagen_generada', snapshot: { url, cost_usd: img.cost_usd }, created_by: uid,
    });
    await supabase.from('ai_agent_runs').insert({
        tenant_id, user_id: uid, agent_key: 'ai_marketing', agent_name: 'ai_marketing',
        run_type: 'image', credits_used: 1, provider: 'openai', model: 'gpt-image-1',
        cost_usd: img.cost_usd, status: 'completed', metadata: { content_id },
    });

    return json({ ok: true, url, cost_usd: img.cost_usd, imagenes: nuevasImagenes });
}

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
async function logRun(supabase: any, tenant_id: string, uid: string, runType: string, llm: any) {
    try {
        await supabase.from('ai_agent_runs').insert({
            tenant_id, user_id: uid, agent_key: 'ai_marketing', agent_name: 'ai_marketing',
            run_type: runType, credits_used: 1,
            provider: llm.provider, model: llm.model,
            input_tokens: llm.input_tokens, output_tokens: llm.output_tokens,
            cost_usd: llm.cost_usd, status: 'completed', duration_ms: llm.duration_ms,
            metadata: { module: 'marketing' },
        });
    } catch (e) { console.warn('logRun:', e); }
}

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
