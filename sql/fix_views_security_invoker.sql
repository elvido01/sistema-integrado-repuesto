-- =====================================================================
-- FIX SEGURIDAD (multi-tenant): vistas que ignoraban el RLS por tenant
-- ---------------------------------------------------------------------
-- Patron del bug: una VISTA que selecciona de tablas con RLS por tenant
-- pero que NO es security_invoker corre como su dueño (postgres) y por
-- defecto IGNORA el RLS -> muestra filas de TODAS las empresas.
--
-- pedidos_list_view ya estaba creada WITH (security_invoker='on') -> OK.
-- Aqui igualamos el resto de vistas tenant-scoped consumidas por la app.
-- Re-ejecutable. Requiere PostgreSQL 15+ (Supabase lo es).
-- =====================================================================

-- Lista de cotizaciones (web, movil, buscador)
ALTER VIEW public.cotizaciones_list_view        SET (security_invoker = true);

-- CRM / Sales Hub (conversaciones)
ALTER VIEW public.crm_whatsapp_conversations_view SET (security_invoker = true);
ALTER VIEW public.sales_conversations_view        SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';

SELECT 'Vistas tenant-scoped ahora respetan el RLS por empresa (security_invoker)' AS status;
