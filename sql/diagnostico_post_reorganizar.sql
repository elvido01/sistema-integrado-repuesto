-- ============================================================
-- Diagnostico: ¿A donde se movieron las lineas de ORD-0030?
-- ============================================================

-- 1) Ver TODAS las ordenes Pendiente actuales (incluso las recien creadas)
SELECT
  oc.numero,
  oc.fecha_orden,
  pr.nombre AS suplidor,
  oc.total_orden,
  (SELECT COUNT(*) FROM public.ordenes_compra_detalle d WHERE d.orden_compra_id = oc.id) AS lineas,
  oc.notas
FROM public.ordenes_compra oc
LEFT JOIN public.proveedores pr ON pr.id = oc.suplidor_id
WHERE oc.estado = 'Pendiente'
ORDER BY oc.fecha_orden DESC, oc.numero;

-- 2) Tomamos un producto especifico (GOMA 110/80-17 codigo 017533)
-- y vemos cual es su suplidor real
SELECT
  p.codigo,
  p.descripcion,
  p.suplidor_id,
  pr.nombre AS suplidor_real_del_producto
FROM public.productos p
LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id
WHERE p.codigo = '017533';

-- 3) Buscar TODOS los proveedores cuyo nombre contenga "HAO"
SELECT id, nombre, rnc, telefono
FROM public.proveedores
WHERE nombre ILIKE '%HAO%'
ORDER BY nombre;

-- 4) Donde esta ahora la GOMA 110/80-17 (codigo 017533)?
SELECT
  oc.numero AS orden,
  pr.nombre AS suplidor_orden,
  d.codigo,
  d.cantidad,
  d.precio
FROM public.ordenes_compra_detalle d
JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
LEFT JOIN public.proveedores pr ON pr.id = oc.suplidor_id
WHERE d.codigo = '017533'
  AND oc.estado = 'Pendiente';

-- 5) Resumen final de quesirans en cada orden (para entender adonde fueron las piezas HAO)
SELECT
  pr.nombre AS suplidor,
  oc.numero,
  COUNT(d.id) AS lineas,
  oc.total_orden
FROM public.ordenes_compra oc
JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
LEFT JOIN public.proveedores pr ON pr.id = oc.suplidor_id
WHERE oc.estado = 'Pendiente'
  AND oc.fecha_orden = CURRENT_DATE
GROUP BY pr.nombre, oc.numero, oc.total_orden
ORDER BY oc.total_orden DESC;
