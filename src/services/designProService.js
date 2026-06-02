// ============================================================
// designProService.js — CRUD del modulo Disen~o Pro (estilo Canva)
// ============================================================
// Maneja design_templates (plantillas del sistema, solo lectura
// para el tenant) y design_documents (disen~os del tenant).
// ============================================================
import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'designs';

// ── PLANTILLAS DEL SISTEMA ─────────────────────────────────
export async function getTemplates({ category = null } = {}) {
    let q = supabase
        .from('design_templates')
        .select('id, slug, name, category, format, width, height, preview_url, description, variables, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

export async function getTemplate(idOrSlug) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const column = isUuid ? 'id' : 'slug';
    const { data, error } = await supabase
        .from('design_templates')
        .select('*')
        .eq(column, idOrSlug)
        .single();
    if (error) throw error;
    return data;
}

// ── DOCUMENTOS DEL TENANT ─────────────────────────────────
export async function listDesigns(tenantId, { status = null, limit = 50 } = {}) {
    let q = supabase
        .from('design_documents')
        .select('id, name, format, width, height, thumbnail_url, rendered_url, status, generated_by_ai, template_id, producto_id, updated_at, created_at, published_to')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

export async function getDesign(id) {
    const { data, error } = await supabase
        .from('design_documents')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function createDesignFromTemplate({ tenantId, userId, template, productoId = null, name = null }) {
    const payload = {
        tenant_id: tenantId,
        user_id: userId,
        template_id: template.id,
        producto_id: productoId,
        name: name || `${template.name} — ${new Date().toLocaleDateString('es-DO')}`,
        format: template.format,
        width: template.width,
        height: template.height,
        content: template.content,
        status: 'borrador',
    };
    const { data, error } = await supabase.from('design_documents').insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

export async function createBlankDesign({ tenantId, userId, format = 'post_square', width = 1080, height = 1080, name = 'Nuevo disen~o' }) {
    const payload = {
        tenant_id: tenantId,
        user_id: userId,
        name,
        format,
        width,
        height,
        content: { width, height, pages: [{ children: [] }] },
        status: 'borrador',
    };
    const { data, error } = await supabase.from('design_documents').insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

export async function updateDesign(id, patch) {
    const { data, error } = await supabase
        .from('design_documents')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

export async function deleteDesign(id) {
    const { error } = await supabase.from('design_documents').delete().eq('id', id);
    if (error) throw error;
}

export async function duplicateDesign(id, { newName = null } = {}) {
    const original = await getDesign(id);
    const { id: _omit, created_at: _ca, updated_at: _ua, ...rest } = original;
    const dup = { ...rest, name: newName || `${original.name} (copia)`, status: 'borrador', published_to: null };
    const { data, error } = await supabase.from('design_documents').insert(dup).select('*').single();
    if (error) throw error;
    return data;
}

// ── STORAGE: subir thumbnail / imagen final ─────────────────
async function uploadBlob(tenantId, designId, blob, filename) {
    const path = `${tenantId}/${designId}/${filename}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || 'image/png',
        upsert: true,
    });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function saveThumbnail(tenantId, designId, blob) {
    const url = await uploadBlob(tenantId, designId, blob, 'thumb.png');
    await updateDesign(designId, { thumbnail_url: url });
    return url;
}

export async function saveRendered(tenantId, designId, blob, { markReady = true } = {}) {
    const url = await uploadBlob(tenantId, designId, blob, `final_${Date.now()}.png`);
    const patch = { rendered_url: url };
    if (markReady) patch.status = 'listo';
    await updateDesign(designId, patch);
    return url;
}
