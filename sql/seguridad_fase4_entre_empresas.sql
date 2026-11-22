-- =====================================================================
-- SEGURIDAD FASE 4 — un usuario CON SESIÓN de otra empresa (22/11/2026)
-- ---------------------------------------------------------------------
-- Ataque simulado: el admin de GRUPO PAMPHILE (otra empresa, sin relación
-- con Morla) con su sesión, pasando ids REALES de Morla a cada función
-- SECURITY DEFINER. Las 249 tablas resistieron (RLS). De 115 funciones, 57
-- lo bloquearon; estas no:
--   LEÍA: salud del negocio (ventas 30 días RD$415 mil), pronóstico de
--   ventas, productos con precio y COSTO para promos, presupuesto de
--   compras (RD$400 mil/mes) y por suplidor, tiempos del suplidor, productos
--   de la orden automática, margen por producto, grupos de equivalentes,
--   caja disponible, plan de la suscripción.
--   CAMBIABA: preferido de un grupo, estado de una orden de compra, códigos
--   y paquetes aprendidos de una compra, corrida de centinelas y de
--   sugerencias de Morla, avisos de crédito vencido de otro usuario.
-- (ai_business_health_score / ai_forecast_ventas / ai_predict_stockouts /
-- get_marketing_candidates ya se habían envuelto el 10/10 en la fase 2,
-- pero esa fase se revirtió.)
--
-- A) Guardias nuevos (en public, pero solo los ejecutan las envolturas,
--    que corren como dueño; nadie desde la web los llama directo):
--    _exigir_acceso_empresa(tenant): a quien llega desde la web/móvil (rol
--    'authenticated' o 'anon') solo lo deja pasar si la empresa es una a la
--    que tiene ACCESO (usuario_alcanza_tenant: la suya, las de
--    usuarios_empresas o superadmin). Así siguen la vista de grupo desde
--    MotoPréstamos y el par Caminero ↔ MotoPréstamos. Sin sesión: nunca.
--    _exigir_mismo_usuario(uid): solo para uno mismo (o superadmin).
--    El servidor (service_role), las tareas (postgres) y Hermes pasan.
--    Empresa NULL (la función usa la tuya) o id que no existe: pasa (la
--    función no encuentra nada).
--
-- B) 22 funciones que usa la web: la original pasa a _impl_<nombre> (sin
--    tocar su lógica) y una envoltura con el mismo nombre, argumentos y
--    resultado verifica la empresa (o la del suplidor, producto, grupo,
--    orden, compra recibido; en fn_check_creditos_vencidos, que sea tu
--    propio usuario) y llama a la original. La envoltura tiene los permisos
--    que tenía la original, MENOS anon (ninguna es pública); la _impl queda
--    solo para servidor/Hermes. Si alguna original no es SECURITY DEFINER,
--    el archivo se aborta (la envoltura definer saltaría su RLS).
--
-- C) 13 funciones internas (espejo de inventario Morla↔Morla Vieja, mover
--    línea de suplidor, retenciones, alertas, seguimientos CRM, objetivo del
--    día): solo las llaman disparadores y funciones definer (corren como
--    dueño). Fuera para usuarios con sesión. _espejo_ajuste con un producto
--    de Morla movía inventario de Morla Vieja. Guardia: si las usa una
--    función no definer, una vista, una política o un default, se aborta.
--
-- Respaldo en seguridad_acl_respaldo (fase 'fase4'), acl =
-- '<tipo>|<roles que podían ejecutar, jsonb>|<proacl original>'.
-- Reversa: reversas/seguridad_fase4_entre_empresas_revertir.sql.
-- =====================================================================
BEGIN;

