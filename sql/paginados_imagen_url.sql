-- ============================================================
-- get_productos_paginados + imagen_url (fix foto en la app móvil)
-- ============================================================
-- BUG: la app móvil mapea p.imagen_url del resultado de esta RPC,
-- pero la RPC nunca devolvió esa columna → el modal del producto
-- salía siempre "sin foto" aunque el producto tuviera imagen.
-- FIX: se agrega imagen_url al RETURNS TABLE (los demás campos y la
-- lógica quedan EXACTAMENTE como optimizar_productos_paginados_stock.sql,
-- que queda supersedido). Agregar columna requiere DROP + CREATE.
-- La web no se afecta (lee campos por nombre). La app móvil queda
-- arreglada SIN actualizarla. Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_productos_paginados(integer, integer, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer,
  p_offset integer,
  p_search_term text,
  p_marca_filter text,
  p_modelo_filter text,
  p_include_zero_stock boolean DEFAULT true,
  p_tipo_filter text DEFAULT NULL
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
  tipo_nombre text,
  existencia numeric,
  presentaciones json,
  min_stock numeric,
  imagen_url text,
  total_count bigint
) AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH stock AS (
    -- Una sola pasada: stock de TODOS los productos del tenant
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM inventario_movimientos im
    WHERE im.tenant_id = v_tenant
    GROUP BY im.producto_id
  ),
  filtered_products AS (
    SELECT
      p.id AS prod_id,
      p.codigo,
      p.referencia,
      p.descripcion,
      p.ubicacion,
      p.costo,
      p.precio,
      p.itbis_pct,
      ma.nombre AS marca_nombre_val,
      get_nombres_modelos(p.modelos_ids) AS modelo_nombre_val,
      tp.nombre AS tipo_nombre_val,
      p.min_stock,
      p.imagen_url AS imagen_url_val,
      p.modelos_ids,
      COALESCE(s.stk, 0) AS existencia_val
    FROM productos p
    LEFT JOIN stock s ON s.producto_id = p.id
    LEFT JOIN marcas ma ON ma.id = p.marca_id
    LEFT JOIN tipos_producto tp ON tp.id = p.tipo_id
    WHERE
      p.tenant_id = v_tenant
      AND p.activo = true
      AND (p_include_zero_stock OR COALESCE(s.stk, 0) > 0)
      AND (
        p_search_term IS NULL OR p_search_term = '' OR
        p.codigo      ILIKE '%'||p_search_term||'%' OR
        p.referencia  ILIKE '%'||p_search_term||'%' OR
        p.descripcion ILIKE '%'||p_search_term||'%' OR
        p.ubicacion   ILIKE '%'||p_search_term||'%'
      )
      AND (p_marca_filter IS NULL OR p_marca_filter = '' OR ma.nombre ILIKE '%'||p_marca_filter||'%')
      AND (p_tipo_filter  IS NULL OR p_tipo_filter  = '' OR tp.nombre ILIKE '%'||p_tipo_filter||'%')
      AND (
        p_modelo_filter IS NULL OR p_modelo_filter = '' OR
        EXISTS (
          SELECT 1
          FROM unnest(p.modelos_ids) AS mid
          JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%'||p_modelo_filter||'%'
        )
      )
  ),
  counted_products AS (
    SELECT fp.*, COUNT(*) OVER() AS total_count
    FROM filtered_products fp
  )
  SELECT
    cp.prod_id AS id,
    cp.codigo,
    cp.referencia,
    cp.descripcion,
    cp.ubicacion,
    cp.costo,
    cp.precio,
    cp.itbis_pct,
    cp.marca_nombre_val AS marca_nombre,
    cp.modelo_nombre_val AS modelo_nombre,
    cp.tipo_nombre_val AS tipo_nombre,
    cp.existencia_val AS existencia,
    (
      SELECT json_agg(json_build_object(
          'id', pr.id,
          'tipo', pr.tipo,
          'cantidad', pr.cantidad,
          'costo', pr.costo,
          'precio1', pr.precio1,
          'precio2', pr.precio2,
          'precio3', pr.precio3
      ))
      FROM presentaciones pr
      WHERE pr.producto_id = cp.prod_id
    ) AS presentaciones,
    cp.min_stock,
    cp.imagen_url_val AS imagen_url,
    cp.total_count
  FROM counted_products cp
  ORDER BY cp.descripcion ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.get_productos_paginados(integer, integer, text, text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_productos_paginados(integer, integer, text, text, text, boolean, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_productos_paginados(integer, integer, text, text, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('paginados_imagen_url.sql');
  END IF;
END $$;

SELECT 'get_productos_paginados ahora devuelve imagen_url (foto visible en la app móvil)' AS status;
