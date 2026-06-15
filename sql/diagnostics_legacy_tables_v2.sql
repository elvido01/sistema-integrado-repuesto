-- ============================================================
-- Diagnostico v2 — tablas legacy (simple, todo SELECT)
-- ============================================================
-- READ ONLY. Una sola query que devuelve todo en una tabla.
-- ============================================================

WITH candidatas AS (
  SELECT unnest(ARRAY[
    'perfiles',
    'products',
    'brands',
    'models',
    'suppliers',
    'presentations'
  ]) AS table_name
),
existencia AS (
  SELECT
    c.table_name,
    EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = c.table_name
    ) AS existe
  FROM candidatas c
)
SELECT
  e.table_name,
  CASE WHEN e.existe THEN 'EXISTE' ELSE 'NO EXISTE' END AS estado,
  CASE
    WHEN NOT e.existe THEN NULL
    -- Si existe, contar filas con SQL dinamico via formato:
    ELSE (
      -- esta sub-consulta usa pg_class para contar APROXIMADO
      -- (rapido y suficiente para saber si esta vacia o tiene millones)
      SELECT reltuples::bigint
      FROM pg_class
      WHERE relname = e.table_name AND relnamespace = (
        SELECT oid FROM pg_namespace WHERE nspname = 'public'
      )
    )
  END AS filas_aprox
FROM existencia e
ORDER BY estado DESC, e.table_name;
