-- =====================================================================
-- WhatsApp Extension -> Lista de deuda para financiera
-- ---------------------------------------------------------------------
-- Devuelve la misma forma que get_clientes_morosos(), pero calculada desde
-- prestamos/prestamo_cuotas. La extension puede usarla sin depender del
-- nombre comercial en config_empresa ni de consultas directas a varias tablas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_clientes_morosos_financiera()
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
      p.fecha_inicio,
      p.tasa_interes,
      q.fecha_vencimiento,
      q.capital,
      q.interes,
      q.capital_pagado,
      q.interes_pagado,
      GREATEST(COALESCE(q.capital, 0) - COALESCE(q.capital_pagado, 0), 0) AS capital_pend,
      GREATEST(COALESCE(q.interes, 0) - COALESCE(q.interes_pagado, 0), 0) AS interes_pend,
      GREATEST(
        COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
        - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
        0
      ) AS pendiente
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
  interes_corriente AS (
    SELECT
      prestamo_id,
      MAX(prestamo_numero) AS prestamo_numero,
      -- max(uuid) NO existe en Postgres: vía texto
      MIN(cliente_id::text)::uuid AS cliente_id,
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
      COALESCE(MAX(v.cliente_id::text), MAX(ic.cliente_id::text))::uuid AS cliente_id,
      COUNT(v.fecha_vencimiento)::int AS cuotas_vencidas,
      CASE
        WHEN MAX(COALESCE(ic.capital_base, 0)) > 0
         AND MAX(COALESCE(ic.tasa_interes, 0)) > 0
         AND MAX(ic.ultimo_interes_venc) IS NOT NULL
         AND MAX(ic.ultimo_interes_venc) < v_today
        THEN 1 ELSE 0
      END AS interes_equivalente,
      COALESCE(SUM(v.pendiente), 0) AS monto_vencido,
      GREATEST(
        COALESCE(MAX(v_today - v.fecha_vencimiento), 0),
        COALESCE(MAX(v_today - ic.ultimo_interes_venc), 0)
      )::int AS dias_atraso
    FROM vencidas v
    FULL JOIN interes_corriente ic
      ON ic.prestamo_id = v.prestamo_id
    GROUP BY COALESCE(v.prestamo_id, ic.prestamo_id)
  ),
  prestamos_filtrados AS (
    SELECT *
    FROM prestamos_atrasados
    WHERE (cuotas_vencidas + interes_equivalente) > 0
      AND cliente_id IS NOT NULL
  ),
  prestamos_por_cliente AS (
    SELECT
      cliente_id,
      prestamo_numero,
      SUM(cuotas_vencidas + interes_equivalente)::int AS pagos_equivalentes,
      ROUND(SUM(monto_vencido), 2) AS monto_vencido,
      MAX(dias_atraso)::int AS dias_atraso
    FROM prestamos_filtrados
    GROUP BY cliente_id, prestamo_numero
  ),
  agg AS (
    SELECT
      cliente_id,
      SUM(pagos_equivalentes)::int AS cuotas,
      ROUND(SUM(monto_vencido), 2) AS total,
      MAX(dias_atraso)::int AS dias_max,
      json_agg(
        json_build_object(
          'numero', prestamo_numero,
          'monto_atrasado', monto_vencido,
          'dias_vencida', dias_atraso
        ) ORDER BY dias_atraso DESC, prestamo_numero
      ) AS prestamos
    FROM prestamos_por_cliente
    GROUP BY cliente_id
  )
  SELECT json_agg(
    json_build_object(
      'tipo_cobranza',    'financiera',
      'cliente_id',       a.cliente_id,
      'cliente_nombre',   c.nombre,
      'cliente_telefono', c.telefono,
      'cuotas_atrasadas', a.cuotas,
      'total_atrasado',   a.total,
      'dias_mas_vencido', a.dias_max,
      'facturas',         a.prestamos,
      'seg_estado',       COALESCE(s.estado, 'pendiente'),
      'seg_fecha',        s.fecha_promesa,
      'seg_nota',         s.nota,
      'ultimo_envio',     s.ultimo_envio,
      'por_reenviar',     (
        s.ultimo_envio IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.prestamo_pagos pp
          WHERE pp.cliente_id = a.cliente_id
            AND COALESCE(pp.anulado, false) = false
            AND pp.created_at >= s.ultimo_envio
        )
        AND (
          COALESCE(s.fecha_promesa, s.ultimo_envio::date) < v_today
          OR (
            COALESCE(s.fecha_promesa, s.ultimo_envio::date) = v_today
            AND v_now_time >= v_corte
          )
        )
      )
    ) ORDER BY a.dias_max DESC, a.total DESC, c.nombre
  )
    INTO v_clientes
  FROM agg a
  JOIN public.clientes c
    ON c.id = a.cliente_id
   AND c.tenant_id = v_tenant
   AND COALESCE(c.activo, true) = true
  LEFT JOIN public.cobranza_seguimiento s
    ON s.cliente_id = a.cliente_id
   AND s.tenant_id = v_tenant
  WHERE NOT (
    COALESCE(s.estado, '') = 'cliente_vendra'
    AND s.fecha_promesa IS NOT NULL
    AND s.fecha_promesa > v_today
  );

  RETURN json_build_object(
    'tipo_cobranza',  'financiera',
    'empresa_nombre', COALESCE(v_empresa, 'la empresa'),
    'plantilla',      v_plantilla,
    'clientes',       COALESCE(v_clientes, '[]'::json)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clientes_morosos_financiera() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clientes_morosos_financiera() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'whatsapp extension financiera morosos listo' AS status;
