// Rescatar la foto que el cliente mandó por WhatsApp.
//
// (2026-08-29) Un cliente mandó la foto de unos balancines y escribió
// "necesito saber si tienen esa pieza de loncin 200 pruss". Al pulsar
// Sugerir, el agente contestó sobre un mensaje de doce horas antes: la foto
// no le llegó nunca. Hay 249 fotos de clientes en la base y 186 de ellas
// vienen SIN una sola palabra de texto — 186 veces que el agente contestó a
// otra pregunta, o no contestó.
//
// >>> POR QUE NO BASTABA CON LO QUE HABIA <<<
// El espejo detectaba la foto por `img[src^="blob:"]` y apuntaba el tipo. Un
// blob: es una dirección que solo existe dentro de esa pestaña: fuera de ahí
// no apunta a nada. Se anotaba que hubo una foto y se tiraban los bytes.
//
// >>> COMO SE RESCATA <<<
// Por el canvas, no por fetch. Las dos vías funcionan (probado: fetch da
// 14,293 bytes, el canvas 5,395 del mismo original, y el canvas NO queda
// manchado porque el blob es del mismo origen), pero el canvas además:
//   - encoge a 1024px, que es de sobra para reconocer una pieza,
//   - normaliza a JPEG, sin importar lo que trajera,
//   - y sobrevive aunque un día fetch deje de alcanzar el blob.
//
// Se sube al bucket whatsapp-media, el mismo donde ya viven las 122 fotos
// que entraron por el webhook oficial en mayo.

const MAX_LADO = 1024;      // suficiente para reconocer una pieza
const CALIDAD = 0.8;
const MAX_BYTES = 4 * 1024 * 1024;

// Un blob: recién puesto por WhatsApp puede no haber cargado todavía.
const listaParaLeer = (img) =>
  !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;

/**
 * Qué tamaño darle a la copia. Nunca AGRANDA: una miniatura estirada pesa
 * más y no enseña nada nuevo.
 */
export function medidaDestino(ancho, alto, max = MAX_LADO) {
  const lado = Math.max(ancho || 0, alto || 0);
  if (!lado) return { w: 0, h: 0 };
  const escala = Math.min(1, max / lado);
  return { w: Math.max(1, Math.round(ancho * escala)), h: Math.max(1, Math.round(alto * escala)) };
}

/**
 * El nombre del archivo en el bucket. Determinista a propósito: el espejo
 * relee el mismo chat cada 20 segundos y sin esto subiría la misma foto una
 * y otra vez. Con la misma llave, la segunda vez sobreescribe y ya.
 */
export function nombreDeArchivo(tenantId, externalMessageId) {
  const limpio = String(externalMessageId || 'sin-id')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(-120);
  return `${tenantId}/espejo/${limpio}.jpg`;
}

/**
 * La foto, encogida y en JPEG. Devuelve null si todavía no ha cargado o si
 * el navegador se niega (imagen de otro origen, canvas manchado).
 */
export async function copiarFoto(img) {
  if (!listaParaLeer(img)) return null;
  const { w, h } = medidaDestino(img.naturalWidth, img.naturalHeight);
  if (!w || !h) return null;

  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = w;
    lienzo.height = h;
    lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((ok, no) => {
      try {
        lienzo.toBlob((b) => (b ? ok(b) : no(new Error('toBlob vacio'))), 'image/jpeg', CALIDAD);
      } catch (e) { no(e); }
    });
    if (!blob || blob.size > MAX_BYTES) return null;
    return blob;
  } catch {
    // Un canvas manchado lanza SecurityError. No es motivo para romper el
    // espejo: la conversación se copia igual, solo que sin la foto.
    return null;
  }
}
