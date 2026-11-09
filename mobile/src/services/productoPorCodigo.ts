import { supabase } from '@/src/supabase/client';

// (09/11/2026) Un producto por código escaneado o tecleado: primero el
// CÓDIGO exacto y, si no hay, la REFERENCIA. Antes iba en un solo .or() con
// limit(1): si el código de una pieza era la referencia de otra, salía
// cualquiera de las dos; y un código con coma o paréntesis rompía la búsqueda.
export async function productoPorCodigo<T = any>(codigo: string, columnas: string): Promise<T | null> {
  const c = codigo.trim();
  if (!c) return null;
  for (const campo of ['codigo', 'referencia']) {
    const { data, error } = await supabase.from('productos').select(columnas)
      .eq(campo, c).order('activo', { ascending: false }).order('id').limit(1);
    if (error) throw error;
    if (data && data.length) return data[0] as T;
  }
  return null;
}
