// =====================================================================
// Reutilizar una publicación anterior: mismo arte, texto nuevo (21/11/2026)
// ---------------------------------------------------------------------
// Cuando a una franja de la publicación diaria no le queda pieza nueva,
// Hermes propone una publicación ya hecha (sql/equipo_reusar_publicaciones.sql).
// Decisión del dueño: "el mismo arte, diferente texto". Aquí:
//   · mediaDeBundle: saca del bundle viejo la imagen del feed, la de la
//     historia y el reel, para el formulario de publicar.
//   · textosReuso: escribe un texto que no repite la entrada del anterior,
//     con el precio de HOY (productos.precio: el de catálogo, ITBIS incluido,
//     sin descuento) y el teléfono y los hashtags que traía el anterior.
// El dueño lo revisa y lo cambia antes de programar: nada sale solo.
// =====================================================================

const urlDe = (j) => j?.image_url || j?.media_url || '';
const fecha = (j) => new Date(j?.completed_at || j?.created_at || 0).getTime();

/** De los trabajos de un bundle: { imagen_feed, imagen_historia, video }. */
export function mediaDeBundle(jobs = []) {
  const recientes = [...jobs].sort((a, b) => fecha(b) - fecha(a));
  const imagen = (j) => j.media_type === 'image' && urlDe(j);
  const feed = recientes.find((j) => imagen(j) && ['feed', 'both'].includes(j.placement));
  const historia = recientes.find((j) => imagen(j) && j.placement === 'story')
    || recientes.find((j) => imagen(j) && j.placement === 'both');
  const video = recientes.find((j) => j.media_type === 'video' && j.media_url);
  const media = {};
  if (feed) media.imagen_feed = urlDe(feed);
  if (historia) media.imagen_historia = urlDe(historia);
  if (video) media.video = video.media_url;
  return media;
}

/** El precio que traía el arte del bundle (lo que dice la imagen). */
export function precioDelArte(jobs = []) {
  const j = [...jobs].sort((a, b) => fecha(b) - fecha(a)).find((x) => x.precio_mostrado != null);
  return j ? Number(j.precio_mostrado) : null;
}

const ENTRADAS = [
  '¡La tenemos disponible!',
  'Para los que preguntaron:',
  'Directo a tu moto:',
  'Todavía te queda chance:',
  'Calidad que se nota:',
  '¿Te hace falta?',
  'Lo que tu moto está pidiendo:',
  'Pasa y llévatela hoy:',
];
const CIERRES = [
  'Escríbenos o pasa por la tienda',
  'Te la apartamos: escríbenos',
  'Pregunta por ella',
  'Ven por la tuya',
];

const primeraLinea = (t) => String(t || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
const sinAcentos = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function hash(texto) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Teléfono del texto anterior (809/829/849-xxx-xxxx), si traía. */
export function telefonoDe(textos = {}) {
  const todo = Object.values(textos || {}).join('\n');
  const m = todo.match(/\b(8[024]9)[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Hashtags del texto anterior, sin repetir, máximo 3 (voz de la marca). */
export function hashtagsDe(textos = {}) {
  const todo = Object.values(textos || {}).join(' ');
  const vistos = new Set();
  const tags = [];
  for (const t of todo.match(/#[\p{L}\p{N}_]+/gu) || []) {
    const k = sinAcentos(t);
    if (!vistos.has(k)) { vistos.add(k); tags.push(t); }
  }
  return tags.slice(0, 3);
}

const dinero = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Texto nuevo por red. `semilla` cambia la entrada de un día a otro (la fecha
 * de hoy + la pieza); nunca repite la primera línea del texto anterior.
 */
export function textosReuso({ descripcion, precio, textosViejos = {}, semilla = '' }) {
  const viejas = new Set(Object.values(textosViejos || {}).map((t) => sinAcentos(primeraLinea(t))));
  const base = hash(`${semilla}|${descripcion}`);
  let entrada = ENTRADAS[base % ENTRADAS.length];
  for (let i = 1; i <= ENTRADAS.length && viejas.has(sinAcentos(entrada)); i += 1) {
    entrada = ENTRADAS[(base + i) % ENTRADAS.length];
  }
  const cierre = CIERRES[base % CIERRES.length];
  const tel = telefonoDe(textosViejos);
  const tags = hashtagsDe(textosViejos);
  const pieza = String(descripcion || '').trim();
  const contacto = tel ? `${cierre}: ${tel}.` : `${cierre}.`;

  const largo = `${entrada}\n\n${pieza} a ${dinero(precio)}.\n${contacto}`;
  const ig = `${entrada}\n\n${pieza} por ${dinero(precio)}.${tel ? ` 📞 ${tel}` : ''}${tags.length ? `\n\n${tags.join(' ')}` : ''}`;
  const corto = `${entrada} ${pieza} a ${dinero(precio)}.${tags.length ? ` ${tags.join(' ')}` : ''}`;
  return { facebook: largo, instagram: ig, tiktok: corto, youtube: corto };
}
