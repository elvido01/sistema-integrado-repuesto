import { describe, it, expect } from 'vitest';
import { docFiscalValido, tipoExigeRnc, problemaDocFiscal } from '@/lib/docFiscal';

describe('docFiscal', () => {
  it('RNC de 9 y cédula de 11 son válidos', () => {
    expect(docFiscalValido('1-31-12345-6')).toBe(true);
    expect(docFiscalValido('028-0015556-2')).toBe(true);
  });
  it('10 dígitos (cédula con uno de menos) no es válido', () => {
    expect(docFiscalValido('028-001556-2')).toBe(false);
    expect(docFiscalValido('000000000')).toBe(false);
    expect(docFiscalValido('')).toBe(false);
  });
  it('crédito fiscal exige RNC; consumo no', () => {
    expect(tipoExigeRnc('01')).toBe(true);
    expect(tipoExigeRnc('E31')).toBe(true);
    expect(tipoExigeRnc('02')).toBe(false);
    expect(problemaDocFiscal('028-001556-2', '02')).toBeNull();
    expect(problemaDocFiscal('028-001556-2', '01')).toMatch(/10 dígitos/);
    expect(problemaDocFiscal('', '01')).toMatch(/hace falta/);
    expect(problemaDocFiscal('000000000', '01')).toMatch(/ceros/);
    expect(problemaDocFiscal('028-0015556-2', '01')).toBeNull();
  });
});
