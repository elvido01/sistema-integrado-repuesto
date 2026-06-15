/**
 * proveedoresRepository — Acceso centralizado a la tabla `proveedores`.
 *
 * Fase 2.4. Suplidores en la BD se llaman `proveedores`. El frontend usa
 * indistintamente "suplidor" y "proveedor" — aquí mantenemos el nombre BD.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo } from '../shared/errorHandler';

const TABLE = 'proveedores';

const SELECT_LIGHT = 'id, codigo, nombre, rnc, telefono, activo, local_suplidor_sugerido';
const SELECT_FULL = '*';

export const getActivos = ({ limit = 100, orderBy = 'nombre' } = {}) =>
  runRepo(
    supabase
      .from(TABLE)
      .select(SELECT_LIGHT)
      .eq('activo', true)
      .order(orderBy, { ascending: true })
      .limit(limit),
    'No se pudieron cargar los suplidores',
  );

export const getById = (id) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_FULL).eq('id', id).maybeSingle(),
    `No se pudo cargar el suplidor ${id}`,
  );

export const getByCodigo = (codigo) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_FULL).ilike('codigo', codigo).maybeSingle(),
    `No se encontro suplidor con codigo ${codigo}`,
  );

export const search = (term, { limit = 25, offset = 0 } = {}) => {
  const pattern = `%${term}%`;
  return runRepo(
    supabase
      .from(TABLE)
      .select(SELECT_LIGHT)
      .or(`codigo.ilike.${pattern},nombre.ilike.${pattern},rnc.ilike.${pattern}`)
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .range(offset, offset + limit - 1),
    'No se pudo buscar suplidores',
  );
};

export const create = (payload) =>
  runRepo(
    supabase.from(TABLE).insert(payload).select().single(),
    'No se pudo crear el suplidor',
  );

export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar el suplidor ${id}`,
  );

export const deactivate = (id) =>
  runRepo(
    supabase.from(TABLE).update({ activo: false }).eq('id', id).select().single(),
    `No se pudo desactivar el suplidor ${id}`,
  );

export default {
  getActivos,
  getById,
  getByCodigo,
  search,
  create,
  update,
  deactivate,
};
