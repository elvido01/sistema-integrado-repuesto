-- ============================================================
-- Diagnostico: historial de compras de un producto por codigo
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Cambia p_codigo_producto para consultar otro producto.
-- Devuelve:
--   1) Resumen: veces comprado, unidades, costo min/max/promedio/ultimo.
--   2) Detalle: cada compra con fecha, numero, suplidor, cantidad y costo.
-- ============================================================

WITH parametros AS (
  SELECT
    NULL::uuid AS p_tenant_id,
    '010691'::text AS p_codigo_producto
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
producto AS (
  SELECT p.id, p.codigo, p.descripcion, COALESCE(p.costo, 0)::numeric AS costo_actual
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  JOIN parametros prm ON prm.p_codigo_producto = p.codigo
  LIMIT 1
),
historial AS (
  SELECT
    cd.id AS compra_detalle_id,
    c.id AS compra_id,
    c.fecha,
    c.numero,
    c.referencia,
    COALESCE(pr.nombre, 'N/A') AS suplidor,
    COALESCE(cd.producto_id, p.id) AS producto_id,
    COALESCE(cd.codigo, p.codigo) AS codigo,
    COALESCE(cd.descripcion, p.descripcion) AS descripcion,
    COALESCE(cd.cantidad, 0)::numeric AS cantidad,
    COALESCE(cd.costo_unitario, 0)::numeric AS costo_unitario,
    COALESCE(cd.descuento_pct, 0)::numeric AS descuento_pct,
    COALESCE(cd.itbis_pct, 0)::numeric AS itbis_pct,
    COALESCE(cd.importe, COALESCE(cd.cantidad, 0) * COALESCE(cd.costo_unitario, 0))::numeric AS importe
  FROM public.compras_detalle cd
  JOIN public.compras c ON c.id = cd.compra_id
  JOIN tenant_objetivo t ON t.tenant_id = COALESCE(cd.tenant_id, c.tenant_id)
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  LEFT JOIN producto p ON p.id = cd.producto_id OR p.codigo = cd.codigo
  JOIN parametros prm ON TRUE
  WHERE c.tenant_id = t.tenant_id
    AND COALESCE(c.estado, '') <> 'Anulada'
    AND (
      cd.producto_id = (SELECT id FROM producto)
      OR cd.codigo = prm.p_codigo_producto
    )
),
ultimo AS (
  SELECT *
  FROM historial
  ORDER BY fecha DESC, numero DESC, compra_detalle_id DESC
  LIMIT 1
)
SELECT
  'RESUMEN' AS seccion,
  (SELECT tenant_id FROM tenant_objetivo) AS tenant_id,
  (SELECT codigo FROM producto) AS codigo_producto,
  (SELECT descripcion FROM producto) AS descripcion_producto,
  (SELECT costo_actual FROM producto) AS costo_actual_maestro,
  COUNT(*) AS veces_comprado,
  COALESCE(SUM(cantidad), 0) AS unidades_compradas,
  ROUND(COALESCE(MIN(NULLIF(costo_unitario, 0)), 0)::numeric, 2) AS costo_minimo,
  ROUND(COALESCE(MAX(costo_unitario), 0)::numeric, 2) AS costo_maximo,
  ROUND(COALESCE(AVG(NULLIF(costo_unitario, 0)), 0)::numeric, 2) AS costo_promedio_simple,
  ROUND(
    COALESCE(SUM(cantidad * costo_unitario) / NULLIF(SUM(cantidad), 0), 0)::numeric,
    2
  ) AS costo_promedio_ponderado,
  (SELECT fecha FROM ultimo) AS ultima_fecha_compra,
  (SELECT numero FROM ultimo) AS ultima_compra_numero,
  (SELECT suplidor FROM ultimo) AS ultimo_suplidor,
  (SELECT costo_unitario FROM ultimo) AS ultimo_costo_unitario
FROM historial;

WITH parametros AS (
  SELECT
    NULL::uuid AS p_tenant_id,
    '010691'::text AS p_codigo_producto
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
producto AS (
  SELECT p.id, p.codigo, p.descripcion
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  JOIN parametros prm ON prm.p_codigo_producto = p.codigo
  LIMIT 1
)
SELECT
  'DETALLE' AS seccion,
  c.fecha,
  c.numero AS compra_numero,
  c.referencia,
  COALESCE(pr.nombre, 'N/A') AS suplidor,
  COALESCE(cd.codigo, p.codigo) AS codigo,
  COALESCE(cd.descripcion, p.descripcion) AS descripcion,
  COALESCE(cd.cantidad, 0)::numeric AS cantidad,
  ROUND(COALESCE(cd.costo_unitario, 0)::numeric, 2) AS costo_unitario,
  COALESCE(cd.descuento_pct, 0)::numeric AS descuento_pct,
  COALESCE(cd.itbis_pct, 0)::numeric AS itbis_pct,
  ROUND(COALESCE(cd.importe, COALESCE(cd.cantidad, 0) * COALESCE(cd.costo_unitario, 0))::numeric, 2) AS importe
FROM public.compras_detalle cd
JOIN public.compras c ON c.id = cd.compra_id
JOIN tenant_objetivo t ON t.tenant_id = COALESCE(cd.tenant_id, c.tenant_id)
LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
LEFT JOIN producto p ON p.id = cd.producto_id OR p.codigo = cd.codigo
JOIN parametros prm ON TRUE
WHERE c.tenant_id = t.tenant_id
  AND COALESCE(c.estado, '') <> 'Anulada'
  AND (
    cd.producto_id = (SELECT id FROM producto)
    OR cd.codigo = prm.p_codigo_producto
  )
ORDER BY c.fecha DESC, c.numero DESC, cd.id DESC;
