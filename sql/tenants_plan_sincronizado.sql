-- =====================================================================
-- tenants.plan = el plan de la suscripción más reciente (09/11/2026)
-- ---------------------------------------------------------------------
-- tenants.plan es una etiqueta vieja que nadie actualizaba al cambiar de
-- plan: el Centenario decía "EDUCA PRO" pagando EDUCA INICIAL; Motopréstamos
-- Caminero Morla y El Naranjo decían "basico" pagando PRO. Lo que cobra y
-- limita es la suscripción (suscripciones.plan_id); esta columna solo se
-- muestra (ficha de la empresa) y la mira el freno de registros al CREAR
-- una empresa (BEFORE INSERT: 'TRIAL'), que no cambia.
-- · Trigger: al crear o cambiar una suscripción, tenants.plan pasa al
--   nombre del plan de la suscripción más reciente (como admin_get_tenants_detalle).
-- · Una vez: se corrigen las empresas que hoy no coinciden.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION private.tenant_plan_desde_suscripcion(p_tenant uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  UPDATE public.tenants t
     SET plan = x.nombre
    FROM (SELECT pl.nombre
            FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
           WHERE s.tenant_id = p_tenant
           ORDER BY s.created_at DESC, s.fecha_fin DESC NULLS LAST
           LIMIT 1) x
   WHERE t.id = p_tenant AND t.plan IS DISTINCT FROM x.nombre;
$function$;

CREATE OR REPLACE FUNCTION private.trg_suscripcion_plan_a_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM private.tenant_plan_desde_suscripcion(NEW.tenant_id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_suscripcion_plan_a_tenant ON public.suscripciones;
CREATE TRIGGER trg_suscripcion_plan_a_tenant
  AFTER INSERT OR UPDATE OF plan_id, fecha_fin ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION private.trg_suscripcion_plan_a_tenant();

-- Corregir las que hoy no coinciden.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM public.suscripciones LOOP
    PERFORM private.tenant_plan_desde_suscripcion(r.tenant_id);
  END LOOP;
END $$;

SELECT public.registrar_migracion('tenants_plan_sincronizado.sql');
