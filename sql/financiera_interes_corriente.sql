-- =====================================================================
-- Financiera externa: INTERÉS CORRIENTE dinámico en el Recibo de Pago
-- ---------------------------------------------------------------------
-- El sistema viejo (SiiF) es un préstamo SOLO-INTERÉS: cada mes acumula
-- tasa_interes% sobre el capital pendiente, y al abrir el recibo genera
-- al vuelo una línea ">>INTERES<< X Días de Intereses" por los días
-- transcurridos desde el último vencimiento de interés hasta HOY.
--
-- El modelo nuevo guardaba solo cuotas fijas del respaldo, por eso el
-- balance salía MENOR que el recibo en vivo (le faltaba el interés del
-- período en curso). Aquí:
--   1) get_prestamos_cliente_financiera_externa: muestra ese interés
--      corriente como una línea dinámica adicional (no se persiste).
--   2) registrar_pago_prestamo_financiera_externa: al cobrar, MATERIALIZA
--      ese interés como una cuota real (igual que el viejo) antes de
--      repartir el abono, para que el cobro cuadre al centavo.
--
-- Convención de días verificada contra el sistema viejo (PT-0026260):
--   interés = capital_pend * (tasa_mensual/100) * 12 * dias / 365
--   58383.07 * 0.015 * 12 * 16 / 365 = 460.67  (idéntico al viejo)
-- =====================================================================

-- 1) DISPLAY: estado de cuenta con interés corriente dinámico -----------
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente_financiera_externa(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_fin   uuid := public._get_financiera_externa_tenant();
  v_today date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_result json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_fin) THEN
    RAISE EXCEPTION 'Cliente no pertenece a la financiera externa';
  END IF;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (date_part('day', (now() AT TIME ZONE 'America/Santo_Domingo') - q.fecha_vencimiento) / 30)::int) AS meses_atraso,
      p.mora_pct
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_fin
    WHERE q.tenant_id = v_fin
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      GREATEST(round((capital_pend + interes_pend) * (mora_pct/100.0) * meses_atraso, 2) - mora_pagada, 0) AS mora_pend
    FROM cu
  ),
  -- Interés corriente del período en curso, por préstamo activo.
  ic AS (
    SELECT
      p.id AS prestamo_id, p.numero AS prestamo_numero, p.fecha_inicio,
      SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
      MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
      MAX(p.tasa_interes) AS tasa
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_fin
    WHERE p.tenant_id = v_fin
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
    GROUP BY p.id, p.numero, p.fecha_inicio
  ),
  ic2 AS (
    SELECT
      prestamo_id, prestamo_numero, fecha_inicio, cap_base, ult_int_venc, tasa,
      -- meses enteros transcurridos desde el último interés facturado
      (date_part('year',  age(v_today, ult_int_venc)) * 12
       + date_part('month', age(v_today, ult_int_venc)))::int AS n_meses
    FROM ic
    WHERE ult_int_venc IS NOT NULL
      AND cap_base > 0
      AND ult_int_venc < v_today
  ),
  ic3 AS (
    SELECT
      prestamo_id, prestamo_numero, fecha_inicio, cap_base, ult_int_venc, n_meses,
      (v_today - (ult_int_venc + make_interval(months => n_meses))::date) AS dias_part,
      -- mes completo = tasa fija (1.5%); días sueltos = prorrateo anual/365 (igual que el viejo)
      ( n_meses * round(cap_base * (tasa/100.0), 2)
        + round(cap_base * (tasa/100.0) * 12.0
                * GREATEST(0, (v_today - (ult_int_venc + make_interval(months => n_meses))::date))::numeric
                / 365.0, 2)
      ) AS int_corr
    FROM ic2
  ),
  -- Cuotas reales + línea(s) de interés corriente, en un solo conjunto.
  filas AS (
    SELECT
      fecha_vencimiento AS sort_d, 0 AS sort_t,
      capital_pend, interes_pend, mora_pend,
      json_build_object(
        'cuota_id', id,
        'prestamo_id', prestamo_id,
        'prestamo_numero', prestamo_numero,
        'referencia', lpad(numero_cuota::text, 3, '0') || '/' || lpad(plazo_cuotas::text, 3, '0'),
        'fecha', CASE WHEN capital > 0 THEN fecha_inicio ELSE fecha_vencimiento END,
        'fecha_vencimiento', fecha_vencimiento,
        'monto_cuota', monto_cuota,
        'capital_pend', capital_pend,
        'interes_pend', interes_pend,
        'mora_pend', mora_pend,
        'pendiente', capital_pend + interes_pend + mora_pend,
        'vencida', fecha_vencimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date,
        'es_interes_corriente', false
      ) AS line
    FROM cu2
    UNION ALL
    SELECT
      v_today AS sort_d, 1 AS sort_t,
      0::numeric, int_corr, 0::numeric,
      json_build_object(
        'cuota_id', 'IC-' || prestamo_id,
        'prestamo_id', prestamo_id,
        'prestamo_numero', prestamo_numero,
        'referencia', '>>INTERES<<',
        'fecha', v_today,
        'fecha_vencimiento', v_today,
        'monto_cuota', int_corr,
        'capital_pend', 0,
        'interes_pend', int_corr,
        'mora_pend', 0,
        'pendiente', int_corr,
        'vencida', false,
        'es_interes_corriente', true
      ) AS line
    FROM ic3
    WHERE int_corr > 0
  )
  SELECT json_build_object(
    'capital_pendiente', COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente', COALESCE(SUM(mora_pend), 0),
    'balance_total', COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
    'cuotas', COALESCE(json_agg(line ORDER BY sort_d, sort_t), '[]'::json)
  ) INTO v_result
  FROM filas;

  RETURN v_result;
