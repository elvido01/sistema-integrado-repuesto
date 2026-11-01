// ════════════════════════════════════════════════════════════════════════
//  TikTok: el video va a la BANDEJA del dueño, no se publica directo
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026. La publicación directa (video.publish) no sirve sin la
//  auditoría de TikTok: sale "solo yo" Y exige que la cuenta ENTERA esté en
//  privado al publicar ("All accounts must be private at posting time"). Para
//  un negocio con seguidores eso no es opción.
//
//  Con video.upload el video llega como BORRADOR a la bandeja de TikTok del
//  dueño: le sale una notificación en el teléfono, lo abre, le pone música si
//  quiere y lo publica él. Nada de cuenta privada.
//
//  El archivo se ENVÍA (FILE_UPLOAD / push_by_file): así no hay que verificar
//  el dominio de donde sale el video, que es el almacenamiento de Supabase.
//  Los Shorts de la casa son de segundos y pesan pocos MB: van en un solo
//  trozo. TikTok acepta un trozo único hasta 64 MB.
// ════════════════════════════════════════════════════════════════════════

const API = 'https://open.tiktokapis.com/v2';
const UN_TROZO_MAX = 64 * 1024 * 1024;

async function errorDe(r) {
  try {
    const j = await r.json();
    return j?.error?.message || j?.error_description || j?.error?.code || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

function tipoDeVideo(url, cabecera) {
  if (cabecera && cabecera.startsWith('video/')) return cabecera.split(';')[0];
  if (/\.mov(\?|$)/i.test(url)) return 'video/quicktime';
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm';
  return 'video/mp4';
}

/**
 * Manda el video vertical a la bandeja de TikTok del dueño.
 * Devuelve { ok, external_post_id (publish_id), external_url, privacidad:'inbox' }
 * o { ok:false, error, http, paso, token_vencido }.
 */
export async function tiktokBandeja({ fetchFn, token, media }) {
  const r = await enviarVideo({ fetchFn, token, media, ruta: 'inbox/video/init/' });
  if (!r.ok) return r;
  // Sin enlace: un borrador en la bandeja no tiene página propia hasta que
  // el dueño lo publica desde el teléfono.
  return { ok: true, external_post_id: r.publishId, external_url: null, privacidad: 'inbox', http: r.http };
}

// ════════════════════════════════════════════════════════════════════════
//  (01/11/2026) PUBLICACIÓN DIRECTA (video.publish)
// ════════════════════════════════════════════════════════════════════════
//  Con el dominio propio se pide la auditoría de TikTok. Sus reglas para la
//  pantalla (que el dueño elige a quién se muestra SIN valor por defecto,
//  interruptores de comentarios/dúo/stitch, aviso comercial) se cumplen en
//  src/components/equipo/TikTokOpciones.jsx; aquí se valida lo mismo otra vez
//  para que nada llegue a TikTok sin la elección explícita del dueño.
//  Sin auditoría, TikTok solo deja SELF_ONLY en cuentas privadas.
// ════════════════════════════════════════════════════════════════════════

export const PRIVACIDADES_TIKTOK = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

/** Lo que TikTok pide validar antes de publicar. Devuelve el texto del problema o null. */
export function problemaOpcionesTikTok(op) {
  if (!op || op.modo !== 'directo') return 'Faltan las opciones de TikTok.';
  if (!PRIVACIDADES_TIKTOK.includes(op.privacy_level)) return 'Elige a quién se muestra el video en TikTok.';
  if (op.comercial) {
    if (!op.tu_marca && !op.contenido_de_marca) return 'Indica si el contenido comercial es de tu marca o de marca de terceros.';
    if (op.contenido_de_marca && op.privacy_level === 'SELF_ONLY') return 'El contenido de marca no puede ser "solo yo".';
  }
  return null;
}

/** Datos de la cuenta que TikTok exige mostrar antes de publicar (creator_info). */
export async function creadorTikTok({ fetchFn, token }) {
  const r = await fetchFn(`${API}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok || (j?.error?.code && j.error.code !== 'ok')) {
    return {
      ok: false, http: r.status, codigo: j?.error?.code || null,
      error: j?.error?.message || j?.error?.code || `HTTP ${r.status}`,
      token_vencido: r.status === 401 || j?.error?.code === 'access_token_invalid',
      sin_permiso: j?.error?.code === 'scope_not_authorized',
    };
  }
  const d = j?.data || {};
  return {
    ok: true,
    nombre: d.creator_nickname || null,
    usuario: d.creator_username || null,
    avatar: d.creator_avatar_url || null,
    privacidades: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
    sin_comentarios: !!d.comment_disabled,
    sin_duo: !!d.duet_disabled,
    sin_stitch: !!d.stitch_disabled,
    max_segundos: Number(d.max_video_post_duration_sec) || null,
  };
}

/** Publica directo con las opciones que eligió el dueño. */
export async function tiktokDirecto({ fetchFn, token, media, texto = '', opciones }) {
  const problema = problemaOpcionesTikTok(opciones);
  if (problema) return { ok: false, paso: 'opciones', error: problema };
  const post_info = {
    title: String(texto).slice(0, 2200),
    privacy_level: opciones.privacy_level,
    disable_comment: !opciones.comentarios,
    disable_duet: !opciones.duo,
    disable_stitch: !opciones.stitch,
    brand_content_toggle: !!(opciones.comercial && opciones.contenido_de_marca),
    brand_organic_toggle: !!(opciones.comercial && opciones.tu_marca),
  };
  const r = await enviarVideo({ fetchFn, token, media, ruta: 'video/init/', post_info });
  if (!r.ok) return r;
  // El enlace se sabe cuando TikTok termina (status/fetch → PUBLISH_COMPLETE):
  // lo anota el publicador al vigilar ('tiktok_enviado').
  return { ok: true, external_post_id: r.publishId, external_url: null, privacidad: 'tiktok_enviado', http: r.http };
}

/**
 * (01/11/2026) Los últimos videos de la cuenta con sus números (video.list).
 * Devuelve { ok, videos:[{id, titulo, portada, enlace, fecha, vistas, me_gusta, comentarios, compartidos}] }.
 */
export async function videosTikTok({ fetchFn, token, max = 10 }) {
  const campos = 'id,title,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count';
  const r = await fetchFn(`${API}/video/list/?fields=${campos}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ max_count: Math.min(Math.max(1, max), 20) }),
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok || (j?.error?.code && j.error.code !== 'ok')) {
    return {
      ok: false, http: r.status, error: j?.error?.message || j?.error?.code || `HTTP ${r.status}`,
      token_vencido: r.status === 401 || j?.error?.code === 'access_token_invalid',
      sin_permiso: j?.error?.code === 'scope_not_authorized',
    };
  }
  const videos = (j?.data?.videos || []).map((v) => ({
    id: String(v.id),
    titulo: v.title || '',
    portada: v.cover_image_url || null,
    enlace: v.share_url || null,
    fecha: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : null,
    vistas: v.view_count ?? null,
    me_gusta: v.like_count ?? null,
    comentarios: v.comment_count ?? null,
    compartidos: v.share_count ?? null,
  }));
  return { ok: true, videos };
}

