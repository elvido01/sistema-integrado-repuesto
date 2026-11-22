-- =====================================================================
-- SEGURIDAD FASE 3 — lo que se puede leer SIN SESIÓN (22/11/2026)
-- ---------------------------------------------------------------------
-- El dueño vio un reel ("apps hechas con IA: con la clave pública de
-- Supabase se descarga la lista de clientes si no hay RLS") y pidió revisar.
-- Las 277 tablas tienen RLS. Pero, con SOLO la clave pública (la que va en
-- la web, sin iniciar sesión), se comprobó el 22/11:
--
-- A) 8 VISTAS sin security_invoker: una vista corre con los permisos de su
--    dueño y se salta el RLS. sales_conversations_view daba 964 filas
--    (nombre y teléfono del cliente, último mensaje, cotización); también
--    pagos en divisa, correcciones del OCR (costos), métricas de IA...
--    → security_invoker = true (respeta el RLS de cada tabla: todas filtran
--    por get_user_tenant()) y fuera anon. Solo las usan el CRM (con sesión)
--    y extract-purchase-from-image (service_role, no le afecta).
--
-- B) 34 funciones SECURITY DEFINER sin ninguna verificación, ejecutables
--    sin sesión. vault_buscar devolvía las notas del vault; vault_guardar_
--    nota las escribía; _espejo_ajuste movía inventario; aplicar_ajuste_
--    mensual, centinelas_ronda, confirmar_orden_compra_enviada...
--    La fase 2 (10/10) ya las había cerrado, pero se REVIRTIÓ esa misma
--    tarde (seguridad_fase2_revertir.sql) y no se volvió a aplicar. Lo que
--    probablemente rompió: también se las quitó a los usuarios CON sesión, y
--    el disparador sales_sync_whatsapp_message_trigger (no es definer) llama
--    a sales_sync_whatsapp_message con el rol de quien inserta el mensaje.
--    Esta vez: SOLO se cierra anon/PUBLIC. authenticated, service_role y
--    hermes_readonly conservan lo que tenían (explícito). Única excepción:
--    las del vault, que nadie usa desde la web (las usan los scripts con
--    service_role y Hermes) → fuera también para authenticated.
--    Se dejan abiertas a propósito: las de la tienda, login, registro y
--    promos (lista blanca de la fase 2) y get_stock_actual (las búsquedas
--    de productos, no-definer, la llaman; solo da una existencia por id).
--    Verificado antes: ninguna política, default, vista o función de la
--    web sin sesión las usa; las tareas programadas corren como postgres.
--
-- B2) Ronda 2, ataque simulado: cada una de las ~140 funciones restantes se
--    llamó como anon con el id de Morla (en una transacción deshecha). 58
--    bloquean bien. Otras 12 revisan la empresa solo cuando hay sesión:
--    get_caja_disponible daba la caja (RD$90 mil, ventas 30 días...),
--    get_presupuesto_compras CxC/CxP, sugerir_grupos_por_similitud los
--    grupos; correr_centinelas / recalcular_sugerencias_equivalentes se
--    podían disparar, e ia_ceo_guia_llamar / omni_avisos_ventana_llamar
--    lanzan llamadas a la IA (cuestan dinero). Todas las usa la web CON
--    sesión o las tareas programadas: se cierran igual, solo para anon.
--    Públicas a propósito y comprobadas: edu_sitio_* (página del colegio),
--    registrar_tester_android, las de RLS (get_user_tenant, is_admin...).
--
-- C) Para que no vuelva a pasar con las vistas y tablas NUEVAS: por defecto
--    anon ya no recibe permisos sobre tablas/vistas nuevas en public (el que
--    las necesite sin sesión debe darlas explícito: GRANT SELECT ... TO anon).
--
-- Respaldo de permisos en seguridad_acl_respaldo (fase 'fase3').
-- Reversa: reversas/seguridad_fase3_anon_revertir.sql (fuera de sql/: el 22/11
-- se aplicó sin querer junto con esta y reabrió la fuga).
-- =====================================================================
BEGIN;

-- A) Vistas ---------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['ai_agent_metrics_daily','dgii_callbacks_recientes','sales_conversations_view',
      'suplidor_virtual_resumen','v_ocr_correcciones','v_ocr_lineas_perdidas','v_pagos_divisa_sin_salida',
      'v_venta_tiempos_resumen']
  LOOP
    INSERT INTO public.seguridad_acl_respaldo (fase, firma, acl)
    SELECT 'fase3', 'vista:public.'||v, c.relacl::text FROM pg_class c
     WHERE c.oid = ('public.'||v)::regclass
    ON CONFLICT (fase, firma) DO NOTHING;
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
  END LOOP;
END $$;

