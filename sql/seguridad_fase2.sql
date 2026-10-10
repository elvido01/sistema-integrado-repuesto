-- =====================================================================
-- SEGURIDAD FASE 2 (plan de comercialización) — 10/10/2026
-- =====================================================================
-- A) Funciones con permisos elevados (SECURITY DEFINER) ejecutables SIN
--    SESIÓN: quedaban 165 tras la fase 1. 63 no verificaban nada (22
--    escriben): vault_buscar / vault_guardar_nota (notas del vault),
--    aplicar_ajuste_mensual, centinelas_ronda, sales_sync_whatsapp_message,
--    get_productos_para_orden_automatica (productos y costos)...
--    Regla nueva: CERRADO POR DEFECTO para anon. Lista blanca (públicas a
--    propósito o que necesitan las reglas de las tablas):
--      login ............ get_empresas_login, get_tenant_por_dominio
--      tienda ........... get_tienda_config, get_productos_tienda,
--                         get_filtros_tienda, get_producto_tienda_por_slug,
--                         registrar_lead_tienda, get_nombres_modelos
--      registro ......... registrar_nueva_empresa
--      promos ........... promos_publicas, promos_publicas_clic
--      reglas RLS/default get_user_tenant, is_superadmin, es_usuario_admin,
--                         get_my_role, get_tenants_documentos
--    Se conserva EXACTAMENTE el acceso de authenticated, service_role y
--    hermes_readonly (se les da explícito lo que tenían vía PUBLIC), salvo
--    18 funciones que solo usan el servidor/cron/Hermes: fuera también para
--    usuarios con sesión (cualquier usuario de otra empresa podía llamarlas).
--    Los disparadores no se afectan (Postgres no revisa EXECUTE al disparar).
--
-- B) 4 funciones que la web/móvil llaman con un tenant por parámetro: se
--    envuelven con _exigir_mi_empresa(p_tenant) (la original pasa a
--    _impl_<nombre>, sin tocar su lógica). Con sesión: solo tu empresa (o
--    superadmin). Servidor/cron/Hermes: pasan.
--
-- C) notificaciones: la política INSERT para PUBLIC (anon) con CHECK (true)
--    y la de authenticated con CHECK (true) → solo para ti, en tu empresa
--    (las dos inserciones de la web son para el propio usuario).
--
-- Respaldo de permisos en seguridad_acl_respaldo. Reversa:
-- sql/seguridad_fase2_revertir.sql. Todo en una transacción.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seguridad_acl_respaldo (
  fase      text NOT NULL,
  firma     text NOT NULL,
  acl       text,
  guardado  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fase, firma)
);
ALTER TABLE public.seguridad_acl_respaldo ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo postgres

-- A) ------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  blanca text[] := ARRAY[
    'get_empresas_login','get_tenant_por_dominio',
    'get_tienda_config','get_productos_tienda','get_filtros_tienda','get_producto_tienda_por_slug',
    'registrar_lead_tienda','get_nombres_modelos','registrar_nueva_empresa',
    'promos_publicas','promos_publicas_clic',
    'get_user_tenant','is_superadmin','es_usuario_admin','get_my_role','get_tenants_documentos'];
  solo_servidor text[] := ARRAY[
    '_ia_conversacion_excluida','_mover_linea_a_suplidor_correcto','ai_resolve_alerts_for_product',
    'aplicar_ajuste_mensual','aplicar_reasignacion_dinamica','centinelas_latido','centinelas_ronda',
    'compromiso_efectivo_pendiente','cron_sugerencias_equivalentes','equipo_revisar_arte',
    'fn_notificar_solicitudes_abiertas_diaria','gestion_cartera_resumen','hermes_colgar_imagen_pendiente',
    'sales_sync_whatsapp_message','suplidor_virtual_expirar_vencidos','vault_buscar','vault_guardar_nota',
    '_agente_acciones_vencer'];
  n_anon int := 0; n_serv int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS firma, p.proname, p.proacl::text AS acl,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT (p.proname = ANY (blanca))
  LOOP
    INSERT INTO public.seguridad_acl_respaldo (fase, firma, acl)
    VALUES ('fase2', r.firma::text, r.acl) ON CONFLICT (fase, firma) DO NOTHING;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, hermes_readonly', r.firma);
    IF r.proname = ANY (solo_servidor) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.firma);
      n_serv := n_serv + 1;
    ELSIF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.firma);
    END IF;
    n_anon := n_anon + 1;
  END LOOP;
  RAISE NOTICE 'Cerradas sin sesión: % (de ellas, también cerradas con sesión: %)', n_anon, n_serv;
