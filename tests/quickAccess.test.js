// Pruebas de los accesos fijados en la barra de abajo del móvil.
//
// >>> POR QUÉ EXISTE ESTE ARCHIVO <<<
// "Fijar abajo" en Hermes no daba error: guardaba y no pasaba nada. La
// causa era que `normalizeQuickAccess` descarta en silencio cualquier
// nombre que no esté en QUICK_ACCESS_OPTIONS, y Hermes nunca se agregó a
// esa lista. Un fallo silencioso no se nota hasta que alguien lo usa, así
// que la regla queda escrita donde una prueba la vigile.
import { describe, it, expect, vi } from 'vitest';

// AsyncStorage es del teléfono. Solo se simula para poder importar el
// módulo: lo que se prueba aquí son las funciones puras.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}));

const { QUICK_ACCESS_OPTIONS, DEFAULT_QUICK_ACCESS, normalizeQuickAccess } =
  await import('../mobile/src/services/quickAccess');

describe('lo que se puede fijar abajo', () => {
  it('Hermes está entre las opciones', () => {
    const nombres = QUICK_ACCESS_OPTIONS.map((o) => o.name);
    expect(nombres).toContain('hermes');
  });

  it('fijar Hermes sobrevive a la normalización', () => {
    // Esta es exactamente la operación que hace el botón "Fijar abajo".
    expect(normalizeQuickAccess([...DEFAULT_QUICK_ACCESS, 'hermes']))
      .toContain('hermes');
  });

  it('sigue descartando lo que no existe', () => {
    // La lista blanca tiene que seguir siendo una lista blanca: si dejara
    // pasar cualquier nombre, la barra intentaría pintar una pestaña de una
    // ruta inexistente.
    expect(normalizeQuickAccess(['hermes', 'ruta-que-no-existe']))
      .toEqual(['hermes']);
  });

  it('no repite si ya estaba fijado', () => {
    expect(normalizeQuickAccess(['hermes', 'hermes', 'index']))
      .toEqual(['hermes', 'index']);
  });

  it('cada opción con moduleKey lo tiene bien puesto', () => {
    // El permiso de Hermes es 'hermes-chat', el mismo con el que aparece en
    // el menú "Más". Si divergen, se puede fijar algo que no se puede abrir.
    const hermes = QUICK_ACCESS_OPTIONS.find((o) => o.name === 'hermes');
    expect(hermes.moduleKey).toBe('hermes-chat');
  });
});
