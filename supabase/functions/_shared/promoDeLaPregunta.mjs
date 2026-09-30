// ════════════════════════════════════════════════════════════════════════
//  ¿EL CLIENTE PREGUNTA POR ALGO QUE ESTÁ EN PROMOCIÓN?
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026. Quien escribe "precio de la banda?" casi siempre vio la
//  promoción del día. Si es así, Hermes lo dice y la extensión ofrece mandar
//  el arte en un toque.
//
//  Dos señales, en orden:
//   1. Hermes consultó ESE producto con sus herramientas (mismo id o código).
//   2. La conversación nombra el TIPO de pieza: la primera palabra de la
//      descripción ("BANDA delantera…", "ACEITE Motul…"). Solo esa: "platina"
//      o "bajaj" aparecen en casi todas las promociones y emparejarían
//      cualquier cosa con cualquier cosa.
// ════════════════════════════════════════════════════════════════════════

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Primera palabra con sentido de la descripción: la familia de la pieza. */
export function familia(descripcion) {
  const w = sinAcentos(descripcion).split(/[^a-z0-9ñ]+/).find((x) => x.length >= 4);
  return w || null;
}

export function promoDeLaPregunta({ promos = [], texto = '', piezas = [] }) {
  if (!Array.isArray(promos) || !promos.length) return null;

  const ids = new Set(piezas.map((p) => p?.id || p?.producto_id).filter(Boolean).map(String));
  const codigos = new Set(piezas.map((p) => p?.codigo).filter(Boolean).map((c) => String(c).toUpperCase()));
  const porHerramienta = promos.find((p) =>
    (p.producto_id && ids.has(String(p.producto_id))) || (p.codigo && codigos.has(String(p.codigo).toUpperCase())));
  if (porHerramienta) return porHerramienta;

  const palabras = new Set(sinAcentos(texto).split(/[^a-z0-9ñ]+/).filter(Boolean));
  // Plural simple: "bandas" pregunta por "banda".
  const nombra = (f) => palabras.has(f) || palabras.has(`${f}s`) || palabras.has(`${f}es`);
  return promos.find((p) => {
    const f = familia(p.descripcion);
    return f && nombra(f);
  }) || null;
}
