import { supabase } from '@/src/supabase/client';

// (09/11/2026) Un producto por código escaneado o tecleado.
// Orden: CÓDIGO de un producto activo → REFERENCIA de un activo → cualquiera
// (inactivo). Un inactivo fusionado (reemplazado_por) se cambia por el que lo
// absorbió, para no ajustar existencia en una pieza muerta. Sin importar
// mayúsculas (como la web). Antes iba en un solo .or() con limit(1): salía
// cualquiera de las dos piezas y una coma en el código rompía la búsqueda.
const exacto = (v: string) => v.replace(/[\%_]/g, (c) => `\${c}`);   // ilike sin comodines

export async function productoPorCodigo<T extends { id: string }>(codigo: string, columnas: string): Promise<T | null> {
  const c = codigo.trim();
  if (!c) return null;
  const cols = columnas.includes('reemplazado_por') ? columnas : `${columnas}, reemplazado_por`;
  const buscar = async (campo: string, soloActivos: boolean) => {
    let q = supabase.from('productos').select(cols).ilike(campo, exacto(c));
    if (soloActivos) q = q.eq('activo', true);
    const { data, error } = await q.order('activo', { ascending: false, nullsFirst: false }).order('id').limit(1);
    if (error) throw error;
    return (data && data[0]) as any;
  };
  let p = (await buscar('codigo', true)) || (await buscar('referencia', true))
    || (await buscar('codigo', false)) || (await buscar('referencia', false));
  for (let i = 0; p && p.reemplazado_por && i < 3; i++) {
    const { data, error } = await supabase.from('productos').select(cols).eq('id', p.reemplazado_por).limit(1);
    if (error) throw error;
    if (!data || !data[0]) break;
    p = data[0];
  }
  return (p || null) as T | null;
}