-- A) Guardias -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._exigir_acceso_empresa(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND p_tenant IS NOT NULL
     AND NOT coalesce(public.usuario_alcanza_tenant(auth.uid(), p_tenant), false) THEN
    RAISE EXCEPTION 'No autorizado: esa empresa no es la tuya' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._exigir_mismo_usuario(p_user uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND p_user IS DISTINCT FROM auth.uid()
     AND NOT coalesce(public.is_superadmin(), false) THEN
    RAISE EXCEPTION 'No autorizado: eso es de otro usuario' USING ERRCODE = '42501';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._exigir_acceso_empresa(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._exigir_mismo_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._exigir_acceso_empresa(uuid) TO service_role, hermes_readonly;
GRANT EXECUTE ON FUNCTION public._exigir_mismo_usuario(uuid) TO service_role, hermes_readonly;

-- B) Envolturas ---------------------------------------------------------------
DO $$
DECLARE
  -- Cada guardia es una llamada; $n = argumento n de la función.
  emp    CONSTANT text := 'public._exigir_acceso_empresa(%s)';
  sup    CONSTANT text := 'public._exigir_acceso_empresa((SELECT x.tenant_id FROM public.proveedores x WHERE x.id = %s))';
  prod   CONSTANT text := 'public._exigir_acceso_empresa((SELECT x.tenant_id FROM public.productos x WHERE x.id = %s))';
  grupo  CONSTANT text := 'public._exigir_acceso_empresa((SELECT x.tenant_id FROM public.producto_grupos x WHERE x.id = %s))';
  orden  CONSTANT text := 'public._exigir_acceso_empresa((SELECT x.tenant_id FROM public.ordenes_compra x WHERE x.id = %s))';
  compra CONSTANT text := 'public._exigir_acceso_empresa((SELECT x.tenant_id FROM public.compras x WHERE x.id = %s))';
  yo     CONSTANT text := 'public._exigir_mismo_usuario(%s)';
  r record; v_oid oid; v_nombre text; v_impl text; v_args text; v_ident text; v_ret text; v_set boolean;
  v_void boolean; v_vol text; v_def boolean; v_llamada text; v_guardias text; v_cuerpo text; v_n int; rol text;
  v_tenia jsonb; total int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.ai_business_health_score(uuid)',                      ARRAY[format(emp, '$1')]),
    ('public.ai_forecast_ventas(uuid)',                            ARRAY[format(emp, '$1')]),
    ('public.ai_predict_stockouts(uuid,integer)',                  ARRAY[format(emp, '$1')]),
    ('public.get_marketing_candidates(uuid,boolean,integer)',      ARRAY[format(emp, '$1')]),
    ('public.get_presupuesto_compras(uuid,integer,numeric)',       ARRAY[format(emp, '$1')]),
    ('public.get_presupuesto_compras_v2(uuid,date)',               ARRAY[format(emp, '$1')]),
    ('public.get_presupuesto_suplidor_auto(uuid,uuid,date)',       ARRAY[format(emp, '$2'), format(sup, '$1')]),
    ('public.get_caja_disponible(uuid,timestamp with time zone)',  ARRAY[format(emp, '$1')]),
    ('public.sugerir_grupos_por_similitud(uuid,numeric,integer)',  ARRAY[format(emp, '$1')]),
    ('public.check_suscripcion_activa(uuid)',                      ARRAY[format(emp, '$1')]),
    ('public.correr_centinelas(uuid,text)',                        ARRAY[format(emp, '$1')]),
    ('public.centinelas_avisar(uuid,boolean)',                     ARRAY[format(emp, '$1')]),
    ('public.recalcular_sugerencias_equivalentes(uuid)',           ARRAY[format(emp, '$1')]),
    ('public.fn_check_creditos_vencidos(uuid)',                    ARRAY[format(yo, '$1')]),
    ('public.get_suplidor_lead_time(uuid)',                        ARRAY[format(sup, '$1')]),
    ('public.get_productos_para_orden_automatica(uuid)',           ARRAY[format(sup, '$1')]),
    ('public.get_productos_para_orden_automatica_v2(uuid)',        ARRAY[format(sup, '$1')]),
    ('public.calcular_score_producto_en_grupo(uuid,uuid)',         ARRAY[format(prod, '$1'), format(grupo, '$2')]),
    ('public.set_preferido_manual(uuid,uuid)',                     ARRAY[format(grupo, '$1'), format(prod, '$2')]),
    ('public.recalcular_estado_recepcion_orden(uuid)',             ARRAY[format(orden, '$1')]),
    ('public.aprender_codigos_de_compra(uuid)',                    ARRAY[format(compra, '$1')]),
    ('public.aprender_paquetes_de_compra(uuid)',                   ARRAY[format(compra, '$1')])
  ) AS t(firma, guardias)
  LOOP
    v_oid := r.firma::regprocedure;
    SELECT p.proname, pg_get_function_arguments(p.oid), pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid), p.proretset, p.prorettype = 'void'::regtype,
           CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
           p.pronargs, p.prosecdef
      INTO v_nombre, v_args, v_ident, v_ret, v_set, v_void, v_vol, v_n, v_def
      FROM pg_proc p WHERE p.oid = v_oid;
    IF NOT v_def THEN
      RAISE EXCEPTION '% no es SECURITY DEFINER: la envoltura saltaría su RLS', r.firma;
    END IF;
    v_impl := '_impl_' || v_nombre;
    IF to_regproc('public.' || v_impl) IS NOT NULL THEN
      RAISE EXCEPTION 'Ya existe public.% (¿fase 4 aplicada a medias?)', v_impl;
    END IF;

    -- Quién podía ejecutarla (para la envoltura y para la reversa).
    SELECT jsonb_object_agg(x, has_function_privilege(x, v_oid, 'EXECUTE'))
      INTO v_tenia FROM unnest(ARRAY['anon','authenticated','service_role','hermes_readonly']) x;
    INSERT INTO public.seguridad_acl_respaldo (fase, firma, acl)
    SELECT 'fase4', r.firma, 'envuelta|' || v_tenia::text || '|' || coalesce(p.proacl::text, '')
      FROM pg_proc p WHERE p.oid = v_oid
    ON CONFLICT (fase, firma) DO NOTHING;

    EXECUTE format('ALTER FUNCTION %s RENAME TO %I', r.firma, v_impl);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', v_impl, v_ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role, hermes_readonly', v_impl, v_ident);

    SELECT string_agg(format('$%s', i), ', ' ORDER BY i) INTO v_llamada FROM generate_series(1, v_n) i;
    SELECT string_agg('  PERFORM ' || g || ';', E'\n') INTO v_guardias FROM unnest(r.guardias) g;
    v_cuerpo := E'#variable_conflict use_column\nBEGIN\n' || v_guardias || E'\n' ||
      CASE WHEN v_set  THEN format('  RETURN QUERY SELECT * FROM public.%I(%s);', v_impl, coalesce(v_llamada, ''))
           WHEN v_void THEN format(E'  PERFORM public.%I(%s);\n  RETURN;', v_impl, coalesce(v_llamada, ''))
           ELSE format('  RETURN public.%I(%s);', v_impl, coalesce(v_llamada, '')) END
      || E'\nEND';
    EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER '
                   'SET search_path TO ''public'' AS %L',
                   v_nombre, v_args, v_ret, v_vol, v_cuerpo);
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.firma,
      'Seguridad fase 4 (22/11/2026): verifica la empresa (o el usuario) y llama a ' || v_impl || '.');

    -- Permisos: los de la original, menos anon.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, hermes_readonly', r.firma);
    FOREACH rol IN ARRAY ARRAY['authenticated','service_role','hermes_readonly'] LOOP
      IF (v_tenia ->> rol)::boolean THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', r.firma, rol);
      END IF;
    END LOOP;
    total := total + 1;
  END LOOP;
  RAISE NOTICE 'Envueltas: %', total;
