// ============================================================
// brandKitService.js — CRUD del kit de marca del tenant
// ============================================================
import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'designs'; // reutilizamos el bucket de Disen~o Pro

export async function getBrandKit(tenantId) {
    const { data, error } = await supabase
        .from('brand_kit').select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    return data;
}

export async function saveBrandKit(tenantId, payload) {
    const row = { tenant_id: tenantId, ...payload };
    const { data, error } = await supabase
        .from('brand_kit').upsert(row, { onConflict: 'tenant_id' })
        .select('*').single();
    if (error) throw error;
    return data;
}

export async function uploadBrandLogo(tenantId, file) {
    const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
    const path = `${tenantId}/brand/logo_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'image/png',
        upsert: true,
    });
    if (error) throw error;
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await saveBrandKit(tenantId, { logo_url: url });
    return url;
}
