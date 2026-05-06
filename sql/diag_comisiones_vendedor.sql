-- ============================================================
-- Diagnostico: ¿por que Pago Comisiones no encuentra ventas?
-- ============================================================
-- Reemplaza el rango de fechas si quieres revisar otro periodo.
-- Lo corres como cualquier usuario admin de Repuestos Caminero
-- (la RLS filtra por tenant automaticamente).
-- ============================================================

-- 1. ¿Cuantas facturas hay del tenant en abril 2026?
SELECT COUNT(*) AS total_facturas_abril
FROM facturas
WHERE fecha >= '2026-04-01'
  AND fecha < '2026-05-01';

-- 2. ¿Tienen vendedor_id asignado?
SELECT
  CASE WHEN vendedor_id IS NULL THEN 'SIN_VENDEDOR' ELSE 'CON_VENDEDOR' END AS estado_vendedor,
  COUNT(*) AS cantidad,
  SUM(total) AS monto_total
FROM facturas
WHERE fecha >= '2026-04-01' AND fecha < '2026-05-01'
GROUP BY 1;

-- 3. Distribucion por vendedor_id (con nombre)
SELECT
  v.id   AS vendedor_id,
  v.nombre AS vendedor_nombre,
  COUNT(f.id) AS cantidad_facturas,
  SUM(f.total) AS monto_total
FROM facturas f
LEFT JOIN vendedores v ON v.id = f.vendedor_id
WHERE f.fecha >= '2026-04-01' AND f.fecha < '2026-05-01'
GROUP BY v.id, v.nombre
ORDER BY cantidad_facturas DESC;

-- 4. ¿Existe el vendedor "RAFA" en la tabla vendedores?
SELECT id, nombre, activo
FROM vendedores
WHERE nombre ILIKE '%rafa%';

-- 5. ¿Que retorna la RPC para RAFA en abril?
-- (reemplaza el id_de_rafa con el resultado del query 4)
-- SELECT * FROM calcular_comisiones_vendedor(
--   p_vendedor_id => '<id_de_rafa>'::uuid,
--   p_fecha_desde => '2026-04-01'::date,
--   p_fecha_hasta => '2026-04-30'::date
-- );

-- 6. Definicion actual de la RPC (para ver que filtros aplica)
SELECT pg_get_functiondef(oid) AS definicion
FROM pg_proc
WHERE proname = 'calcular_comisiones_vendedor'
  AND pronamespace = 'public'::regnamespace;
