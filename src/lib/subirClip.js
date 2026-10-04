import * as tus from 'tus-js-client';
import { supabase } from '@/lib/customSupabaseClient';

// Subir un video del teléfono a equipo-clips, POR PARTES.
//
// (04/10/2026) "Reel con tu video": un minuto de video del teléfono pesa de
// 100 a 200 MB. Una subida de una sola vez se corta con cualquier bajón de
// señal y hay que empezar de cero; la subida reanudable de Supabase (TUS) va
// en trozos de 6 MB (el tamaño que exige) y sigue donde se quedó. Límite
// 300 MB por archivo (sql/reel_con_tus_videos.sql).

const BUCKET = 'equipo-clips';
const URL_SB = import.meta.env.VITE_SUPABASE_URL?.trim();
export const MAX_CLIP = 300 * 1024 * 1024;

const nombreSeguro = (n) => String(n || 'clip').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-50);

/** Sube el archivo y devuelve su URL pública. `alAvanzar(0..100)`. */
export async function subirClip(file, tenantId, alAvanzar = () => {}) {
  if (!file?.type?.startsWith('video/')) throw new Error(`${file?.name || 'Ese archivo'} no es un video.`);
  if (file.size > MAX_CLIP) throw new Error(`${file.name} pesa más de 300 MB. Graba clips más cortos (5 a 20 s).`);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('La sesión venció. Vuelve a entrar.');

  const ruta = `${tenantId}/${Date.now()}-${nombreSeguro(file.name)}`;
  await new Promise((resolve, reject) => {
    const subida = new tus.Upload(file, {
      endpoint: `${URL_SB}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: ruta, contentType: file.type, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024,
      onError: (e) => reject(new Error(e?.originalResponse?.getBody?.() || e?.message || 'La subida falló.')),
      onProgress: (subidos, total) => alAvanzar(Math.round((subidos / total) * 100)),
      onSuccess: () => resolve(),
    });
    subida.findPreviousUploads().then((previas) => {
      if (previas.length) subida.resumeFromPreviousUpload(previas[0]);
      subida.start();
    });
  });
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}
