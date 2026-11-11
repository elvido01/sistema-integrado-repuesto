import { describe, it, expect } from 'vitest';
import { docFiscalValido, tipoExigeRnc, problemaDocFiscal, formatoDocDgii } from '@/lib/docFiscal';

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

describe('formatoDocDgii', () => {
  it('RNC y cédula como la DGII', () => {
    expect(formatoDocDgii('130558361')).toBe('130-55836-1');
    expect(formatoDocDgii('1-3055836-1')).toBe('130-55836-1');
    expect(formatoDocDgii('02800155562')).toBe('028-0015556-2');
  });
  it('lo demás tal cual', () => {
    expect(formatoDocDgii('AB123456')).toBe('AB123456');
    expect(formatoDocDgii('')).toBe('');
    expect(formatoDocDgii(null)).toBe('');
  });
});
