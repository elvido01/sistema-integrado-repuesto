-- ============================================================
-- Diagnostico: primera venta de un producto por codigo
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Cambia p_codigo_producto para consultar otro producto.
-- Devuelve:
--   1) La primera venta registrada del producto.
--   2) El historial completo de ventas del producto.
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
  SELECT p.id, p.codigo, p.descripcion
  FROM public.productos p
  JOIN tenant_objetivo t ON t.tenant_id = p.tenant_id
  JOIN parametros prm ON prm.p_codigo_producto = p.codigo
  LIMIT 1
),
ventas AS (
  SELECT
    f.fecha,
    f.numero AS factura_numero,
    f.ncf,
    COALESCE(c.nombre, 'N/A') AS cliente,
    COALESCE(fd.codigo, p.codigo) AS codigo,
    COALESCE(fd.descripcion, p.descripcion) AS descripcion,
    COALESCE(fd.cantidad, 0)::numeric AS cantidad,
    COALESCE(fd.precio, 0)::numeric AS precio_unitario,
    COALESCE(fd.descuento, 0)::numeric AS descuento,
    COALESCE(fd.itbis, 0)::numeric AS itbis,
    COALESCE(fd.importe, COALESCE(fd.cantidad, 0) * COALESCE(fd.precio, 0))::numeric AS total_linea,
    fd.id AS factura_detalle_id
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  JOIN tenant_objetivo t ON t.tenant_id = COALESCE(fd.tenant_id, f.tenant_id)
  LEFT JOIN public.clientes c ON c.id = f.cliente_id
  LEFT JOIN producto p ON p.id = fd.producto_id OR p.codigo = fd.codigo
  JOIN parametros prm ON TRUE
  WHERE f.tenant_id = t.tenant_id
    AND COALESCE(f.estado, '') <> 'Anulada'
    AND (
      fd.producto_id = (SELECT id FROM producto)
      OR fd.codigo = prm.p_codigo_producto
    )
)
SELECT
  'PRIMERA_VENTA' AS seccion,
  fecha,
  factura_numero,
  ncf,
  cliente,
  codigo,
  descripcion,
  cantidad,
  ROUND(precio_unitario::numeric, 2) AS precio_unitario,
  ROUND(descuento::numeric, 2) AS descuento,
  ROUND(itbis::numeric, 2) AS itbis,
  ROUND(total_linea::numeric, 2) AS total_linea
FROM ventas
ORDER BY fecha ASC, factura_numero ASC, factura_detalle_id ASC
LIMIT 1;

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
  'HISTORIAL_VENTAS' AS seccion,
  f.fecha,
  f.numero AS factura_numero,
  f.ncf,
  COALESCE(c.nombre, 'N/A') AS cliente,
  COALESCE(fd.codigo, p.codigo) AS codigo,
  COALESCE(fd.descripcion, p.descripcion) AS descripcion,
  COALESCE(fd.cantidad, 0)::numeric AS cantidad,
  ROUND(COALESCE(fd.precio, 0)::numeric, 2) AS precio_unitario,
  ROUND(COALESCE(fd.descuento, 0)::numeric, 2) AS descuento,
  ROUND(COALESCE(fd.itbis, 0)::numeric, 2) AS itbis,
  ROUND(COALESCE(fd.importe, COALESCE(fd.cantidad, 0) * COALESCE(fd.precio, 0))::numeric, 2) AS total_linea
FROM public.facturas_detalle fd
JOIN public.facturas f ON f.id = fd.factura_id
JOIN tenant_objetivo t ON t.tenant_id = COALESCE(fd.tenant_id, f.tenant_id)
LEFT JOIN public.clientes c ON c.id = f.cliente_id
LEFT JOIN producto p ON p.id = fd.producto_id OR p.codigo = fd.codigo
JOIN parametros prm ON TRUE
WHERE f.tenant_id = t.tenant_id
  AND COALESCE(f.estado, '') <> 'Anulada'
  AND (
    fd.producto_id = (SELECT id FROM producto)
    OR fd.codigo = prm.p_codigo_producto
  )
ORDER BY f.fecha ASC, f.numero ASC, fd.id ASC;
