import { describe, it, expect } from 'vitest';
import { correoValido, puedeReenviar, membresiaOk, correoBienvenida, ENLACE_PRUEBA, ENLACE_GRUPO } from '../supabase/functions/_shared/androidTesters.mjs';

describe('Testers Android automáticos', () => {
  it('valida y normaliza el correo', () => {
    expect(correoValido(' Juan_Perez@Gmail.com ')).toBe('juan_perez@gmail.com');
    expect(correoValido('sin-arroba')).toBeNull();
    expect(correoValido('')).toBeNull();
  });
  it('no reenvía antes de 10 minutos', () => {
    const ahora = Date.parse('2026-11-19T12:00:00Z');
    expect(puedeReenviar(null, ahora)).toBe(true);
    expect(puedeReenviar('2026-11-19T11:55:00Z', ahora)).toBe(false);
    expect(puedeReenviar('2026-11-19T11:49:00Z', ahora)).toBe(true);
  });
  it('ya estar en el grupo cuenta como agregado', () => {
    expect(membresiaOk(200, {})).toBe(true);
    expect(membresiaOk(409, {})).toBe(true);
    expect(membresiaOk(400, { error: { status: 'ALREADY_EXISTS' } })).toBe(true);
    expect(membresiaOk(403, { error: { status: 'PERMISSION_DENIED' } })).toBe(false);
  });
  it('el correo lleva el enlace de la prueba y el correo de la persona', () => {
    const c = correoBienvenida('ana@gmail.com');
    expect(c.html).toContain(ENLACE_PRUEBA);
    expect(c.html).toContain(ENLACE_GRUPO);
    expect(c.text.indexOf(ENLACE_GRUPO)).toBeLessThan(c.text.indexOf(ENLACE_PRUEBA));
    expect(c.text).toContain('ana@gmail.com');
    expect(c.subject).toMatch(/Android/);
  });
});
