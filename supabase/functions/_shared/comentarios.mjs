// ════════════════════════════════════════════════════════════════════════
//  LOS COMENTARIOS DE UNA PROMOCIÓN, LEÍDOS Y RESPONDIDOS EN LA RED
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026. Un "precio?" debajo de una promoción es alguien con la mano
//  levantada, en público, y nadie lo veía: MotoFlow publicaba y medía, pero
//  los comentarios se quedaban en Facebook/Instagram.
//
//  Se leen DIRECTO de la red cada vez (no del webhook): así aparecen también
//  los que llegaron antes de conectar el webhook de la página, y lo que se
//  responda desde el propio Facebook se ve como respondido aquí.
//
//  Normalizado: { id, platform, texto, autor, fecha, respondido, respuestas }
//  "respondido" = la propia cuenta contestó debajo de ese comentario.
//
//  Responder: Instagram con instagram_manage_comments (lo tiene el token).
//  Facebook pide pages_manage_engagement: sin él, Meta contesta (#200) y se
//  devuelve motivo 'permiso' para que la pantalla ofrezca abrir Facebook.
// ════════════════════════════════════════════════════════════════════════

export const V_META = 'v22.0';
const G = `https://graph.facebook.com/${V_META}`;

async function pedir(fetchFn, url, token, init = {}) {
  const r = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await r.json(); } catch { /* sin JSON */ }
  return { ok: r.ok && !body?.error, body, error: body?.error || (r.ok ? null : { message: `HTTP ${r.status}` }) };
}

/** Comentarios de primer nivel de una publicación de la página de Facebook. */
export async function comentariosFacebook({ fetchFn, token, postId, paginaId }) {
  const campos = 'id,message,created_time,from,comments.limit(10){id,message,created_time,from}';
  const r = await pedir(fetchFn,
    `${G}/${encodeURIComponent(postId)}/comments?filter=toplevel&order=reverse_chronological&limit=50&fields=${encodeURIComponent(campos)}`,
    token);
  if (!r.ok) return { ok: false, error: r.error?.message };
  const propia = (f) => !!f?.id && String(f.id) === String(paginaId);
  const lista = (r.body?.data || [])
    .filter((c) => !propia(c.from))   // lo que la página escribió como comentario suelto no es un cliente
    .map((c) => {
      const respuestas = (c.comments?.data || []).map((x) => ({ texto: x.message || '', fecha: x.created_time, propia: propia(x.from) }));
      return {
        id: c.id,
        platform: 'facebook',
        texto: c.message || '',
        // Facebook oculta el nombre de quien no dio permiso a la app: null, no se inventa.
        autor: c.from?.name || null,
        fecha: c.created_time,
        respondido: respuestas.some((x) => x.propia),
        respuestas,
      };
    });
  return { ok: true, comentarios: lista };
}

/** Comentarios de un medio de Instagram. */
export async function comentariosInstagram({ fetchFn, token, mediaId, igId }) {
  const campos = 'id,text,timestamp,username,from,replies{id,text,timestamp,username,from}';
  const r = await pedir(fetchFn,
    `${G}/${encodeURIComponent(mediaId)}/comments?limit=50&fields=${encodeURIComponent(campos)}`, token);
  if (!r.ok) return { ok: false, error: r.error?.message };
  const propia = (x) => !!x?.from?.id && String(x.from.id) === String(igId);
  const lista = (r.body?.data || [])
    .filter((c) => !propia(c))
    .map((c) => {
      const respuestas = (c.replies?.data || []).map((x) => ({ texto: x.text || '', fecha: x.timestamp, propia: propia(x) }));
      return {
        id: c.id,
        platform: 'instagram',
        texto: c.text || '',
        autor: c.username || c.from?.username || null,
        fecha: c.timestamp,
        respondido: respuestas.some((x) => x.propia),
        respuestas,
      };
    });
  return { ok: true, comentarios: lista };
}

/** Responde en público debajo de un comentario. */
export async function responderComentario({ fetchFn, token, platform, commentId, texto }) {
  const mensaje = String(texto || '').trim();
  if (!mensaje) return { ok: false, motivo: 'vacio', error: 'Escribe la respuesta.' };
  const ruta = platform === 'instagram' ? 'replies' : 'comments';
  const r = await pedir(fetchFn, `${G}/${encodeURIComponent(commentId)}/${ruta}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensaje }),
  });
  if (r.ok) return { ok: true, id: r.body?.id || null };
  const e = r.error || {};
  // (#200) / (#10) = la app no tiene el permiso para escribir ahí.
  const permiso = e.code === 200 || e.code === 10 || /permission|pages_manage_engagement/i.test(e.message || '');
  return { ok: false, motivo: permiso ? 'permiso' : 'red', error: e.message || 'La red no aceptó la respuesta.' };
}

/** La respuesta rápida con precio y WhatsApp que se ofrece en la pantalla. */
export function respuestaConPrecio({ precio, telefono }) {
  const p = Number(precio);
  const partes = ['¡Hola!'];
  if (p > 0) partes.push(`Está en RD$${p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`);
  partes.push(telefono ? `Escríbenos al WhatsApp ${telefono} y te lo separamos.` : 'Escríbenos por interno y te lo separamos.');
  return partes.join(' ');
}
