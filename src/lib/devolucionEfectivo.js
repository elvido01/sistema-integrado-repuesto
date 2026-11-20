// =====================================================================
// Lo que de verdad se cobró de una venta, y lo que sale en su devolución
// (20/11/2026)
// ---------------------------------------------------------------------
// Una venta de CONTADO a un cliente que retiene (AMSTAR) cobra el total menos
// lo retenido (facturas.retenido_no_cobrado, lo calcula el servidor): esa
// parte nunca entró a la caja. Al devolver, la nota de crédito y
// total_devolucion siguen siendo el monto fiscal (bruto); lo que se le
// entrega al cliente es la misma proporción neta. El servidor lo guarda en
// devoluciones.efectivo_devuelto al grabar (sql/devolucion_efectivo_neto.sql).
// =====================================================================
const n = (v) => Number(v) || 0;

/** Lo retenido que no se cobró (nunca más que el total). */
export const retenidoNoCobrado = (factura) => Math.min(n(factura?.retenido_no_cobrado), n(factura?.total));

/** Lo que se cobró de la factura. */
export const netoCobrado = (factura) => Math.max(0, n(factura?.total) - retenidoNoCobrado(factura));

/** Parte de la factura que de verdad se cobró (0..1). */
export const fraccionCobrada = (factura) => {
  const total = n(factura?.total);
  if (total <= 0 || n(factura?.retenido_no_cobrado) <= 0) return 1;
  return netoCobrado(factura) / total;
};

/** Monto a entregar al cliente, redondeado a centavos. */
export const efectivoDevuelto = (totalDevolucion, factura) =>
  Math.round(n(totalDevolucion) * fraccionCobrada(factura) * 100) / 100;

/** Lo que salió de verdad en una devolución ya grabada. */
export const montoEntregado = (devolucion, factura) =>
  devolucion?.efectivo_devuelto != null
    ? n(devolucion.efectivo_devuelto)
    : efectivoDevuelto(devolucion?.total_devolucion, factura);