/** Baja el video, lo anuncia a TikTok y lo sube en un trozo. { ok, publishId, http } o el fallo. */
async function enviarVideo({ fetchFn, token, media, ruta, post_info }) {
  const video = media?.video;
  if (!video) return { ok: false, error: 'Falta el video vertical: TikTok solo acepta video.', paso: 'video' };

  const rv = await fetchFn(video);
  if (!rv.ok) return { ok: false, error: `No se pudo bajar el video (${rv.status}).`, http: rv.status, paso: 'video' };
  const bytes = new Uint8Array(await rv.arrayBuffer());
  if (!bytes.length) return { ok: false, error: 'El video está vacío.', paso: 'video' };
  if (bytes.length > UN_TROZO_MAX) {
    return { ok: false, error: 'El video pasa de 64 MB: para una promoción de segundos no debería. Hay que rehacerlo más liviano.', paso: 'video' };
  }

  // 1) Se anuncia el archivo y TikTok da la dirección de subida.
  const r1 = await fetchFn(`${API}/post/publish/${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      ...(post_info ? { post_info } : {}),
      source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
    }),
  });
  let j1 = null;
  try { j1 = await r1.json(); } catch { /* sin cuerpo */ }
  if (!r1.ok || (j1?.error?.code && j1.error.code !== 'ok')) {
    return {
      ok: false, paso: 'iniciar', http: r1.status,
      error: j1?.error?.message || j1?.error?.code || `HTTP ${r1.status}`,
      token_vencido: r1.status === 401 || j1?.error?.code === 'access_token_invalid',
    };
  }
  const publishId = j1?.data?.publish_id;
  const destino = j1?.data?.upload_url;
  if (!publishId || !destino) return { ok: false, paso: 'iniciar', http: r1.status, error: 'TikTok no devolvió dónde subir el video.' };

  // 2) El archivo, en un solo trozo.
  const r2 = await fetchFn(destino, {
    method: 'PUT',
    headers: {
      'Content-Type': tipoDeVideo(video, rv.headers?.get?.('content-type')),
      'Content-Length': String(bytes.length),
      'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: bytes,
  });
  if (!r2.ok) return { ok: false, paso: 'subir', http: r2.status, error: await errorDe(r2) };
  return { ok: true, publishId: String(publishId), http: r2.status };
}

/**
 * ¿En qué va el envío? status/fetch con el publish_id.
 * Devuelve { ok, estado } — estado es el de TikTok (PROCESSING_UPLOAD,
 * SEND_TO_USER_INBOX, PUBLISH_COMPLETE, FAILED) — o { ok:false, error, token_vencido }.
 */
export async function estadoEnvioTikTok({ fetchFn, token, publishId }) {
  const r = await fetchFn(`${API}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok || (j?.error?.code && j.error.code !== 'ok')) {
    return { ok: false, error: j?.error?.message || `HTTP ${r.status}`, token_vencido: r.status === 401 || j?.error?.code === 'access_token_invalid' };
  }
  // Al publicar público, TikTok da el id del video (publicaly_available_post_id,
  // así, con la errata de TikTok).
  const ids = j?.data?.publicaly_available_post_id || j?.data?.publicly_available_post_id || [];
  return { ok: true, estado: j?.data?.status || null, motivo: j?.data?.fail_reason || null,
    video_id: Array.isArray(ids) && ids.length ? String(ids[0]) : null };
}

