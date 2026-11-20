import { describe, it, expect } from 'vitest';
import { efectivoDevuelto, fraccionCobrada, montoEntregado } from '@/lib/devolucionEfectivo';

describe('efectivoDevuelto', () => {
  it('sin retención devuelve el total', () => {
    expect(efectivoDevuelto(1180, { total: 1180, retenido_no_cobrado: 0 })).toBe(1180);
    expect(efectivoDevuelto(500, null)).toBe(500);
  });
  it('con retención devuelve la proporción cobrada', () => {
    // factura 11,800 con 1,800 retenido: se cobraron 10,000
    expect(efectivoDevuelto(11800, { total: 11800, retenido_no_cobrado: 1800 })).toBe(10000);
    expect(efectivoDevuelto(5900, { total: 11800, retenido_no_cobrado: 1800 })).toBe(5000);
  });
  it('redondea a centavos y nunca pasa del total', () => {
    expect(efectivoDevuelto(100, { total: 300, retenido_no_cobrado: 100 })).toBe(66.67);
    expect(fraccionCobrada({ total: 100, retenido_no_cobrado: 500 })).toBe(0);
    expect(fraccionCobrada({ total: 0, retenido_no_cobrado: 5 })).toBe(1);
  });
});

describe('montoEntregado', () => {
  it('usa lo guardado al grabar aunque la factura cambie después', () => {
    expect(montoEntregado({ efectivo_devuelto: 10000, total_devolucion: 11800 }, { total: 11800, retenido_no_cobrado: 0 })).toBe(10000);
  });
  it('sin lo guardado (devoluciones viejas) lo calcula', () => {
    expect(montoEntregado({ efectivo_devuelto: null, total_devolucion: 500 }, { total: 500 })).toBe(500);
  });
});
