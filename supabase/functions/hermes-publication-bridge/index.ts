// hermes-publication-bridge
// Carga un arte a Supabase Storage mediante una clave de un solo uso.
// No publica en Meta: solo deja el job listo para Hermes cuando ya fue aprobado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return json({ ok: true, service: 'hermes-publication-bridge', version: 1 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const jobId = (req.headers.get('x-job-id') || '').trim();
  const uploadToken = (req.headers.get('x-upload-token') || '').trim();
  const contentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return json({ ok: false, error: 'invalid_job_id' }, 400);
  }
  if (uploadToken.length < 32 || uploadToken.length > 256) {
    return json({ ok: false, error: 'invalid_upload_token' }, 401);
  }
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) {
    return json({ ok: false, error: 'unsupported_media_type' }, 415);
  }

  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (declaredLength > MAX_BYTES) {
    return json({ ok: false, error: 'file_too_large', max_bytes: MAX_BYTES }, 413);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const tokenHash = await sha256Hex(new TextEncoder().encode(uploadToken));
  const nowIso = new Date().toISOString();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('hermes_publication_upload_tokens')
    .select('job_id, token_hash, expires_at, consumed_at')
    .eq('job_id', jobId)
    .maybeSingle();

  if (tokenErr || !tokenRow || !constantTimeEqual(tokenHash, tokenRow.token_hash)) {
    return json({ ok: false, error: 'invalid_upload_token' }, 401);
  }
  if (tokenRow.consumed_at) {
    return json({ ok: false, error: 'upload_token_already_used' }, 409);
  }
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return json({ ok: false, error: 'upload_token_expired' }, 410);
  }

  const { data: consumedRows, error: consumeErr } = await supabase
    .from('hermes_publication_upload_tokens')
    .update({ consumed_at: nowIso })
    .eq('job_id', jobId)
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .select('job_id');

  if (consumeErr || !consumedRows?.length) {
    return json({ ok: false, error: 'upload_token_already_used' }, 409);
  }

  const { data: job, error: jobErr } = await supabase
    .from('hermes_publication_jobs')
    .select('id, tenant_id, producto_id, requested_by, title, caption, channels, placement, approval_status, status')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return json({ ok: false, error: 'job_not_found' }, 404);
  }
  if (job.approval_status === 'revoked' || ['cancelled', 'published', 'partially_published'].includes(job.status)) {
    return json({ ok: false, error: 'job_not_uploadable' }, 409);
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) {
    return json({ ok: false, error: 'empty_file' }, 400);
  }
  if (bytes.length > MAX_BYTES) {
    return json({ ok: false, error: 'file_too_large', max_bytes: MAX_BYTES }, 413);
  }

  const imageSha256 = await sha256Hex(bytes);
  const storagePath = `${job.tenant_id}/hermes-publications/${job.id}.${extension}`;

  const { error: uploadErr } = await supabase.storage
    .from('designs')
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadErr) {
    return json({ ok: false, error: 'storage_upload_failed', detail: uploadErr.message }, 500);
  }

  const { data: publicUrlData } = supabase.storage.from('designs').getPublicUrl(storagePath);
  const imageUrl = publicUrlData.publicUrl;
  const width = positiveInt(req.headers.get('x-image-width'));
  const height = positiveInt(req.headers.get('x-image-height'));

  const { data: design, error: designErr } = await supabase
    .from('design_documents')
    .insert({
      tenant_id: job.tenant_id,
      user_id: job.requested_by,
      producto_id: job.producto_id,
      name: job.title,
      format: job.placement === 'story' ? 'story' : (job.placement === 'both' ? 'social' : 'post'),
      width,
      height,
      content: {
        source: 'chatgpt-hermes-bridge',
        version: 1,
        bridge_job_id: job.id,
      },
      thumbnail_url: imageUrl,
      rendered_url: imageUrl,
      status: job.approval_status === 'approved' ? 'listo' : 'borrador',
      generated_by_ai: true,
      metadata: {
        bridge_job_id: job.id,
        channels: job.channels,
        placement: job.placement,
        uploaded_at: nowIso,
        image_mime_type: contentType,
        image_sha256: imageSha256,
      },
    })
    .select('id')
    .single();

  if (designErr || !design) {
    await supabase.storage.from('designs').remove([storagePath]);
    return json({ ok: false, error: 'design_create_failed', detail: designErr?.message }, 500);
  }

  const nextStatus = job.approval_status === 'approved' ? 'queued' : 'draft';
  const { error: jobUpdateErr } = await supabase
    .from('hermes_publication_jobs')
    .update({
      design_id: design.id,
      image_url: imageUrl,
      storage_path: storagePath,
      image_mime_type: contentType,
      image_sha256: imageSha256,
      status: nextStatus,
      updated_at: nowIso,
      error_message: null,
    })
    .eq('id', job.id);

  if (jobUpdateErr) {
    await supabase.from('design_documents').delete().eq('id', design.id);
    await supabase.storage.from('designs').remove([storagePath]);
    return json({ ok: false, error: 'job_update_failed', detail: jobUpdateErr.message }, 500);
  }

  return json({
    ok: true,
    job_id: job.id,
    design_id: design.id,
    status: nextStatus,
    image_url: imageUrl,
    approved: job.approval_status === 'approved',
  });
});

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 10000) return null;
  return parsed;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
