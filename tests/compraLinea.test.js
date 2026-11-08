import { describe, it, expect } from 'vitest';
import { importeLineaCompra } from '../src/lib/compraLinea.js';

describe('total de la línea de compra', () => {
  it('ITBIS incluido: el costo ya lo trae (OC-0393: 12 × 359.78 = 4,317.36, no 5,094.48)', () => {
    expect(importeLineaCompra({ cantidad: 12, costo_unitario: 359.78, itbis_pct: 0.18, importe: 5094.48 }, true)).toBe(4317.36);
  });
  it('ITBIS aparte: base + ITBIS truncado', () => {
    expect(importeLineaCompra({ cantidad: 3, costo_unitario: 33.33, itbis_pct: 0.18 }, false)).toBe(117.98); // 99.99 + 17.99
  });
  it('descuento y exento', () => {
    expect(importeLineaCompra({ cantidad: 2, costo_unitario: 100, descuento_pct: 10, itbis_pct: 0.18 }, false)).toBe(212.4);
    expect(importeLineaCompra({ cantidad: 2, costo_unitario: 100, itbis_pct: 0 }, false)).toBe(200);
  });
});
