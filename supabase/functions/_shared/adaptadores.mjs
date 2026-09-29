// ════════════════════════════════════════════════════════════════════════
//  ADAPTADORES DE PUBLICACIÓN — uno por red y formato
// ════════════════════════════════════════════════════════════════════════
//
//  Reglas de la casa, que valen para todos:
//
//   1. `fetch` ENTRA POR PARÁMETRO. Así estas funciones se prueban sin red y
//      sin tocar ninguna cuenta de verdad (tests/publicadorAdaptadores.test.js).
//      Es también la razón de que este archivo sea .mjs plano: lo importa la
//      Edge Function en Deno y lo importa vitest en Node, sin dos copias que
//      se separen con el tiempo.
//
//   2. EL TOKEN NUNCA VA EN LA URL. Va en la cabecera Authorization. En la URL
//      acaba en los registros de Meta, en los de cualquier proxy por el medio
//      y en los nuestros. Hay una prueba que lo vigila.
//
//   3. TODOS DEVUELVEN LA MISMA FORMA:
//        { ok, external_post_id, external_url, error, http, paso,
//          token_vencido, sin_autorizar }
//      El que llama no tiene que saber de qué red viene.
//
//   4. NADIE INVENTA UN ÉXITO. Si la plataforma no devuelve un id, es un
//      fallo, por mucho que el HTTP diga 200.
// ════════════════════════════════════════════════════════════════════════

import { youtubeShort } from './youtube.mjs';

export const V_META = 'v22.0';

/** Meta avisa del token muerto con el código 190 (y subcódigos 463/467). */
function esTokenVencido(err) {
  if (!err) return false;
  const code = Number(err.code);
  const sub = Number(err.error_subcode);
  return code === 190 || sub === 463 || sub === 467;
}

/** Una llamada a Meta: token en la cabecera, datos en el cuerpo. */
async function meta(fetchFn, url, token, cuerpo) {
  const r = await fetchFn(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  let body = null;
  try { body = await r.json(); } catch { /* puede no venir JSON */ }
  return { http: r.status, ok: r.ok && !body?.error, body, err: body?.error || null };
}

/** Una lectura a Meta (GET), con el token también en la cabecera. */
async function metaLeer(fetchFn, url, token) {
  const r = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await r.json(); } catch { /* puede no venir JSON */ }
  return { http: r.status, ok: r.ok && !body?.error, body, err: body?.error || null };
}

/** Instagram todavía no terminó de procesar el contenedor: se reintenta. */
function noEstaLista(err) {
  if (!err) return false;
  return Number(err.code) === 9007 || Number(err.error_subcode) === 2207027;
}

const pausa = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function fallo(res, paso) {
  return {
    ok: false,
    paso,
    http: res.http,
    error: res.err?.message || `HTTP ${res.http}`,
    token_vencido: esTokenVencido(res.err),
  };
}

// ── FACEBOOK ────────────────────────────────────────────────────────────
export async function facebookFeed({ fetchFn, token, cuentaId, media, texto }) {
  const res = await meta(fetchFn, `https://graph.facebook.com/${V_META}/${cuentaId}/photos`,
    token, { url: media.imagen, caption: texto });
  if (!res.ok) return fallo(res, 'publicar');
  const id = res.body?.post_id || res.body?.id;
  if (!id) return { ok: false, paso: 'publicar', http: res.http, error: 'Facebook contestó 200 pero sin id de publicación.' };
  return { ok: true, external_post_id: String(id), external_url: `https://facebook.com/${id}` };
}

