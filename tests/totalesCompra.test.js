import { describe, it, expect } from 'vitest';
import { totalesCompra } from '../src/lib/compraLinea';

// Factura FT117687 (suplidor de Morla, 19/11/2026): 13 líneas, 6 % de
// descuento, ITBIS 18 % aparte. Comprobante: sub total 12,999.63,
// descuento 829.77, ITBIS 2,339.93, total 15,339.56.
const L = (cantidad, costo) => ({ cantidad, costo_unitario: costo, descuento_pct: 6, itbis_pct: 0.18 });
const FT117687 = [
  L(1, 1621.10), L(2, 439.20), L(6, 96.48), L(2, 451.56), L(3, 120.00), L(3, 584.64), L(1, 1399.00),
  L(2, 556.64), L(2, 490.00), L(1, 930.24), L(6, 188.16), L(3, 324.30), L(2, 604.80),
];

describe('Totales de la compra: ITBIS sobre el total', () => {
  it('cuadra al centavo con la factura del suplidor', () => {
    const t = totalesCompra(FT117687, false);
    expect(t.gravado).toBe(12999.63);
    expect(t.descuento).toBe(829.77);
    expect(t.itbis).toBe(2339.93);
    expect(t.total).toBe(15339.56);
  });
  it('separa exento y calcula cada tasa por su lado', () => {
    const t = totalesCompra([
      { cantidad: 1, costo_unitario: 100, itbis_pct: 0.18 },
      { cantidad: 1, costo_unitario: 100, itbis_pct: 0.16 },
      { cantidad: 1, costo_unitario: 50, itbis_pct: 0 },
    ], false);
    expect(t).toEqual({ exento: 50, gravado: 200, descuento: 0, itbis: 34, total: 284 });
  });
  it('ITBIS incluido: saca el ITBIS del total de la tasa', () => {
    const t = totalesCompra([{ cantidad: 1, costo_unitario: 118, itbis_pct: 0.18 }, { cantidad: 2, costo_unitario: 59, itbis_pct: 0.18 }], true);
    expect(t.gravado).toBe(200);
    expect(t.itbis).toBe(36);
    expect(t.total).toBe(236);
  });
  it('sin líneas: todo en 0', () => {
    expect(totalesCompra([], false)).toEqual({ exento: 0, gravado: 0, descuento: 0, itbis: 0, total: 0 });
  });
});

describe('Totales de la compra: bordes', () => {
  it('medio centavo exacto redondea hacia arriba (1.25 × 18 % = 0.225 → 0.23)', () => {
    expect(totalesCompra([{ cantidad: 1, costo_unitario: 1.25, itbis_pct: 0.18 }], false).itbis).toBe(0.23);
    expect(totalesCompra([{ cantidad: 1, costo_unitario: 5.75, itbis_pct: 0.18 }], false).itbis).toBe(1.04);
  });
  it('tasas casi iguales van juntas', () => {
    const t = totalesCompra([
      { cantidad: 1, costo_unitario: 0.69, itbis_pct: 0.18 },
      { cantidad: 1, costo_unitario: 0.69, itbis_pct: 0.18000000000000002 },
    ], false);
    expect(t.itbis).toBe(0.25); // 1.38 × 0.18 = 0.2484, no 0.12 + 0.12
  });
});

describe('Regla de antes (editar compras viejas)', () => {
  it('reproduce el total viejo truncado por línea, distinto del nuevo', async () => {
    const { totalesCompraPorLinea } = await import('../src/lib/compraLinea');
    const vieja = totalesCompraPorLinea(FT117687, false);
    expect(Number(vieja.total.toFixed(2))).toBe(15339.49);
    expect(Number(vieja.itbis.toFixed(2))).toBe(2339.86);
  });
});

describe('Más bordes', () => {
  it('descuento con medio centavo: 120.25 × 6 % = 7.215 → 7.22', () => {
    const t = totalesCompra([{ cantidad: 1, costo_unitario: 120.25, descuento_pct: 6, itbis_pct: 0 }], false);
    expect(t.descuento).toBe(7.22);
    expect(t.exento).toBe(113.03);
  });
  it('nota de crédito: el negativo redondea igual que el positivo', () => {
    expect(totalesCompra([{ cantidad: -1, costo_unitario: 1.25, itbis_pct: 0.18 }], false).itbis).toBe(-0.23);
  });
});
