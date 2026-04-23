-- ============================================================
-- LIMPIEZA: Eliminar ubicaciones que quedaron en tabla almacenes
-- ============================================================
-- MORLA tiene ~90+ registros en "almacenes" que son ubicaciones
-- (A-CAJA-1, B-CAJA-2, CAJON L-x, etc.)
-- El único almacén real es "Almacén Principal" (ALM01).
--
-- EJECUTAR PASO POR PASO en el SQL Editor de Supabase.
-- ============================================================

-- ──────────────────────────────────────────────────────
-- PASO 1: Obtener el ID del almacén principal de MORLA
-- (ejecutar primero para verificar que existe)
-- ──────────────────────────────────────────────────────
SELECT id, codigo, nombre
FROM almacenes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND codigo = 'ALM01';
-- Resultado esperado: id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'

-- ──────────────────────────────────────────────────────
-- PASO 2: Reasignar TODAS las FKs al almacén principal
-- (compras, entradas y salidas que apunten a ubicaciones)
-- ──────────────────────────────────────────────────────

-- 2A. compras
UPDATE compras
SET almacen_id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND almacen_id IS NOT NULL
  AND almacen_id != 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7';

-- 2B. entradas_inventario
UPDATE entradas_inventario
SET almacen_id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND almacen_id IS NOT NULL
  AND almacen_id != 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7';

-- 2C. salidas_inventario
UPDATE salidas_inventario
SET almacen_id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND almacen_id IS NOT NULL
  AND almacen_id != 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7';

-- ──────────────────────────────────────────────────────
-- PASO 3: Eliminar todas las ubicaciones de la tabla almacenes
-- (dejar SOLO el almacén principal ALM01)
-- ──────────────────────────────────────────────────────
DELETE FROM almacenes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND codigo != 'ALM01';

-- ──────────────────────────────────────────────────────
-- PASO 4: Renombrar ALM01 → codigo '01' para consistencia
-- con el estándar SaaS (nuevos tenants usan '01')
-- ──────────────────────────────────────────────────────
UPDATE almacenes
SET codigo = '01', nombre = 'ALMACEN PRINCIPAL'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND codigo = 'ALM01';

-- ──────────────────────────────────────────────────────
-- PASO 5: Verificación final
-- ──────────────────────────────────────────────────────
SELECT id, codigo, nombre, activo, tenant_id
FROM almacenes
ORDER BY tenant_id, codigo;
-- Debe mostrar solo 1 fila para MORLA: '01' - 'ALMACEN PRINCIPAL'