// La historia de una página tiene su propio camino: se sube la foto SIN
// publicarla (published=false) y después se convierte en historia.
export async function facebookHistoria({ fetchFn, token, cuentaId, media }) {
  const subida = await meta(fetchFn, `https://graph.facebook.com/${V_META}/${cuentaId}/photos`,
    token, { url: media.imagen, published: false });
  if (!subida.ok) return fallo(subida, 'subir');
  const photoId = subida.body?.id;
  if (!photoId) return { ok: false, paso: 'subir', http: subida.http, error: 'Facebook no devolvió el id de la foto.' };

  const hist = await meta(fetchFn, `https://graph.facebook.com/${V_META}/${cuentaId}/photo_stories`,
    token, { photo_id: photoId });
  if (!hist.ok) return fallo(hist, 'historia');
  const id = hist.body?.post_id || hist.body?.id;
  if (!id) return { ok: false, paso: 'historia', http: hist.http, error: 'Facebook no devolvió el id de la historia.' };
  return { ok: true, external_post_id: String(id), external_url: `https://facebook.com/${id}` };
}

// ── INSTAGRAM (siempre dos pasos: contenedor y publicación) ─────────────
async function instagram({ fetchFn, token, cuentaId, contenedor, esperar = pausa }) {
  const host = String(token).startsWith('IGAA') ? 'graph.instagram.com' : 'graph.facebook.com';
  const ident = String(token).startsWith('IGAA') ? 'me' : cuentaId;

  const c = await meta(fetchFn, `https://${host}/${V_META}/${ident}/media`, token, contenedor);
  if (!c.ok) return fallo(c, 'contenedor');
  const creationId = c.body?.id;
  if (!creationId) return { ok: false, paso: 'contenedor', http: c.http, error: 'Instagram no devolvió el id del contenedor.' };

  // Instagram a veces necesita un momento para procesar la imagen del
  // contenedor, y el segundo paso contesta "media not ready" (9007). Eso NO
  // es un fallo: se espera y se reintenta. Hasta tres veces; si no, sí falla.
  let p = null;
  for (let intento = 0; intento < 4; intento += 1) {
    if (intento > 0) await esperar(3000);
    p = await meta(fetchFn, `https://${host}/${V_META}/${ident}/media_publish`, token, { creation_id: creationId });
    if (p.ok || !noEstaLista(p.err)) break;
  }
  if (!p.ok) return fallo(p, 'publicar');
  const id = p.body?.id;
  if (!id) return { ok: false, paso: 'publicar', http: p.http, error: 'Instagram contestó 200 pero sin id.' };

  // El enlace NO se arma a mano: instagram.com/p/<...> lleva el código corto
  // de la publicación, no este id, y armado a mano daba un enlace roto. Se le
  // pide a Instagram. Si no lo da, queda sin enlace — publicado igual, porque
  // el id sí es de verdad; lo que nunca se hace es inventar la URL.
  const l = await metaLeer(fetchFn, `https://${host}/${V_META}/${id}?fields=permalink`, token);
  const permalink = l.ok ? (l.body?.permalink || null) : null;
  return { ok: true, external_post_id: String(id), external_url: permalink, creation_id: creationId };
}

export const instagramFeed = ({ fetchFn, token, cuentaId, media, texto, esperar }) =>
  instagram({ fetchFn, token, cuentaId, esperar, contenedor: { image_url: media.imagen, caption: texto } });

export const instagramHistoria = ({ fetchFn, token, cuentaId, media, esperar }) =>
  instagram({ fetchFn, token, cuentaId, esperar, contenedor: { image_url: media.imagen, media_type: 'STORIES' } });

// ── TIKTOK: todavía no ──────────────────────────────────────────────────
// No es que falte escribir el código: es que la plataforma no deja. Se
// devuelve `sin_autorizar` para que el destino se muestre como lo que es y
// JAMÁS como publicado.
export async function tiktokVideo() {
  return {
    ok: false,
    sin_autorizar: true,
    error: 'TikTok no está autorizado. Su Content Posting API deja publicar solo en privado '
      + '("all content posted by unaudited clients will be restricted to private viewing mode") '
      + 'hasta que la app pase la auditoría. Faltan además cuenta Business, cuenta de desarrollador y el video de demo.',
  };
}

// YouTube ya sube de verdad (29/09/2026): el canal está conectado por OAuth
// con youtube.upload. Vive en youtube.mjs y sube en PRIVADO por defecto;
// Google además fuerza privado mientras el proyecto no pase su auditoría.
// Que una promoción real salga a YouTube sigue dependiendo de la cuenta
// (`publicacion_habilitada`), que el publicador revisa antes de llamar aquí.
export { youtubeShort };

