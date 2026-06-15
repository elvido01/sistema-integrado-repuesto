-- ============================================================
-- Diagnostico: valor real de inventario actual
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Objetivo:
-- 1) Confirmar el valor actual real del inventario:
--      SUM(GREATEST(get_stock_actual(producto), 0) * productos.costo)
-- 2) Compararlo contra la logica vieja de Inventario Inteligente:
--      - solo primeros 5000 productos ordenados por descripcion
--      - costo sustituido por ultimo movimiento positivo de 180 dias
--
-- IMPORTANTE:
-- Si lo corres en Supabase SQL Editor, auth.uid() puede ser NULL.
-- Por eso este script intenta detectar el tenant por config_empresa.
-- Si tienes mas de un tenant y quieres forzarlo, reemplaza el valor
-- de p_tenant_id en parametros.
-- ============================================================

WITH parametros AS (
  SELECT
    NULL::uuid AS p_tenant_id,
    5000::int AS p_limite_viejo,
    180::int AS p_dias_movimientos
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
productos_base AS (
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    COALESCE(p.costo, 0)::numeric AS costo_maestro,
    COALESCE(public.get_stock_actual(p.id), 0)::numeric AS existencia,
    ROW_NUMBER() OVER (ORDER BY p.descripcion ASC, p.id ASC) AS rn
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  WHERE COALESCE(p.activo, true) = true
),
ultimo_costo_movimiento AS (
  SELECT DISTINCT ON (im.producto_id)
    im.producto_id,
    im.costo_unitario::numeric AS ultimo_costo_entrada,
    im.fecha AS ultimo_costo_fecha,
    im.referencia_doc AS ultimo_costo_referencia
  FROM public.inventario_movimientos im
  JOIN tenant_objetivo t ON t.tenant_id = im.tenant_id
  WHERE im.cantidad > 0
    AND COALESCE(im.costo_unitario, 0) > 0
    AND im.fecha >= NOW() - ((SELECT p_dias_movimientos FROM parametros) || ' days')::interval
  ORDER BY im.producto_id, im.fecha DESC, im.id DESC
),
calculado AS (
  SELECT
    pb.*,
    ucm.ultimo_costo_entrada,
    ucm.ultimo_costo_fecha,
    ucm.ultimo_costo_referencia,
    ROUND((GREATEST(pb.existencia, 0) * pb.costo_maestro)::numeric, 2) AS valor_real,
    CASE
      WHEN pb.rn <= (SELECT p_limite_viejo FROM parametros)
      THEN ROUND((GREATEST(pb.existencia, 0) * COALESCE(ucm.ultimo_costo_entrada, pb.costo_maestro))::numeric, 2)
      ELSE 0
    END AS valor_pantalla_vieja
  FROM productos_base pb
  LEFT JOIN ultimo_costo_movimiento ucm ON ucm.producto_id = pb.id
)
SELECT
  'RESUMEN' AS seccion,
  (SELECT tenant_id FROM tenant_objetivo) AS tenant_id,
  COUNT(*) AS productos_activos,
  COUNT(*) FILTER (WHERE existencia > 0) AS productos_con_existencia,
  COUNT(*) FILTER (WHERE rn > (SELECT p_limite_viejo FROM parametros)) AS productos_omitidos_por_limite_viejo,
  ROUND(SUM(valor_real)::numeric, 2) AS valor_real_inventario_actual,
  ROUND(SUM(valor_pantalla_vieja)::numeric, 2) AS valor_segun_pantalla_vieja,
  ROUND((SUM(valor_real) - SUM(valor_pantalla_vieja))::numeric, 2) AS diferencia_real_vs_pantalla_vieja
FROM calculado;

-- Productos que mas aportan al valor real.
WITH parametros AS (
  SELECT NULL::uuid AS p_tenant_id
),
tenant_objetivo AS (
  SELECT COALESCE(
    (SELECT p_tenant_id FROM parametros WHERE p_tenant_id IS NOT NULL),
    (SELECT public.get_user_tenant()),
    (SELECT ce.tenant_id FROM public.config_empresa ce WHERE ce.tenant_id IS NOT NULL ORDER BY CASE WHEN COALESCE(ce.nombre, '') ILIKE '%morla%' THEN 0 ELSE 1 END, ce.nombre NULLS LAST LIMIT 1),
    (SELECT t.id FROM public.tenants t ORDER BY t.created_at NULLS LAST LIMIT 1)
  ) AS tenant_id
),
productos_valor AS (
  SELECT
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
  'TOP_VALOR_REAL' AS seccion,
  codigo,
  descripcion,
  existencia,
  costo_maestro,
  valor_real
FROM productos_valor
WHERE valor_real > 0
ORDER BY valor_real DESC
LIMIT 50;

-- Productos omitidos por la pantalla vieja por estar despues de los primeros 5000.
WITH parametros AS (
  SELECT NULL::uuid AS p_tenant_id, 5000::int AS p_limite_viejo
),
tenant_objetivo AS (
  SELECT COALESCE(
    (SELECT p_tenant_id FROM parametros WHERE p_tenant_id IS NOT NULL),
    (SELECT public.get_user_tenant()),
    (SELECT ce.tenant_id FROM public.config_empresa ce WHERE ce.tenant_id IS NOT NULL ORDER BY CASE WHEN COALESCE(ce.nombre, '') ILIKE '%morla%' THEN 0 ELSE 1 END, ce.nombre NULLS LAST LIMIT 1),
    (SELECT t.id FROM public.tenants t ORDER BY t.created_at NULLS LAST LIMIT 1)
  ) AS tenant_id
),
omitidos AS (
  SELECT
    p.codigo,
    p.descripcion,
    COALESCE(public.get_stock_actual(p.id), 0)::numeric AS existencia,
    COALESCE(p.costo, 0)::numeric AS costo_maestro,
    ROUND((GREATEST(COALESCE(public.get_stock_actual(p.id), 0), 0) * COALESCE(p.costo, 0))::numeric, 2) AS valor_real,
    ROW_NUMBER() OVER (ORDER BY p.descripcion ASC, p.id ASC) AS rn
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  WHERE COALESCE(p.activo, true) = true
)
SELECT
  'OMITIDOS_POR_LIMITE_VIEJO' AS seccion,
  rn,
  codigo,
  descripcion,
  existencia,
  costo_maestro,
  valor_real
FROM omitidos
WHERE rn > (SELECT p_limite_viejo FROM parametros)
  AND valor_real > 0
ORDER BY valor_real DESC
LIMIT 50;
