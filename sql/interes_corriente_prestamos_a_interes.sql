-- =====================================================================
-- PRESTAMOS A INTERES: el interes corriente se cuenta desde el ULTIMO PAGO
-- ---------------------------------------------------------------------
-- Hallazgo 2026-07-21 (caso ISABEL DEL ROSARIO, Odalys, PT-0000880):
-- el sistema viejo mostraba 18,990 y MotoFlow 15,554.16. La diferencia
-- (3,435.84) es el interes corriente acumulado desde su ultimo pago del
-- 28/04/2026 — la formula que ya tiene get_prestamos_cliente lo reproduce
-- casi al centavo (2 meses completos + 23 dias al 8%).
--
-- Por que no lo calculaba: la linea >>INTERES<< solo se genera cuando el
-- prestamo tiene alguna cuota con interes > 0 (`ult_int_venc`). La
-- migracion solo trajo las filas PENDIENTES del libro viejo, asi que un
-- prestamo a interes con el interes al dia queda con UNA sola cuota, de
-- capital puro: sin ancla, sin interes corriente. Afecta a 87 prestamos
-- activos (24 Odalys, 35 Inversiones, 28 Naranjos).
--
-- Arreglo:
--   1) prestamos.es_solo_interes — marca el prestamo "a interes" (paga
--      interes periodico y el capital vence al final). Se marca de una vez
--      con la forma que dejo la migracion: UNA cuota que vence en
--      fecha_inicio + plazo_cuotas meses. Validado sobre las 3 financieras:
--      87 marcados, 320 amortizables, CERO falsos positivos. Editable a
--      mano si algun caso quedo mal clasificado.
--   2) get_prestamos_cliente: si el prestamo es a interes y no tiene cuota
--      de interes pendiente, el interes corriente se ancla al ULTIMO PAGO
--      del cliente (como el sistema viejo) y, si nunca ha pagado, al
--      desembolso. Los amortizables NO se tocan: su interes ya va dentro
--      de las cuotas.
--
-- OJO: el ancla es por CLIENTE (prestamo_pagos no guarda prestamo_id). Un
-- cliente con dos prestamos activos usa su ultimo pago para ambos — error
-- conservador (cobra de menos, nunca de mas).
--
-- Parte de sql/mora_default_empresa.sql (version canonica anterior); al
-- reescribir get_prestamos_cliente partir de ESTE archivo. Re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Marca del prestamo a interes
-- ---------------------------------------------------------------------
ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS es_solo_interes boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.prestamos.es_solo_interes IS
  'Prestamo a INTERES: paga interes periodico y el capital vence al final. '
  'El interes corriente corre desde el ultimo pago. Ver sql/interes_corriente_prestamos_a_interes.sql';

-- Marcado de una vez por la forma que dejo la migracion del SiiF:
-- UNA sola cuota que vence al final del plazo (+/- 3 dias de tolerancia).
WITH cand AS (
  SELECT p.id
  FROM public.prestamos p
  JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = p.tenant_id
  WHERE p.estado = 'activo'
    AND COALESCE(p.plazo_cuotas, 0) > 0
    AND p.fecha_inicio IS NOT NULL
  GROUP BY p.id, p.fecha_inicio, p.plazo_cuotas
  HAVING count(*) = 1
     AND abs(MAX(q.fecha_vencimiento)
             - (p.fecha_inicio + make_interval(months => p.plazo_cuotas))::date) <= 3
)
UPDATE public.prestamos p SET es_solo_interes = true
FROM cand WHERE p.id = cand.id AND p.es_solo_interes = false;

-- Caso revisado a mano (2026-07-21): EDWIN R. MATOS, Inversiones. Es a
-- interes ("PAGO INTERES Y ABONO A CAPITAL" / "SALDO" en su historial) pero
-- el vencimiento del capital quedo corrido un mes (01/09/2028 en vez de
-- 31/07/2028), asi que la regla de arriba no lo agarra. Le quedan 175.48 de
-- capital. Los otros dos sueltos (PT-0026472 FRANKLIN CABRERA y PT-0026549
-- ANTONIO JIMENEZ, ambos Naranjos) son AMORTIZABLES y NO se marcan.
UPDATE public.prestamos SET es_solo_interes = true
 WHERE tenant_id = 'c07a1d07-1e2f-4b3c-9d4a-107a10500007'
   AND numero = 'PT-0000592'
   AND estado = 'activo'
   AND es_solo_interes = false;