// ── El de mentira, para probar y para ensayar sin publicar ──────────────
export function adaptadorDePrueba(guion = {}) {
  const llamadas = [];
  const fn = async ({ destino }) => {
    const clave = `${destino.platform}:${destino.placement}`;
    llamadas.push(clave);
    const r = guion[clave] ?? guion.porDefecto ?? { ok: true };
    if (r.ok === false) return r;
    return {
      ok: true,
      external_post_id: r.external_post_id || `FALSO-${clave}-${llamadas.length}`,
      external_url: r.external_url || `https://ejemplo/${clave}/${llamadas.length}`,
    };
  };
  fn.llamadas = llamadas;
  return fn;
}

// Marcado a proposito: el que llama no tiene que adivinar por el resultado
// que TikTok no publica todavia.
tiktokVideo.sinAutorizar = true;

// ── El mapa ─────────────────────────────────────────────────────────────
export const ADAPTADORES = {
  'facebook:feed': facebookFeed,
  'facebook:story': facebookHistoria,
  'instagram:feed': instagramFeed,
  'instagram:story': instagramHistoria,
  'tiktok:reel': tiktokVideo,
  'tiktok:short': tiktokVideo,
  'youtube:short': youtubeShort,
  'youtube:reel': youtubeShort,
};

/**
 * Publica UN destino.
 *
 * Lo primero que hace es no publicar: si el destino ya trae id o enlace, ya
 * salió, y volver a mandarlo sería publicarlo dos veces. La base también lo
 * impide con un disparador; esto lo impide antes de gastar una llamada.
 */
export async function publicarDestino({ fetchFn, destino, cuenta, media, texto, adaptadores = ADAPTADORES }) {
  if (destino.external_post_id || destino.external_url) {
    return { ok: true, ya_estaba: true, external_post_id: destino.external_post_id, external_url: destino.external_url };
  }
  if (destino.bloqueo_motivo) {
    return { ok: false, sin_autorizar: true, error: destino.bloqueo_motivo };
  }

  const clave = `${destino.platform}:${destino.placement}`;
  const adaptador = adaptadores[clave];
  if (!adaptador) return { ok: false, error: `No hay adaptador para ${clave}.` };

  // Los de "todavía no" contestan sin token y sin red: no hay nada que pedirle
  // a una plataforma que no deja publicar.
  if (adaptador.sinAutorizar) return adaptador({ destino });

  if (!cuenta?.token) {
    return { ok: false, error: `No hay token para ${destino.platform}: la cuenta no está conectada.` };
  }

  try {
    return await adaptador({ fetchFn, token: cuenta.token, cuentaId: cuenta.external_account_id, media, texto, destino });
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Publica una promoción entera.
 *
 * Que un destino falle NO detiene a los demás: se publica todo lo que se
 * pueda y se devuelve el detalle de cada uno. Una promoción a medias tiene
 * que verse como lo que es, no como un fallo entero ni como un éxito entero.
 */
export async function publicarPromocion({ fetchFn, destinos, cuentas, media, textos, adaptadores = ADAPTADORES }) {
  const resultados = [];
  for (const destino of destinos) {
    const r = await publicarDestino({
      fetchFn,
      destino,
      cuenta: cuentas?.[destino.platform],
      media,
      texto: textos?.[destino.platform] || '',
      adaptadores,
    });
    resultados.push({ ...r, platform: destino.platform, placement: destino.placement, id: destino.id });
  }
  const publicados = resultados.filter((r) => r.ok).length;
  return {
    resultados,
    publicados,
    fallidos: resultados.filter((r) => !r.ok && !r.sin_autorizar).length,
    sin_autorizar: resultados.filter((r) => r.sin_autorizar).length,
    estado: publicados === 0 ? 'FALLO' : publicados === resultados.length ? 'PUBLICADO' : 'PARCIAL',
  };
}
