-- =====================================================================
-- Fase 6 del onboarding (20/11/2026): métricas para el dueño (superadmin)
-- ---------------------------------------------------------------------
-- admin_metricas_onboarding(p_dias) — empresas registradas en los últimos
-- p_dias días:
--   * Indicador de éxito (decisión del dueño 19/11): % de empresas nuevas
--     con PRIMERA VENTA en sus primeros 7 días SIN ESCRIBIR por WhatsApp.
--     Solo cuentan las que ya cumplieron 7 días.
--     "Escribió" = mensaje entrante al WhatsApp de MotoFlow (809-769-5965,
--     SOLO WhatsApp; el 809-390-5965 es de Repuestos Morla; cuenta cuando ese
--     número esté conectado al CRM de alguna empresa con ese teléfono) desde el teléfono que la
--     empresa puso al registrarse, en esos 7 días. Sin teléfono registrado no
--     se puede saber: se cuenta aparte (whatsapp = null), no como "no escribió".
--   * Embudo: registradas → alguien entró → artículo → cliente → venta.
--   * Por empresa: plan, primeros pasos hechos, días a la primera venta,
--     última actividad, pausa.
--   * Guías: cuántos usuarios las vieron ofrecer, empezar, terminar, dejar,
--     y en cuántas no se encontró un paso en pantalla (guía rota).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_metricas_onboarding(p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE
  v_desde   timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_dias, 90), 730)));
  v_tel_mf  text := '8097695965';            -- WhatsApp de MotoFlow (solo WhatsApp)
  v_crm     uuid[];
  v_emp     jsonb;
  v_res     jsonb;
  v_guias   jsonb;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Solo el superadmin.'; END IF;

  -- Empresas cuyo CRM recibe el WhatsApp de MotoFlow.
  SELECT array_agg(ce.tenant_id) INTO v_crm FROM public.config_empresa ce
   WHERE right(regexp_replace(COALESCE(ce.telefono, ''), '\D', '', 'g'), 10) = v_tel_mf;

  WITH emp AS (
    SELECT t.id, t.nombre, t.created_at AS creada,
           ce.tipo_negocio,
           public._plan_vigente(t.id) AS plan,
           NULLIF(right(regexp_replace(COALESCE(ce.telefono, t.telefono, ''), '\D', '', 'g'), 10), '') AS tel,
           (SELECT count(*) FROM public.profiles p WHERE p.tenant_id = t.id) AS usuarios,
           EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
                    WHERE p.tenant_id = t.id AND u.last_sign_in_at IS NOT NULL) AS entro,
           EXISTS (SELECT 1 FROM public.productos pr WHERE pr.tenant_id = t.id AND COALESCE(pr.codigo, '') <> 'SERV-GENERAL') AS con_producto,
           EXISTS (SELECT 1 FROM public.clientes c WHERE c.tenant_id = t.id) AS con_cliente,
           (SELECT min(f.created_at) FROM public.facturas f
             WHERE f.tenant_id = t.id AND NOT COALESCE(f.es_saldo_inicial, false)
               AND upper(COALESCE(f.estado, '')) <> 'ANULADA') AS primera_venta,
           a.ultima AS ultima_actividad, a.pausada_at
      FROM public.tenants t
      LEFT JOIN public.config_empresa ce ON ce.tenant_id = t.id
      LEFT JOIN public.tenant_actividad a ON a.tenant_id = t.id
     WHERE t.created_at >= v_desde
       AND NOT (t.id = ANY (COALESCE(v_crm, '{}')))
  ), emp2 AS (
    SELECT e.*,
           now() - e.creada >= interval '7 days' AS madura,
           e.primera_venta IS NOT NULL AND e.primera_venta <= e.creada + interval '7 days' AS venta_7d,
           CASE WHEN v_crm IS NULL OR e.tel IS NULL OR length(e.tel) < 10 THEN NULL
                ELSE EXISTS (
                  SELECT 1 FROM public.crm_whatsapp_messages m
                    JOIN public.crm_whatsapp_contacts ct ON ct.id = m.contact_id
                   WHERE m.tenant_id = ANY (COALESCE(v_crm, '{}'))
                     AND m.role = 'user'
                     AND right(regexp_replace(COALESCE(ct.phone, ct.wa_id, ''), '\D', '', 'g'), 10) = e.tel
                     AND m.created_at BETWEEN e.creada AND e.creada + interval '7 days')
           END AS whatsapp_7d,
           COALESCE((SELECT (pp->>'hechos')::int FROM (SELECT private._primeros_pasos(e.id) AS pp) z), 0) AS pasos_hechos,
           COALESCE((SELECT (pp->>'total')::int FROM (SELECT private._primeros_pasos(e.id) AS pp) z), 0) AS pasos_total
      FROM emp e
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'tipo', tipo_negocio, 'plan', plan, 'creada', creada,
      'usuarios', usuarios, 'entro', entro, 'con_producto', con_producto, 'con_cliente', con_cliente,
      'primera_venta', primera_venta,
      'dias_a_venta', CASE WHEN primera_venta IS NULL THEN NULL ELSE round(EXTRACT(EPOCH FROM primera_venta - creada) / 86400.0, 1) END,
      'venta_7d', venta_7d, 'whatsapp_7d', whatsapp_7d, 'madura', madura,
      'pasos_hechos', pasos_hechos, 'pasos_total', pasos_total,
      'ultima_actividad', ultima_actividad, 'pausada', pausada_at IS NOT NULL
    ) ORDER BY creada DESC), '[]'::jsonb),
    jsonb_build_object(
      'registradas', count(*),
      'entraron', count(*) FILTER (WHERE entro),
      'con_producto', count(*) FILTER (WHERE con_producto),
      'con_cliente', count(*) FILTER (WHERE con_cliente),
      'con_venta', count(*) FILTER (WHERE primera_venta IS NOT NULL),
      'maduras', count(*) FILTER (WHERE madura),
      'venta_7d', count(*) FILTER (WHERE madura AND venta_7d),
      'venta_7d_sin_whatsapp', count(*) FILTER (WHERE madura AND venta_7d AND whatsapp_7d IS FALSE),
      'venta_7d_sin_telefono', count(*) FILTER (WHERE madura AND venta_7d AND whatsapp_7d IS NULL),
      'escribieron_7d', count(*) FILTER (WHERE madura AND whatsapp_7d),
      'pausadas', count(*) FILTER (WHERE pausada_at IS NOT NULL),
      'whatsapp_medible', v_crm IS NOT NULL,
      'indicador_pct', CASE WHEN count(*) FILTER (WHERE madura) = 0 THEN NULL
        -- Sin el WhatsApp de MotoFlow conectado al CRM no se sabe quién
        -- escribió: mientras tanto cuenta solo la primera venta en 7 días.
        WHEN v_crm IS NULL THEN round(100.0 * count(*) FILTER (WHERE madura AND venta_7d) / count(*) FILTER (WHERE madura), 1)
        ELSE round(100.0 * count(*) FILTER (WHERE madura AND venta_7d AND whatsapp_7d IS FALSE)
                   / count(*) FILTER (WHERE madura), 1) END)
    INTO v_emp, v_res
    FROM emp2;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'guia'), '[]'::jsonb) INTO v_guias FROM (
    SELECT jsonb_build_object(
      'guia', guia_id,
      'ofrecida',   count(DISTINCT user_id) FILTER (WHERE evento = 'ofrecida'),
      'iniciada',   count(DISTINCT user_id) FILTER (WHERE evento IN ('iniciada', 'reiniciada')),
      'completada', count(DISTINCT user_id) FILTER (WHERE evento = 'completada'),
      'omitida',    count(DISTINCT user_id) FILTER (WHERE evento = 'omitida'),
      'rota',       count(*) FILTER (WHERE evento = 'elemento_no_encontrado'),
      'web',        count(DISTINCT user_id) FILTER (WHERE COALESCE(plataforma, 'web') = 'web'),
      'app',        count(DISTINCT user_id) FILTER (WHERE plataforma = 'app')) AS g
      FROM public.guias_eventos
     WHERE created_at >= v_desde
     GROUP BY guia_id) x;

  RETURN jsonb_build_object('desde', v_desde, 'dias', p_dias, 'resumen', v_res, 'empresas', v_emp, 'guias', v_guias);
END $f$;
REVOKE ALL ON FUNCTION public.admin_metricas_onboarding(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metricas_onboarding(integer) TO authenticated;

COMMIT;

SELECT public.registrar_migracion('metricas_onboarding.sql');
