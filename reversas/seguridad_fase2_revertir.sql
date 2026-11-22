-- =====================================================================
-- REVERSA de seguridad_fase2.sql (SOLO si algo se rompe)
-- =====================================================================
-- Vuelve a dar EXECUTE a PUBLIC/anon/authenticated a las funciones que
-- respaldó la fase 2, deshace los 4 envoltorios y repone las políticas de
-- notificaciones. Reabre lo cerrado: usar solo para salir de un apuro y
-- avisar qué falló para cerrarlo bien.
-- =====================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT firma FROM public.seguridad_acl_respaldo WHERE fase = 'fase2' LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.firma);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.ai_business_health_score(uuid);
ALTER FUNCTION public._impl_ai_business_health_score(uuid) RENAME TO ai_business_health_score;
DROP FUNCTION IF EXISTS public.ai_forecast_ventas(uuid);
ALTER FUNCTION public._impl_ai_forecast_ventas(uuid) RENAME TO ai_forecast_ventas;
DROP FUNCTION IF EXISTS public.ai_predict_stockouts(uuid, integer);
ALTER FUNCTION public._impl_ai_predict_stockouts(uuid, integer) RENAME TO ai_predict_stockouts;
DROP FUNCTION IF EXISTS public.get_marketing_candidates(uuid, boolean, integer);
ALTER FUNCTION public._impl_get_marketing_candidates(uuid, boolean, integer) RENAME TO get_marketing_candidates;
GRANT EXECUTE ON FUNCTION public.ai_business_health_score(uuid), public.ai_forecast_ventas(uuid),
  public.ai_predict_stockouts(uuid, integer), public.get_marketing_candidates(uuid, boolean, integer)
  TO authenticated, service_role, hermes_readonly;

DROP POLICY IF EXISTS notificaciones_insert_propia ON public.notificaciones;
CREATE POLICY notificaciones_insert ON public.notificaciones FOR INSERT TO public WITH CHECK (true);
CREATE POLICY notif_insert_system ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;
SELECT public.registrar_migracion('seguridad_fase2_revertir.sql');
