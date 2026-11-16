import { describe, it, expect } from 'vitest';
import { esFacturaPrecioNeto } from '../src/lib/facturaPrecioNeto.js';

// Pedro Racing 05-2109754 (14/11/2026): sub-total 19,313.74, desc 10%, ITBIS 3,128.83, neto 20,511.19.
const pedro = [
  { qty: 6, unit_cost: 190.74, line_total: 1144.41, itbis_pct: 18 },
  { qty: 6, unit_cost: 222.68, line_total: 1418.90, itbis_pct: 18 },
  { qty: 1, unit_cost: 2476.46, line_total: 2630.00, itbis_pct: 18 },
];
const totalPedro = 1144.41 + 1418.90 + 2630.00;

describe('factura con precio neto', () => {
  it('los importes suman el total con ITBIS: precio neto', () => {
    expect(esFacturaPrecioNeto(pedro, { subtotal: 4600, total: totalPedro })).toBe(true);
  });
  it('los importes suman el subtotal (antes de ITBIS): factura normal', () => {
    const normal = [{ qty: 2, unit_cost: 100, line_total: 200, itbis_pct: 18 }];
    expect(esFacturaPrecioNeto(normal, { subtotal: 200, total: 236 })).toBe(false);
  });
  it('sin total impreso no se adivina', () => {
    expect(esFacturaPrecioNeto(pedro, { subtotal: 0, total: 0 })).toBe(false);
  });
  it('factura sin ITBIS (total = subtotal): no se marca ITBIS incluido', () => {
    const exenta = [{ qty: 1, unit_cost: 500, line_total: 500, itbis_pct: 0 }];
    expect(esFacturaPrecioNeto(exenta, { subtotal: 500, total: 500 })).toBe(false);
  });
});