END;
$$;

-- 2) COBRO: materializa el interés corriente antes de repartir el abono --
DROP FUNCTION IF EXISTS public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid);

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo_financiera_externa(
  p_cliente_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT NULL,
  p_cobrador text DEFAULT NULL,
  p_forma_pago text DEFAULT 'Efectivo',
  p_cuenta text DEFAULT NULL,
  p_banco text DEFAULT NULL,
  p_comentarios text DEFAULT NULL,
  p_prestamo_id uuid DEFAULT NULL,
  p_cuota_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin uuid := public._get_financiera_externa_tenant();
  v_tenant uuid := public.get_user_tenant();
  v_asof date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_restante numeric := round(COALESCE(p_monto,0), 2);
  v_total numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant numeric;
  v_bal_act numeric;
  v_pago_id uuid;
  v_numero text;
  v_ticket_numero text;
  v_recibo_numero text;
  v_seq int;
  v_ticket_seq int;
  v_estado json;
  rec record;
  ab_mora numeric;
  ab_int numeric;
  ab_cap numeric;
BEGIN
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_fin) THEN
    RAISE EXCEPTION 'Cliente no pertenece a la financiera externa';
  END IF;

  -- Materializar el interés corriente del período como cuota real (igual que el
  -- sistema viejo genera la línea ">>INTERES<< X Días" al grabar el recibo).
  INSERT INTO public.prestamo_cuotas
    (tenant_id, prestamo_id, numero_cuota, fecha_vencimiento,
     capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado)
  SELECT
    v_fin, t.prestamo_id,
    COALESCE((SELECT MAX(numero_cuota) FROM public.prestamo_cuotas q3 WHERE q3.prestamo_id = t.prestamo_id), 0) + 1,
    v_asof, 0, t.int_corr, t.int_corr, 0, 0, 0, 'pendiente'
  FROM (
    SELECT
      g.prestamo_id,
      ( g.n_meses * round(g.cap_base * (g.tasa/100.0), 2)
        + round(g.cap_base * (g.tasa/100.0) * 12.0
                * GREATEST(0, (v_asof - (g.ult_int_venc + make_interval(months => g.n_meses))::date))::numeric
                / 365.0, 2)
      ) AS int_corr
    FROM (
      SELECT
        p.id AS prestamo_id,
        SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
        MAX(p.tasa_interes) AS tasa,
        MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
        (date_part('year',  age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))) * 12
         + date_part('month', age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))))::int AS n_meses
      FROM public.prestamos p
      JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_fin
      WHERE p.tenant_id = v_fin
        AND p.cliente_id = p_cliente_id
        AND p.estado = 'activo'
        AND (p_prestamo_id IS NULL OR p.id = p_prestamo_id)
      GROUP BY p.id
    ) g
    WHERE g.ult_int_venc IS NOT NULL
      AND g.cap_base > 0
      AND g.ult_int_venc < v_asof
  ) t
  WHERE t.int_corr > 0;

  v_estado := public.get_prestamos_cliente_financiera_externa(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq
  FROM public.prestamo_pagos
  WHERE tenant_id = v_fin;
  v_numero := lpad(v_seq::text, 7, '0');

  SELECT COUNT(*)::int + 1
    INTO v_ticket_seq
  FROM public.prestamo_pagos pp
  WHERE pp.tenant_id = v_fin
    AND (
      (v_tenant IS NOT NULL AND pp.created_by IN (
        SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_tenant
      ))
      OR (v_tenant IS NULL AND pp.created_by = auth.uid())
    );
  v_ticket_numero := lpad(v_ticket_seq::text, 4, '0');

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios, created_by
  ) VALUES (
    v_fin, v_numero, p_cliente_id, v_asof, p_cobrador,
    COALESCE(p_forma_pago,'Efectivo'), p_cuenta, p_banco, v_total, v_bal_ant, 0, p_comentarios, auth.uid()
  ) RETURNING id INTO v_pago_id;

  FOR rec IN
    SELECT (c->>'cuota_id')::uuid AS cuota_id,
           (c->>'mora_pend')::numeric AS mora_pend,
           (c->>'interes_pend')::numeric AS interes_pend,
           (c->>'capital_pend')::numeric AS capital_pend
    FROM json_array_elements(v_estado->'cuotas') c
    WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'   -- ya materializado arriba
      AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'                   -- solo cuotas reales (uuid)
      AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
      AND (p_cuota_ids IS NULL OR (c->>'cuota_id')::uuid = ANY(p_cuota_ids))
    ORDER BY (c->>'fecha_vencimiento')::date
  LOOP
    EXIT WHEN v_restante <= 0;

    ab_mora := LEAST(v_restante, rec.mora_pend);
    v_restante := round(v_restante - ab_mora, 2);
    ab_int := LEAST(v_restante, rec.interes_pend);
    v_restante := round(v_restante - ab_int, 2);
    ab_cap := LEAST(v_restante, rec.capital_pend);
    v_restante := round(v_restante - ab_cap, 2);

    IF (ab_mora + ab_int + ab_cap) > 0 THEN
      INSERT INTO public.prestamo_pago_detalle (
        tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total
      ) VALUES (
        v_fin, v_pago_id, rec.cuota_id, ab_cap, ab_int, ab_mora, ab_cap + ab_int + ab_mora
      );

      UPDATE public.prestamo_cuotas q
         SET capital_pagado = q.capital_pagado + ab_cap,
             interes_pagado = q.interes_pagado + ab_int,
             mora_pagada = q.mora_pagada + ab_mora,
             estado = CASE
                        WHEN (q.capital_pagado + ab_cap) >= q.capital
                         AND (q.interes_pagado + ab_int) >= q.interes THEN 'pagada'
                        ELSE 'parcial'
                      END
       WHERE q.id = rec.cuota_id AND q.tenant_id = v_fin;
    END IF;
  END LOOP;

  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_fin
     AND p.cliente_id = p_cliente_id
     AND p.estado = 'activo'
     AND NOT EXISTS (
       SELECT 1 FROM public.prestamo_cuotas q
       WHERE q.prestamo_id = p.id AND COALESCE(q.estado, 'pendiente') <> 'pagada'
     );

  -- Un pago aceptado por la empresa libera automaticamente el estado SE BUSCA.
  UPDATE public.cobro_gestiones
     SET estado = 'cerrada',
         resultado = 'pago_recibido',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cerrado_por_pago', true,
           'pago_id', v_pago_id,
           'pago_numero', v_numero,
           'monto_pagado', v_total
         )
   WHERE tenant_id = v_fin
     AND cliente_id = p_cliente_id
     AND tipo = 'mandado_buscar'
     AND estado = 'mandado_buscar';

  SELECT 'RI-' || lpad((COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1)::text, 6, '0')
    INTO v_recibo_numero
  FROM public.recibos_ingreso
  WHERE tenant_id = v_fin;

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id
  ) VALUES (
    v_fin,
    v_recibo_numero,
    p_cliente_id,
    v_asof,
    v_total,
    'Pago de prestamo (financiera)',
    jsonb_build_array(jsonb_build_object(
      'forma', COALESCE(p_forma_pago, 'Efectivo'),
      'monto', v_total,
      'referencia', COALESCE(NULLIF(btrim(p_cuenta), ''), v_numero)
    )),
    auth.uid()
  );

  v_bal_act := COALESCE((public.get_prestamos_cliente_financiera_externa(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_pagos SET balance_actual = v_bal_act WHERE id = v_pago_id;

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', COALESCE(v_ticket_numero, v_numero),
    'numero_interno', v_numero,
    'total_pagado', v_total,
    'sobrante', GREATEST(v_restante, 0),
    'balance_anterior', v_bal_ant,
    'balance_actual', v_bal_act
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente_financiera_externa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prestamos_cliente_financiera_externa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) TO authenticated;

-- =====================================================================
-- 3) MISMO interés corriente para las funciones BASE (tenant propio).
--    Las usa la financiera si entra directo a la app (get_user_tenant).
-- =====================================================================

-- 3.1) DISPLAY base -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_today  date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (date_part('day', (now() AT TIME ZONE 'America/Santo_Domingo') - q.fecha_vencimiento) / 30)::int) AS meses_atraso,
      p.mora_pct
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_tenant
    WHERE q.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      GREATEST(round((capital_pend + interes_pend) * (mora_pct/100.0) * meses_atraso, 2) - mora_pagada, 0) AS mora_pend
    FROM cu
  ),
  ic AS (
    SELECT
      p.id AS prestamo_id, p.numero AS prestamo_numero, p.fecha_inicio,
      SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
      MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
      MAX(p.tasa_interes) AS tasa
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
    GROUP BY p.id, p.numero, p.fecha_inicio
  ),
  ic2 AS (
    SELECT
      prestamo_id, prestamo_numero, fecha_inicio, cap_base, ult_int_venc, tasa,
      (date_part('year',  age(v_today, ult_int_venc)) * 12
       + date_part('month', age(v_today, ult_int_venc)))::int AS n_meses
    FROM ic
    WHERE ult_int_venc IS NOT NULL
      AND cap_base > 0
      AND ult_int_venc < v_today
  ),
  ic3 AS (
    SELECT
      prestamo_id, prestamo_numero, fecha_inicio, cap_base, ult_int_venc, n_meses,
      (v_today - (ult_int_venc + make_interval(months => n_meses))::date) AS dias_part,
      ( n_meses * round(cap_base * (tasa/100.0), 2)
        + round(cap_base * (tasa/100.0) * 12.0
                * GREATEST(0, (v_today - (ult_int_venc + make_interval(months => n_meses))::date))::numeric
                / 365.0, 2)
      ) AS int_corr
    FROM ic2
  ),
  filas AS (
    SELECT
      fecha_vencimiento AS sort_d, 0 AS sort_t,
      capital_pend, interes_pend, mora_pend,
      json_build_object(
        'cuota_id', id,
        'prestamo_id', prestamo_id,
        'prestamo_numero', prestamo_numero,
        'referencia', lpad(numero_cuota::text, 3, '0') || '/' || lpad(plazo_cuotas::text, 3, '0'),
        'fecha', CASE WHEN capital > 0 THEN fecha_inicio ELSE fecha_vencimiento END,
        'fecha_vencimiento', fecha_vencimiento,
        'monto_cuota', monto_cuota,
        'capital_pend', capital_pend,
        'interes_pend', interes_pend,
        'mora_pend', mora_pend,
        'pendiente', capital_pend + interes_pend + mora_pend,
        'vencida', fecha_vencimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date,
        'es_interes_corriente', false
      ) AS line
    FROM cu2
    UNION ALL
    SELECT
      v_today AS sort_d, 1 AS sort_t,
      0::numeric, int_corr, 0::numeric,
      json_build_object(
        'cuota_id', 'IC-' || prestamo_id,
        'prestamo_id', prestamo_id,
        'prestamo_numero', prestamo_numero,
        'referencia', '>>INTERES<<',
        'fecha', v_today,
        'fecha_vencimiento', v_today,
        'monto_cuota', int_corr,
        'capital_pend', 0,
        'interes_pend', int_corr,
        'mora_pend', 0,
        'pendiente', int_corr,
        'vencida', false,
        'es_interes_corriente', true
      ) AS line
    FROM ic3
    WHERE int_corr > 0
  )
  SELECT json_build_object(
    'capital_pendiente', COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente', COALESCE(SUM(mora_pend), 0),
    'balance_total', COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
    'cuotas', COALESCE(json_agg(line ORDER BY sort_d, sort_t), '[]'::json)
  ) INTO v_result
  FROM filas;

  RETURN v_result;
