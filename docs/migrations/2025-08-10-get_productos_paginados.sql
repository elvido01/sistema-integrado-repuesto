-- Crea función: public.get_productos_paginados
-- Firma exacta requerida:
-- (p_limit int, p_marca_filter uuid NULL, p_modelo_filter uuid NULL, p_offset int default 0, p_search_term text NULL)
-- Devuelve columnas usadas por Mercancías

CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit int,
  p_marca_filter uuid DEFAULT NULL,
  p_modelo_filter uuid DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_search_term text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  codigo text,
  referencia text,
  descripcion text,
  precio numeric,
  ubicacion text,
  marca_nombre text,
  modelo_nombre text,
  existencia numeric,
  estado boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      pr.id,
      pr.codigo,
      pr.referencia,
      pr.descripcion,
      pr.precio,
      pr.ubicacion,
      m.nombre  AS marca_nombre,
      mo.nombre AS modelo_nombre,
      COALESCE(pr.existencia, 0) AS existencia,
      pr.activo AS estado
    FROM productos pr
    LEFT JOIN marcas  m  ON m.id  = pr.marca_id
    LEFT JOIN modelos mo ON mo.id = pr.modelo_id
    WHERE (p_marca_filter  IS NULL OR pr.marca_id  = p_marca_filter)
      AND (p_modelo_filter IS NULL OR pr.modelo_id = p_modelo_filter)
      AND (
        p_search_term IS NULL
        OR pr.codigo      ILIKE '%' || p_search_term || '%'
        OR pr.referencia  ILIKE '%' || p_search_term || '%'
        OR pr.descripcion ILIKE '%' || p_search_term || '%'
        OR pr.ubicacion   ILIKE '%' || p_search_term || '%'
        OR m.nombre       ILIKE '%' || p_search_term || '%'
        OR mo.nombre      ILIKE '%' || p_search_term || '%'
      )
  ), counted AS (
    SELECT b.*, COUNT(*) OVER() AS total_count FROM base b
  )
  SELECT *
  FROM counted
  ORDER BY descripcion
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.get_productos_paginados(int, uuid, uuid, int, text) TO authenticated, anon;

-- Notas:
-- - Si tu esquema no tiene productos.existencia, ajusta el cálculo de existencia
--   a la vista/tabla correspondiente (por ejemplo, una vista de stock actual).
-- - Tras crear o actualizar la función, puedes refrescar la caché del esquema de PostgREST con:
--     NOTIFY pgrst, 'reload schema';
--   o usar el botón “Reset API cache” en Supabase Studio.
