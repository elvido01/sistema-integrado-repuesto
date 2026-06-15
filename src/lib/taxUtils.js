/**
 * Cálculos de impuestos centralizados (Fase 1.1).
 *
 * Reglas de negocio del proyecto:
 *  - `itbis_pct` se guarda como decimal (0.18 = 18%) NO como porcentaje (18).
 *  - Algunos formularios viejos guardaban 18 en lugar de 0.18; este módulo
 *    normaliza ambos casos.
 *  - El precio puede venir con o sin ITBIS incluido (depende del documento).
 *  - DGII e-CF acepta tasas mixtas (18%, 16%, 8%) en `TotalITBIS1/2/3`.
 *
 * Reemplaza los `normalizeTaxRate` duplicados en:
 *   - src/pages/OrdenCompraPage.jsx
 *   - src/services/sendToOrdenCompra.js
 *   - src/hooks/useVentas.js (variante inline)
 *
 * Documentado en docs/BUSINESS_RULES.md sección ITBIS.
 */

/**
 * Convierte una tasa de impuesto a su forma decimal canónica (0..1).
 *
 * Tolera entradas como número o string, formato porcentaje (18) o decimal (0.18),
 * y valores vacíos/null/undefined.
 *
 * @param {number|string|null|undefined} value
 * @returns {number} Tasa decimal entre 0 y 1 (clamped). Ej.: 0.18 para 18%.
 *
 * @example
 *   normalizeTaxRate(0.18)   // 0.18
 *   normalizeTaxRate(18)     // 0.18
 *   normalizeTaxRate("18")   // 0.18
 *   normalizeTaxRate(null)   // 0
 *   normalizeTaxRate("")     // 0
 */
export const normalizeTaxRate = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const raw = parseFloat(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // > 1 implica que viene como porcentaje (18 -> 0.18).
  // Caso raro: tasa exactamente 1 (= 100%) es ambiguo; lo tratamos como decimal.
  return raw > 1 ? raw / 100 : raw;
};

/**
 * Redondea a 2 decimales preservando precisión (evita drift de IEEE-754).
 *
 * @param {number} n
 * @returns {number}
 */
const round2 = (n) => Number((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));

/**
 * Calcula el monto de ITBIS dado una base.
 *
 * @param {number} base - Monto. Si isIncluded=true, contiene ITBIS dentro. Si no, es base imponible.
 * @param {number|string} taxRate - Tasa (0.18 o 18, normalizada internamente).
 * @param {boolean} isIncluded - true si `base` ya incluye el impuesto. Default false.
 * @returns {number} Monto del impuesto, redondeado a 2 decimales.
 *
 * @example
 *   calculateTaxAmount(100, 0.18, false)  // 18.00  (100 + ITBIS 18)
 *   calculateTaxAmount(118, 0.18, true)   // 18.00  (base 100 + ITBIS 18 incluido)
 *   calculateTaxAmount(100, 0,    false)  // 0      (exento)
 */
export const calculateTaxAmount = (base, taxRate = 0.18, isIncluded = false) => {
  const amount = Number(base) || 0;
  const rate = normalizeTaxRate(taxRate);
  if (rate === 0 || amount === 0) return 0;
  if (isIncluded) {
    const baseSinImpuesto = amount / (1 + rate);
    return round2(amount - baseSinImpuesto);
  }
  return round2(amount * rate);
};

/**
 * Extrae la base imponible cuando un precio incluye impuesto.
 *
 * @param {number} priceWithTax
 * @param {number|string} taxRate
 * @returns {number} Base imponible, redondeada a 2 decimales.
 *
 * @example
 *   extractTaxableBase(118, 0.18)  // 100.00
 *   extractTaxableBase(100, 0)     // 100.00
 */
export const extractTaxableBase = (priceWithTax, taxRate = 0.18) => {
  const amount = Number(priceWithTax) || 0;
  const rate = normalizeTaxRate(taxRate);
  if (rate === 0) return round2(amount);
  return round2(amount / (1 + rate));
};

/**
 * Calcula el importe TOTAL de una línea de detalle, considerando:
 * cantidad, precio unitario, descuento %, ITBIS % y flag aplicarItbis.
 *
 * Asume que `precio` es la base UNITARIA sin impuestos. Si tu modelo guarda
 * el precio CON ITBIS incluido, usa primero `extractTaxableBase` para
 * obtener el precio base antes de pasarlo aquí.
 *
 * @param {object} detalle - Línea con { cantidad, precio, descuento_pct, itbis_pct }
 * @param {boolean} aplicarItbis - Si false, retorna solo base con descuento. Default true.
 * @returns {number} Importe redondeado a 2 decimales.
 *
 * @example
 *   calculateLineAmount({cantidad: 2, precio: 50, descuento_pct: 10, itbis_pct: 0.18})
 *     // base = (2 * 50) - 10% = 90; itbis = 16.20; total = 106.20
 *
 *   calculateLineAmount({cantidad: 1, precio: 100, itbis_pct: 0}, true)
 *     // 100.00 (exento)
 *
 *   calculateLineAmount({cantidad: 3, precio: 25, itbis_pct: 0.18}, false)
 *     // 75.00 (no se aplica ITBIS aunque el producto lo tenga)
 */
export const calculateLineAmount = (detalle, aplicarItbis = true) => {
  if (!detalle) return 0;
  const cantidad = Number(detalle.cantidad) || 0;
  const precio = Number(detalle.precio) || 0;
  const descPct = (Number(detalle.descuento_pct) || 0) / 100;
  const rate = normalizeTaxRate(detalle.itbis_pct);

  const subtotal = cantidad * precio;
  const base = subtotal - (subtotal * descPct);

  if (!aplicarItbis || rate === 0) return round2(base);

  const tax = round2(base * rate);
  return round2(base + tax);
};

/**
 * Agrupa los totales (gravado, exento, itbis, total) de un array de líneas.
 *
 * Útil para construir cabeceras de factura/orden de compra/cotización.
 *
 * @param {Array<object>} detalles - Cada uno con { cantidad, precio, descuento_pct, itbis_pct }
 * @param {boolean} aplicarItbis - Default true
 * @returns {{ gravado: number, exento: number, descuento: number, itbis: number, total: number }}
 *
 * @example
 *   sumLineTotals([
 *     { cantidad: 2, precio: 50, itbis_pct: 0.18 },     // gravado
 *     { cantidad: 1, precio: 100, itbis_pct: 0 },       // exento
 *   ])
 *   // { gravado: 100, exento: 100, descuento: 0, itbis: 18, total: 218 }
 */
export const sumLineTotals = (detalles = [], aplicarItbis = true) => {
  let gravado = 0;
  let exento = 0;
  let descuento = 0;
  let itbis = 0;

  for (const d of detalles) {
    const cantidad = Number(d?.cantidad) || 0;
    const precio = Number(d?.precio) || 0;
    const descPct = (Number(d?.descuento_pct) || 0) / 100;
    const rate = normalizeTaxRate(d?.itbis_pct);

    const subtotal = cantidad * precio;
    const desc = subtotal * descPct;
    const base = subtotal - desc;

    descuento += desc;

    if (aplicarItbis && rate > 0) {
      gravado += base;
      itbis += base * rate;
    } else {
      exento += base;
    }
  }

  return {
    gravado: round2(gravado),
    exento: round2(exento),
    descuento: round2(descuento),
    itbis: round2(itbis),
    total: round2(gravado + exento + itbis),
  };
};
