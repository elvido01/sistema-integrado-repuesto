-- ============================================================
-- Diagnostico Fase 1.5 — Inventario de tablas y columna tenant_id
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Lista TODAS las tablas del schema public clasificadas por:
--   - Si tienen columna tenant_id
--   - Si tienen RLS activado
--   - Si tienen policies
--   - Cuantas filas tienen
-- ============================================================

-- 1) Vista maestra: una fila por tabla, con estado de aislamiento
WITH t AS (
  SELECT
    c.oid,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS n_policies
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'                      -- solo tablas
    AND c.relname NOT LIKE 'pg_%'
    AND c.relname NOT IN ('schema_migrations', 'spatial_ref_sys')
),
cols AS (
  SELECT
    c.table_name,
    bool_or(c.column_name = 'tenant_id') AS has_tenant_id,
    bool_or(c.column_name = 'tenant_id' AND c.is_nullable = 'YES') AS tenant_id_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  GROUP BY c.table_name
)
SELECT
  t.table_name,
  COALESCE(cols.has_tenant_id, false)      AS has_tenant_id,
  COALESCE(cols.tenant_id_nullable, false) AS tenant_id_nullable,
  t.rls_enabled,
  t.n_policies,
  CASE
    WHEN cols.has_tenant_id AND t.rls_enabled AND t.n_policies > 0 THEN '✓ aislada'
    WHEN cols.has_tenant_id AND t.rls_enabled AND t.n_policies = 0 THEN '⚠ tenant_id + RLS sin policies'
    WHEN cols.has_tenant_id AND NOT t.rls_enabled                   THEN '⚠ tenant_id sin RLS activado'
    WHEN NOT cols.has_tenant_id AND t.rls_enabled                   THEN '? sin tenant_id pero RLS on (revisar)'
    WHEN NOT cols.has_tenant_id AND NOT t.rls_enabled               THEN '✗ sin tenant_id, sin RLS'
    ELSE 'revisar'
  END AS estado
FROM t
LEFT JOIN cols ON cols.table_name = t.table_name
ORDER BY estado DESC, t.table_name;

-- 2) Resumen contadores
SELECT
  estado,
  COUNT(*) AS n_tablas
FROM (
  WITH t AS (
    SELECT
      c.oid,
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS n_policies
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT IN ('schema_migrations', 'spatial_ref_sys')
  ),
  cols AS (
    SELECT
      c.table_name,
      bool_or(c.column_name = 'tenant_id') AS has_tenant_id
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    GROUP BY c.table_name
  )
  SELECT
    CASE
      WHEN cols.has_tenant_id AND t.rls_enabled AND t.n_policies > 0 THEN '✓ aislada'
      WHEN cols.has_tenant_id AND t.rls_enabled AND t.n_policies = 0 THEN '⚠ tenant_id + RLS sin policies'
      WHEN cols.has_tenant_id AND NOT t.rls_enabled                   THEN '⚠ tenant_id sin RLS activado'
      WHEN NOT cols.has_tenant_id AND t.rls_enabled                   THEN '? sin tenant_id pero RLS on'
      WHEN NOT cols.has_tenant_id AND NOT t.rls_enabled               THEN '✗ sin tenant_id, sin RLS'
      ELSE 'revisar'
    END AS estado
  FROM t
  LEFT JOIN cols ON cols.table_name = t.table_name
) sub
GROUP BY estado
ORDER BY estado;

-- 3) Tablas con RLS pero SIN policies (riesgo silencioso: nadie puede leer)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = c.relname AND p.schemaname = 'public'
  )
ORDER BY c.relname;

-- 4) Tablas con tenant_id NULLABLE (riesgo: filas sin tenant escapan a policies)
SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
  AND is_nullable = 'YES'
ORDER BY table_name;
