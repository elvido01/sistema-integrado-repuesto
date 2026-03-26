-- ============================================================
-- MÓDULO: Soporte Múltiples Modelos por Producto
-- Migración completa - pegar en Supabase SQL Editor
-- ============================================================

-- 1. Agregamos la columna de modelos_ids (arreglo de UUIDs)
ALTER TABLE public.productos 
ADD COLUMN IF NOT EXISTS modelos_ids uuid[] DEFAULT '{}'::uuid[];

-- 2. Migramos los datos existentes: si tenía un modelo_id lo ponemos en el arreglo
UPDATE public.productos 
SET modelos_ids = ARRAY[modelo_id] 
WHERE modelo_id IS NOT NULL AND (modelos_ids IS NULL OR array_length(modelos_ids, 1) IS NULL);

-- (Opcional) Podemos dejar modelo_id por compatibilidad temporal o eliminarlo. Dejémoslo por ahora por seguridad.

-- 3. Creamos una función de ayuda para concatenar nombres de modelos basada en un arreglo de IDs
-- Drop first if it exists to easily replace
DROP FUNCTION IF EXISTS public.get_nombres_modelos(uuid[]);

CREATE OR REPLACE FUNCTION public.get_nombres_modelos(p_modelos_ids uuid[])
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  nombres text;
BEGIN
  IF p_modelos_ids IS NULL OR array_length(p_modelos_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT string_agg(m.nombre, ', ' ORDER BY m.nombre)
  INTO nombres
  FROM unnest(p_modelos_ids) AS mid
  JOIN public.modelos m ON m.id = mid;

  RETURN nombres;
END;
$$;


-- 4. Actualizamos la función get_productos_paginados
-- Drop original to avoid return type issues
DROP FUNCTION IF EXISTS public.get_productos_paginados(integer, integer, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer, 
  p_offset integer, 
  p_search_term text, 
  p_marca_filter text, 
  p_modelo_filter text, 
  p_include_zero_stock boolean DEFAULT true
) 
RETURNS TABLE(
  id uuid, 
  codigo text, 
  referencia text, 
  descripcion text, 
  ubicacion text, 
  costo numeric, 
  precio numeric, 
  itbis_pct numeric, 
  marca_nombre text, 
  modelo_nombre text, 
  existencia numeric, 
  presentaciones json, 
  min_stock numeric, 
  total_count bigint
) AS $$
begin
  return query
  with filtered_products as (
    select
      p.id as prod_id,
      p.codigo,
      p.referencia,
      p.descripcion,
      p.ubicacion,
      p.costo,
      p.precio,
      p.itbis_pct,
      ma.nombre as marca_nombre_val,
      -- Usamos la nueva función para obtener todos los nombres separados por coma
      get_nombres_modelos(p.modelos_ids) as modelo_nombre_val,
      p.min_stock,
      p.modelos_ids
    from productos p
    left join marcas ma on ma.id = p.marca_id
    where
      p.activo = true
      and (p_include_zero_stock or get_stock_actual(p.id) > 0)
      and (
        p_search_term is null or p_search_term = '' or
        p.codigo ilike '%'||p_search_term||'%' or
        p.referencia ilike '%'||p_search_term||'%' or
        p.descripcion ilike '%'||p_search_term||'%' or
        p.ubicacion ilike '%'||p_search_term||'%'
      )
      and (p_marca_filter  is null or p_marca_filter  = '' or ma.nombre ilike '%'||p_marca_filter||'%')
      -- Filtro de modelo ajustado: busca el término p_modelo_filter en cualquiera de los nombres de los modelos asociados.
      and (
        p_modelo_filter is null or 
        p_modelo_filter = '' or 
        exists (
          select 1 
          from unnest(p.modelos_ids) AS mid
          join modelos mo on mo.id = mid
          where mo.nombre ilike '%'||p_modelo_filter||'%'
        )
      )
  ),
  counted_products as (
    select fp.*, count(*) over() as total_count
    from filtered_products fp
  )
  select
    cp.prod_id as id,
    cp.codigo,
    cp.referencia,
    cp.descripcion,
    cp.ubicacion,
    cp.costo,
    cp.precio,
    cp.itbis_pct,
    cp.marca_nombre_val as marca_nombre,
    cp.modelo_nombre_val as modelo_nombre,
    get_stock_actual(cp.prod_id) as existencia,
    (
        select json_agg(json_build_object(
            'id', pr.id,
            'tipo', pr.tipo,
            'cantidad', pr.cantidad,
            'costo', pr.costo,
            'precio1', pr.precio1,
            'precio2', pr.precio2,
            'precio3', pr.precio3
        ))
        from presentaciones pr
        where pr.producto_id = cp.prod_id
    ) as presentaciones,
    cp.min_stock,
    cp.total_count
  from counted_products cp
  order by cp.descripcion asc
  limit p_limit offset p_offset;
end;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';