-- ---------------------------------------------------------------------
-- 2) get_prestamos_cliente (canonica: mora diaria CPF + interes corriente
--    anclado al ultimo pago para los prestamos a interes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_today    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_genmora  boolean := true;
  v_cli_mora numeric := 0;
  v_emp_mora numeric := 0;
  v_ult_pago date;
  v_result   json;
  v_cargos   json;
  v_cargos_pend numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- La mora se rige por el CLIENTE (cotejo + tasa) en tiempo real.
  SELECT COALESCE(generar_mora, true), COALESCE(mora_pct, 0)
    INTO v_genmora, v_cli_mora
  FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;
  v_genmora  := COALESCE(v_genmora, true);
  v_cli_mora := COALESCE(v_cli_mora, 0);

  -- Tasa default de la empresa (fallback cuando cliente y prestamo estan en 0)
  SELECT COALESCE(mora_pct_default, 0) INTO v_emp_mora
  FROM public.config_empresa WHERE tenant_id = v_tenant LIMIT 1;
  v_emp_mora := COALESCE(v_emp_mora, 0);

  -- Ultimo pago del cliente: ancla del interes corriente en los prestamos
  -- a interes (el sistema viejo cuenta desde ahi).
  SELECT MAX(fecha) INTO v_ult_pago
  FROM public.prestamo_pagos
  WHERE tenant_id = v_tenant
    AND cliente_id = p_cliente_id
    AND COALESCE(anulado, false) = false;

  -- Cargos manuales pendientes (Otras Transacciones)
  -- 'creado' = fecha en que se aplicó el cargo (columna Fecha del Recibo);
  -- 'fecha'  = fecha de vencimiento pactada (columna Vence).
  SELECT
    COALESCE(json_agg(json_build_object(
      'cargo_id',    id,
      'numero',      numero,
      'prestamo_id', prestamo_id,
      'fecha',       fecha,
      'creado',      created_at::date,
      'tipo',        tipo,
      'concepto',    concepto,
      'descripcion', descripcion,
      'monto',       monto,
      'pagado',      monto_pagado,
      'pendiente',   GREATEST(monto - monto_pagado, 0)
    ) ORDER BY fecha, numero), '[]'::json),
    COALESCE(SUM(GREATEST(monto - monto_pagado, 0)), 0)
  INTO v_cargos, v_cargos_pend
  FROM public.prestamo_cargos
  WHERE tenant_id = v_tenant
    AND cliente_id = p_cliente_id
    AND COALESCE(anulado, false) = false
    AND estado <> 'pagado'
    AND GREATEST(monto - monto_pagado, 0) > 0;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (v_today - q.fecha_vencimiento))::int AS dias_atraso,
      -- Tasa efectiva: cliente > prestamo > default de la empresa
      CASE WHEN v_cli_mora > 0 THEN v_cli_mora
           WHEN COALESCE(p.mora_pct, 0) > 0 THEN p.mora_pct
           ELSE v_emp_mora END AS tasa_mora
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_tenant
    WHERE q.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      -- Mora prorrateada POR DIA, formula exacta del CPF viejo:
      --   pendiente * (tasa_mensual * 12 / 100) * dias / 365
      CASE WHEN v_genmora THEN
        GREATEST(
          round((capital_pend + interes_pend) * (tasa_mora * 12.0 / 100.0)
                * dias_atraso / 365.0, 2) - mora_pagada,
          0
        )
      ELSE 0 END AS mora_pend
    FROM cu
  ),
  ic AS (
    SELECT
      p.id AS prestamo_id, p.numero AS prestamo_numero, p.fecha_inicio,
      SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
      -- Ancla del interes corriente:
      --   1) la ultima cuota de INTERES pendiente (comportamiento de siempre)
      --   2) prestamo A INTERES sin esa fila -> el ULTIMO PAGO del cliente
      --      (o el desembolso si nunca ha pagado)
      COALESCE(
        MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0),
        CASE WHEN p.es_solo_interes
             THEN COALESCE(v_ult_pago, p.fecha_inicio) END
      ) AS ult_int_venc,
      MAX(p.tasa_interes) AS tasa
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
    GROUP BY p.id, p.numero, p.fecha_inicio, p.es_solo_interes
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
        'vencida', fecha_vencimiento < v_today,
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
    'capital_pendiente',    COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente',       COALESCE(SUM(mora_pend), 0),
    'cargos_pendientes',    v_cargos_pend,
    'balance_total',        COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0) + v_cargos_pend,
    'cargos',               v_cargos,
    'cuotas',               COALESCE(json_agg(line ORDER BY sort_d, sort_t), '[]'::json)
  ) INTO v_result
  FROM filas;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('interes_corriente_prestamos_a_interes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: cuantos prestamos quedaron marcados por empresa
SELECT c.nombre AS empresa,
       count(*) FILTER (WHERE p.es_solo_interes)     AS a_interes,
       count(*) FILTER (WHERE NOT p.es_solo_interes) AS amortizables
FROM public.prestamos p
JOIN public.config_empresa c ON c.tenant_id = p.tenant_id
WHERE p.estado = 'activo'
GROUP BY c.nombre
ORDER BY 2 DESC;
