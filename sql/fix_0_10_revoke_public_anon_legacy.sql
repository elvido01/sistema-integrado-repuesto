-- ============================================================
-- Fix 0.10 (URGENTE) — REVOKE acceso publico/anon a funciones legacy
-- ============================================================
-- Auditoria 2026-06-15 (R-NUEVO descubierto en smoke test).
--
-- Problema: get_usuarios_panel, get_perfiles_con_email y
-- bulk_upsert_products tienen GRANT EXECUTE TO PUBLIC y anon.
-- Eso significa que CUALQUIERA en internet (sin login) puede:
--   - Listar todos los emails de usuarios (PII leak)
--   - Insertar/actualizar productos en masa
--
-- Esta migracion es DEFENSIVA: solo quita los permisos peligrosos
-- sin tocar la logica. La app sigue funcionando porque el cliente
-- web/movil corre como authenticated.
--
-- Pasos siguientes (fix definitivo en Fase 0.11):
--   - Si tabla 'perfiles' esta vacia -> DROP las 2 funciones get_*
--     y migrar UsuariosPage.jsx a una RPC con filtro de tenant
--   - bulk_upsert_products: probablemente obsoleta (usa products,
--     brands, models, suppliers). DROP si NO se usa en frontend.
--
-- IDEMPOTENTE: REVOKE de algo no concedido no falla.
-- ============================================================

-- 1) get_usuarios_panel
REVOKE EXECUTE ON FUNCTION public.get_usuarios_panel() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_usuarios_panel() FROM anon;
-- mantener: service_role, authenticated, postgres

-- 2) get_perfiles_con_email
REVOKE EXECUTE ON FUNCTION public.get_perfiles_con_email() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_perfiles_con_email() FROM anon;

-- 3) bulk_upsert_products
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM anon;

-- 4) Verificacion: confirmar que PUBLIC y anon ya NO estan en los grantees
SELECT
  p.proname AS func,
  pg_get_function_identity_arguments(p.oid) AS args,
  array(
    SELECT grantee
    FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema = 'public' AND rp.routine_name = p.proname
    ORDER BY grantee
  ) AS grantees_actualizados
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_perfiles_con_email',
    'get_usuarios_panel',
    'bulk_upsert_products'
  );

NOTIFY pgrst, 'reload schema';

SELECT 'fix_0_10 REVOKE PUBLIC/anon de funciones legacy aplicado' AS status;
