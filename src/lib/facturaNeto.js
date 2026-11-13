// =====================================================================
// Factura desde lo que paga el cliente (neto) — 13/11/2026
// ---------------------------------------------------------------------
// Algunos clientes empresa (AMSTAR con Oscar Aristy) pagan una cifra fija
// (RD$ 600) y exigen la factura con ITBIS, propina legal y sus retenciones.
// Dado ese neto, se busca el PRECIO CON ITBIS de una línea para que la
// FACTURA COMPLETA dé el neto:
//
//   neto = Σ precios + propina 10 % − ITBIS retenido − ISR retenido
//
// con los mismos redondeos que la venta y la base: la propina es la de
// lib/propinaLegal (= propinaLegalDgii del e-CF) sobre todas las líneas, y
// cada retención se redondea una vez sobre toda la factura, como
// recalcular_retenciones_factura. Se busca en centavos del precio CON ITBIS
// porque así el total de MotoFlow y el del e-CF cuadran al centavo. No siempre
// existe un precio que dé el neto exacto (con propina salta de 599.99 a
// 600.01): se elige el más cercano y, en un empate, el que no cobra de menos.
// =====================================================================
import { propinaLegal } from './propinaLegal';

// Las retenciones: como round() de la base sobre lo que guardó la venta.
const rnd = (v) => Math.round(Number(v) * 100) / 100;

/**
 * Lo que paga el cliente por la factura.
 * lineas: [{ precio (total de la línea CON ITBIS), itbis: 0.18, retItbis: 0..1, isr: 0..1 }]
 */
export function netoFactura(lineas, { propina = false } = {}) {
  let total = 0; let retI = 0; let retS = 0;
  for (const l of lineas) {
    const p = Number(l.itbis) || 0;
    const precio = Number(l.precio) || 0;
    const base = precio / (1 + p);
    total += precio;
    retI += (precio - base) * (Number(l.retItbis) || 0);
    retS += base * (Number(l.isr) || 0);
  }
  const prop = propina ? propinaLegal(lineas.map((l) => ({ cantidad: 1, precio: l.precio, descuento: 0, itbis_pct: l.itbis }))) : 0;
  return rnd(total + prop - rnd(retI) - rnd(retS));
}

/**
 * Precio CON ITBIS (en centavos) para la línea `idx` de modo que la factura
 * pague `netoLinea` más lo que ya pagan las demás líneas.
 * Devuelve { precio, base, neto (de la línea, el que de verdad resulta) }.
 */
export function precioLineaDesdeNeto(lineas, idx, netoLinea, opts = {}) {
  const objetivoLinea = Number(netoLinea) || 0;
  const l = lineas[idx];
  if (!l || objetivoLinea <= 0) return { precio: 0, base: 0, neto: 0 };
  const otras = lineas.filter((_, i) => i !== idx);
  const netoOtras = otras.length ? netoFactura(otras, opts) : 0;
  const objetivo = netoOtras + objetivoLinea;
  const p = Number(l.itbis) || 0;
  const factor = 1 + p - p * (Number(l.retItbis) || 0) - (Number(l.isr) || 0) + (opts.propina ? 0.10 : 0);
  const aprox = (objetivoLinea / factor) * (1 + p);
  let mejor = null;
  for (let c = Math.round(aprox * 100) - 10; c <= Math.round(aprox * 100) + 10; c++) {
    if (c <= 0) continue;
    const precio = c / 100;
    const n = netoFactura(lineas.map((x, i) => (i === idx ? { ...x, precio } : x)), opts);
    const dif = Math.abs(n - objetivo);
    if (!mejor
      || dif < mejor.dif - 1e-9
      || (Math.abs(dif - mejor.dif) < 1e-9 && n >= objetivo && mejor.n < objetivo)) {
      mejor = { precio, n, dif };
    }
  }
  return { precio: mejor.precio, base: rnd(mejor.precio / (1 + p)), neto: rnd(mejor.n - netoOtras) };
}

/** Una sola línea (atajo). */
export const precioDesdeNeto = (neto, t) =>
  precioLineaDesdeNeto([{ precio: 0, itbis: t.itbis, retItbis: t.retItbis, isr: t.isr }], 0, neto, { propina: !!t.propina });
