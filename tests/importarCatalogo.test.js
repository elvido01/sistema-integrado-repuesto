import { describe, it, expect } from 'vitest';
import { aNumero, aFecha } from '@/components/products/ImportarCatalogoModal';

describe('aNumero (importar catálogo)', () => {
  it('lee montos como vienen de Excel o de un CSV', () => {
    expect(aNumero(1250.5)).toBe(1250.5);
    expect(aNumero('1250.50')).toBe(1250.5);
    expect(aNumero('RD$ 1,250.50')).toBe(1250.5);
    expect(aNumero('1.250,50')).toBe(1250.5);   // coma decimal
    expect(aNumero('18')).toBe(18);
    expect(aNumero('$250')).toBe(250);
  });
  it('celda vacía o texto = sin dato (no cero)', () => {
    expect(aNumero('')).toBeNull();
    expect(aNumero(null)).toBeNull();
    expect(aNumero('N/A')).toBeNull();
  });
});

describe('aFecha (saldos iniciales)', () => {
  it('número de serie de Excel', () => {
    expect(aFecha(46280)).toBe('2026-09-15');
  });
  it('texto ISO y día/mes/año', () => {
    expect(aFecha('2026-09-15')).toBe('2026-09-15');
    expect(aFecha('15/09/2026')).toBe('2026-09-15');
    expect(aFecha('5/9/26')).toBe('2026-09-05');
  });
  it('vacío o basura → null', () => {
    expect(aFecha('')).toBeNull();
    expect(aFecha(null)).toBeNull();
    expect(aFecha('ayer')).toBeNull();
  });
});
