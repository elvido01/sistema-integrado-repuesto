-- ============================================================
-- Diagnostico — Tablas legacy posiblemente obsoletas
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Las funciones get_perfiles_con_email, get_usuarios_panel, y
-- bulk_upsert_products usan tablas que parecen legacy:
--   - perfiles (singular español; el actual es profiles en inglés)
--   - products (singular inglés; el actual es productos en español)
--   - brands, models, suppliers, presentations (inglés)
--
-- Verificamos si existen y si tienen datos. Si NO -> las funciones
-- son obsoletas y se pueden DROP. Si SI -> hay que migrarlas o
-- aislarlas por tenant.
-- ============================================================

-- 1) Existen las tablas legacy?
SELECT
  table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = candidatas.tn
  ) THEN '✓ existe' ELSE '✗ no existe' END AS estado_tabla
FROM (VALUES
  ('perfiles'),
  ('products'),
  ('brands'),
  ('models'),
  ('suppliers'),
  ('presentations')
) AS candidatas(tn)
JOIN LATERAL (SELECT candidatas.tn AS table_name) lt ON true;

-- 2) Si existen, cuantas filas tienen
DO $$
DECLARE
  v_t TEXT;
  v_count BIGINT;
BEGIN
  FOR v_t IN
    SELECT t FROM (VALUES ('perfiles'),('products'),('brands'),('models'),('suppliers'),('presentations')) AS x(t)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_t
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I', v_t) INTO v_count;
      RAISE NOTICE 'Tabla %: % filas', v_t, v_count;
    END IF;
  END LOOP;
END $$;

-- 3) Las funciones que usan estas tablas tienen GRANT a authenticated?
SELECT
  p.proname AS func,
  pg_get_function_identity_arguments(p.oid) AS args,
  array(
    SELECT grantee
    FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema='public' AND rp.routine_name=p.proname
  ) AS grantees
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_perfiles_con_email',
    'get_usuarios_panel',
    'bulk_upsert_products'
  );
