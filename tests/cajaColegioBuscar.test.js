import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
const { palabrasDeBusqueda, patronSinTildes } = await import('@/pages/colegio/CajaColegioPage.jsx');

describe('buscador de la caja del colegio', () => {
  it('palabras sueltas, sin tildes ni puntuación', () => {
    expect(palabrasDeBusqueda('ANA BATIS')).toEqual(['ana', 'batis']);
    expect(palabrasDeBusqueda('BATISTA, ANA')).toEqual(['batista', 'ana']);
    expect(palabrasDeBusqueda('Ma. José Peña')).toEqual(['ma', 'jose', 'pena']);
    expect(palabrasDeBusqueda(' , . ')).toEqual([]);
  });

  it('patrón para la base: vocales y ñ con o sin tilde', () => {
    expect(patronSinTildes('pena')).toBe('p[eéè][nñ][aáà]');
    const re = new RegExp(patronSinTildes('perez'), 'i');
    expect(re.test('PÉREZ')).toBe(true);
    expect(re.test('PEREZ')).toBe(true);
    expect(new RegExp(patronSinTildes('pena'), 'i').test('PEÑA')).toBe(true);
    expect(new RegExp(patronSinTildes('ana'), 'i').test('ENMANUEL')).toBe(false);
  });
});