END $$;

-- B) ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._exigir_mi_empresa(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Solo se verifica a los usuarios con sesión de la web/móvil. El servidor
  -- (service_role), las tareas (postgres) y Hermes no traen rol 'authenticated'.
  IF coalesce(auth.role(), '') = 'authenticated'
     AND p_tenant IS DISTINCT FROM get_user_tenant()
     AND NOT coalesce(is_superadmin(), false) THEN
    RAISE EXCEPTION 'No autorizado: esa empresa no es la tuya' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._exigir_mi_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._exigir_mi_empresa(uuid) TO authenticated, service_role, hermes_readonly;

ALTER FUNCTION public.ai_business_health_score(uuid) RENAME TO _impl_ai_business_health_score;
CREATE FUNCTION public.ai_business_health_score(p_tenant_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM _exigir_mi_empresa(p_tenant_id);
  RETURN _impl_ai_business_health_score(p_tenant_id);
END $$;

ALTER FUNCTION public.ai_forecast_ventas(uuid) RENAME TO _impl_ai_forecast_ventas;
CREATE FUNCTION public.ai_forecast_ventas(p_tenant_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM _exigir_mi_empresa(p_tenant_id);
  RETURN _impl_ai_forecast_ventas(p_tenant_id);
END $$;

ALTER FUNCTION public.ai_predict_stockouts(uuid, integer) RENAME TO _impl_ai_predict_stockouts;
CREATE FUNCTION public.ai_predict_stockouts(p_tenant_id uuid, p_dias_alerta integer DEFAULT 14)
RETURNS TABLE(producto_id uuid, codigo text, descripcion text, existencia numeric,
              velocidad_diaria numeric, dias_para_agotarse numeric, fecha_estimada_stockout date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM _exigir_mi_empresa(p_tenant_id);
  RETURN QUERY SELECT * FROM _impl_ai_predict_stockouts(p_tenant_id, p_dias_alerta);
END $$;

ALTER FUNCTION public.get_marketing_candidates(uuid, boolean, integer) RENAME TO _impl_get_marketing_candidates;
CREATE FUNCTION public.get_marketing_candidates(p_tenant_id uuid, p_permitir_sin_imagen boolean DEFAULT false, p_limit integer DEFAULT 8)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM _exigir_mi_empresa(p_tenant_id);
  RETURN _impl_get_marketing_candidates(p_tenant_id, p_permitir_sin_imagen, p_limit);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._impl_ai_business_health_score(uuid)', 'public._impl_ai_forecast_ventas(uuid)',
    'public._impl_ai_predict_stockouts(uuid, integer)', 'public._impl_get_marketing_candidates(uuid, boolean, integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, hermes_readonly', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.ai_business_health_score(uuid)', 'public.ai_forecast_ventas(uuid)',
    'public.ai_predict_stockouts(uuid, integer)', 'public.get_marketing_candidates(uuid, boolean, integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, hermes_readonly', f);
  END LOOP;
END $$;

-- C) ------------------------------------------------------------------------
DROP POLICY IF EXISTS notificaciones_insert ON public.notificaciones;   -- PUBLIC, CHECK (true)
DROP POLICY IF EXISTS notif_insert_system   ON public.notificaciones;   -- authenticated, CHECK (true)
DROP POLICY IF EXISTS notificaciones_insert_propia ON public.notificaciones;
CREATE POLICY notificaciones_insert_propia ON public.notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (tenant_id IS NULL OR tenant_id = get_user_tenant()));

COMMIT;

-- Comprobación
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))                       AS abiertas_sin_sesion,
  (SELECT count(*) FROM public.seguridad_acl_respaldo WHERE fase = 'fase2')          AS respaldadas,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'notificaciones' AND cmd = 'INSERT') AS politicas_insert_notif;

SELECT public.registrar_migracion('seguridad_fase2.sql');
