// ============================================================
// socialMetricsService.js — Marketing IA Fase 2 (Métricas)
// ============================================================
// Núcleo 2a: registro manual + impacto en ventas (RPC) + aprendizaje.
// Las sync* de APIs reales llegan en Fase 2b (stubs por ahora).
// Los tokens NUNCA pasan por aquí (viven en social_account_secrets,
// solo accesibles por el backend).
// ============================================================

import { supabase } from '@/lib/customSupabaseClient';

// ── Cuentas sociales ──
export async function connectSocialAccount(tenantId, platform, account_name) {
    // Fase 2a: registro manual (sin OAuth). La conexión real OAuth es 2b.
    const { data, error } = await supabase
        .from('social_accounts')
        .upsert({
            tenant_id: tenantId, platform, account_name,
            external_account_id: account_name || platform, status: 'manual',
        }, { onConflict: 'tenant_id,platform,external_account_id' })
        .select('*').single();
    if (error) throw error;
    return data;
}

export async function listSocialAccounts(tenantId) {
    const { data, error } = await supabase
        .from('social_accounts').select('*').eq('tenant_id', tenantId)
        .order('connected_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function disconnectSocialAccount(id) {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (error) throw error;
}

// ── Publicaciones ──
export async function saveSocialPost(tenantId, payload) {
    const row = {
        tenant_id: tenantId,
        content_id: payload.content_id || null,
        producto_id: payload.producto_id || null,
        campaign_id: payload.campaign_id || null,
        platform: payload.platform,
        post_type: payload.post_type || null,
        estilo_guion: payload.estilo_guion || null,
        external_post_id: payload.external_post_id || null,
        external_url: payload.external_url || null,
        title: payload.title || null,
        description: payload.description || null,
        script_used: payload.script_used || null,
        thumbnail_url: payload.thumbnail_url || null,
        published_at: payload.published_at || new Date().toISOString(),
        status: payload.status || 'publicado',
        is_general: !payload.producto_id,
    };
    const { data, error } = await supabase.from('social_posts').insert(row).select('*').single();
    if (error) throw error;
    return data;
}

export async function listSocialPosts(tenantId, { platform, producto_id } = {}) {
    let q = supabase.from('social_posts')
        .select('*, productos(codigo, descripcion, imagen_url)')
        .eq('tenant_id', tenantId)
        .order('published_at', { ascending: false });
    if (platform && platform !== 'todos') q = q.eq('platform', platform);
    if (producto_id) q = q.eq('producto_id', producto_id);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

export async function deleteSocialPost(id) {
    const { error } = await supabase.from('social_posts').delete().eq('id', id);
    if (error) throw error;
}

// ── Métricas manuales ──
export async function saveManualMetrics(tenantId, postId, m) {
    const total = (Number(m.likes || 0) + Number(m.comments || 0) + Number(m.shares || 0) + Number(m.saves || 0));
    const eng = m.views > 0 ? Number(((total / Number(m.views)) * 100).toFixed(2)) : 0;
    const { data, error } = await supabase.from('social_post_metrics').insert({
        tenant_id: tenantId, post_id: postId,
        views: m.views || 0, likes: m.likes || 0, comments: m.comments || 0,
        shares: m.shares || 0, saves: m.saves || 0, clicks: m.clicks || 0,
        reach: m.reach || 0, impressions: m.impressions || 0,
        engagement_rate: eng, origen: 'manual', raw_data: m.raw_data || {},
    }).select('*').single();
    if (error) throw error;
    return data;
}

export async function getLatestMetrics(tenantId, postIds) {
    if (!postIds?.length) return {};
    const { data } = await supabase
        .from('social_post_metrics')
        .select('post_id, views, likes, comments, shares, saves, clicks, performance_score, engagement_rate, captured_at')
        .in('post_id', postIds).order('captured_at', { ascending: false });
    const latest = {};
    for (const m of data || []) if (!latest[m.post_id]) latest[m.post_id] = m;
    return latest;
}

// ── Impacto en ventas (RPC SQL, sin costo) ──
// Calcula performance_score Y sales_impact_score de una vez.
export async function calculateSalesImpact(postId, rangoDias = 7) {
    const { data, error } = await supabase.rpc('compute_marketing_impact', {
        p_post_id: postId, p_rango_dias: rangoDias,
    });
    if (error) throw error;
    return data;
}
export const calculatePostPerformanceScore = calculateSalesImpact; // misma RPC

export async function getImpacts(tenantId, postIds) {
    if (!postIds?.length) return {};
    const { data } = await supabase
        .from('ai_marketing_sales_impact')
        .select('*').in('post_id', postIds);
    const byPost = {};
    for (const im of data || []) byPost[im.post_id] = im;
    return byPost;
}

export async function getProductContentImpact(tenantId, productId) {
    const { data, error } = await supabase
        .from('ai_marketing_sales_impact')
        .select('*, social_posts(platform, title, published_at)')
        .eq('tenant_id', tenantId).eq('producto_id', productId)
        .order('computed_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ── Ranking / Dashboard ──
export async function getTopPerformingPosts(tenantId, limit = 20) {
    const posts = await listSocialPosts(tenantId);
    const ids = posts.map((p) => p.id);
    const [metrics, impacts] = await Promise.all([getLatestMetrics(tenantId, ids), getImpacts(tenantId, ids)]);
    return posts
        .map((p) => ({ ...p, metric: metrics[p.id] || {}, impact: impacts[p.id] || {} }))
        .sort((a, b) => (b.metric.performance_score || 0) - (a.metric.performance_score || 0))
        .slice(0, limit);
}

export async function getDashboardTotals(tenantId) {
    const posts = await listSocialPosts(tenantId);
    const ids = posts.map((p) => p.id);
    const metrics = await getLatestMetrics(tenantId, ids);
    const t = { posts: posts.length, views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, porPlataforma: {} };
    for (const p of posts) {
        const m = metrics[p.id] || {};
        t.views += Number(m.views || 0); t.likes += Number(m.likes || 0);
        t.comments += Number(m.comments || 0); t.shares += Number(m.shares || 0);
        t.clicks += Number(m.clicks || 0);
        t.porPlataforma[p.platform] = (t.porPlataforma[p.platform] || 0) + 1;
    }
    return t;
}

// ── Aprendizaje / Recomendaciones (Edge Function LLM) ──
export async function generateMarketingLearning() {
    const { data, error } = await supabase.functions.invoke('ai-marketing-learning', {
        body: { action: 'generate_learning' },
    });
    if (error) throw new Error(error.message);
    if (data?.ok === false) throw new Error(data.mensaje || data.error);
    return data;
}

export async function getRecommendedContentStrategy(tenantId) {
    const { data } = await supabase
        .from('ai_marketing_learning').select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data;
}

// ── Sync de APIs reales — Fase 2b (stubs) ──
const noSync = (plat) => async () => {
    throw new Error(`La sincronización automática de ${plat} llega en la Fase 2b. Por ahora registra las métricas manualmente.`);
};
export const syncYouTubeMetrics = noSync('YouTube');
export const syncInstagramMetrics = noSync('Instagram');
export const syncTikTokMetrics = noSync('TikTok');
export const syncWhatsAppMetrics = noSync('WhatsApp');
