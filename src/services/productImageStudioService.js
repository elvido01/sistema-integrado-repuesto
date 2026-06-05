import { supabase } from '@/lib/customSupabaseClient';

const BUCKET = 'product-images';

function safeSlug(value, fallback = 'producto') {
  const slug = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

export async function uploadProductImage({ tenantId, product, blob, previousUrl = null }) {
  if (!blob) throw new Error('No hay imagen procesada para guardar.');

  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const codigo = safeSlug(product?.codigo || product?.referencia || product?.id);
  const folder = tenantId ? `${tenantId}/` : '';
  const path = `${folder}${codigo}_${Date.now()}.${ext}`;

  if (previousUrl) {
    const oldPath = previousUrl.split(`/${BUCKET}/`)[1];
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
    }
  }

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    contentType: blob.type || 'image/png',
    upsert: false,
  });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
}

export async function saveProductImageUrl(productId, imageUrl) {
  if (!productId) throw new Error('Guarda el producto antes de asignar la imagen al catalogo.');
  const { data, error } = await supabase
    .from('productos')
    .update({ imagen_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
