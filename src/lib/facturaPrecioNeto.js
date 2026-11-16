// =====================================================================
// ¿La factura del suplidor trae PRECIO NETO? (16/11/2026)
// ---------------------------------------------------------------------
// Pedro Racing imprime "Precio lista 179.60 · Precio neto 190.74 · Importe
// 1,144.41": el neto ya trae el descuento (10%) y el ITBIS (18%), y la suma
// de los importes de las filas ES el total de la factura. En ese caso la
// compra va con ITBIS incluido y sin descuento (aplicarlo lo cobra dos veces).
//
// Solo se decide con datos impresos, nunca adivinando:
//   · cada fila con cantidad trae su importe (si falta uno, no se decide);
//   · los importes (también los negativos: devoluciones, bonos) suman el
//     TOTAL impreso;
//   · la factura trae SUBTOTAL y el total es mayor (el ITBIS ya está adentro).
// =====================================================================
export const cercaDe = (a, b, tolerancia = 0.005) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tolerancia);

export function esFacturaPrecioNeto(items, invoice) {
  const total = Number(invoice?.total) || 0;
  const subtotal = Number(invoice?.subtotal) || 0;
  if (!(total > 0) || !(subtotal > 0) || !(total > subtotal * 1.01)) return false;
  const filas = (items || []).filter((it) => Number(it?.qty) > 0 || Number(it?.line_total) !== 0);
  if (filas.length === 0) return false;
  // Una fila sin importe no se puede costear por su importe: mejor no decidir.
  if (filas.some((it) => !Number(it?.line_total))) return false;
  const suma = filas.reduce((s, it) => s + Number(it.line_total), 0);
  return cercaDe(suma, total);
}
