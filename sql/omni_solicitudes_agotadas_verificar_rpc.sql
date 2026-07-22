-- ============================================================
-- MotoFlow Omni - Verificar RPC Producto Agotado
-- Ejecutar en el MISMO proyecto Supabase que usa la extension.
-- ============================================================

WITH rpc AS (
  SELECT
    p.oid,
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS result_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'omni_crear_solicitudes_agotadas'
),
reload AS (
  SELECT pg_notify('pgrst', 'reload schema') AS notified
)
SELECT
  CASE WHEN rpc.oid IS NULL THEN 'NO_EXISTE' ELSE 'EXISTE' END AS estado_rpc,
  COALESCE(rpc.schema_name, 'public') AS schema_name,
  COALESCE(rpc.function_name, 'omni_crear_solicitudes_agotadas') AS function_name,
  rpc.arguments,
  rpc.result_type,
  CASE
    WHEN rpc.oid IS NULL THEN false
    ELSE has_function_privilege(
      'authenticated',
      rpc.oid,
      'EXECUTE'
    )
  END AS authenticated_puede_ejecutar,
  true AS postgrest_schema_reload_requested
FROM reload
LEFT JOIN rpc ON true;

-- Resultado esperado:
-- public | omni_crear_solicitudes_agotadas | p_payload jsonb | jsonb
