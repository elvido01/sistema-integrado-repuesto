import { describe, it, expect } from 'vitest';
import { esFacturaPrecioNeto } from '../src/lib/facturaPrecioNeto.js';

// Pedro Racing 05-2109754 (14/11/2026): precio lista − 10% + ITBIS 18% = precio neto; importe = cant × neto.
const fila = (qty, lista) => {
  const neto = Math.round(lista * 0.9 * 1.18 * 100) / 100;
  return { qty, unit_cost: lista, line_total: Math.round(qty * neto * 100) / 100, itbis_pct: 0.18, discount_pct: 0 };
};
const pedro = [fila(6, 179.60), fila(6, 222.68), fila(1, 2476.46)];
const subtotal = pedro.reduce((s, f) => s + f.qty * f.unit_cost, 0);
const total = pedro.reduce((s, f) => s + f.line_total, 0);

describe('factura con precio neto', () => {
  it('los importes suman el total con ITBIS: precio neto', () => {
    expect(esFacturaPrecioNeto(pedro, { subtotal, total })).toBe(true);
  });
  it('los importes suman el subtotal (antes de ITBIS): factura normal', () => {
    const normal = [{ qty: 2, unit_cost: 100, line_total: 200, itbis_pct: 0.18 }];
    expect(esFacturaPrecioNeto(normal, { subtotal: 200, total: 236 })).toBe(false);
  });
  it('sin total o sin subtotal impreso no se adivina', () => {
    expect(esFacturaPrecioNeto(pedro, { subtotal: 0, total })).toBe(false);
    expect(esFacturaPrecioNeto(pedro, { subtotal, total: 0 })).toBe(false);
  });
  it('factura sin ITBIS (total = subtotal): no se marca ITBIS incluido', () => {
    const exenta = [{ qty: 1, unit_cost: 500, line_total: 500, itbis_pct: 0 }];
    expect(esFacturaPrecioNeto(exenta, { subtotal: 500, total: 500 })).toBe(false);
  });
  it('si a una fila le falta el importe, no se decide', () => {
    const conHueco = [...pedro, { qty: 1, unit_cost: 50, line_total: 0, itbis_pct: 0.18 }];
    expect(esFacturaPrecioNeto(conHueco, { subtotal: subtotal + 50, total })).toBe(false);
  });
  it('una devolución (importe negativo) también cuenta en la suma', () => {
    const conDevolucion = [...pedro, { qty: 1, unit_cost: -200, line_total: -200, itbis_pct: 0.18 }];
    expect(esFacturaPrecioNeto(conDevolucion, { subtotal, total: total - 200 })).toBe(true);
  });
});