/**
 * Un acceso nuevo con el permiso renovable (el de TikTok dura 24 horas; el
 * renovable, un año). Las credenciales van en el CUERPO del POST.
 * Devuelve { access_token, refresh_token, expires_at } o lanza; `e.token_vencido`
 * si hay que reconectar.
 */
export async function renovarAccesoTikTok({ fetchFn, clientKey, clientSecret, refreshToken, ahora = Date.now() }) {
  if (!clientKey || !clientSecret) throw new Error('Faltan las credenciales de TikTok en el servidor.');
  if (!refreshToken) {
    const e = new Error('TikTok no dejó permiso renovable: hay que reconectar la cuenta.');
    e.token_vencido = true;
    throw e;
  }
  const body = new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
  const r = await fetchFn(`${API}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok || !j?.access_token) {
    const e = new Error(j?.error === 'invalid_grant'
      ? 'TikTok retiró el permiso: hay que reconectar la cuenta.'
      : `No se pudo renovar el acceso a TikTok (${j?.error || r.status}).`);
    e.token_vencido = j?.error === 'invalid_grant';
    throw e;
  }
  return {
    access_token: j.access_token,
    // TikTok puede rotar el renovable: si manda uno nuevo, ese es el que vale.
    refresh_token: j.refresh_token || refreshToken,
    expires_at: new Date(ahora + Number(j.expires_in || 86400) * 1000).toISOString(),
  };
}

/** El acceso que sirve ahora: el guardado si le quedan más de 5 minutos; si no, uno renovado (y guardado). */
export async function accesoVigenteTikTok({ fetchFn, secreto, clientKey, clientSecret, guardar, ahora = Date.now() }) {
  const vence = secreto?.expires_at ? new Date(secreto.expires_at).getTime() : 0;
  if (secreto?.access_token && vence - ahora > 5 * 60 * 1000) return secreto.access_token;
  const nuevo = await renovarAccesoTikTok({ fetchFn, clientKey, clientSecret, refreshToken: secreto?.refresh_token, ahora });
  if (guardar) await guardar(nuevo);
  return nuevo.access_token;
}
