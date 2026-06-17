-- ============================================================
-- INVENTARIO MUERTO vs ROTACION — donde quedo atrapado el capital
-- ============================================================
-- READ ONLY. Resuelve tenant por nombre (corre como admin).
--
-- Causa raiz confirmada por el dueño: se compraba "al ojo" / anotado,
-- no segun lo vendido. Resultado: capital enterrado en productos que
-- no rotan, mientras se acumulaba deuda para reponer lo que si vende.
--
-- Este analisis muestra:
--   A) Cuanto capital (a costo) esta en inventario, separado en:
--      - MUERTO: sin ventas en 180 dias
--      - LENTO:  sin ventas en 90 dias (pero si en 180)
--      - ACTIVO: con ventas en 90 dias
--   B) Top productos con mas capital muerto (candidatos a liquidar/devolver)
--   C) Productos que SI rotan pero estan agotados (lo que de verdad
--      hay que comprar)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECCION A — CAPITAL EN INVENTARIO POR ESTADO DE ROTACION
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION A: Capital en inventario por rotacion' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
ultima_venta AS (
  SELECT fd.producto_id, MAX(f.fecha) AS ultima_fecha
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND f.estado <> 'Anulada'
  GROUP BY fd.producto_id
),
inv AS (
  SELECT
    p.id,
    GREATEST(public.get_stock_actual(p.id), 0) AS stock,
    COALESCE(p.costo, 0) AS costo,
    uv.ultima_fecha
  FROM public.productos p
  LEFT JOIN ultima_venta uv ON uv.producto_id = p.id
  WHERE p.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(p.activo, true) = true
)
SELECT
  CASE
    WHEN ultima_fecha IS NULL                         THEN '1. NUNCA VENDIDO'
    WHEN ultima_fecha < CURRENT_DATE - 180            THEN '2. MUERTO (sin venta 180d+)'
    WHEN ultima_fecha < CURRENT_DATE - 90             THEN '3. LENTO (90-180d)'
    ELSE '4. ACTIVO (vende <90d)'
  END AS estado_rotacion,
  COUNT(*) FILTER (WHERE stock > 0)             AS productos_con_stock,
  ROUND(SUM(stock * costo), 2)                  AS capital_atrapado
FROM inv
GROUP BY 1
ORDER BY 1;

-- Total global del inventario a costo
SELECT 'SECCION A2: Valor total inventario a costo' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
)
SELECT ROUND(SUM(GREATEST(public.get_stock_actual(p.id),0) * COALESCE(p.costo,0)), 2) AS valor_total_inventario
FROM public.productos p
WHERE p.tenant_id = (SELECT tenant_id FROM tnt)
  AND COALESCE(p.activo, true) = true;


-- ════════════════════════════════════════════════════════════
-- SECCION B — TOP 50 CAPITAL MUERTO (candidatos a liquidar/devolver)
-- ════════════════════════════════════════════════════════════
-- Productos con mas dinero enterrado que NO se venden hace 180d+ o nunca.
SELECT 'SECCION B: Top capital muerto' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
ultima_venta AS (
  SELECT fd.producto_id, MAX(f.fecha) AS ultima_fecha, SUM(fd.cantidad) AS total_vendido_hist
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND f.estado <> 'Anulada'
  GROUP BY fd.producto_id
)
SELECT
  p.codigo,
  p.descripcion,
  GREATEST(public.get_stock_actual(p.id), 0)       AS stock,
  ROUND(COALESCE(p.costo,0), 2)                    AS costo_unit,
  ROUND(GREATEST(public.get_stock_actual(p.id),0) * COALESCE(p.costo,0), 2) AS capital_atrapado,
  COALESCE(uv.ultima_fecha::text, 'NUNCA')         AS ultima_venta,
  COALESCE(uv.total_vendido_hist, 0)               AS vendido_historico
FROM public.productos p
LEFT JOIN ultima_venta uv ON uv.producto_id = p.id
WHERE p.tenant_id = (SELECT tenant_id FROM tnt)
  AND COALESCE(p.activo, true) = true
  AND GREATEST(public.get_stock_actual(p.id), 0) > 0
  AND (uv.ultima_fecha IS NULL OR uv.ultima_fecha < CURRENT_DATE - 180)
ORDER BY capital_atrapado DESC
LIMIT 50;


-- ════════════════════════════════════════════════════════════
-- SECCION C — LO QUE SI HAY QUE COMPRAR (rota pero esta agotado/bajo)
-- ════════════════════════════════════════════════════════════
-- Productos con ventas en 90d, stock <= minimo. Ordenado por velocidad.
SELECT 'SECCION C: Comprar esto (rota y esta bajo minimo)' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
ventas_90 AS (
  SELECT fd.producto_id, SUM(fd.cantidad) AS vendidas_90d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 90
  GROUP BY fd.producto_id
)
SELECT
  p.codigo,
  p.descripcion,
  GREATEST(public.get_stock_actual(p.id),0)  AS stock,
  p.min_stock,
  v.vendidas_90d,
  ROUND(v.vendidas_90d / 90.0, 2)            AS venta_diaria_prom,
  ROUND(COALESCE(p.costo,0),2)               AS costo_unit,
  GREATEST(0, CEIL(v.vendidas_90d / 90.0 * 30) - GREATEST(public.get_stock_actual(p.id),0)) AS comprar_30d,
  ROUND(GREATEST(0, CEIL(v.vendidas_90d / 90.0 * 30) - GREATEST(public.get_stock_actual(p.id),0)) * COALESCE(p.costo,0), 2) AS inversion
FROM public.productos p
JOIN ventas_90 v ON v.producto_id = p.id
WHERE p.tenant_id = (SELECT tenant_id FROM tnt)
  AND COALESCE(p.activo, true) = true
  AND GREATEST(public.get_stock_actual(p.id),0) <= COALESCE(p.min_stock, 0)
ORDER BY v.vendidas_90d DESC
LIMIT 50;
