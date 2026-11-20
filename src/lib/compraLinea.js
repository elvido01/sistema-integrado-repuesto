// =====================================================================
// Totales de una compra (07/11/2026; ITBIS sobre el total 20/11/2026)
// ---------------------------------------------------------------------
// baseLineaCompra: base de cada línea = cantidad × costo − descuento,
//   redondeada a 2 decimales. La usan las dos reglas de abajo.
//
// importeLineaCompra (compras_detalle.importe):
//   · ITBIS incluido en el costo, o línea exenta → importe = base
//   · ITBIS aparte → base + ITBIS de la línea (truncado, como siempre).
//   Antes el importe se copiaba de la Orden de Compra (que ya traía el
//   ITBIS) aunque la compra fuera "ITBIS incluido" (OC-0393 de Morla).
//
// totalesCompra (compras.itbis_total / total_compra, lo que va al 606):
//   desde el 20/11/2026 el ITBIS se calcula SOBRE EL TOTAL de cada tasa y se
//   redondea una vez, como en la factura del suplidor (pedido del dueño:
//   FT117687 salía 2,339.86 contra 2,339.93 del comprobante). Por eso la
//   suma de los importes de línea puede diferir del total por centavos: el
//   total que manda es el del comprobante.
//   · ITBIS aparte: gravado = Σ bases de la tasa; ITBIS = redondeo(gravado × tasa).
//   · ITBIS incluido: bruto = Σ bases; gravado = redondeo(bruto / (1+tasa)); ITBIS = bruto − gravado.
//   · Tasa 0 → exento.
//   Todo en CENTAVOS ENTEROS: con decimales de computadora 1.25 × 0.18 da
//   0.22499999… y redondeaba a 0.22 en vez de 0.23.
//
// totalesCompraPorLinea: la regla de antes (suma del ITBIS truncado de cada
//   línea). Solo para EDITAR una compra cuyo total guardado sale con esta
//   regla (ComprasPage lo compara al cargarla): sus pagos y pagarés suman
//   ese total y no deben descuadrarse por centavos.
// itbis_pct va en decimal (0.18).
// =====================================================================

// Redondeo a entero con los medios hacia afuera (como en papel), simétrico
// para negativos (notas de crédito). El 1e-7 corrige el error de los
// decimales de computadora (7.2149999… centavos×100 → 721.5).
const redondeo = (x) => Math.sign(x) * Math.round(Math.abs(x) + 1e-7);
const centavos = (v) => redondeo((Number(v) || 0) * 100);
const pesos = (c) => c / 100;
// Tasa en puntos básicos enteros (0.18 → 1800): junta 0.18 y 0.18000000000000002.
const puntosBasicos = (tasa) => Math.round((Number(tasa) || 0) * 10000);

export function baseLineaCompra(d) {
  const cantidad = Number(d?.cantidad) || 0;
  const costo = Number(d?.costo_unitario) || 0;
  const subtotal = Number((cantidad * costo).toFixed(2));
  const descuento = Number((subtotal * ((Number(d?.descuento_pct) || 0) / 100)).toFixed(2));
  return { subtotal, descuento, base: Number((subtotal - descuento).toFixed(2)) };
}

export function importeLineaCompra(d, itbisIncluido) {
  const { base } = baseLineaCompra(d);
  const tasa = Number(d?.itbis_pct) || 0;
  if (tasa > 0 && !itbisIncluido) {
    return Number((base + Math.trunc(base * tasa * 100) / 100).toFixed(2));
  }
  return base;
}

export function totalesCompra(detalles, itbisIncluido) {
  let exento = 0;
  let descuento = 0;
  const porTasa = new Map(); // puntos básicos → centavos de base
  for (const d of detalles || []) {
    // Base de la línea en centavos exactos (120.25 × 6 % = 7.215 → 7.22).
    const subtotal = centavos((Number(d?.cantidad) || 0) * (Number(d?.costo_unitario) || 0));
    const desc = redondeo(subtotal * (Number(d?.descuento_pct) || 0) / 100);
    descuento += desc;
    const base = subtotal - desc;
    const bp = puntosBasicos(d?.itbis_pct);
    if (bp > 0) porTasa.set(bp, (porTasa.get(bp) || 0) + base);
    else exento += base;
  }
  let gravado = 0;
  let itbis = 0;
  for (const [bp, bases] of porTasa) {
    if (itbisIncluido) {
      const sinItbis = redondeo((bases * 10000) / (10000 + bp));
      gravado += sinItbis;
      itbis += bases - sinItbis;
    } else {
      gravado += bases;
      itbis += redondeo((bases * bp) / 10000);
    }
  }
  return {
    exento: pesos(exento),
    gravado: pesos(gravado),
    descuento: pesos(descuento),
    itbis: pesos(itbis),
    total: pesos(gravado + exento + itbis),
  };
}

// La regla de antes del 20/11/2026 (ver arriba): solo para editar compras viejas.
export function totalesCompraPorLinea(detalles, itbisIncluido) {
  let exento = 0;
  let gravado = 0;
  let descuento = 0;
  let itbis = 0;
  for (const d of detalles || []) {
    const l = baseLineaCompra(d);
    descuento += l.descuento;
    const tasa = Number(d?.itbis_pct) || 0;
    if (tasa > 0) {
      if (itbisIncluido) {
        const baseSinItbis = Number((l.base / (1 + tasa)).toFixed(2));
        gravado += baseSinItbis;
        itbis += Number((l.base - baseSinItbis).toFixed(2));
      } else {
        gravado += l.base;
        itbis += Math.trunc((l.base * tasa) * 100) / 100;
      }
    } else {
      exento += l.base;
    }
  }
  const total = Number((gravado + exento + itbis).toFixed(2));
  return { exento, gravado, descuento, itbis, total };
}
