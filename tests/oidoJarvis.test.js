// Con qué texto se queda Jarvis cuando oye por dos vías.
//
// (2026-08-17) El dictado del navegador sigue corriendo en paralelo al
// servidor. Estas pruebas cuidan la regla que decide entre los dos — y
// sobre todo, que un fallo del oído nuevo NUNCA deje mudo el modo voz.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const { elegirTexto, transcribir } = await import('../src/lib/oidoJarvis.js');

describe('elegirTexto — el servidor gana, pero no a ciegas', () => {
  it('con las dos versiones, se queda con la del servidor', () => {
    // Es la que tuvo el glosario delante.
    const r = elegirTexto('autorízalo', 'autoriza lo');
    expect(r).toEqual({ texto: 'autorízalo', de: 'servidor' });
  });

  it('si el servidor no trajo nada, vale lo del navegador', () => {
    const r = elegirTexto('', 'busca la cotización de Sander');
    expect(r).toEqual({ texto: 'busca la cotización de Sander', de: 'navegador' });
    expect(elegirTexto(null, 'hola').de).toBe('navegador');
  });

  it('si el navegador no oyó nada, vale lo del servidor', () => {
    expect(elegirTexto('factúrala', '')).toEqual({ texto: 'factúrala', de: 'servidor' });
  });

  it('un servidor sospechosamente corto pierde', () => {
    // Micrófono tapado o audio cortado: es más probable eso que el usuario
    // diciendo una sílaba después de una frase larga. Ante la duda, lo que
    // más información tiene.
    const largo = 'búscame un caliper trasero para la Pruss 200 por favor';
    expect(elegirTexto('eh', largo)).toEqual({ texto: largo, de: 'navegador' });
  });

  it('con los dos vacíos no revienta', () => {
    expect(elegirTexto('', '')).toEqual({ texto: '', de: 'navegador' });
    expect(elegirTexto(null, null)).toEqual({ texto: '', de: 'navegador' });
  });
});

describe('transcribir — fallar es una opción, romper no', () => {
  it('sin audio devuelve null y no llama a nadie', async () => {
    await expect(transcribir(null, 'glosario')).resolves.toBeNull();
    await expect(transcribir({ blob: { size: 0 } }, '')).resolves.toBeNull();
  });

  it('si el servidor responde error, devuelve null en vez de lanzar', async () => {
    // Quien llama sigue con el dictado del navegador. Si esto lanzara,
    // tumbaría el modo voz entero por un fallo de red.
    const { supabase } = await import('@/lib/customSupabaseClient');
    supabase.functions.invoke.mockResolvedValueOnce({ data: { ok: false, error: 'x' }, error: null });
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await expect(transcribir({ blob, mime: 'audio/webm', duracionMs: 2000 }, '')).resolves.toBeNull();
  });

  it('si invoke lanza, tampoco propaga', async () => {
    const { supabase } = await import('@/lib/customSupabaseClient');
    supabase.functions.invoke.mockRejectedValueOnce(new Error('sin red'));
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await expect(transcribir({ blob, mime: 'audio/webm', duracionMs: 2000 }, '')).resolves.toBeNull();
  });
});
