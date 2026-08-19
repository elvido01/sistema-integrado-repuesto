// De dónde vino la venta: un solo vocabulario para toda la aplicación.
//
// >>> POR QUE ESTE ARCHIVO <<<
// Las mismas etiquetas hacen falta en tres sitios que no se hablan entre
// ellos: el pie de Ventas (donde el vendedor las elige), el reporte de
// Marketing (donde se leen) y el CRM. Escritas tres veces divergen, y una
// lista de canales divergente no se nota como un error: se nota como que
// "TikTok" y "Tik Tok" son dos canales distintos con la mitad del dinero
// cada uno.
//
// Los VALORES son los mismos que acepta el CHECK de facturas.canal_origen y
// de crm_seguimiento.canal_origen, y los mismos que guarda
// sales_conversations.platform. Eso es lo que permite comparar una factura
// con el seguimiento que la produjo sin traducir nada por el camino.
// Cambiar uno aquí sin cambiar el CHECK rompe la grabación.

/** Lo que se le ofrece al vendedor, en el orden en que se le ofrece. */
export const CANALES_ORIGEN = Object.freeze([
  { valor: 'tienda',    label: 'Vino a la tienda', corto: 'Tienda',    emoji: '🏪' },
  { valor: 'whatsapp',  label: 'WhatsApp',         corto: 'WhatsApp',  emoji: '💬' },
  { valor: 'instagram', label: 'Instagram',        corto: 'Instagram', emoji: '📸' },
  { valor: 'facebook',  label: 'Facebook',         corto: 'Facebook',  emoji: '👥' },
  { valor: 'tiktok',    label: 'TikTok',           corto: 'TikTok',    emoji: '🎵' },
  { valor: 'telefono',  label: 'Llamó por teléfono', corto: 'Teléfono', emoji: '📞' },
  { valor: 'referido',  label: 'Lo refirió alguien', corto: 'Referido', emoji: '🤝' },
  { valor: 'otro',      label: 'Otro',             corto: 'Otro',      emoji: '❔' },
]);

// 'redes' no se ofrece: sigue siendo válido en la base por las filas viejas,
// pero era justo lo que impedía contestar la pregunta — Instagram, Facebook
// y TikTok en la misma bolsa hacen imposible saber cuál de los tres trae
// gente. Se nombra aquí para que los reportes sepan leerlo, no para elegirlo.
const HISTORICOS = {
  redes:      { corto: 'Redes (viejo)', emoji: '📱' },
  sin_anotar: { corto: 'Sin anotar',    emoji: '⚪' },
};

/** Nombre legible de un canal, venga de donde venga. Nunca devuelve vacío. */
export function nombreCanal(valor) {
  if (!valor) return HISTORICOS.sin_anotar.corto;
  const c = CANALES_ORIGEN.find(x => x.valor === valor);
  if (c) return c.corto;
  return HISTORICOS[valor]?.corto || valor;
}

/** El emoji que lo acompaña en las listas. */
export function emojiCanal(valor) {
  if (!valor) return HISTORICOS.sin_anotar.emoji;
  const c = CANALES_ORIGEN.find(x => x.valor === valor);
  return c?.emoji || HISTORICOS[valor]?.emoji || '❔';
}
