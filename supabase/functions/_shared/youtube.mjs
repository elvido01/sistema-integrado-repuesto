// ════════════════════════════════════════════════════════════════════════
//  YOUTUBE — subir un Short, y mantener vivo el permiso del canal
// ════════════════════════════════════════════════════════════════════════
//  Hasta el 29/09/2026 el adaptador de YouTube no subía nada: contestaba
//  siempre "no autorizado". Esto es la subida de verdad, con las reglas de
//  adaptadores.mjs:
//
//   · `fetch` entra por parámetro (tests/youtubeShort.test.js sin red).
//   · El token va en la cabecera Authorization, nunca en la URL.
//   · No hay éxito sin id de video: un 200 sin id es un fallo.
//
//  >>> SIEMPRE PRIVADO, SALVO DECISIÓN EXPLÍCITA <<<
//  Google sube en privado todo lo de un proyecto sin auditar, pidamos lo que
//  pidamos. Aquí además el privado es lo que se pide por defecto: publicar en
//  público solo pasa si quien llama lo pide con `privacidad: 'public'`, y eso
//  no lo hace nadie hasta que el dueño lo autorice tras la auditoría.
//
//  Subida reanudable en dos pasos (la que recomienda Google):
//    1. POST con los metadatos → Google devuelve en `Location` dónde subir.
//    2. PUT de los bytes a esa dirección → devuelve el video con su id.
// ════════════════════════════════════════════════════════════════════════

const SUBIDA = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PRIVACIDADES = new Set(['private', 'unlisted', 'public']);
const CATEGORIA_AUTOS = '2'; // "Autos y vehículos"

/** El título sale del texto de YouTube: la línea "Título:" o la primera. */
export function tituloDesdeTexto(texto = '', respaldo = 'Promoción') {
  const lineas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const marcada = lineas.find((l) => /^t[ií]tulo\s*:/i.test(l));
  let t = (marcada || lineas[0] || respaldo).replace(/^t[ií]tulo\s*:\s*/i, '');
  t = t.replace(/[<>]/g, '').trim() || respaldo;               // YouTube rechaza < y >
  const conShorts = `${t} #Shorts`;
  return (conShorts.length <= 100 ? conShorts : t).slice(0, 100);
}

/** La descripción: el texto sin la línea del título ni el rótulo "Descripción:". */
export function descripcionDesdeTexto(texto = '') {
  return String(texto)
    .split(/\r?\n/)
    .filter((l) => !/^\s*t[ií]tulo\s*:/i.test(l))
    .map((l) => l.replace(/^\s*descripci[oó]n\s*:\s*/i, ''))
    .join('\n')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 5000);
}

function tipoDeVideo(url, cabecera) {
  if (cabecera && cabecera.startsWith('video/')) return cabecera.split(';')[0];
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm';
  if (/\.mov(\?|$)/i.test(url)) return 'video/quicktime';
  return 'video/mp4';
}

async function errorDe(r) {
  try {
    const j = await r.json();
    return j?.error?.message || j?.error_description || j?.error || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

/**
 * Sube un Short. Devuelve la forma común de los adaptadores:
 *   { ok, external_post_id, external_url, error, http, paso, token_vencido, privacidad }
 */
export async function youtubeShort({ fetchFn, token, media, texto = '', privacidad = 'private' }) {
  if (!PRIVACIDADES.has(privacidad)) privacidad = 'private';
  const video = media?.video;
  if (!video) return { ok: false, error: 'Falta el video vertical: YouTube Shorts solo acepta video.', paso: 'video' };

  // 0) Los bytes del video.
  const rv = await fetchFn(video);
  if (!rv.ok) return { ok: false, error: `No se pudo bajar el video (${rv.status}).`, http: rv.status, paso: 'video' };
  const tipo = tipoDeVideo(video, rv.headers?.get?.('content-type'));
  const bytes = new Uint8Array(await rv.arrayBuffer());
  if (!bytes.length) return { ok: false, error: 'El video está vacío.', paso: 'video' };

  // 1) Metadatos → dónde subir.
  const r1 = await fetchFn(SUBIDA, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': tipo,
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({
      snippet: {
        title: tituloDesdeTexto(texto),
        description: descripcionDesdeTexto(texto),
        categoryId: CATEGORIA_AUTOS,
      },
      status: { privacyStatus: privacidad, selfDeclaredMadeForKids: false },
    }),
  });
  if (!r1.ok) {
    return { ok: false, error: await errorDe(r1), http: r1.status, paso: 'iniciar', token_vencido: r1.status === 401 };
  }
  const destino = r1.headers?.get?.('location') || r1.headers?.get?.('Location');
  if (!destino) return { ok: false, error: 'YouTube no devolvió dónde subir el video.', http: r1.status, paso: 'iniciar' };

  // 2) Los bytes.
  const r2 = await fetchFn(destino, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo, 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!r2.ok) {
    return { ok: false, error: await errorDe(r2), http: r2.status, paso: 'subir', token_vencido: r2.status === 401 };
  }
  let v = null;
  try { v = await r2.json(); } catch { /* sin cuerpo */ }
  if (!v?.id) return { ok: false, error: 'YouTube contestó sin id de video: no se da por subido.', http: r2.status, paso: 'subir' };

  return {
    ok: true,
    external_post_id: v.id,
    external_url: `https://www.youtube.com/shorts/${v.id}`,
    privacidad: v?.status?.privacyStatus || privacidad,
    http: r2.status,
  };
}

/**
 * Un acceso nuevo a partir del permiso renovable. Las credenciales van en el
 * CUERPO del POST, nunca en la URL.
 * Devuelve { access_token, expires_at } o lanza; `e.token_vencido` si el
 * canal retiró el permiso y hay que reconectar.
 */
export async function renovarAccesoGoogle({ fetchFn, clientId, clientSecret, refreshToken, ahora = Date.now() }) {
  if (!refreshToken) {
    const e = new Error('No hay permiso renovable guardado: vuelve a conectar YouTube.');
    e.token_vencido = true;
    throw e;
  }
  const r = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
    }).toString(),
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok || !j?.access_token) {
    const e = new Error(j?.error === 'invalid_grant'
      ? 'Google retiró el permiso del canal: vuelve a conectar YouTube.'
      : `No se pudo renovar el acceso a YouTube (${j?.error || r.status}).`);
    e.token_vencido = j?.error === 'invalid_grant';
    throw e;
  }
  return { access_token: j.access_token, expires_at: new Date(ahora + Number(j.expires_in || 3600) * 1000).toISOString() };
}

/**
 * El acceso listo para usar: el guardado si le quedan más de 5 minutos; si
 * no, uno renovado, que se guarda con `guardar` para la próxima vez.
 */
export async function accesoVigenteGoogle({ fetchFn, secreto, clientId, clientSecret, guardar, ahora = Date.now() }) {
  const vence = secreto?.expires_at ? new Date(secreto.expires_at).getTime() : 0;
  if (secreto?.access_token && vence - ahora > 5 * 60 * 1000) return secreto.access_token;
  const nuevo = await renovarAccesoGoogle({ fetchFn, clientId, clientSecret, refreshToken: secreto?.refresh_token, ahora });
  if (guardar) await guardar(nuevo);
  return nuevo.access_token;
}
