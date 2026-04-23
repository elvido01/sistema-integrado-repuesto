-- ============================================================
-- Diagnóstico + reparación de tenant_id en productos
-- Causa del error: "new row violates row-level security policy
-- for table 'productos'" al guardar desde Repuestos Morla.
-- ============================================================
-- Ejecutar en Supabase SQL Editor del proyecto PROD.
-- Asegúrate de estar en la base correcta antes de correr.
-- ============================================================

-- 0. ¿Cuál es el tenant_id de Repuestos Morla?
--    (cambia el WHERE si el nombre exacto difiere)
SELECT id AS tenant_id_morla, nombre
FROM tenants
WHERE nombre ILIKE '%morla%';

-- 1. ¿Cuántos productos tienen tenant_id = default migración (0001)?
SELECT tenant_id, COUNT(*) AS cantidad
FROM productos
GROUP BY tenant_id
ORDER BY cantidad DESC;

-- 2. ¿Hay productos con tenant_id NULL?
SELECT COUNT(*) AS productos_sin_tenant
FROM productos
WHERE tenant_id IS NULL;

-- 3. Listar el producto que da error (busca por código si lo conoces)
--    Cambia 'Z38N8010350' por el código del producto que falló.
SELECT id, codigo, descripcion, tenant_id, activo
FROM productos
WHERE codigo = 'Z38N8010350';

-- ============================================================
-- REPARACIÓN — DESCOMENTA Y EJECUTA SOLO CUANDO HAYAS
-- CONFIRMADO LOS DATOS DE ARRIBA
-- ============================================================

-- 4a. Reasignar TODOS los productos huérfanos (tenant default)
--     a Repuestos Morla. Reemplaza el UUID por el tenant_id_morla
--     que devolvió el query #0.
--
-- UPDATE productos
-- SET tenant_id = '<UUID_DE_MORLA>'::uuid
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
--    OR tenant_id IS NULL;

-- 4b. (Alternativa segura) Reparar solo el producto específico
--
-- UPDATE productos
-- SET tenant_id = '<UUID_DE_MORLA>'::uuid
-- WHERE codigo = 'Z38N8010350';

-- 5. Validación post-fix
-- SELECT tenant_id, COUNT(*) FROM productos GROUP BY tenant_id;
