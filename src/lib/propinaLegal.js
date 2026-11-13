// =====================================================================
// Propina legal (10 %) — 13/11/2026
// ---------------------------------------------------------------------
// La misma base que el e-CF (supabase/functions/emitir-fiscal/
// dgii_xml_builder.ts → propinaLegalDgii): la suma de los montos de las líneas
// SIN ITBIS, redondeados línea por línea, por 10 %. Si las dos cuentas no dan
// lo mismo, la factura no se puede emitir.
// =====================================================================

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const pct = (v) => { const x = Number(v || 0); return x > 1 ? x / 100 : x; };

/** Monto sin ITBIS de una línea de la venta (precio CON ITBIS, descuento en %). */
export const baseLineaSinItbis = (it) => {
  const neto = (Number(it.cantidad) || 0) * (Number(it.precio) || 0) * (1 - (Number(it.descuento) || 0) / 100);
  return r2(neto / (1 + pct(it.itbis_pct)));
};

/** Propina legal de la venta, en pesos. */
export const propinaLegal = (items) => r2((items || []).reduce((s, it) => s + baseLineaSinItbis(it), 0) * 0.10);