-- B) Funciones --------------------------------------------------------------
DO $$
DECLARE
  r record;
  cerrar text[] := ARRAY[
    '_equipo_auto_objetivo','_espejo_ajuste','_espejo_destino','_espejo_etiqueta','_espejo_marca',
    '_espejo_modelo','_espejo_par','_espejo_producto','_espejo_tipo','_ia_conversacion_excluida',
    '_mover_linea_a_suplidor_correcto','ai_resolve_alerts_for_product','aplicar_ajuste_mensual',
    'aplicar_reasignacion_dinamica','cancelar_linea_orden_compra_no_suplida','centinelas_latido',
    'centinelas_ronda','compromiso_efectivo_pendiente','compute_marketing_impact',
    'confirmar_orden_compra_enviada','cron_sugerencias_equivalentes','equipo_revisar_arte',
    'fn_check_creditos_vencidos','fn_notificar_solicitudes_abiertas_diaria','gestion_cartera_resumen',
    'get_productos_para_orden_automatica','get_productos_para_orden_automatica_v2','ia_ceo_guia_llamar',
    'omni_avisos_ventana_llamar','recalcular_estado_recepcion_orden','recalcular_retenciones_factura',
    'sales_sync_whatsapp_message','suplidor_virtual_expirar_vencidos','vault_buscar','vault_guardar_nota',
    -- Ronda 2 (ataque simulado sin sesión): revisan la empresa solo si HAY
    -- sesión; sin sesión, con el id de la empresa, entregaban los datos.
    'get_caja_disponible','get_presupuesto_compras','get_presupuesto_compras_v2',
    'sugerir_grupos_por_similitud','calcular_score_producto_en_grupo','get_demanda_grupo',
    'check_suscripcion_activa','centinelas_avisar','correr_centinelas',
    'recalcular_sugerencias_equivalentes','ia_ceo_guia_llamar','omni_avisos_ventana_llamar'];
  solo_servidor text[] := ARRAY['vault_buscar','vault_guardar_nota'];
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma, p.proname, p.proacl::text AS acl,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY (cerrar)
  LOOP
    INSERT INTO public.seguridad_acl_respaldo (fase, firma, acl)
    VALUES ('fase3', r.firma::text, r.acl) ON CONFLICT (fase, firma) DO NOTHING;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, hermes_readonly', r.firma);
    IF r.proname = ANY (solo_servidor) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.firma);
    ELSIF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.firma);
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Funciones cerradas sin sesión: %', n;
END $$;

-- C) Tablas y vistas nuevas: anon no recibe nada por defecto ---------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

COMMIT;

-- Comprobación (todo debe dar 0 / false)
SELECT jsonb_build_object(
  'vistas_leibles_sin_sesion', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('v','m') AND has_table_privilege('anon', c.oid, 'SELECT')
        AND NOT coalesce((SELECT bool_or(o IN ('security_invoker=true','security_invoker=on')) FROM unnest(c.reloptions) o), false)),
  'funciones_sin_verificar_abiertas', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f' AND p.prorettype <> 'trigger'::regtype
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
        AND p.proname NOT IN ('get_empresas_login','get_tenant_por_dominio','get_tienda_config','get_productos_tienda',
            'get_filtros_tienda','get_producto_tienda_por_slug','registrar_lead_tienda','get_nombres_modelos',
            'promos_publicas','promos_publicas_clic','get_stock_actual')
        AND p.prosrc !~* '(auth\.uid|get_user_tenant|auth\.role|auth\.jwt|request\.jwt|current_user_tenant|es_super_admin|is_super_admin|_exigir|_tenant_del_usuario)'),
  'crm_con_sesion_sigue', has_table_privilege('authenticated', 'public.sales_conversations_view', 'SELECT'),
  'sync_whatsapp_con_sesion_sigue', has_function_privilege('authenticated', 'public.sales_sync_whatsapp_message(uuid)', 'EXECUTE'),
  'tienda_sigue_publica', has_function_privilege('anon', 'public.get_productos_tienda(text,integer,integer,text,text,text,text)', 'EXECUTE'),
  'caja_sin_sesion', has_function_privilege('anon', 'public.get_caja_disponible(uuid,timestamp with time zone)', 'EXECUTE'),
  'caja_con_sesion_sigue', has_function_privilege('authenticated', 'public.get_caja_disponible(uuid,timestamp with time zone)', 'EXECUTE'),
  'vault_sin_sesion', has_function_privilege('anon', 'public.vault_buscar(text,integer)', 'EXECUTE'),
  'hermes_vault', has_function_privilege('hermes_readonly', 'public.vault_buscar(text,integer)', 'EXECUTE')
) AS r;

SELECT public.registrar_migracion('seguridad_fase3_anon.sql');
