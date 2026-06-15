/**
 * Helpers compartidos para repositorios — manejo de errores Supabase
 * de forma consistente (Fase 2.2).
 *
 * Convención: cada repository method retorna `{ data, error }`. Si `error`
 * NO es null, viene normalizado con `{ message, code, status, hint }`.
 * Los componentes/hooks deciden si mostrar toast, throw, o silenciar.
 *
 * Reemplaza el patrón disperso:
 *   const { data, error } = await supabase...
 *   if (error) toast({ variant: 'destructive', title: 'Error', description: error.message });
 *
 * Por:
 *   const { data, error } = await clientesRepository.getActivos();
 *   if (error) toast({ variant: 'destructive', title: error.title, description: error.message });
 */

/**
 * Normaliza un error de Supabase a forma estándar.
 *
 * @param {*} supabaseError - Error que devuelve supabase-js
 * @param {string} fallbackMessage - Texto si el error no trae mensaje
 * @returns {{ message: string, code: string|null, status: number|null, hint: string|null, title: string }}
 */
export const normalizeSupabaseError = (supabaseError, fallbackMessage = 'Ocurrio un error inesperado') => {
  if (!supabaseError) return null;

  // PostgrestError normal
  const message = supabaseError.message || supabaseError.error_description || fallbackMessage;
  const code = supabaseError.code || null;
  const status = supabaseError.status || null;
  const hint = supabaseError.hint || null;

  // Códigos comunes mapeados a títulos amigables
  let title = 'Error';
  if (code === 'PGRST301') title = 'No encontrado';
  else if (code === 'PGRST116') title = 'Sin resultados';
  else if (code === '42501' || message.toLowerCase().includes('permission')) title = 'Permiso denegado';
  else if (code === '23505') title = 'Ya existe';
  else if (code === '23503') title = 'Referencia inválida';
  else if (code === 'insufficient_privilege') title = 'Acceso denegado por tenant';
  else if (status === 401) title = 'No autenticado';
  else if (status === 403) title = 'Sin permisos';

  return { message, code, status, hint, title };
};

/**
 * Envuelve una promesa de supabase-js, retorna `{ data, error }` normalizado.
 *
 * @param {Promise<{ data: any, error: any }>} promise
 * @param {string} fallbackMessage
 * @returns {Promise<{ data: any, error: object|null }>}
 *
 * @example
 *   const { data, error } = await runRepo(
 *     supabase.from('clientes').select('*').eq('id', id).single(),
 *     'No se pudo cargar el cliente'
 *   );
 */
export const runRepo = async (promise, fallbackMessage) => {
  try {
    const { data, error } = await promise;
    if (error) {
      return { data: null, error: normalizeSupabaseError(error, fallbackMessage) };
    }
    return { data, error: null };
  } catch (caughtError) {
    return {
      data: null,
      error: normalizeSupabaseError(caughtError, fallbackMessage),
    };
  }
};

/**
 * Envuelve una RPC, retorna `{ data, error }` normalizado.
 * Idéntico a runRepo pero la firma queda más clara semánticamente.
 *
 * @param {Promise} rpcPromise - resultado de supabase.rpc(...)
 * @param {string} fallbackMessage
 */
export const runRpc = (rpcPromise, fallbackMessage) =>
  runRepo(rpcPromise, fallbackMessage);
