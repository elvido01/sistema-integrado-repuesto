-- ============================================================
-- Test smoke multi-tenant — Fase 1.3
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Verificaciones que confirman que el aislamiento multi-tenant
-- esta funcionando como se espera. Correr en DEV/PROD periódicamente,
-- o incorporar a CI cuando se monten tests de integracion contra una
-- BD de prueba.
--
-- Las pruebas que pasan retornan 0 filas. Cualquier fila != 0 es
-- una alerta que requiere investigacion.
-- ============================================================

-- === TEST 1: tablas de dominio sin tenant_id ===
-- Esperado: solo tablas globales legitimas (planes, tenants, ai_agents,
-- design_templates, auth_*). Cualquier otra es alerta.
SELECT
  '[TEST 1] Tablas sin tenant_id (filtrar globales legitimas)' AS test,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT LIKE 'schema_%'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'tenant_id'
  )
  -- Excluir tablas globales conocidas:
  AND c.relname NOT IN (
    'tenants',
    'planes',
    'plan_features',
    'ai_agents',
    'design_templates',
    'design_template_categories',
    'sales_channels',
    'app_settings',
    'feature_flags',
    'profiles'  -- profiles tiene tenant_id en columna user_id+tenant_id; revisar
  )
ORDER BY c.relname;

-- === TEST 2: tablas con RLS activado pero SIN policies (datos invisibles) ===
SELECT
  '[TEST 2] RLS activado sin policies (nadie puede leer)' AS test,
  c.relname AS table_name
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

-- === TEST 3: tablas con tenant_id pero RLS DESACTIVADO ===
-- (deberian tener RLS encendida para que las policies apliquen)
SELECT
  '[TEST 3] Tabla con tenant_id pero RLS desactivado' AS test,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'tenant_id'
  )
ORDER BY c.relname;

-- === TEST 4: tenant_id NULLABLE en tablas de dominio ===
SELECT
  '[TEST 4] tenant_id NULLABLE en tabla de dominio' AS test,
  table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
  AND is_nullable = 'YES'
ORDER BY table_name;

-- === TEST 5: detectar filas huerfanas con tenant_id NULL en tablas que SI lo tienen como nullable ===
-- (este test es generico: revisa cada tabla con tenant_id nullable y cuenta filas con NULL)
DO $$
DECLARE
  v_row RECORD;
  v_count BIGINT;
BEGIN
  RAISE NOTICE '[TEST 5] Filas con tenant_id NULL en tablas:';
  FOR v_row IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND is_nullable = 'YES'
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', v_row.table_name)
    INTO v_count;
    IF v_count > 0 THEN
      RAISE NOTICE '  % => % filas con tenant_id NULL', v_row.table_name, v_count;
    END IF;
  END LOOP;
END $$;

-- === TEST 6: Funciones SECURITY DEFINER que no mencionan tenant ===
-- Excluye: get_user_tenant misma, helpers de cron, endpoints publicos
SELECT
  '[TEST 6] SECURITY DEFINER sin tenant check (revisar)' AS test,
  p.proname AS func_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND position('tenant_id' IN pg_get_functiondef(p.oid)) = 0
  AND position('get_user_tenant' IN pg_get_functiondef(p.oid)) = 0
  AND p.proname NOT LIKE 'get_user_tenant%'
  AND p.proname NOT LIKE 'cron_%'
  AND p.proname NOT LIKE 'get_store_%'
  AND p.proname NOT LIKE 'get_tenant_por_dominio%'
ORDER BY p.proname;
