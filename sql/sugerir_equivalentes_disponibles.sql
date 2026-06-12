-- ============================================================
-- sugerir_equivalentes_disponibles: Fase 4 (sugerencia al vender)
-- ============================================================
-- Dado un producto_id, si pertenece a un grupo de equivalentes,
-- retorna los OTROS miembros del grupo que tienen stock disponible.
--
-- Ordenamiento:
--   1. Preferido (⭐) primero si tiene stock
--   2. Luego por mayor stock
--   3. Luego por mayor margen %
--
-- Caso de uso:
--   El cajero intenta vender "BATERIA Y-7443" pero esta en 0.
--   El sistema sugiere "BATERIA HOSUYA YTX5A-BS" que es el ⭐
--   del grupo y tiene 8 unidades en stock.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sugerir_equivalentes_disponibles(
  p_producto_id UUID
)
RETURNS TABLE(
  id            UUID,
  codigo        TEXT,
  descripcion   TEXT,
  existencia    NUMERIC,
  precio        NUMERIC,
  costo         NUMERIC,
  itbis_pct     NUMERIC,
  es_preferido  BOOLEAN,
  margen_pct    NUMERIC,
  grupo_nombre  TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_grupo_id   UUID;
  v_tenant_id  UUID;
BEGIN
  v_tenant_id := public.get_user_tenant();

  -- Encontrar el grupo del producto
  SELECT m.grupo_id INTO v_grupo_id
  FROM public.producto_grupo_miembros m
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.producto_id = p_producto_id
    AND g.tenant_id = v_tenant_id
  LIMIT 1;

  IF v_grupo_id IS NULL THEN
    RETURN;  -- No esta en grupo, no hay sugerencias
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    public.get_stock_actual(p.id) AS existencia,
    COALESCE(p.precio, 0) AS precio,
    COALESCE(p.costo, 0) AS costo,
    COALESCE(p.itbis_pct, 0.18) AS itbis_pct,
    (m.prioridad = 1) AS es_preferido,
    CASE
      WHEN COALESCE(p.precio, 0) > 0 AND COALESCE(p.costo, 0) > 0 AND p.precio > p.costo
      THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 2)
      ELSE 0
    END AS margen_pct,
    g.nombre AS grupo_nombre
  FROM public.producto_grupo_miembros m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.grupo_id = v_grupo_id
    AND m.producto_id <> p_producto_id              -- Excluir el producto original
    AND public.get_stock_actual(p.id) > 0           -- Solo con stock
  ORDER BY
    (m.prioridad = 1) DESC,                         -- Preferido primero
    public.get_stock_actual(p.id) DESC,             -- Luego mayor stock
    CASE
      WHEN COALESCE(p.precio, 0) > 0 AND COALESCE(p.costo, 0) > 0 AND p.precio > p.costo
      THEN ((p.precio - p.costo) / p.precio)
      ELSE 0
    END DESC;                                       -- Luego mayor margen
END;
$$;

GRANT EXECUTE ON FUNCTION public.sugerir_equivalentes_disponibles(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'sugerir_equivalentes_disponibles listo' AS status;
