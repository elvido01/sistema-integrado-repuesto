-- =====================================================================
-- ROLLBACK ETAPA 2.1 — Cola de oportunidades comerciales (enviada por error)
-- ---------------------------------------------------------------------
-- La instrucción de crear la cola/vistas de inteligencia comercial en
-- MotoFlow fue un error: esa inteligencia la implementa HERMES leyendo
-- MotoFlow. Este script elimina EXCLUSIVAMENTE los objetos creados por
-- sql/etapa_2_1_oportunidades_comerciales.sql (4 vistas, sin tablas,
-- triggers ni crons — la etapa no creó nada más).
--
-- NO toca (queda todo como está):
--   schema hermes, hermes.product_image_status, hermes.crm_hoy,
--   hermes.crm_seguimiento, hermes.crm_upsert_seguimiento, vistas de
--   WhatsApp, hermes.hermes_llegadas_pendientes, trigger/canal
--   hermes_llegadas, cierre automático del CRM al facturar, RLS/tenants.
-- Idempotente / re-ejecutable.
-- =====================================================================

DROP VIEW IF EXISTS public.hermes_oportunidades_hoy;
DROP VIEW IF EXISTS public.hermes_oportunidades_comerciales;
DROP VIEW IF EXISTS hermes.oportunidades_hoy;
DROP VIEW IF EXISTS hermes.oportunidades_comerciales;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('rollback_etapa_2_1_oportunidades.sql');
  END IF;
END $$;

-- Verificación: las 4 vistas fuera, lo aprobado intacto
SELECT
  (to_regclass('hermes.oportunidades_comerciales') IS NULL
   AND to_regclass('hermes.oportunidades_hoy') IS NULL
   AND to_regclass('public.hermes_oportunidades_comerciales') IS NULL
   AND to_regclass('public.hermes_oportunidades_hoy') IS NULL)      AS etapa_2_1_eliminada,
  (to_regclass('hermes.product_image_status') IS NOT NULL
   AND to_regclass('hermes.crm_hoy') IS NOT NULL
   AND to_regclass('hermes.crm_seguimiento') IS NOT NULL
   AND to_regclass('hermes.hermes_llegadas_pendientes') IS NOT NULL
   AND to_regprocedure('hermes.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid)') IS NOT NULL
   AND to_regprocedure('public.crm_cerrar_seguimientos_factura(uuid)') IS NOT NULL) AS aprobados_intactos;
-- esperado: true | true
