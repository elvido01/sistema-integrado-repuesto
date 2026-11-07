-- =====================================================================
-- Recordatorios de pago por WhatsApp del colegio (07/11/2026)
-- ---------------------------------------------------------------------
-- Plan EDUCA PRO y EDUCA TOTAL. Reusa la Gestión de Cobro de la extensión
-- de WhatsApp (la de MotoPréstamos): misma lista, mismo "pegar en el chat
-- y presionar Enter", mismo historial (cobro_gestiones) y "Para reenviar"
-- (cobranza_seguimiento). Esta función arma la lista del colegio:
--   · Atrasados: la familia con cargos vencidos (mensualidades, recargos…).
--   · Recordatorio: la familia al día cuya mensualidad vence en 0 a 3 días
--     (sale una vez por mes: al enviarlo queda en cobro_gestiones).
-- Una fila por FAMILIA (al padre se le escribe por todos sus hijos), con el
-- mensaje ya armado (nombres, meses, montos, recargo).
-- Devuelve NULL si la empresa no es un colegio (la extensión sigue con la
-- cobranza normal). Si el plan no lo incluye, lista vacía con el aviso.
-- No es STABLE: crea el cliente de la familia que todavía no lo tiene
-- (cobro_gestiones y cobranza_seguimiento van por cliente).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_cobro_colegio_extension()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_empresa text; v_plan text; v_corte time := '17:50';
  cfg public.edu_config%ROWTYPE;
  f record; v_cli uuid; v_clientes json;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa del usuario'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = v_t AND tipo_negocio = 'educativo') THEN
    RETURN NULL;
  END IF;
  SELECT nombre, COALESCE(cobranza_hora_corte, '17:50') INTO v_empresa, v_corte
    FROM public.config_empresa WHERE tenant_id = v_t ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  SELECT pl.nombre INTO v_plan
    FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
   WHERE s.tenant_id = v_t ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC LIMIT 1;
  IF upper(COALESCE(v_plan, '')) NOT IN ('EDUCA PRO', 'EDUCA TOTAL')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN
    RETURN json_build_object('tipo_cobranza', 'colegio', 'empresa_nombre', COALESCE(v_empresa, 'el colegio'), 'plantilla', NULL,
      'aviso', 'Los recordatorios de pago por WhatsApp son de los planes Educa Pro y Educa Total.', 'clientes', '[]'::json);
  END IF;
  SELECT * INTO cfg FROM public.edu_config WHERE tenant_id = v_t;

  -- Cliente de cada familia con algo que cobrar (igual que edu_cobrar).
  FOR f IN
    SELECT DISTINCT fa.* FROM public.edu_familias fa
      JOIN public.edu_estudiantes e ON e.familia_id = fa.id
      JOIN public.edu_cargos c ON c.estudiante_id = e.id
     WHERE fa.tenant_id = v_t AND c.estado IN ('pendiente', 'parcial') AND c.vence IS NOT NULL AND c.vence <= v_hoy + 3
       AND (fa.cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = fa.cliente_id AND tenant_id = v_t))
  LOOP
    INSERT INTO public.clientes (tenant_id, nombre, telefono)
    VALUES (v_t, left(COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, ''), 'Familia ' || f.nombre)
                      || ' (Fam. ' || f.nombre || ')', 160),
            COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, '')))
    RETURNING id INTO v_cli;
    UPDATE public.edu_familias SET cliente_id = v_cli WHERE id = f.id;
  END LOOP;

  WITH pend AS (
    SELECT fa.id AS familia_id, fa.cliente_id,
           COALESCE(NULLIF(fa.tutor_nombre, ''), NULLIF(fa.madre_nombre, ''), NULLIF(fa.padre_nombre, ''), 'Familia ' || fa.nombre) AS tutor,
           COALESCE(NULLIF(fa.tutor_telefono, ''), NULLIF(fa.madre_celular, ''), NULLIF(fa.padre_celular, '')) AS telefono,
           c.id AS cargo_id, c.tipo, c.descripcion, c.moneda, c.vence, c.periodo,
           split_part(e.nombres, ' ', 1) AS hijo,
           round(c.monto - c.descuento - c.pagado, 2) AS pendiente,
           (v_hoy - c.vence) AS dias
      FROM public.edu_cargos c
      JOIN public.edu_estudiantes e ON e.id = c.estudiante_id
      JOIN public.edu_familias fa ON fa.id = e.familia_id
     WHERE c.tenant_id = v_t AND c.estado IN ('pendiente', 'parcial') AND c.vence IS NOT NULL
       AND c.monto - c.descuento - c.pagado > 0.009 AND c.moneda = 'DOP'
       AND e.estado IN ('activo', 'por_confirmar', 'retirado')
  ),
  venc AS (      -- familias atrasadas
    SELECT familia_id, cliente_id, max(tutor) AS tutor, max(telefono) AS telefono,
           count(*) FILTER (WHERE tipo = 'mensualidad') AS meses, sum(pendiente) AS total, max(dias) AS dias_max,
           string_agg(DISTINCT hijo, ', ') AS hijos,
           json_agg(json_build_object('numero', descripcion || ' · ' || hijo, 'monto_atrasado', pendiente, 'dias_vencida', dias,
                                      'cuota_id', cargo_id, 'fecha_vencimiento', vence) ORDER BY vence, hijo) AS facturas,
           -- "Ana: septiembre, octubre; Luis: octubre" (sin el año ni la palabra Mensualidad).
           (SELECT string_agg(h.hijo || ': ' || h.cosas, '; ' ORDER BY h.hijo)
              FROM (SELECT q.hijo, string_agg(lower(regexp_replace(replace(q.descripcion, 'Mensualidad ', ''), ' \d{4}$', '')), ', ' ORDER BY q.vence) AS cosas
                      FROM pend q WHERE q.familia_id = pend.familia_id AND q.dias > 0 GROUP BY q.hijo) h) AS detalle
      FROM pend WHERE dias > 0 GROUP BY familia_id, cliente_id
  ),
  prox AS (      -- al día, con mensualidad por vencer en 0-3 días
    SELECT p.familia_id, p.cliente_id, max(p.tutor) AS tutor, max(p.telefono) AS telefono,
           min(p.vence) AS vence, sum(p.pendiente) AS total, (array_agg(p.cargo_id ORDER BY p.vence, p.cargo_id))[1] AS cargo_id,
           string_agg(DISTINCT p.hijo, ' y ') AS hijos, max(p.descripcion) AS descripcion,
           json_agg(json_build_object('numero', p.descripcion || ' · ' || p.hijo, 'monto_atrasado', p.pendiente, 'dias_vencida', 0,
                                      'cuota_id', p.cargo_id, 'fecha_vencimiento', p.vence) ORDER BY p.hijo) AS facturas
      FROM pend p
     WHERE p.tipo = 'mensualidad' AND p.dias BETWEEN -3 AND 0
       AND NOT EXISTS (SELECT 1 FROM venc v WHERE v.familia_id = p.familia_id)
     GROUP BY p.familia_id, p.cliente_id
  ),
  pagos AS (
    SELECT r.cliente_id, max(r.created_at) AS ultimo_created,
           (array_agg(r.fecha ORDER BY r.fecha DESC, r.created_at DESC))[1] AS ultima_fecha,
           (array_agg(r.monto_pagado ORDER BY r.fecha DESC, r.created_at DESC))[1] AS ultimo_monto,
           count(*) FILTER (WHERE r.fecha >= v_hoy - 15)::int AS pagos15
      FROM public.recibos_ingreso r
     WHERE r.tenant_id = v_t AND COALESCE(r.anulado, false) = false
     GROUP BY r.cliente_id
  ),
  filas AS (
    SELECT v.cliente_id, v.tutor, v.telefono, v.meses::int AS cuotas, round(v.total, 2) AS total, v.dias_max, v.facturas,
           false AS recordatorio, NULL::uuid AS cargo_id, NULL::date AS vence,
           'Hola ' || v.tutor || '. Le saluda ' || COALESCE(v_empresa, 'el colegio') || '. Su cuenta tiene pendiente: ' || v.detalle
             || '. Total: RD$ ' || to_char(v.total, 'FM999,999,990.00')
             || '. Favor pasar por caja a ponerse al día'
             || CASE WHEN COALESCE(cfg.recargo_monto, 0) > 0 THEN ' y evitar más recargos' ELSE '' END
             || '. Si ya pagó, ignore este mensaje. Este es un mensaje automático del sistema. Gracias.' AS mensaje
      FROM venc v
    UNION ALL
    SELECT x.cliente_id, x.tutor, x.telefono, 1, round(x.total, 2), 0, x.facturas, true, x.cargo_id, x.vence,
           'Hola ' || x.tutor || '. Le saluda ' || COALESCE(v_empresa, 'el colegio') || '. Le recordamos que la '
             || replace(lower(regexp_replace(x.descripcion, ' \d{4}$', '')), 'mensualidad ', 'mensualidad de ') || ' de ' || x.hijos
             || CASE WHEN x.vence = v_hoy THEN ' vence hoy' ELSE ' vence el ' || to_char(x.vence, 'DD/MM') END
             || ': RD$ ' || to_char(x.total, 'FM999,999,990.00') || '.'
             || CASE WHEN COALESCE(cfg.recargo_monto, 0) > 0
                     THEN ' Pagando a tiempo evita el recargo de RD$ ' || to_char(cfg.recargo_monto, 'FM999,999,990.00') || '.' ELSE '' END
             || ' Este es un mensaje automático del sistema. Gracias.'
      FROM prox x
     -- El recordatorio sale una vez: al enviarlo queda registrado con ese cargo.
     WHERE NOT EXISTS (SELECT 1 FROM public.cobro_gestiones g
                        WHERE g.cliente_id = x.cliente_id AND g.tipo = 'mensaje_enviado'
                          AND g.metadata->>'recordatorio_pago' = 'true'
                          AND g.metadata->>'recordatorio_cuota_id' = x.cargo_id::text)
  )
  SELECT json_agg(json_build_object(
           'tipo_cobranza', 'colegio',
           'case_id', COALESCE(fl.cargo_id::text, fl.cliente_id::text),
           'cliente_id', fl.cliente_id,
           'cliente_nombre', fl.tutor,
           'cliente_telefono', COALESCE(fl.telefono, c.telefono),
           'cuotas_atrasadas', fl.cuotas,
           'pagos_vencidos_equivalentes', fl.cuotas,
           'total_atrasado', fl.total,
           'dias_mas_vencido', fl.dias_max,
           'facturas', fl.facturas,
           'mensaje', fl.mensaje,
           'recordatorio_pago', fl.recordatorio,
           'recordatorio_cuota_id', fl.cargo_id,
           'recordatorio_fecha_vencimiento', fl.vence,
           'seg_estado', CASE WHEN pc.cumplida THEN 'pendiente' ELSE COALESCE(s.estado, 'pendiente') END,
           'seg_fecha', CASE WHEN pc.cumplida THEN NULL ELSE s.fecha_promesa END,
           'seg_nota', s.nota,
           'ultimo_pago_fecha', p.ultima_fecha,
           'ultimo_pago_monto', p.ultimo_monto,
           'pagos15_count', COALESCE(p.pagos15, 0),
           'ultimo_envio', s.ultimo_envio,
           'por_reenviar', (NOT fl.recordatorio AND s.ultimo_envio IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso r WHERE r.cliente_id = fl.cliente_id
                              AND COALESCE(r.anulado, false) = false AND r.created_at >= s.ultimo_envio)
             AND (COALESCE(s.fecha_promesa, s.ultimo_envio::date) < v_hoy
                  OR (COALESCE(s.fecha_promesa, s.ultimo_envio::date) = v_hoy
                      AND (now() AT TIME ZONE 'America/Santo_Domingo')::time >= v_corte)))
         ) ORDER BY fl.recordatorio, fl.dias_max DESC, fl.total DESC)
    INTO v_clientes
    FROM filas fl
    JOIN public.clientes c ON c.id = fl.cliente_id AND c.tenant_id = v_t
    LEFT JOIN public.cobranza_seguimiento s ON s.cliente_id = fl.cliente_id AND s.tenant_id = v_t
    LEFT JOIN pagos p ON p.cliente_id = fl.cliente_id
   CROSS JOIN LATERAL (SELECT (COALESCE(s.estado, '') = 'cliente_vendra' AND p.ultimo_created IS NOT NULL
                               AND s.updated_at IS NOT NULL AND p.ultimo_created >= s.updated_at) AS cumplida) pc
   -- Prometió venir en una fecha futura: se esconde hasta ese día (si no ha pagado).
   WHERE NOT (COALESCE(s.estado, '') = 'cliente_vendra' AND s.fecha_promesa IS NOT NULL
              AND s.fecha_promesa > v_hoy AND NOT pc.cumplida);

  RETURN json_build_object('tipo_cobranza', 'colegio', 'empresa_nombre', COALESCE(v_empresa, 'el colegio'),
                           'plantilla', NULL, 'clientes', COALESCE(v_clientes, '[]'::json));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_cobro_colegio_extension() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cobro_colegio_extension() TO authenticated;

SELECT public.registrar_migracion('centros_educativos_recordatorios.sql');
