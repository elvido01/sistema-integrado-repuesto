// ============================================================
// captutProService.js - CRUD de proyectos Captut Pro
// ============================================================
import { supabase } from '@/lib/customSupabaseClient';

const TABLE = 'captut_video_projects';
const BUCKET = 'captut-pro';

export async function listCaptutProjects(tenantId, { status = null, limit = 30 } = {}) {
    let query = supabase
        .from(TABLE)
        .select('id, name, aspect, duration, source_name, source_url, status, rendered_url, thumbnail_url, updated_at, created_at')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getCaptutProject(id) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function createCaptutProject({ tenantId, userId, name, aspect, duration, sourceName = null, content }) {
    const payload = {
        tenant_id: tenantId,
        user_id: userId,
        name,
        aspect,
        duration,
        source_name: sourceName,
        source_url: content?.source?.url || null,
        content,
        status: 'borrador',
    };

    const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

export async function updateCaptutProject(id, patch) {
    const { data, error } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

    if (error) throw error;
    return data;
}

export async function deleteCaptutProject(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
}

export async function duplicateCaptutProject(id, { userId = null } = {}) {
    const original = await getCaptutProject(id);
    const {
        id: _id,
        rendered_url: _renderedUrl,
        status: _status,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...copy
    } = original;

    const payload = {
        ...copy,
        user_id: userId || original.user_id,
        name: `${original.name || 'Video sin nombre'} (copia)`,
        status: 'borrador',
        rendered_url: null,
        metadata: {
            ...(original.metadata || {}),
            duplicated_from: original.id,
            duplicated_at: new Date().toISOString(),
        },
    };

    const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

async function uploadCaptutBlob(tenantId, projectId, blob, filename) {
    const path = `${tenantId}/${projectId}/${filename}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
    });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadCaptutFile(tenantId, projectId, file, filename) {
    const path = `${tenantId}/${projectId}/${filename}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
    });
    if (error) throw error;
    return {
        path,
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    };
}

function safeFilename(name = 'video') {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 120);
}

export async function saveCaptutSourceVideo(tenantId, projectId, file) {
    const filename = `source_${Date.now()}_${safeFilename(file.name)}`;
    const uploaded = await uploadCaptutFile(tenantId, projectId, file, filename);
    await updateCaptutProject(projectId, {
        source_url: uploaded.url,
        source_path: uploaded.path,
        source_name: file.name,
    });
    return uploaded;
}

export async function saveCaptutAudioTrack(tenantId, projectId, file) {
    const filename = `audio_${Date.now()}_${safeFilename(file.name)}`;
    return uploadCaptutFile(tenantId, projectId, file, filename);
}

export async function saveCaptutThumbnail(tenantId, projectId, blob) {
    const url = await uploadCaptutBlob(tenantId, projectId, blob, 'thumb.png');
    await updateCaptutProject(projectId, { thumbnail_url: url });
    return url;
}

export async function saveCaptutRendered(tenantId, projectId, blob, { extension = 'webm' } = {}) {
    const safeExt = extension === 'mp4' ? 'mp4' : 'webm';
    const url = await uploadCaptutBlob(tenantId, projectId, blob, `render_${Date.now()}.${safeExt}`);
    await updateCaptutProject(projectId, {
        rendered_url: url,
        status: 'renderizado',
    });
    return url;
}
