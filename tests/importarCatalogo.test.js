import { describe, it, expect } from 'vitest';
import { aNumero } from '@/components/products/ImportarCatalogoModal';

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
