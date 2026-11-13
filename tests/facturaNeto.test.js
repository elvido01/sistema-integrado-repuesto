import { describe, it, expect } from 'vitest';
import { precioDesdeNeto } from '../src/lib/facturaNeto.js';
import { propinaLegal } from '../src/lib/propinaLegal.js';

// AMSTAR → Oscar Aristy: persona física, servicio técnico (ISR 3 %), le retienen
// el 100 % del ITBIS, propina legal 10 %. Paga RD$ 600.
const amstar = { itbis: 0.18, retItbis: 1, isr: 0.03, propina: true };

describe('factura desde lo que paga el cliente', () => {
  it('600 de AMSTAR → precio 661.68 con ITBIS (base 560.75), paga 600.01', () => {
    const r = precioDesdeNeto(600, amstar);
    expect(r).toEqual({ precio: 661.68, base: 560.75, neto: 600.01 });
    // La propina de la venta (y del e-CF) sobre esa línea: 56.08.
    expect(propinaLegal([{ cantidad: 1, precio: r.precio, descuento: 0, itbis_pct: 0.18 }])).toBe(56.08);
  });
  it('la factura de papel cuadra con la misma cuenta: 608.25 con ITBIS sin propina legal da 500.01', () => {
    expect(netoFactura([{ precio: 608.25, itbis: 0.18, retItbis: 1, isr: 0.03 }], { propina: false })).toBe(500.01);
  });
  it('sin retenciones ni propina: el neto es el precio con ITBIS', () => {
    expect(precioDesdeNeto(1180, { itbis: 0.18, retItbis: 0, isr: 0, propina: false })).toEqual({ precio: 1180, base: 1000, neto: 1180 });
  });
  it('siempre queda a 2 centavos o menos del neto pedido', () => {
    for (const n of [100, 250, 600, 999.99, 1500, 35000]) {
      expect(Math.abs(precioDesdeNeto(n, amstar).neto - n)).toBeLessThanOrEqual(0.02);
    }
  });
});

import { precioLineaDesdeNeto, netoFactura } from '../src/lib/facturaNeto.js';

describe('varias líneas: la propina y las retenciones son de toda la factura', () => {
  it('600 + 600 + 350 en tres líneas da una factura de 1550 (± 2 centavos), sin cobrar de menos en empate', () => {
    const tasa = { itbis: 0.18, retItbis: 1, isr: 0.03 };
    const lineas = [{ ...tasa, precio: 0 }, { ...tasa, precio: 0 }, { ...tasa, precio: 0 }];
    let acumulado = 0;
    [600, 600, 350].forEach((neto, i) => {
      const r = precioLineaDesdeNeto(lineas, i, neto, { propina: true });
      lineas[i] = { ...lineas[i], precio: r.precio };
      acumulado += neto;
      expect(Math.abs(netoFactura(lineas, { propina: true }) - acumulado)).toBeLessThanOrEqual(0.02);
    });
  });
});
