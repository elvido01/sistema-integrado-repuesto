import { describe, it, expect, vi } from 'vitest';

import {
  normalizeSupabaseError,
  runRepo,
  runRpc,
} from '../src/repositories/shared/errorHandler.js';

describe('normalizeSupabaseError', () => {
  it('null/undefined retornan null', () => {
    expect(normalizeSupabaseError(null)).toBeNull();
    expect(normalizeSupabaseError(undefined)).toBeNull();
  });

  it('codigo PGRST301 → No encontrado', () => {
    const err = normalizeSupabaseError({ code: 'PGRST301', message: 'no row' });
    expect(err.title).toBe('No encontrado');
    expect(err.message).toBe('no row');
  });

  it('insufficient_privilege → Acceso denegado por tenant', () => {
    const err = normalizeSupabaseError({
      code: 'insufficient_privilege',
      message: 'p_tenant_id no coincide',
    });
    expect(err.title).toBe('Acceso denegado por tenant');
  });

  it('status 401 → No autenticado', () => {
    const err = normalizeSupabaseError({ status: 401, message: 'JWT expired' });
    expect(err.title).toBe('No autenticado');
  });

  it('codigo 23505 (unique violation) → Ya existe', () => {
    const err = normalizeSupabaseError({ code: '23505', message: 'duplicate' });
    expect(err.title).toBe('Ya existe');
  });

  it('fallback message si error no trae mensaje', () => {
    const err = normalizeSupabaseError({}, 'default');
    expect(err.message).toBe('default');
  });
});

describe('runRepo', () => {
  it('promise exitosa retorna { data, error: null }', async () => {
    const promise = Promise.resolve({ data: { foo: 1 }, error: null });
    const result = await runRepo(promise, 'fail');
    expect(result).toEqual({ data: { foo: 1 }, error: null });
  });

  it('promise con error retorna error normalizado', async () => {
    const promise = Promise.resolve({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    const result = await runRepo(promise, 'fail');
    expect(result.data).toBeNull();
    expect(result.error.title).toBe('Permiso denegado');
    expect(result.error.message).toBe('permission denied');
  });

  it('promise que throwea es capturada', async () => {
    const promise = Promise.reject(new Error('boom'));
    const result = await runRepo(promise, 'fallback');
    expect(result.data).toBeNull();
    expect(result.error.message).toBe('boom');
  });
});

describe('secuenciasRepository.getNext', () => {
  it('tipo invalido retorna error sin tocar supabase', async () => {
    // Importamos el módulo dinámicamente para evitar inicializar supabase
    // (que requiere VITE_SUPABASE_URL en el entorno de test).
    const { getNext } = await import('../src/repositories/shared/secuenciasRepository.js');
    const result = await getNext('tipoInexistente');
    expect(result.data).toBeNull();
    expect(result.error.code).toBe('invalid_param');
    expect(result.error.title).toBe('Tipo invalido');
  });
});