END $$;

-- C) Internas: fuera para usuarios con sesión ---------------------------------
DO $$
DECLARE
  r record; f text; v_tenia jsonb;
  internas text[] := ARRAY['_espejo_ajuste','_espejo_producto','_espejo_marca','_espejo_modelo','_espejo_tipo',
    '_espejo_destino','_espejo_etiqueta','_espejo_par','_mover_linea_a_suplidor_correcto',
    'recalcular_retenciones_factura','ai_resolve_alerts_for_product','crm_cerrar_seguimientos_factura',
    '_equipo_auto_objetivo'];
BEGIN
  -- Guardia: si algo que corre con el rol del usuario las usa, fallaría.
  SELECT string_agg(quien || ' -> ' || i, ', ') INTO f FROM (
      SELECT q.oid::regprocedure::text AS quien, coalesce(q.prosrc, '') || ' ' || coalesce(pg_get_function_sqlbody(q.oid), '') AS txt
        FROM pg_proc q JOIN pg_namespace ns ON ns.oid = q.pronamespace
       WHERE ns.nspname IN ('public','private','hermes') AND NOT q.prosecdef
      UNION ALL
      SELECT 'vista ' || schemaname || '.' || viewname, definition FROM pg_views WHERE schemaname IN ('public','hermes')
      UNION ALL
      SELECT 'política ' || tablename || '.' || policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') FROM pg_policies
      UNION ALL
      SELECT 'default ' || d.adrelid::regclass::text, pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d
    ) s, unnest(internas) i
   WHERE s.txt ~ ('\m' || i || '\M') AND s.quien NOT LIKE ('public.' || i || '(%');
  IF f IS NOT NULL THEN RAISE EXCEPTION 'Las usa algo que corre con el rol del usuario: %', f; END IF;

  FOR r IN SELECT p.oid, p.oid::regprocedure AS firma, p.proacl::text AS acl
             FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE ns.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY (internas)
  LOOP
    SELECT jsonb_object_agg(x, has_function_privilege(x, r.oid, 'EXECUTE'))
      INTO v_tenia FROM unnest(ARRAY['anon','authenticated','service_role','hermes_readonly']) x;
    INSERT INTO public.seguridad_acl_respaldo (fase, firma, acl)
    VALUES ('fase4', r.firma::text, 'interna|' || v_tenia::text || '|' || coalesce(r.acl, ''))
    ON CONFLICT (fase, firma) DO NOTHING;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, hermes_readonly', r.firma);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Comprobación: todo true
