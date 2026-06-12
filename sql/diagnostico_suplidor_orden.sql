-- ============================================================
-- Diagnostico: ¿Por que productos "HAO" estan en orden de IMDORE?
-- ============================================================
-- Reemplaza 'ORD-0030' por el numero de orden a investigar.
-- ============================================================

-- 1) Comparar suplidor de la orden vs suplidor real de cada producto
SELECT
  d.codigo,
  d.descripcion,
  prov_orden.nombre   AS suplidor_de_la_orden,
  prov_prod.nombre    AS suplidor_real_del_producto,
  CASE
    WHEN oc.suplidor_id = p.suplidor_id THEN '✓ Coincide'
    WHEN p.suplidor_id IS NULL          THEN '⚠ Producto SIN suplidor'
    ELSE '✗ NO coincide (deberia ir a ' || prov_prod.nombre || ')'
  END AS estado
FROM public.ordenes_compra oc
JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
LEFT JOIN public.productos p           ON p.id = d.producto_id
LEFT JOIN public.proveedores prov_orden ON prov_orden.id = oc.suplidor_id
LEFT JOIN public.proveedores prov_prod  ON prov_prod.id = p.suplidor_id
WHERE oc.numero = 'ORD-0030'
ORDER BY estado DESC, d.codigo;

-- 2) Resumen: cuantos productos en ORD-0030 estan MAL asignados
SELECT
  COUNT(*)                                                   AS total_lineas,
  COUNT(*) FILTER (WHERE oc.suplidor_id = p.suplidor_id)     AS coincide,
  COUNT(*) FILTER (WHERE p.suplidor_id IS NULL)              AS sin_suplidor,
  COUNT(*) FILTER (
    WHERE p.suplidor_id IS NOT NULL
      AND oc.suplidor_id <> p.suplidor_id
  )                                                          AS no_coincide
FROM public.ordenes_compra oc
JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
LEFT JOIN public.productos p ON p.id = d.producto_id
WHERE oc.numero = 'ORD-0030';

-- 3) Si descubres que muchos tienen suplidor IMDORE pero descripcion dice HAO,
-- aqui hay un script para REASIGNARLOS al suplidor HAO (revisar antes de correr):
--
-- UPDATE public.productos
--    SET suplidor_id = (SELECT id FROM public.proveedores WHERE nombre ILIKE '%HAO%' LIMIT 1)
--  WHERE descripcion ILIKE '%HAO%'
--    AND suplidor_id = (SELECT id FROM public.proveedores WHERE nombre ILIKE '%IMDORE%' LIMIT 1);
--
-- IMPORTANTE: corre el SELECT primero para ver cuantas filas afectaria:
--
SELECT COUNT(*) AS productos_que_se_reasignarian
FROM public.productos
WHERE descripcion ILIKE '%HAO%'
  AND suplidor_id = (SELECT id FROM public.proveedores WHERE nombre ILIKE '%IMDORE%' LIMIT 1);
