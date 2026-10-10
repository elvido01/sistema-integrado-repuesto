-- =====================================================================
-- SEGURIDAD FASE 1: cerrar las fugas entre empresas encontradas en la
-- auditoría para comercializar MotoFlow (10/10/2026)
-- =====================================================================
-- 1) 40 funciones SECURITY DEFINER recibían el tenant por parámetro, no
--    verificaban quién llamaba y las podía ejecutar ANON (la clave pública
--    que viaja en la web). Comprobado: sin sesión se leían ventas, crédito
--    y morosos de cualquier empresa conociendo su uuid.
--      • 2 son públicas a propósito (página /promos): promos_publicas,
--        promos_publicas_clic → no se tocan.
--      • 4 las llama la web/móvil con sesión → se quita anon/PUBLIC, se
--        deja authenticated (fase 2: validar que el tenant sea el del usuario).
--      • 34 solo las llaman funciones del servidor (service_role), cron
--        (postgres) o Hermes (hermes_readonly) → fuera anon, PUBLIC y
--        authenticated.
--    hermes_readonly las usaba vía PUBLIC: se le da EXECUTE explícito para
--    no cambiarle nada.
--
-- 2) 9 políticas INSERT "WITH CHECK (true)" (restos viejos) anulaban la
--    política por empresa que ya existe al lado (las PERMISSIVE se suman con
--    OR): cualquier usuario con sesión podía insertar facturas, compras,
--    recibos o inventario EN OTRA EMPRESA. Todas esas tablas tienen
--    tenant_id DEFAULT get_user_tenant(), así que la política por empresa
--    deja pasar los inserts normales de la app. brand_kit tenía ALL true:
--    pasa a por empresa. (notificaciones queda para la fase 2: se usa entre
--    empresas y no tiene default.)
--
-- Todo en una transacción: si algo falla, no se aplica nada.
-- =====================================================================

BEGIN;

-- 1) Funciones -----------------------------------------------------------
DO $$
DECLARE
  r record;
  solo_servidor text[] := ARRAY[
    'ai_capture_metrics_snapshot','ai_chat_context_summary','ai_detect_existencia_negativa',
    'ai_detect_facturas_vencidas','ai_detect_productos_lentos','ai_detect_sin_ubicacion',
    'ai_detect_stock_bajo','ai_resolve_stale_inventory_alerts','ai_run_deterministic_alerts',
    'centinela_agotado_sin_pedir','centinela_borrador_olvidado','centinela_camino_fantasma',
    'centinela_canal_mudo','centinela_cierre_no_cuadra','centinela_orden_automatica_muda',
    'centinela_respuesta_no_salio','centinela_roto','centinela_sin_suplidor',
    'centinela_sin_ventas_hoy','centinela_suplidor_no_ha_venido','centinela_venta_bajo_costo',
    'centinela_venta_no_alimento','equipo_avisar_del_borrador','get_compras_summary',
    'get_credito_summary','get_estrategia_summary','get_finanzas_summary',
    'get_inventario_summary','get_marketing_summary','get_operaciones_summary',
    'get_productos_anomalos','get_ventas_summary','hermes_decir','poner_en_borrador_del_suplidor'];
  con_sesion text[] := ARRAY[
    'ai_business_health_score','ai_forecast_ventas','ai_predict_stockouts','get_marketing_candidates'];
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma, p.proname
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = ANY (solo_servidor || con_sesion)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, hermes_readonly', r.firma);
    IF r.proname = ANY (solo_servidor) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.firma);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.firma);
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Funciones cerradas: %', n;
  IF n < 38 THEN
    RAISE EXCEPTION 'Se esperaban al menos 38 firmas y se encontraron %: revisar antes de aplicar', n;
  END IF;
END $$;

-- 2) Políticas INSERT abiertas ----------------------------------------------
DROP POLICY IF EXISTS facturas_auth_insert                   ON public.facturas;
DROP POLICY IF EXISTS facturas_detalle_auth_insert           ON public.facturas_detalle;
DROP POLICY IF EXISTS compras_auth_insert                    ON public.compras;
DROP POLICY IF EXISTS compras_detalle_auth_insert            ON public.compras_detalle;
DROP POLICY IF EXISTS recibos_ingreso_auth_insert            ON public.recibos_ingreso;
DROP POLICY IF EXISTS recibos_ingreso_detalle_auth_insert    ON public.recibos_ingreso_detalle;
DROP POLICY IF EXISTS inventario_movimientos_auth_insert     ON public.inventario_movimientos;
DROP POLICY IF EXISTS solicitudes_clientes_auth_insert       ON public.solicitudes_clientes;
DROP POLICY IF EXISTS "Authenticated users can insert cierres_caja" ON public.cierres_caja;

DROP POLICY IF EXISTS brand_kit_rw_all ON public.brand_kit;
DROP POLICY IF EXISTS brand_kit_tenant ON public.brand_kit;
CREATE POLICY brand_kit_tenant ON public.brand_kit
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant())
  WITH CHECK (tenant_id = get_user_tenant());

COMMIT;

-- Comprobación: ninguna de esas funciones debe quedar ejecutable por anon.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion,
       has_function_privilege('hermes_readonly', p.oid, 'EXECUTE') AS hermes
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname ~ '^(ai_|centinela_|get_.*_summary$|get_productos_anomalos|get_marketing_candidates|hermes_decir|poner_en_borrador_del_suplidor|equipo_avisar_del_borrador)'
 ORDER BY anon DESC, p.proname;

SELECT public.registrar_migracion('seguridad_fase1_cerrar_fugas.sql');
