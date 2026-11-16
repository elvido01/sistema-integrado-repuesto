// =====================================================================
// ¿La factura del suplidor trae PRECIO NETO? (16/11/2026)
// ---------------------------------------------------------------------
// Pedro Racing imprime "Precio lista 179.60 · Precio neto 190.74 · Importe
// 1,144.41": el neto ya trae el descuento (10%) y el ITBIS (18%), y la suma
// de los importes de las filas ES el total de la factura. En ese caso la
// compra va con ITBIS incluido y sin descuento (aplicarlo lo cobra dos veces).
//
// Se decide por dos cosas que la foto da sola:
//   · los importes de las filas suman el TOTAL impreso (con ITBIS), y
//   · el total es mayor que el subtotal (o sea, el ITBIS ya está adentro).
// Si la factura no trae total, no se adivina: se deja como está.
// =====================================================================
const cerca = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

export function esFacturaPrecioNeto(items, invoice) {
  const total = Number(invoice?.total) || 0;
  const filas = (items || []).filter((it) => Number(it?.line_total) > 0);
  if (!(total > 0) || filas.length === 0) return false;
  const suma = filas.reduce((s, it) => s + Number(it.line_total), 0);
  if (!cerca(suma, total)) return false;
  // Que el total traiga ITBIS: mayor que el subtotal impreso, o filas con ITBIS.
  const subtotal = Number(invoice?.subtotal) || 0;
  const conItbis = subtotal > 0 ? total > subtotal * 1.01 : filas.some((it) => Number(it.itbis_pct) > 0);
  return conItbis;
}
