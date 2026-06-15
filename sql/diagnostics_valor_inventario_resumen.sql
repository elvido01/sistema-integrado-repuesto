-- ============================================================
-- Diagnostico corto: resumen del valor real de inventario
-- ============================================================
-- READ ONLY. Solo SELECT.
--
-- Valor real:
--   SUM(GREATEST(get_stock_actual(producto), 0) * productos.costo)
--
-- Si tienes mas de un tenant, reemplaza NULL::uuid por el tenant_id
-- exacto en parametros.p_tenant_id.
-- ============================================================

WITH parametros AS (
  SELECT
    NULL::uuid AS p_tenant_id
),
tenant_objetivo AS (
  SELECT COALESCE(
    (SELECT p_tenant_id FROM parametros WHERE p_tenant_id IS NOT NULL),
    (SELECT public.get_user_tenant()),
    (
      SELECT ce.tenant_id
      FROM public.config_empresa ce
      WHERE ce.tenant_id IS NOT NULL
      ORDER BY
        CASE WHEN COALESCE(ce.nombre, '') ILIKE '%morla%' THEN 0 ELSE 1 END,
        ce.nombre NULLS LAST
      LIMIT 1
    ),
    (
      SELECT t.id
      FROM public.tenants t
      ORDER BY t.created_at NULLS LAST
      LIMIT 1
    )
  ) AS tenant_id
),
productos_valor AS (
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    COALESCE(public.get_stock_actual(p.id), 0)::numeric AS existencia,
    COALESCE(p.costo, 0)::numeric AS costo_maestro,
    ROUND((GREATEST(COALESCE(public.get_stock_actual(p.id), 0), 0) * COALESCE(p.costo, 0))::numeric, 2) AS valor_real
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  WHERE COALESCE(p.activo, true) = true
)
SELECT
  (SELECT tenant_id FROM tenant_objetivo) AS tenant_id,
  COUNT(*) AS productos_activos,
  COUNT(*) FILTER (WHERE existencia > 0) AS productos_con_existencia,
  COUNT(*) FILTER (WHERE existencia < 0) AS productos_con_existencia_negativa,
  COUNT(*) FILTER (WHERE existencia > 0 AND costo_maestro <= 0) AS productos_con_stock_sin_costo,
  ROUND(SUM(valor_real)::numeric, 2) AS valor_real_inventario_actual
FROM productos_valor;
