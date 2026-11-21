// =====================================================================
// Volver a publicar una promoción ya hecha (21/11/2026)
// ---------------------------------------------------------------------
// Lo usan la publicación diaria (franja reutilizada), el calendario y las
// recomendaciones: arma lo que el formulario de publicar necesita con el
// MISMO arte de antes y un texto nuevo con el precio de hoy.
// =====================================================================
import { supabase } from '@/lib/customSupabaseClient';
import { mediaDeBundle, textosReuso } from '@/lib/textoReuso';

export const COLUMNAS_JOB_REUSO = 'publication_bundle_id, producto_id, placement, media_type, image_url, media_url, precio_mostrado, textos, completed_at, created_at';

// Un archivo público que ya no está (404) no se manda a publicar.
async function existe(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return true; // sin red no se puede saber: que lo diga la vista previa del formulario
  }
}

export async function soloLosQueExisten(media) {
  const pares = await Promise.all(Object.entries(media).map(async ([k, url]) => [k, url, await existe(url)]));
  return Object.fromEntries(pares.filter(([, , ok]) => ok).map(([k, url]) => [k, url]));
}

/**
 * Devuelve { prefill } o { error }. `jobs` son los trabajos del bundle (si no
 * vienen, se leen). `producto` puede venir sin precio: se lee el de hoy.
 */
export async function prefillDesdeBundle({ bundleId, jobs = null, productoId = null, programarPara = null, semilla = '' }) {
  let js = jobs;
  if (!js) {
    const { data, error } = await supabase.from('hermes_publication_jobs')
      .select(COLUMNAS_JOB_REUSO).eq('publication_bundle_id', bundleId);
    if (error) return { error: error.message };
    js = data || [];
  }
  const pid = productoId || js.find((j) => j.producto_id)?.producto_id;
  if (!pid) return { error: 'La promoción anterior no tiene pieza.' };
  const [{ data: p }, { data: stock }, media] = await Promise.all([
    supabase.from('productos').select('id, codigo, descripcion, precio').eq('id', pid).maybeSingle(),
    supabase.rpc('get_stock_actual', { producto_uuid: pid }),
    soloLosQueExisten(mediaDeBundle(js)),
  ]);
  if (!p) return { error: 'La pieza ya no está en el catálogo.' };
  if (!media.imagen_feed) return { error: 'El arte anterior ya no está guardado.' };
  const viejo = js.find((j) => j.textos && Object.keys(j.textos).length)?.textos || {};
  return {
    prefill: {
      programarPara,
      producto: { ...p, existencia: Number(stock || 0) },
      sinDescuento: true,
      titulo: p.descripcion,
      media,
      textos: textosReuso({ descripcion: p.descripcion, precio: p.precio, textosViejos: viejo, semilla }),
    },
  };
}
