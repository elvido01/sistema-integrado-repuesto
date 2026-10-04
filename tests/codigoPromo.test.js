import { describe, it, expect } from 'vitest';
import { codigoDeRed, fechaCorta, lineaCodigo, textoConCodigo } from '../supabase/functions/_shared/codigoPromo.mjs';

describe('codigo de descuento por promocion', () => {
  it('cada red lleva su letra', () => {
    expect(codigoDeRed('tiktok', 214)).toBe('T214');
    expect(codigoDeRed('Instagram', 214)).toBe('I214');
    expect(codigoDeRed('whatsapp', 101)).toBe('W101');
    expect(codigoDeRed('pinterest', 101)).toBeNull();
    expect(codigoDeRed('tiktok', null)).toBeNull();
  });

  it('la fecha es la de RD, no la de UTC', () => {
    // 10/10 a las 11:59:59 pm en RD es 11/10 03:59:59 en UTC.
    expect(fechaCorta('2026-10-11T03:59:59+00:00')).toBe('10/10');
    expect(fechaCorta('basura')).toBe('');
  });

  it('pega el codigo al final y no lo repite', () => {
    const info = { codigo: 'F101', pct: 5, vence_at: '2026-10-11T03:59:59+00:00' };
    const una = textoConCodigo('Farol stop RD$545', info);
    expect(una).toBe(`Farol stop RD$545\n\n${lineaCodigo(info)}`);
    expect(una).toContain('F101');
    expect(una).toContain('5%');
    expect(una).toContain('10/10');
    expect(textoConCodigo(una, info)).toBe(una);
  });

  it('sin codigo, el texto queda igual', () => {
    expect(textoConCodigo('Hola  ', null)).toBe('Hola');
    expect(textoConCodigo('', { codigo: 'T101', pct: 5 })).toBe(lineaCodigo({ codigo: 'T101', pct: 5 }));
  });
});
