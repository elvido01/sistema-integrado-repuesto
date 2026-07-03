-- =====================================================================
-- WhatsApp Extension -> Gestion de Cobro
-- ---------------------------------------------------------------------
-- Devuelve la lista usando la misma logica operativa del modulo
-- GestionCobroPage: cuotas vencidas con 3 dias de gracia, interes corriente
-- equivalente, promesas, mandados a buscar, respuestas y pagos recientes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gestion_cobro_extension()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_empresa text;
  v_plantilla text;
  v_corte time := '17:50';
  v_today date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_now_time time := (now() AT TIME ZONE 'America/Santo_Domingo')::time;
  v_clientes json;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre), ce.plantilla_cobro, COALESCE(ce.cobranza_hora_corte, '17:50')
    INTO v_empresa, v_plantilla, v_corte
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
  LIMIT 1;

  WITH cuotas_base AS (
    SELECT
      p.id AS prestamo_id,
      regexp_replace(p.numero::text, '^(PT-[0-9]+)-2[0-9]+$', '\1', 'i') AS prestamo_numero,
      p.cliente_id,
      p.tipo,
      p.garantia,
      p.fecha_inicio,
      p.tasa_interes,
      q.id AS cuota_id,
      q.numero_cuota,
      q.fecha_vencimiento,
      q.capital,
      q.interes,
      q.capital_pagado,
      q.interes_pagado,
      GREATEST(
        COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
        - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
        0
      ) AS pendiente,
      GREATEST(COALESCE(q.capital, 0) - COALESCE(q.capital_pagado, 0), 0) AS capital_pend
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q
      ON q.prestamo_id = p.id
     AND q.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.estado = 'activo'
      AND p.cliente_id IS NOT NULL
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  vencidas AS (
    SELECT *
    FROM cuotas_base
    WHERE pendiente > 0
      AND (v_today - fecha_vencimiento) > 3
  ),
  recordatorios_dia3 AS (
    SELECT *
    FROM cuotas_base qb
    WHERE qb.pendiente > 0
      AND (v_today - qb.fecha_vencimiento) = 3
      AND NOT EXISTS (
        SELECT 1
        FROM public.cobro_gestiones g
        WHERE g.tenant_id = v_tenant
          AND g.cliente_id = qb.cliente_id
          AND g.tipo = 'mensaje_enviado'
          AND COALESCE(g.metadata->>'recordatorio_pago', 'false') = 'true'
          AND g.metadata->>'recordatorio_cuota_id' = qb.cuota_id::text
      )
  ),
  interes_corriente AS (
    SELECT
      prestamo_id,
      MAX(prestamo_numero) AS prestamo_numero,
      MAX(cliente_id) AS cliente_id,
      MAX(tipo) AS tipo,
      MAX(garantia) AS garantia,
      SUM(capital_pend) AS capital_base,
      MAX(fecha_vencimiento) FILTER (WHERE COALESCE(interes, 0) > 0) AS ultimo_interes_venc,
      MAX(COALESCE(tasa_interes, 0)) AS tasa_interes
    FROM cuotas_base
    GROUP BY prestamo_id
  ),
  prestamos_atrasados AS (
    SELECT
      COALESCE(v.prestamo_id, ic.prestamo_id) AS prestamo_id,
      COALESCE(MAX(v.prestamo_numero), MAX(ic.prestamo_numero)) AS prestamo_numero,
      COALESCE(MAX(v.cliente_id), MAX(ic.cliente_id)) AS cliente_id,
      COALESCE(MAX(v.tipo), MAX(ic.tipo)) AS tipo,
      COALESCE(MAX(v.garantia), MAX(ic.garantia)) AS garantia,
      COUNT(v.fecha_vencimiento)::int AS cuotas_vencidas,
      CASE
        WHEN MAX(COALESCE(ic.capital_base, 0)) > 0
         AND MAX(COALESCE(ic.tasa_interes, 0)) > 0
         AND MAX(ic.ultimo_interes_venc) IS NOT NULL
         AND MAX(ic.ultimo_interes_venc) < v_today
        THEN 1 ELSE 0
      END AS interes_equivalente,
      COALESCE(SUM(v.pendiente), 0) AS monto_vencido,
      COALESCE(MAX(v_today - v.fecha_vencimiento), 0)::int AS dias_atraso,
      false AS recordatorio_pago,
      NULL::uuid AS recordatorio_cuota_id,
      NULL::date AS recordatorio_fecha_vencimiento
    FROM vencidas v
    FULL JOIN interes_corriente ic
      ON ic.prestamo_id = v.prestamo_id
    GROUP BY COALESCE(v.prestamo_id, ic.prestamo_id)
  ),
  base AS (
    SELECT *
    FROM prestamos_atrasados
    WHERE (cuotas_vencidas + interes_equivalente) > 0
      AND cliente_id IS NOT NULL
  ),
  recordatorios AS (
    SELECT
      r.prestamo_id,
      MAX(r.prestamo_numero) AS prestamo_numero,
      MAX(r.cliente_id) AS cliente_id,
      MAX(r.tipo) AS tipo,
      MAX(r.garantia) AS garantia,
      COUNT(*)::int AS cuotas_vencidas,
      0 AS interes_equivalente,
      COALESCE(SUM(r.pendiente), 0) AS monto_vencido,
      3 AS dias_atraso,
      true AS recordatorio_pago,
      (array_agg(r.cuota_id ORDER BY r.fecha_vencimiento, r.numero_cuota))[1] AS recordatorio_cuota_id,
      MIN(r.fecha_vencimiento) AS recordatorio_fecha_vencimiento
    FROM recordatorios_dia3 r
    -- "Aviso temprano" es SOLO para prestamos que NO son morosos: si el
    -- prestamo ya tiene cuotas de mas de 3 dias o interes corriente (esta en
    -- 'base'), es un moroso normal, no un recordatorio de 3 dias. Espeja el
    -- !isCasoAtrasado de GestionCobroPage: isRecordatorioPago = !isCasoAtrasado.
    WHERE NOT EXISTS (SELECT 1 FROM base b WHERE b.prestamo_id = r.prestamo_id)
    GROUP BY r.prestamo_id
    HAVING COUNT(*) = 1
  ),
  casos AS (
    SELECT * FROM base
    UNION ALL
    SELECT * FROM recordatorios
  ),
  pagos AS (
    SELECT DISTINCT ON (pp.cliente_id)
      pp.id,
      pp.cliente_id,
      pp.fecha,
      pp.total_pagado,
      pp.cobrador,
      pp.comentarios,
      pp.created_at
    FROM public.prestamo_pagos pp
    WHERE COALESCE(pp.anulado, false) = false
      AND EXISTS (
        SELECT 1
        FROM casos b
        WHERE b.cliente_id = pp.cliente_id
      )
    ORDER BY pp.cliente_id, pp.fecha DESC, pp.created_at DESC
  ),
  pagos15 AS (
    SELECT pp.cliente_id, COUNT(*)::int AS total
    FROM public.prestamo_pagos pp
    WHERE COALESCE(pp.anulado, false) = false
      AND EXISTS (
        SELECT 1
        FROM casos b
        WHERE b.cliente_id = pp.cliente_id
      )
      AND pp.fecha >= (v_today - 15)
    GROUP BY pp.cliente_id
  ),
  promesas AS (
    SELECT DISTINCT ON (g.cliente_id) g.*
    FROM public.cobro_gestiones g
    WHERE g.tenant_id = v_tenant
      AND g.tipo = 'promesa_pago'
      AND estado NOT IN ('cumplida', 'cancelada')
      -- REGLA: si el cliente PAGO despues de registrar la promesa, la promesa
      -- queda cumplida y no debe marcar "Promesa vencida".
      AND NOT EXISTS (
        SELECT 1 FROM public.prestamo_pagos pp
        WHERE pp.cliente_id = g.cliente_id
          AND pp.tenant_id = v_tenant
          AND COALESCE(pp.anulado, false) = false
          AND pp.created_at >= g.created_at
      )
    ORDER BY g.cliente_id, g.created_at DESC
  ),
  fisicas AS (
    SELECT DISTINCT ON (g.cliente_id) g.*
    FROM public.cobro_gestiones g
    WHERE g.tenant_id = v_tenant
      AND g.tipo IN ('mandado_buscar', 'visita')
      AND estado <> 'cerrada'
    ORDER BY g.cliente_id, g.created_at DESC
  ),
  respuestas AS (
    SELECT DISTINCT ON (g.cliente_id) g.*
    FROM public.cobro_gestiones g
    WHERE g.tenant_id = v_tenant
      AND g.tipo IN ('respuesta_cliente', 'llamada')
    ORDER BY g.cliente_id, g.created_at DESC
  ),
  enriquecida AS (
    SELECT
      b.*,
      c.nombre AS cliente_nombre,
      c.telefono AS cliente_telefono,
      c.codigo AS cliente_codigo,
      c.rnc AS cliente_rnc,
      p.fecha AS ultimo_pago_fecha,
      p.total_pagado AS ultimo_pago_monto,
      p.cobrador AS ultimo_pago_cobrador,
      COALESCE(p15.total, 0) AS pagos15_count,
      pr.fecha_promesa,
      pr.monto_promesa,
      pr.nota AS promesa_nota,
      pr.estado AS promesa_estado,
      f.tipo AS fisica_tipo,
      f.estado AS fisica_estado,
      r.tipo AS respuesta_tipo,
      r.estado AS respuesta_estado,
      r.nota AS respuesta_nota
    FROM casos b
    JOIN public.clientes c
      ON c.id = b.cliente_id
     AND c.tenant_id = v_tenant
     AND COALESCE(c.activo, true) = true
    LEFT JOIN pagos p ON p.cliente_id = b.cliente_id
    LEFT JOIN pagos15 p15 ON p15.cliente_id = b.cliente_id
    LEFT JOIN promesas pr ON pr.cliente_id = b.cliente_id
    LEFT JOIN fisicas f ON f.cliente_id = b.cliente_id
    LEFT JOIN respuestas r ON r.cliente_id = b.cliente_id
  )
  SELECT json_agg(
    json_build_object(
      'tipo_cobranza', 'gestion_cobro',
      'case_id', CASE WHEN recordatorio_pago THEN recordatorio_cuota_id ELSE prestamo_id END,
      'prestamo_id', prestamo_id,
      'prestamo_numero', prestamo_numero,
      'recordatorio_pago', recordatorio_pago,
      'recordatorio_cuota_id', recordatorio_cuota_id,
      'recordatorio_fecha_vencimiento', recordatorio_fecha_vencimiento,
      'cliente_id', cliente_id,
      'cliente_nombre', cliente_nombre,
      'cliente_telefono', cliente_telefono,
      'cliente_codigo', cliente_codigo,
      'cliente_rnc', cliente_rnc,
      'cuotas_atrasadas', cuotas_vencidas + interes_equivalente,
      'pagos_vencidos_equivalentes', cuotas_vencidas + interes_equivalente,
      'total_atrasado', ROUND(monto_vencido, 2),
      'dias_mas_vencido', dias_atraso,
      'tiene_promesa', fecha_promesa IS NOT NULL,
      'tiene_gestion_fisica', fisica_tipo IS NOT NULL,
      'tiene_respuesta', respuesta_tipo IS NOT NULL,
      'promesa_vencida', fecha_promesa IS NOT NULL AND fecha_promesa < v_today,
      'promesa_hoy', fecha_promesa IS NOT NULL AND fecha_promesa = v_today,
      'caso_critico', (
        (dias_atraso >= 31 OR monto_vencido >= 15000)
        AND fecha_promesa IS NULL
      ),
      'estado_cobro', CASE
        WHEN recordatorio_pago THEN 'Recordatorio 3 dias'
        WHEN fisica_estado = 'mandado_buscar' THEN 'Mandado a buscar'
        WHEN fecha_promesa IS NOT NULL AND fecha_promesa < v_today THEN 'Promesa vencida'
        WHEN fecha_promesa IS NOT NULL AND fecha_promesa = v_today THEN 'Promesa para hoy'
        WHEN fecha_promesa IS NOT NULL THEN 'Promesa futura'
        WHEN respuesta_tipo IS NOT NULL THEN 'Respondio'
        WHEN (cuotas_vencidas + interes_equivalente) >= 2 THEN 'Moroso'
        ELSE 'Seguimiento'
      END,
      'prioridad', CASE
        WHEN recordatorio_pago THEN 'Baja'
        WHEN dias_atraso >= 31 OR monto_vencido >= 15000 THEN 'Alta'
        WHEN dias_atraso >= 16 OR monto_vencido >= 6000 THEN 'Media'
        ELSE 'Baja'
      END,
      'bucket', CASE
        WHEN dias_atraso >= 31 THEN '31+'
        WHEN dias_atraso >= 16 THEN '16 - 30'
        WHEN dias_atraso >= 8 THEN '8 - 15'
        ELSE '1 - 7'
      END,
      'facturas', json_build_array(json_build_object(
        'numero', prestamo_numero,
        'cuota_id', recordatorio_cuota_id,
        'fecha_vencimiento', recordatorio_fecha_vencimiento,
        'monto_atrasado', ROUND(monto_vencido, 2),
        'dias_vencida', dias_atraso
      )),
      'seg_estado', CASE
        WHEN fisica_estado = 'mandado_buscar' THEN 'ir_a_buscar'
        WHEN fecha_promesa IS NOT NULL THEN 'cliente_vendra'
        ELSE 'pendiente'
      END,
      'seg_fecha', fecha_promesa,
      'monto_promesa', monto_promesa,
      'seg_nota', COALESCE(promesa_nota, respuesta_nota),
      'ultimo_envio', NULL,
      'ultimo_pago', CASE
        WHEN ultimo_pago_fecha IS NULL THEN NULL
        ELSE json_build_object(
          'fecha', ultimo_pago_fecha,
          'total_pagado', ultimo_pago_monto,
          'cobrador', ultimo_pago_cobrador
        )
      END,
      'ultimo_pago_fecha', ultimo_pago_fecha,
      'ultimo_pago_monto', ultimo_pago_monto,
      'pagos15_count', pagos15_count,
      'por_reenviar', false
    )
    ORDER BY dias_atraso DESC, monto_vencido DESC, cliente_nombre
  )
    INTO v_clientes
  FROM enriquecida;

  RETURN json_build_object(
    'tipo_cobranza', 'gestion_cobro',
    'empresa_nombre', COALESCE(v_empresa, 'la empresa'),
    'plantilla', v_plantilla,
    'clientes', COALESCE(v_clientes, '[]'::json)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_cobro_extension() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gestion_cobro_extension() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'whatsapp extension gestion de cobro listo' AS status;
