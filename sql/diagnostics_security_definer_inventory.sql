-- ============================================================
-- Diagnostico Fase 1.4 — Inventario exhaustivo de funciones SECURITY DEFINER
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Lista TODAS las funciones SECURITY DEFINER del schema public con su
-- signature, return type, y un flag heuristico que indica si filtran
-- por tenant o no.
--
-- Util para Fase 1: tener un mapa completo de funciones que bypasan RLS
-- y verificar manualmente cuales necesitan auditoria adicional.
-- ============================================================

-- 1) Listado completo con metadata
WITH defs AS (
  SELECT
    p.oid,
    p.proname                                            AS func_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
    pg_catalog.pg_get_function_result(p.oid)             AS return_type,
    l.lanname                                            AS language,
    pg_catalog.pg_get_functiondef(p.oid)                 AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_language l ON p.prolang = l.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true                                -- SECURITY DEFINER
    AND p.proname NOT LIKE 'pg_%'
)
SELECT
  func_name,
  args,
  return_type,
  language,
  CASE
    WHEN position('get_user_tenant' IN definition) > 0 THEN '✓ usa get_user_tenant()'
    WHEN position('tenant_id' IN args) > 0 THEN '~ recibe tenant_id por parametro'
    WHEN position('tenant_id' IN definition) > 0 THEN '~ menciona tenant_id en cuerpo'
    ELSE '⚠ NO MENCIONA tenant'
  END AS tenant_check,
  length(definition) AS body_length
FROM defs
ORDER BY tenant_check, func_name;

-- 2) Contadores
SELECT
  'Total funciones SECURITY DEFINER en public' AS metric,
  COUNT(*) AS valor
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
UNION ALL
SELECT
  'Que usan get_user_tenant()',
  COUNT(*)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND position('get_user_tenant' IN pg_get_functiondef(p.oid)) > 0
UNION ALL
SELECT
  'Que reciben tenant_id por parametro',
  COUNT(*)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND position('tenant_id' IN pg_get_function_identity_arguments(p.oid)) > 0
UNION ALL
SELECT
  'Que NO mencionan tenant en ningun lado (RIESGO)',
  COUNT(*)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND position('tenant_id' IN pg_get_functiondef(p.oid)) = 0
  AND position('get_user_tenant' IN pg_get_functiondef(p.oid)) = 0;

-- 3) DETALLE de las funciones SECURITY DEFINER que NO mencionan tenant
-- (revisar manualmente cada una para confirmar que es legitima)
SELECT
  p.proname AS func_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS return_type,
  CASE
    WHEN p.proname LIKE 'get_user_tenant%' THEN 'OK: es la propia get_user_tenant'
    WHEN p.proname LIKE '%public%' OR p.proname LIKE 'get_store_%' THEN 'OK: endpoint publico'
    WHEN p.proname LIKE 'cron_%' THEN 'OK: cron itera tenants intencionalmente'
    ELSE '⚠ REVISAR'
  END AS clasificacion
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND position('tenant_id' IN pg_get_functiondef(p.oid)) = 0
  AND position('get_user_tenant' IN pg_get_functiondef(p.oid)) = 0
ORDER BY clasificacion DESC, func_name;