END;
$$;

-- 3.2) COBRO base -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_fecha        date DEFAULT NULL,
  p_cobrador     text DEFAULT NULL,
  p_forma_pago   text DEFAULT 'Efectivo',
  p_cuenta       text DEFAULT NULL,
  p_banco        text DEFAULT NULL,
  p_comentarios  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_asof     date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_restante numeric := round(COALESCE(p_monto,0), 2);
  v_total    numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant  numeric;
  v_bal_act  numeric;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  v_estado   json;
  rec        record;
  ab_mora    numeric;
  ab_int     numeric;
  ab_cap     numeric;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  -- Materializar el interés corriente del período como cuota real.
  INSERT INTO public.prestamo_cuotas
    (tenant_id, prestamo_id, numero_cuota, fecha_vencimiento,
     capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado)
  SELECT
    v_tenant, t.prestamo_id,
    COALESCE((SELECT MAX(numero_cuota) FROM public.prestamo_cuotas q3 WHERE q3.prestamo_id = t.prestamo_id), 0) + 1,
    v_asof, 0, t.int_corr, t.int_corr, 0, 0, 0, 'pendiente'
  FROM (
    SELECT
      g.prestamo_id,
      ( g.n_meses * round(g.cap_base * (g.tasa/100.0), 2)
        + round(g.cap_base * (g.tasa/100.0) * 12.0
                * GREATEST(0, (v_asof - (g.ult_int_venc + make_interval(months => g.n_meses))::date))::numeric
                / 365.0, 2)
      ) AS int_corr
    FROM (
      SELECT
        p.id AS prestamo_id,
        SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
        MAX(p.tasa_interes) AS tasa,
        MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
        (date_part('year',  age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))) * 12
         + date_part('month', age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))))::int AS n_meses
      FROM public.prestamos p
      JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
      WHERE p.tenant_id = v_tenant
        AND p.cliente_id = p_cliente_id
        AND p.estado = 'activo'
        AND (p_prestamo_id IS NULL OR p.id = p_prestamo_id)
      GROUP BY p.id
    ) g
    WHERE g.ult_int_venc IS NOT NULL
      AND g.cap_base > 0
      AND g.ult_int_venc < v_asof
  ) t
  WHERE t.int_corr > 0;

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_pagos WHERE tenant_id = v_tenant;
  v_numero := lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, v_asof, p_cobrador,
    COALESCE(p_forma_pago,'Efectivo'), p_cuenta, p_banco, v_total, v_bal_ant, 0, p_comentarios
  ) RETURNING id INTO v_pago_id;

  FOR rec IN
    SELECT (c->>'cuota_id')::uuid AS cuota_id,
           (c->>'mora_pend')::numeric AS mora_pend,
           (c->>'interes_pend')::numeric AS interes_pend,
           (c->>'capital_pend')::numeric AS capital_pend
    FROM json_array_elements(v_estado->'cuotas') c
    WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'
      AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'
      AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
    ORDER BY (c->>'fecha_vencimiento')::date
  LOOP
    EXIT WHEN v_restante <= 0;

    ab_mora := LEAST(v_restante, rec.mora_pend);
    v_restante := round(v_restante - ab_mora, 2);
    ab_int := LEAST(v_restante, rec.interes_pend);
    v_restante := round(v_restante - ab_int, 2);
    ab_cap := LEAST(v_restante, rec.capital_pend);
    v_restante := round(v_restante - ab_cap, 2);

    IF (ab_mora + ab_int + ab_cap) > 0 THEN
      INSERT INTO public.prestamo_pago_detalle (
        tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total
      ) VALUES (
        v_tenant, v_pago_id, rec.cuota_id, ab_cap, ab_int, ab_mora, (ab_cap+ab_int+ab_mora)
      );

      UPDATE public.prestamo_cuotas q
         SET capital_pagado = q.capital_pagado + ab_cap,
             interes_pagado = q.interes_pagado + ab_int,
             mora_pagada    = q.mora_pagada + ab_mora,
             estado = CASE
                        WHEN (q.capital_pagado + ab_cap) >= q.capital
                         AND (q.interes_pagado + ab_int) >= q.interes THEN 'pagada'
                        ELSE 'parcial'
                      END
       WHERE q.id = rec.cuota_id AND q.tenant_id = v_tenant;
    END IF;
  END LOOP;

  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_tenant
     AND p.cliente_id = p_cliente_id
     AND p.estado = 'activo'
     AND NOT EXISTS (
       SELECT 1 FROM public.prestamo_cuotas q
       WHERE q.prestamo_id = p.id AND COALESCE(q.estado, 'pendiente') <> 'pagada'
     );

  -- Un pago aceptado por la empresa libera automaticamente el estado SE BUSCA.
  UPDATE public.cobro_gestiones
     SET estado = 'cerrada',
         resultado = 'pago_recibido',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cerrado_por_pago', true,
           'pago_id', v_pago_id,
           'pago_numero', v_numero,
           'monto_pagado', v_total
         )
   WHERE tenant_id = v_tenant
     AND cliente_id = p_cliente_id
     AND tipo = 'mandado_buscar'
     AND estado = 'mandado_buscar';

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id
  ) VALUES (
    v_tenant,
    public.get_next_recibo_ingreso_numero(),
    p_cliente_id,
    v_asof,
    v_total,
    'Pago de prestamo (financiera)',
    jsonb_build_array(jsonb_build_object(
      'forma', COALESCE(p_forma_pago, 'Efectivo'),
      'monto', v_total,
      'referencia', COALESCE(NULLIF(btrim(p_cuenta), ''), v_numero)
    )),
    auth.uid()
  );

  v_bal_act := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_pagos SET balance_actual = v_bal_act WHERE id = v_pago_id;

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'total_pagado', v_total,
    'sobrante', GREATEST(v_restante, 0),
    'balance_anterior', v_bal_ant,
    'balance_actual', v_bal_act
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'interes corriente financiera (externa + base) listo' AS status;
