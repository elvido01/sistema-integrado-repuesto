-- ============================================================
-- MIGRACIÓN: Fase 2A — Agregar ecommerce_visible al RPC paginado
-- Fecha: 2026-05-09
-- ============================================================

-- Actualizar get_productos_paginados para incluir ecommerce_visible
DROP FUNCTION IF EXISTS public.get_productos_paginados(integer,integer,text,text,text,boolean);

CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_search_term text DEFAULT NULL::text,
  p_marca_filter text DEFAULT NULL::text,
  p_modelo_filter text DEFAULT NULL::text,
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
  total_count bigint,
  imagen_url text,
  ecommerce_visible boolean
)
LANGUAGE plpgsql
AS $function$
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
      get_nombres_modelos(p.modelos_ids) as modelo_nombre_val,
      p.min_stock,
      p.modelos_ids,
      p.imagen_url,
      COALESCE(p.ecommerce_visible, false) as ecommerce_visible
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
      and (p_marca_filter is null or p_marca_filter = '' or ma.nombre ilike '%'||p_marca_filter||'%')
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
            'precio3', pr.precio3,
            'afecta_ft', pr.afecta_ft,
            'descuento_pct', pr.descuento_pct
        ))
        from presentaciones pr
        where pr.producto_id = cp.prod_id
    ) as presentaciones,
    cp.min_stock,
    cp.total_count,
    cp.imagen_url,
    cp.ecommerce_visible
  from counted_products cp
  order by cp.descripcion asc
  limit p_limit offset p_offset;
end;
$function$;