SELECT jsonb_build_object(
  'envolturas_22', (SELECT count(*) = 22 FROM public.seguridad_acl_respaldo s
                     WHERE s.fase = 'fase4' AND s.acl LIKE 'envuelta|%'
                       AND to_regprocedure(s.firma) IS NOT NULL
                       AND to_regprocedure('public._impl_' || substr(s.firma, 8)) IS NOT NULL
                       AND NOT has_function_privilege('anon', s.firma::regprocedure, 'EXECUTE')),
  'internas_cerradas_con_sesion', (SELECT bool_and(NOT has_function_privilege('authenticated', s.firma::regprocedure, 'EXECUTE'))
                     FROM public.seguridad_acl_respaldo s WHERE s.fase = 'fase4' AND s.acl LIKE 'interna|%'),
  'web_sigue_pudiendo', has_function_privilege('authenticated', 'public.get_presupuesto_suplidor_auto(uuid,uuid,date)', 'EXECUTE'),
  'impl_cerrada_con_sesion', NOT has_function_privilege('authenticated', 'public._impl_get_presupuesto_suplidor_auto(uuid,uuid,date)', 'EXECUTE'),
  'anon_cerrado', NOT has_function_privilege('anon', 'public.get_caja_disponible(uuid,timestamp with time zone)', 'EXECUTE')
) AS r;

SELECT public.registrar_migracion('seguridad_fase4_entre_empresas.sql');
