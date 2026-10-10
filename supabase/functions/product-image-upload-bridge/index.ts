// Secure one-time bridge for attaching a real image to an exact Morla product.
// It is intentionally restricted to Repuestos Morla's tenant and never overwrites
// a product image that was linked after the grant was issued.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const MORLA_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return json({ ok: true, service: 'product-image-upload-bridge', version: 1 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const grantId = (req.headers.get('x-upload-id') || '').trim();
  const uploadToken = (req.headers.get('x-upload-token') || '').trim();
  const contentType = (req.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!/^[0-9a-f-]{36}$/i.test(grantId)) {
    return json({ ok: false, error: 'invalid_upload_id' }, 400);
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
  const { data: grant, error: grantError } = await supabase
    .from('product_image_upload_tokens')
    .select(
      'id, tenant_id, product_id, product_code, token_hash, expected_sha256, expected_mime_type, expected_bytes, expires_at, consumed_at',
    )
    .eq('id', grantId)
    .maybeSingle();

  if (grantError || !grant || !constantTimeEqual(tokenHash, grant.token_hash)) {
    return json({ ok: false, error: 'invalid_upload_token' }, 401);
  }
  if (grant.tenant_id !== MORLA_TENANT_ID) {
    return json({ ok: false, error: 'tenant_not_allowed' }, 403);
  }
  if (grant.consumed_at) {
    return json({ ok: false, error: 'upload_token_already_used' }, 409);
  }
  if (new Date(grant.expires_at).getTime() <= Date.now()) {
    return json({ ok: false, error: 'upload_token_expired' }, 410);
  }
  if (grant.expected_mime_type !== contentType) {
    return json({ ok: false, error: 'unexpected_media_type' }, 415);
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) {
    return json({ ok: false, error: 'empty_file' }, 400);
  }
  if (bytes.length > MAX_BYTES) {
    return json({ ok: false, error: 'file_too_large', max_bytes: MAX_BYTES }, 413);
  }
  if (bytes.length !== Number(grant.expected_bytes)) {
    return json({ ok: false, error: 'unexpected_file_size' }, 422);
  }
  if (!magicMatches(contentType, bytes)) {
    return json({ ok: false, error: 'invalid_image_signature' }, 422);
  }

  const imageSha256 = await sha256Hex(bytes);
  if (!constantTimeEqual(imageSha256, grant.expected_sha256)) {
    return json({ ok: false, error: 'unexpected_file_hash' }, 422);
  }

  const { data: product, error: productError } = await supabase
    .from('productos')
    .select('id, tenant_id, codigo, descripcion, imagen_url')
    .eq('id', grant.product_id)
    .eq('tenant_id', MORLA_TENANT_ID)
    .eq('codigo', grant.product_code)
    .maybeSingle();

  if (productError || !product) {
    return json({ ok: false, error: 'product_not_found' }, 404);
  }
  if (product.imagen_url) {
    return json({ ok: false, error: 'product_already_has_image' }, 409);
  }

  const nowIso = new Date().toISOString();
  const { data: consumed, error: consumeError } = await supabase
    .from('product_image_upload_tokens')
    .update({ consumed_at: nowIso, error_message: null })
    .eq('id', grant.id)
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .select('id');

  if (consumeError || !consumed?.length) {
    return json({ ok: false, error: 'upload_token_already_used' }, 409);
  }

  const storagePath = `${MORLA_TENANT_ID}/${grant.product_id}/${grant.id}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    await saveGrantError(supabase, grant.id, `storage_upload_failed: ${uploadError.message}`);
    return json({ ok: false, error: 'storage_upload_failed' }, 500);
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const imageUrl = publicUrlData.publicUrl;

  const { data: updatedProducts, error: updateError } = await supabase
    .from('productos')
    .update({ imagen_url: imageUrl, updated_at: nowIso })
    .eq('id', grant.product_id)
    .eq('tenant_id', MORLA_TENANT_ID)
    .eq('codigo', grant.product_code)
    .is('imagen_url', null)
    .select('id, codigo, descripcion, imagen_url');

  if (updateError || !updatedProducts?.length) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    await saveGrantError(supabase, grant.id, `product_update_failed: ${updateError?.message || 'no_row_updated'}`);
    return json({ ok: false, error: 'product_update_failed' }, 500);
  }

  const { error: auditError } = await supabase
    .from('product_image_upload_tokens')
    .update({ storage_path: storagePath, image_url: imageUrl, error_message: null })
    .eq('id', grant.id);

  if (auditError) {
    console.error('grant_audit_update_failed', auditError.message);
  }

  return json({
    ok: true,
    product_id: product.id,
    product_code: product.codigo,
    product_name: product.descripcion,
    image_url: imageUrl,
    sha256: imageSha256,
  });
});

async function saveGrantError(supabase: ReturnType<typeof createClient>, id: string, message: string) {
  await supabase
    .from('product_image_upload_tokens')
    .update({ error_message: message.slice(0, 1000) })
    .eq('id', id);
}

function magicMatches(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value);
  }
  if (contentType === 'image/webp') {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
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
