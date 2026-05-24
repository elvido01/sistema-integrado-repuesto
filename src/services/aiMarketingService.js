// ============================================================
// aiMarketingService.js — Cliente del módulo Marketing IA
// ============================================================
// Toda la IA pasa por la Edge Function motoflow-ai-marketing.
// Las lecturas/estados van directo a las tablas (RLS por tenant).
// ============================================================

import { supabase } from '@/lib/customSupabaseClient';

const FN = 'motoflow-ai-marketing';

async function invoke(action, payload = {}) {
    const { data, error } = await supabase.functions.invoke(FN, { body: { action, ...payload } });
    if (error) {
        // Intentar leer el mensaje real que devuelve la función
        let msg = error.message;
        try {
            const body = await error.context?.json?.();
            if (body?.mensaje || body?.error) msg = body.mensaje || body.error;
        } catch { /* noop */ }
        throw new Error(msg);
    }
    if (data && data.ok === false) throw new Error(data.mensaje || data.error || 'Error del agente');
    return data;
}

// ── IA (Edge Function) ──
export const getRecommendedProductsForMarketing = (opts = {}) =>
    invoke('suggest_today', opts);

export const generateProductProposal = (producto_id, opts = {}) =>
    invoke('generate_proposal', { producto_id, ...opts });

export const regenerateProposal = (producto_id, opts = {}) =>
    invoke('regenerate_proposal', { producto_id, ...opts });

export const generateContentImage = (content_id, opts = {}) =>
    invoke('generate_image', { content_id, ...opts });

// ── Estados / historial (tablas) ──
export async function markContentState(content_id, estado) {
    const patch = { estado };
    if (estado === 'publicado') patch.published_at = new Date().toISOString();
    const { data, error } = await supabase
        .from('ai_marketing_content').update(patch).eq('id', content_id).select('*').single();
    if (error) throw error;
    // Registrar en historial
    await supabase.from('ai_product_content_history').insert({
        tenant_id: data.tenant_id, producto_id: data.producto_id, content_id,
        accion: estado, snapshot: { estado },
    });
    return data;
}

export const markContentAsPublished = (content_id) => markContentState(content_id, 'publicado');

export async function scheduleContent(content_id, fecha_programada) {
    const { data, error } = await supabase
        .from('ai_marketing_content')
        .update({ fecha_programada }).eq('id', content_id).select('*').single();
    if (error) throw error;
    return data;
}

export async function listContent({ estado, canal, producto_id, tenantId } = {}) {
    let q = supabase.from('ai_marketing_content')
        .select('*, productos(codigo, descripcion, imagen_url)')
        .order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (estado && estado !== 'todos') q = q.eq('estado', estado);
    if (producto_id) q = q.eq('producto_id', producto_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).filter((c) => !canal || canal === 'todos' || c.canal_recomendado === canal);
}

export async function getWeeklyContentCalendar(tenantId, weekStartISO, weekEndISO) {
    const { data, error } = await supabase
        .from('ai_marketing_content')
        .select('id, titulo_youtube, canal_recomendado, estado, fecha_programada, producto_id, productos(codigo, descripcion)')
        .eq('tenant_id', tenantId)
        .not('fecha_programada', 'is', null)
        .gte('fecha_programada', weekStartISO)
        .lte('fecha_programada', weekEndISO);
    if (error) throw error;
    return data || [];
}

export async function getContentHistory(tenantId, producto_id) {
    const { data, error } = await supabase
        .from('ai_product_content_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('producto_id', producto_id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ── Settings ──
export async function getMarketingSettings(tenantId) {
    const { data } = await supabase
        .from('ai_marketing_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
    return data;
}

export async function saveMarketingSettings(tenantId, patch) {
    const { data, error } = await supabase
        .from('ai_marketing_settings')
        .upsert({ tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() })
        .select('*').single();
    if (error) throw error;
    return data;
}

// ── Consumo diario (medidor) ──
export async function getDailyConsumption(tenantId) {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('ai_agent_runs')
        .select('cost_usd, run_type')
        .eq('tenant_id', tenantId)
        .eq('agent_key', 'ai_marketing')
        .gte('created_at', hoy + 'T00:00:00Z');
    if (error) return { total: 0, llamados: 0, imagenes: 0 };
    const rows = data || [];
    return {
        total: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
        llamados: rows.length,
        imagenes: rows.filter((r) => r.run_type === 'image').length,
    };
}
