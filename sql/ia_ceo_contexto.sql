-- =====================================================================
-- IA CEO · FASE 1: VER TODO EL NEGOCIO (20/10/2026)
-- ---------------------------------------------------------------------
-- El dueño: "entrelazar los datos de todos los submódulos de MOTOFLOW IA
-- CEO para verlo actuar como un CEO". Hasta hoy el CEO solo leía 7
-- resúmenes de agosto (finanzas, inventario, crédito, ventas, compras,
-- marketing, operaciones) y decidía en el aire: "campaña de marketing
-- digital", "liquidar stock muerto"… y llamaba "MotoFlow" a la empresa.
--
-- ia_ceo_contexto(tenant) le junta, en un JSON compacto, lo que hoy ya
-- saben los otros módulos:
--   empresa         nombre y tipo de negocio (repuestos / dealer / financiera)
--   grupo           posición del grupo (Gestión Empresarial IA)
--   publicaciones   qué promoción movió la pieza, por objetivo (Equipo IA)
--   agotados        lo que se vende y se acabó / se está acabando
--   promocionar     lo que conviene anunciar hoy y por qué
--   crm             embudo de 30 días, listos para comprar, casos abiertos,
--                   lo que se perdió por no tenerlo, clientes sin respuesta
--   financiera      cartera, cuotas vencidas y los más atrasados
--   decisiones      las que siguen pendientes (para no repetirlas)
-- Cada bloque va en su propio BEGIN/EXCEPTION: si uno falla, los demás
-- llegan igual y el error se ve en el JSON.
--
-- Las funciones de Equipo IA y Gestión miran la empresa del usuario
-- (get_user_tenant): aquí se mira como el dueño/admin de esa empresa, solo
-- dentro de esta llamada. Solo la puede llamar el servidor (service_role).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ia_ceo_contexto(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_out   jsonb := '{}'::jsonb;
  v_user  uuid;
  v_ok    boolean := false;
  v_tmp   jsonb;
  v_tipo  text;
BEGIN
  SELECT jsonb_build_object('nombre', ce.nombre, 'tipo_negocio', coalesce(ce.tipo_negocio, 'repuestos')),
         coalesce(ce.tipo_negocio, 'repuestos')
    INTO v_tmp, v_tipo
    FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant_id;
  v_out := v_out || jsonb_build_object('empresa', v_tmp);

  -- Mirar como el dueño/admin de esa empresa (solo en esta transacción).
  FOR v_user IN
    SELECT p.id FROM public.profiles p
     WHERE p.tenant_id = p_tenant_id AND p.role IN ('owner', 'admin')
     ORDER BY (p.role = 'owner') DESC, coalesce(p.is_superadmin, false), p.created_at
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    IF public.get_user_tenant() = p_tenant_id THEN v_ok := true; EXIT; END IF;
  END LOOP;

  -- ── Grupo (Gestión Empresarial IA) ─────────────────────────────────
  IF v_ok THEN
    BEGIN
      v_tmp := to_jsonb(public.get_gestion_empresarial_ia(3));
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object(
        'posicion', v_tmp -> 'posicion', 'estado_actual', v_tmp -> 'estado_actual',
        'totales', v_tmp -> 'totales', 'margen_pct', v_tmp -> 'margen_pct',
        'ventas_mes', v_tmp -> 'ventas_mes', 'gasto_diario', v_tmp -> 'gasto_diario',
        'empresas_grupo', v_tmp -> 'empresas_grupo'));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Publicaciones: qué movió la pieza (Equipo IA) ──────────────────
  IF v_ok THEN
    BEGIN
      WITH e AS (SELECT * FROM public.efectividad_publicaciones(30))
      SELECT jsonb_build_object(
        'por_objetivo', (SELECT jsonb_agg(jsonb_build_object('objetivo', objetivo, 'piezas', n,
                           'alcance_prom', alc, 'interacciones_prom', inter, 'uds_vendidas_despues', uds))
                           FROM (SELECT objetivo, count(*) n, round(avg(alcance)) alc, round(avg(interacciones)) inter,
                                        sum(uds_despues) uds FROM e GROUP BY objetivo) o),
        'mejores', (SELECT jsonb_agg(jsonb_build_object('pieza', descripcion, 'publicado', publicado_at::date,
                      'alcance', alcance, 'uds_dia_antes', uds_dia_antes, 'uds_dia_despues', uds_dia_despues))
                      FROM (SELECT * FROM e ORDER BY (uds_dia_despues - uds_dia_antes) DESC, alcance DESC LIMIT 3) m),
        'sin_efecto', (SELECT count(*) FROM e WHERE dias_despues >= 7 AND uds_despues = 0))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('publicaciones', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('publicaciones', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Agotados que se venden y qué promocionar (Equipo IA) ───────────
  -- Solo empresas con Equipo IA (hoy Morla); las demás no lo traen.
  IF v_ok AND public.equipo_ia_permitido() THEN
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'estado', x->>'estado', 'existencia', (x->>'existencia')::numeric,
               'vendidos_30d', (x->>'vendidos_30d')::numeric, 'sugerido_pedir', (x->>'sugerido')::numeric,
               'ya_en_orden', x->'en_orden'->>'numero'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_agotados_que_se_venden(10))) x;
      v_out := v_out || jsonb_build_object('agotados', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('agotados', jsonb_build_object('error', SQLERRM));
    END;
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'existencia', (x->>'existencia')::numeric, 'razon', x->>'razon'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_candidatos_promocion(6))) x;
      v_out := v_out || jsonb_build_object('promocionar', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('promocionar', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── CRM: embudo, listos, casos, perdidos, sin respuesta ────────────
  BEGIN
    SELECT jsonb_build_object(
      'embudo_30d', (SELECT jsonb_object_agg(etapa, n) FROM (
          SELECT coalesce(c.etapa, 'nuevo') etapa, count(*) n FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.last_user_message_at > now() - interval '30 days'
           GROUP BY 1) e),
      'listos_para_comprar', (SELECT jsonb_agg(jsonb_build_object('cliente', nombre, 'canal', platform,
            'quiere', producto, 'desde', desde)) FROM (
          SELECT coalesce(nullif(btrim(c.customer_name), ''), 'cliente') nombre, c.platform,
                 c.clasificacion ->> 'producto' producto, c.etapa_cambiada_at::date desde
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'listo_para_comprar'
             AND c.last_user_message_at > now() - interval '14 days'
           ORDER BY c.last_user_message_at DESC LIMIT 6) l),
      'casos_abiertos', (SELECT jsonb_agg(jsonb_build_object('motivo', k.motivo, 'quiere', k.quiere, 'falta', k.falta))
          FROM (SELECT * FROM public.crm_casos k WHERE k.tenant_id = p_tenant_id AND k.estado = 'abierto'
                 ORDER BY k.creado_at DESC LIMIT 6) k),
      'perdidos_por_no_tenerlo', (SELECT jsonb_agg(jsonb_build_object('pieza', pieza, 'veces', n)) FROM (
          SELECT coalesce(nullif(c.clasificacion ->> 'producto', ''), c.etapa_motivo) pieza, count(*) n
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'perdido'
             AND c.etapa_motivo ILIKE 'No lo tenemos%'
             AND c.etapa_cambiada_at > now() - interval '30 days'
           GROUP BY 1 ORDER BY 2 DESC LIMIT 8) p),
      'esperando_respuesta_mas_1h', (SELECT count(*) FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id
             AND c.last_user_message_at > now() - interval '3 days'
             AND c.last_user_message_at < now() - interval '1 hour'
             AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
             AND coalesce(c.etapa, '') NOT IN ('perdido', 'spam')))
      INTO v_tmp;
    v_out := v_out || jsonb_build_object('crm', v_tmp);
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('crm', jsonb_build_object('error', SQLERRM));
  END;

  -- ── Financiera: cartera y mora ─────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo') THEN
    BEGIN
      WITH venc AS (
        SELECT q.prestamo_id, count(*) cuotas,
               sum(greatest(q.monto_cuota - coalesce(q.capital_pagado, 0) - coalesce(q.interes_pagado, 0), 0)) monto,
               current_date - min(q.fecha_vencimiento) dias
          FROM public.prestamo_cuotas q
          JOIN public.prestamos p ON p.id = q.prestamo_id AND p.estado = 'activo'
         WHERE q.tenant_id = p_tenant_id AND q.estado IN ('pendiente', 'parcial')
           AND q.fecha_vencimiento < current_date
         GROUP BY q.prestamo_id)
      SELECT jsonb_build_object(
        'prestamos_activos', (SELECT count(*) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'capital_prestado_activo', (SELECT round(sum(monto_capital)) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'prestamos_con_atraso', (SELECT count(*) FROM venc),
        'monto_vencido', (SELECT round(sum(monto)) FROM venc),
        'atraso_mas_30_dias', (SELECT count(*) FROM venc WHERE dias > 30),
        'mas_atrasados', (SELECT jsonb_agg(jsonb_build_object('prestamo', p.numero, 'cliente', cl.nombre,
              'cuotas_vencidas', v.cuotas, 'monto', round(v.monto), 'dias', v.dias))
            FROM (SELECT * FROM venc ORDER BY monto DESC LIMIT 6) v
            JOIN public.prestamos p ON p.id = v.prestamo_id
            LEFT JOIN public.clientes cl ON cl.id = p.cliente_id))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('financiera', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('financiera', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Decisiones que siguen pendientes (no repetirlas) ───────────────
  SELECT jsonb_agg(jsonb_build_object('titulo', d.title, 'area', d.area, 'desde', d.created_at::date))
    INTO v_tmp
    FROM (SELECT * FROM public.ai_decisions WHERE tenant_id = p_tenant_id AND status = 'pending'
           ORDER BY created_at DESC LIMIT 10) d;
  v_out := v_out || jsonb_build_object('decisiones_pendientes', coalesce(v_tmp, '[]'::jsonb));

  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.ia_ceo_contexto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_ceo_contexto(uuid) TO service_role;

SELECT public.registrar_migracion('ia_ceo_contexto.sql');
