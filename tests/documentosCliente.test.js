import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase simulado: guarda qué se subió, qué se quitó y qué responde la tabla.
const estado = { subidos: [], quitados: [], upsert: { data: [{ id: 'r1' }], error: null }, del: { data: [{ id: 'r1' }], error: null } };
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path) => { estado.subidos.push(path); return { error: null }; },
        remove: async (paths) => { estado.quitados.push(...paths); return { error: null }; },
      }),
    },
    from: () => ({
      upsert: () => ({ select: async () => estado.upsert }),
      delete: () => ({ eq: () => ({ select: async () => estado.del }) }),
    }),
  },
}));

const { guardarDocumentacion, borrarDocumentacion, camposDocumentacion, DOC_FIELDS, TODOS_DOC_FIELDS } = await import('@/lib/documentosCliente');

const archivo = (n) => ({ name: `${n}.jpg`, type: 'image/jpeg' });
const anterior = { id: 'r1', placa_path: 't/r1/placa-viejo.jpg', seguro_path: 't/r1/seguro-viejo.jpg' };

beforeEach(() => {
  estado.subidos = []; estado.quitados = [];
  estado.upsert = { data: [{ id: 'r1' }], error: null };
  estado.del = { data: [{ id: 'r1' }], error: null };
});

describe('guardarDocumentacion', () => {
  it('si se graba, borra SOLO la imagen reemplazada (no las demás)', async () => {
    await guardarDocumentacion({ tenantId: 't', recordId: 'r1', files: { placa_path: archivo('p') }, anterior, payload: {} });
    expect(estado.subidos).toHaveLength(1);
    expect(estado.quitados).toEqual(['t/r1/placa-viejo.jpg']);
  });

  it('si el registro NO se graba, la imagen vieja queda y se quita la nueva', async () => {
    estado.upsert = { data: null, error: { message: 'columna no existe' } };
    await expect(guardarDocumentacion({ tenantId: 't', recordId: 'r1', files: { placa_path: archivo('p') }, anterior, payload: {} }))
      .rejects.toBeTruthy();
    expect(estado.quitados).not.toContain('t/r1/placa-viejo.jpg');
    expect(estado.quitados).toEqual(estado.subidos);
  });

  it('si el registro no se pudo editar (0 filas), tampoco borra la vieja', async () => {
    estado.upsert = { data: [], error: null };
    await expect(guardarDocumentacion({ tenantId: 't', recordId: 'r1', files: { seguro_path: archivo('s') }, anterior, payload: {} }))
      .rejects.toThrow(/No se guardó/);
    expect(estado.quitados).not.toContain('t/r1/seguro-viejo.jpg');
  });
});

describe('borrarDocumentacion', () => {
  it('borra las imágenes solo después de borrar el registro', async () => {
    await borrarDocumentacion(anterior);
    expect(estado.quitados.sort()).toEqual(['t/r1/placa-viejo.jpg', 't/r1/seguro-viejo.jpg']);
  });
  it('si el registro no se borró (otra empresa), las imágenes quedan', async () => {
    estado.del = { data: [], error: null };
    await expect(borrarDocumentacion(anterior)).rejects.toThrow(/otra empresa/);
    expect(estado.quitados).toEqual([]);
  });
});

describe('camposDocumentacion', () => {
  it('financiera ve Registro DGII; otro tipo no (salvo que el registro ya lo tenga)', () => {
    expect(camposDocumentacion('financiera', null)).toBe(TODOS_DOC_FIELDS);
    expect(camposDocumentacion('repuestos', null)).toBe(DOC_FIELDS);
    expect(camposDocumentacion('repuestos', { registro_dgii_path: 'x' })).toBe(TODOS_DOC_FIELDS);
  });
});
