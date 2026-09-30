// ════════════════════════════════════════════════════════════════════════
//  LOS NÚMEROS DE CADA PUBLICACIÓN, POR LAS APIS OFICIALES
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026. Los números los traía Metricool desde fuera, y dejó de traerlos
//  el 28/09: las promociones publicadas por MotoFlow se quedaban "Todavía sin
//  medir". Ahora MotoFlow mide lo suyo con las MISMAS cuentas con que publica.
//
//  Cada función devuelve números normalizados a las columnas de
//  social_post_metrics. Un número que la red no da (o no deja ver con el
//  permiso que tenemos) queda en null: nunca se inventa un cero. `raw` guarda
//  lo que contestó la red, para poder revisar.
//
//  Facebook feed: reacciones, comentarios, compartidos (+ alcance si el token
//    tiene read_insights). Historias de Facebook: la API no da números.
//  Instagram feed e historias: me gusta, comentarios, alcance, vistas,
//    guardados, compartidos (las historias solo mientras viven, 24 h).
//  YouTube: vistas, me gusta, comentarios (videos.list, 1 unidad de cuota).
//  TikTok: pide otro permiso (video.list) que no está en la revisión.
// ════════════════════════════════════════════════════════════════════════

export const V_META = 'v22.0';

const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

async function leer(fetchFn, url, token) {
  const r = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await r.json(); } catch { /* sin JSON */ }
  return { ok: r.ok && !body?.error, http: r.status, body, error: body?.error?.message || (r.ok ? null : `HTTP ${r.status}`) };
}

// Las insights de Meta vienen como [{name, values:[{value}]}] o [{name, total_value:{value}}].
function insightsAMapa(data = []) {
  const m = {};
  for (const x of data) {
    const v = x?.total_value?.value ?? x?.values?.[0]?.value;
    if (x?.name) m[x.name] = typeof v === 'object' && v !== null ? null : num(v);
  }
  return m;
}

/** Una publicación del feed de una página de Facebook ("pagina_post"). */
export async function metricasFacebook({ fetchFn, token, id }) {
  // Dos caminos, y vale cualquiera de los dos. Leer reacciones/comentarios
  // del post pide pages_read_user_content, que la app no tiene (30/09); las
  // ESTADÍSTICAS (read_insights) dan alcance, clics y reacciones por tipo.
  const base = await leer(fetchFn,
    `https://graph.facebook.com/${V_META}/${encodeURIComponent(id)}?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)`,
    token);
  // Una por una: Meta va retirando métricas, y con una inválida en la lista
  // rechaza TODA la petición ("The value must be a valid insights metric").
  const datos = [];
  const errores = [];
  for (const metrica of ['post_total_media_view_unique', 'post_clicks', 'post_reactions_by_type_total', 'post_media_view']) {
    const r = await leer(fetchFn,
      `https://graph.facebook.com/${V_META}/${encodeURIComponent(id)}/insights?metric=${metrica}`, token);
    if (r.ok) datos.push(...(r.body?.data || []));
    else errores.push(`${metrica}: ${r.error}`);
  }
  const ins = { ok: datos.length > 0, body: { data: datos }, error: errores.join(' | ') };
  if (!base.ok && !ins.ok) return { ok: false, error: `${base.error} | ${ins.error}` };
  const m = ins.ok ? insightsAMapa(ins.body?.data) : {};
  // Las reacciones por tipo vienen como objeto {like: 3, love: 1}: se suman.
  const porTipo = ins.ok ? (ins.body?.data || []).find((x) => x?.name === 'post_reactions_by_type_total') : null;
  const objTipos = porTipo?.values?.[0]?.value ?? porTipo?.total_value?.value;
  const reaccionesIns = objTipos && typeof objTipos === 'object'
    ? Object.values(objTipos).reduce((a, v) => a + (Number(v) || 0), 0) : null;
  return {
    ok: true,
    likes: base.ok ? num(base.body?.reactions?.summary?.total_count) : reaccionesIns,
    comments: base.ok ? num(base.body?.comments?.summary?.total_count) : null,
    shares: base.ok ? (num(base.body?.shares?.count) ?? 0) : null,   // Meta omite "shares" cuando es cero
    // Meta retiró post_impressions* en 2025: el alcance es ahora quienes lo vieron.
    reach: m.post_total_media_view_unique ?? null,
    impressions: m.post_media_view ?? null,
    views: m.post_media_view ?? null,
    clicks: m.post_clicks ?? null,
    raw: { base: base.ok ? base.body : { error: base.error }, insights: ins.body, insights_errores: ins.error || null },
  };
}

/** Una publicación o historia de Instagram (id del media). */
export async function metricasInstagram({ fetchFn, token, id, historia = false }) {
  const base = await leer(fetchFn,
    `https://graph.facebook.com/${V_META}/${encodeURIComponent(id)}?fields=like_count,comments_count`,
    token);
  if (!base.ok) return { ok: false, error: base.error };
  const metricas = historia ? 'reach,views,replies,shares' : 'reach,views,saved,shares';
  const ins = await leer(fetchFn,
    `https://graph.facebook.com/${V_META}/${encodeURIComponent(id)}/insights?metric=${metricas}`,
    token);
  const m = ins.ok ? insightsAMapa(ins.body?.data) : {};
  return {
    ok: true,
    likes: historia ? null : num(base.body?.like_count),
    comments: historia ? (m.replies ?? null) : num(base.body?.comments_count),
    reach: m.reach ?? null,
    views: m.views ?? null,
    saves: historia ? null : (m.saved ?? null),
    shares: m.shares ?? null,
    raw: { base: base.body, insights: ins.ok ? ins.body : { error: ins.error } },
  };
}

/** Un video de YouTube. */
export async function metricasYoutube({ fetchFn, token, id }) {
  const r = await leer(fetchFn,
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`,
    token);
  if (!r.ok) return { ok: false, error: r.error };
  const s = r.body?.items?.[0]?.statistics;
  if (!s) return { ok: false, error: 'YouTube no devolvió ese video.' };
  return {
    ok: true,
    views: num(s.viewCount),
    likes: num(s.likeCount),
    comments: num(s.commentCount),
    raw: r.body,
  };
}

/** Mide UN destino publicado según su red y formato. null si esa red/formato no se mide. */
export async function medirDestino({ fetchFn, token, platform, placement, id }) {
  if (!token || !id) return null;
  if (platform === 'facebook' && placement === 'feed') return metricasFacebook({ fetchFn, token, id });
  if (platform === 'instagram') return metricasInstagram({ fetchFn, token, id, historia: placement === 'story' });
  if (platform === 'youtube') return metricasYoutube({ fetchFn, token, id });
  return null;
}
