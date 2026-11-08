// =====================================================================
// Total de una línea de compra (07/11/2026)
// ---------------------------------------------------------------------
// Una sola regla para compras_detalle.importe, la misma que ya usaban los
// totales de la compra (ComprasPage → totals):
//   base = cantidad × costo − descuento (redondeado a 2 decimales)
//   · ITBIS incluido en el costo, o línea exenta → importe = base
//   · ITBIS aparte → base + ITBIS (truncado a 2 decimales, como pidió el dueño)
// Antes el importe se copiaba de la Orden de Compra (que ya traía el ITBIS)
// aunque la compra fuera "ITBIS incluido", y marcar/desmarcar la casilla no
// lo recalculaba: el ITBIS quedaba sumado dos veces (OC-0393 de Morla).
// itbis_pct va en decimal (0.18).
// =====================================================================

export function importeLineaCompra(d, itbisIncluido) {
  const cantidad = Number(d?.cantidad) || 0;
  const costo = Number(d?.costo_unitario) || 0;
  const subtotal = Number((cantidad * costo).toFixed(2));
  const descuento = Number((subtotal * ((Number(d?.descuento_pct) || 0) / 100)).toFixed(2));
  const base = Number((subtotal - descuento).toFixed(2));
  const tasa = Number(d?.itbis_pct) || 0;
  if (tasa > 0 && !itbisIncluido) {
    return Number((base + Math.trunc(base * tasa * 100) / 100).toFixed(2));
  }
  return base;
}
