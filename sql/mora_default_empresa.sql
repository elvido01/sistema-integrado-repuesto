-- =====================================================================
-- MORA: tasa default por EMPRESA + prorrateo diario (como el CPF viejo)
-- ---------------------------------------------------------------------
-- Hallazgo 2026-07-05 (caso TEODORA PT-0026270): el sistema viejo (CPF)
-- NO guarda los cargos de mora ni la tasa en los datos: 26,049 de 26,068
-- prestamos del backup tienen mora=0 y no hay tabla de configuracion.
-- La tasa vive dentro del programa y la mora se calcula al vuelo:
--     mora = pendiente * (4% mensual * 12) * dias_atraso / 365
-- (verificado al centavo: cuota 500 con 68 dias -> 44.71; 67 dias -> 44.05)
--
-- Este fix:
--   1. config_empresa.mora_pct_default (tasa mensual %) — se usa cuando
--      el cliente Y el prestamo tienen mora 0. Editable en Configuracion.
--   2. get_prestamos_cliente CONSOLIDADA (una sola version canonica):
--      * gate clientes.generar_mora + override clientes.mora_pct       (1/7)
--      * cargos manuales de Otras Transacciones                        (1/7)
--      * interes corriente dinamico (filas >>INTERES<<)                (2/7)
--      * NUEVO: tasa efectiva cliente -> prestamo -> empresa, y mora
--        PRORRATEADA POR DIA con la formula exacta del CPF (antes se
--        truncaba a meses completos).
--   3. Deja la tasa en 4 a las 3 financieras (Naranjos/Odalys/Inversiones).
--
-- OJO futuro: al reescribir get_prestamos_cliente, partir de ESTE archivo
-- (las versiones de financiera_interes_corriente.sql y
--  otras_transacciones_cargos.sql quedan superadas).
-- Re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS mora_pct_default numeric NOT NULL DEFAULT 0;

-- Las 3 financieras del grupo usan la tasa del sistema viejo (4% mensual)
UPDATE public.config_empresa SET mora_pct_default = 4
 WHERE tenant_id IN (
   '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',  -- MotoPrestamos Los Naranjos
   'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',  -- Moto Prestamos Odalys
   'c07a1d07-1e2f-4b3c-9d4a-107a10500007'   -- Inversiones Los Naranjos
 ) AND COALESCE(mora_pct_default, 0) = 0;

-- ---------------------------------------------------------------------
-- get_prestamos_cliente (version canonica consolidada)
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

  -- Cargos manuales pendientes (Otras Transacciones)
  SELECT
    COALESCE(json_agg(json_build_object(
      'cargo_id',    id,
      'numero',      numero,
      'prestamo_id', prestamo_id,
      'fecha',       fecha,
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

NOTIFY pgrst, 'reload schema';

SELECT 'mora_pct_default + get_prestamos_cliente consolidada (mora diaria CPF) listos' AS status;
