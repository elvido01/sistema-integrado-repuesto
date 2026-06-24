-- =====================================================================
-- FIX SEGURIDAD: cotizaciones_list_view debe respetar el RLS por tenant
-- ---------------------------------------------------------------------
-- La tabla cotizaciones SI tiene RLS por tenant (tenant_select_cotizaciones),
-- pero la VISTA cotizaciones_list_view corre como su dueño (postgres) y
-- por defecto IGNORA el RLS de la tabla subyacente -> mostraba cotizaciones
-- de TODAS las empresas en cualquier tenant.
--
-- security_invoker = true hace que la vista corra con los permisos del
-- usuario que consulta -> aplica el RLS de cotizaciones -> aislamiento
-- por empresa garantizado para TODOS los consumidores (web, movil, buscador).
-- Requiere PostgreSQL 15+ (Supabase lo es). Idempotente.
-- =====================================================================

ALTER VIEW public.cotizaciones_list_view SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';

SELECT 'cotizaciones_list_view ahora respeta el RLS por tenant (security_invoker)' AS status;
