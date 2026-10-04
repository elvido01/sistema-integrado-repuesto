// El codigo de descuento de una promocion, en palabras para el cliente.
//
// (04/10/2026) Cada promocion lleva un codigo (T214 TikTok, I214 Instagram,
// F214 Facebook, Y214 YouTube, W214 estado de WhatsApp) que da 5% en caja y
// dice de que red vino la venta. Ver sql/codigo_de_descuento_por_promocion.sql.
//
// Lo usan el publicador (lo pega al texto de Facebook, Instagram y YouTube) y
// Equipo IA (el texto para copiar en TikTok y en el estado de WhatsApp, que
// salen sin texto). Un solo sitio para que el cliente lea lo mismo en todas.

export const LETRA_DE_RED = Object.freeze({
  tiktok: 'T', instagram: 'I', facebook: 'F', youtube: 'Y', whatsapp: 'W',
});

/** "10/10": el ultimo dia que vale, en hora de RD. */
export function fechaCorta(venceAt) {
  const d = new Date(venceAt);
  if (Number.isNaN(d.getTime())) return '';
  const rd = new Date(d.getTime() - 4 * 3600 * 1000); // RD no cambia de hora
  const dd = String(rd.getUTCDate()).padStart(2, '0');
  const mm = String(rd.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** El codigo de una red: codigoDeRed('tiktok', 214) → 'T214'. */
export function codigoDeRed(red, numero) {
  const letra = LETRA_DE_RED[String(red || '').toLowerCase()];
  return letra && numero ? `${letra}${numero}` : null;
}

/** La linea que lee el cliente. */
export function lineaCodigo({ codigo, pct = 5, vence_at }) {
  if (!codigo) return '';
  const hasta = fechaCorta(vence_at);
  return `🎁 Di el código ${codigo} en caja y llévatela con ${Number(pct)}% de descuento.`
    + (hasta ? ` Válido hasta el ${hasta}.` : '');
}

/**
 * El texto de la publicacion con el codigo al final. Si ya lo trae (se
 * reintenta un destino, o alguien lo escribio a mano), no se repite.
 */
export function textoConCodigo(texto, info) {
  const base = String(texto || '').trimEnd();
  if (!info?.codigo) return base;
  if (base.toUpperCase().includes(String(info.codigo).toUpperCase())) return base;
  const linea = lineaCodigo(info);
  return base ? `${base}\n\n${linea}` : linea;
}
