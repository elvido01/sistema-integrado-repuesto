-- =====================================================================
-- REVERSA de seguridad_fase1_cerrar_fugas.sql (SOLO si algo se rompe)
-- =====================================================================
-- Devuelve los permisos exactamente como estaban el 10/10/2026: EXECUTE a
-- PUBLIC, anon y authenticated en las 38 funciones, y las 9 políticas INSERT
-- abiertas + brand_kit abierto. Reabre la fuga: usarla solo para salir de
-- un apuro y avisar para corregir el punto exacto que falló.
-- =====================================================================

BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname = ANY (ARRAY[
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
         'get_productos_anomalos','get_ventas_summary','hermes_decir','poner_en_borrador_del_suplidor',
         'ai_business_health_score','ai_forecast_ventas','ai_predict_stockouts','get_marketing_candidates'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated, service_role', r.firma);
  END LOOP;
END $$;

CREATE POLICY facturas_auth_insert ON public.facturas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY facturas_detalle_auth_insert ON public.facturas_detalle FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY compras_auth_insert ON public.compras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY compras_detalle_auth_insert ON public.compras_detalle FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY recibos_ingreso_auth_insert ON public.recibos_ingreso FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY recibos_ingreso_detalle_auth_insert ON public.recibos_ingreso_detalle FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY inventario_movimientos_auth_insert ON public.inventario_movimientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY solicitudes_clientes_auth_insert ON public.solicitudes_clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert cierres_caja" ON public.cierres_caja FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS brand_kit_tenant ON public.brand_kit;
CREATE POLICY brand_kit_rw_all ON public.brand_kit FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

SELECT public.registrar_migracion('seguridad_fase1_revertir.sql');
