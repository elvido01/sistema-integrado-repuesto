-- ============================================================
-- Fix: resumen real para Inventario Inteligente
-- ============================================================
-- Crea una RPC que devuelve el valor actual de inventario calculado
-- directamente en BD para el tenant autenticado.
--
-- Valor real:
--   SUM(GREATEST(get_stock_actual(producto), 0) * productos.costo)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_inventario_inteligente_resumen()
RETURNS TABLE (
  tenant_id uuid,
  productos_activos bigint,
  productos_con_existencia bigint,
  productos_con_existencia_negativa bigint,
  productos_con_stock_sin_costo bigint,
  valor_real_inventario_actual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH productos_valor AS (
    SELECT
      p.id,
      COALESCE(public.get_stock_actual(p.id), 0)::numeric AS existencia,
      COALESCE(p.costo, 0)::numeric AS costo_maestro,
      ROUND((GREATEST(COALESCE(public.get_stock_actual(p.id), 0), 0) * COALESCE(p.costo, 0))::numeric, 2) AS valor_real
    FROM public.productos p
    WHERE p.tenant_id = v_tenant
      AND COALESCE(p.activo, true) = true
  )
  SELECT
    v_tenant AS tenant_id,
    COUNT(*) AS productos_activos,
    COUNT(*) FILTER (WHERE existencia > 0) AS productos_con_existencia,
    COUNT(*) FILTER (WHERE existencia < 0) AS productos_con_existencia_negativa,
    COUNT(*) FILTER (WHERE existencia > 0 AND costo_maestro <= 0) AS productos_con_stock_sin_costo,
    ROUND(COALESCE(SUM(valor_real), 0)::numeric, 2) AS valor_real_inventario_actual
  FROM productos_valor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventario_inteligente_resumen() TO authenticated;

NOTIFY pgrst, 'reload schema';
