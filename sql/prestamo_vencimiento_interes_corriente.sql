-- =====================================================================
-- PRESTAMO A VENCIMIENTO: una linea de capital + interes corriente diario
-- ---------------------------------------------------------------------
-- Reportado 2026-07-22 (PT-0026587, MotoPrestamos): un prestamo a
-- vencimiento / interes periodico se creo con 36 cuotas de interes de
-- 10,000 generadas por adelantado (balance 460,000). Esta MAL.
--
-- Como debe ser (asi vienen los del backup del SiiF, ej. PT-0026457):
--   * UNA sola linea con el CAPITAL, venciendo al final del plazo.
--   * El interes NO se genera por adelantado: se acumula DIA A DIA como
--     interes corriente (100,000 al 10% => ~333/dia, 10,000 al mes).
--   * Si el cliente no paga al vencer el mes, queda la linea de capital +
--     el mes cumplido + lo que va corriendo del mes siguiente.
--
-- Eso ya lo calcula get_prestamos_cliente para los prestamos marcados
-- es_solo_interes (ver sql/interes_corriente_prestamos_a_interes.sql); lo
-- unico que faltaba era que los prestamos a vencimiento se CREARAN con esa
-- forma y con la marca puesta.
--
-- Cambios:
--   1) calc_amortizacion: metodo 'vencimiento' devuelve UNA cuota (capital
--      al final, interes 0) en vez de N cuotas de interes.
--   2) crear_prestamo: si el metodo es 'vencimiento', marca
--      prestamos.es_solo_interes = true.
--   3) BASE DEL INTERES DIARIO (pedido 2026-07-22): los prestamos NUEVOS
--      usan mes comercial de 30 dias — 100,000 al 10% da 333.33/dia y
--      10,000 al mes. Los ANTERIORES se quedan con la base 365 que tienen
--      hoy (365/12 = 30.4167 => 328.77/dia): NO se tocan. Para distinguir
--      se agrega prestamos.base_interes_dias (default 365; los nuevos 30).
--
-- Los otros metodos (simple / frances) NO cambian.
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Base del interes diario por prestamo. Default 365 = como estan hoy
--    todos los existentes (no se tocan). crear_prestamo pondra 30.
-- ---------------------------------------------------------------------
ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS base_interes_dias smallint NOT NULL DEFAULT 365;

COMMENT ON COLUMN public.prestamos.base_interes_dias IS
  'Base para prorratear el interes corriente de los dias sueltos: 30 = mes comercial (333.33/dia en 100k al 10%), 365 = ano civil (328.77/dia). Los prestamos viejos quedan en 365. Ver sql/prestamo_vencimiento_interes_corriente.sql';

-- ---------------------------------------------------------------------
-- 1) calc_amortizacion: 'vencimiento' = una sola linea de capital
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_amortizacion(
  p_monto numeric, p_tasa numeric, p_plazo integer,
  p_metodo text DEFAULT 'simple', p_frecuencia text DEFAULT 'mensual',
  p_fecha_primera date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  i           numeric := COALESCE(p_tasa, 0) / 100.0;
  saldo       numeric := p_monto;
  cuota_fija  numeric;
  cap         numeric;
  interes     numeric;
  cuota       numeric;
  k           int;
  v_fecha     date;
  sum_cap     numeric := 0;
  arr         jsonb := '[]'::jsonb;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_plazo IS NULL OR p_plazo <= 0 THEN
    RETURN '[]'::json;
  END IF;

  -- A VENCIMIENTO: el interes es corriente (se acumula dia a dia), no se
  -- generan cuotas de interes. Solo la linea del capital al final del plazo.
  IF p_metodo = 'vencimiento' THEN
    v_fecha := CASE p_frecuencia
                 WHEN 'semanal'   THEN p_fecha_primera + (p_plazo * 7)
                 WHEN 'quincenal' THEN p_fecha_primera + (p_plazo * 15)
                 ELSE (p_fecha_primera + (p_plazo || ' months')::interval)::date
               END;
    RETURN jsonb_build_array(jsonb_build_object(
      'numero_cuota',      1,
      'fecha_vencimiento', v_fecha,
      'capital',           round(p_monto, 2),
      'interes',           0,
      'monto_cuota',       round(p_monto, 2)
    ))::json;
  END IF;

  IF p_metodo = 'frances' AND i > 0 THEN
    cuota_fija := round(p_monto * i / (1 - power(1 + i, -p_plazo)), 2);
  END IF;

  FOR k IN 1..p_plazo LOOP
    v_fecha := CASE p_frecuencia
                 WHEN 'semanal'   THEN p_fecha_primera + ((k-1) * 7)
                 WHEN 'quincenal' THEN p_fecha_primera + ((k-1) * 15)
                 ELSE (p_fecha_primera + ((k-1) || ' months')::interval)::date
               END;

    IF p_metodo = 'frances' THEN
      IF i > 0 THEN
        interes := round(saldo * i, 2);
        cuota   := cuota_fija;
        cap     := round(cuota - interes, 2);
      ELSE
        cap     := round(p_monto / p_plazo, 2);
        interes := 0;
        cuota   := cap;
      END IF;
    ELSE
      -- simple / flat: capital igual por cuota, interes fijo sobre el capital original
      cap     := round(p_monto / p_plazo, 2);
      interes := round(p_monto * i, 2);
      cuota   := cap + interes;
    END IF;

    IF k = p_plazo THEN
      cap   := round(p_monto - sum_cap, 2);
      cuota := round(cap + interes, 2);
    END IF;
    sum_cap := sum_cap + cap;
    saldo   := round(saldo - cap, 2);

    arr := arr || jsonb_build_object(
      'numero_cuota',      k,
      'fecha_vencimiento', v_fecha,
      'capital',           cap,
      'interes',           interes,
      'monto_cuota',       cuota
    );
  END LOOP;

  RETURN arr::json;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) crear_prestamo: marcar es_solo_interes cuando es a vencimiento
--    (conserva la numeracion a prueba de legacy de
--     sql/fix_crear_prestamo_numeracion.sql y la columna desembolso)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_prestamo(
  p_cliente_id uuid, p_monto numeric, p_tasa numeric, p_plazo integer,
  p_metodo text DEFAULT 'simple', p_frecuencia text DEFAULT 'mensual',
  p_mora_pct numeric DEFAULT 0, p_tipo text DEFAULT 'financiamiento',
  p_fecha_primera date DEFAULT NULL, p_garantia text DEFAULT NULL,
  p_notas text DEFAULT NULL, p_cuota_ajustada numeric DEFAULT NULL,
  p_desembolso text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_id       uuid;
  v_numero   text;
  v_seq      bigint;
  v_fecha1   date := COALESCE(p_fecha_primera, (current_date + interval '1 month')::date);
  v_cuotas   json;
  c          jsonb;
  v_cap      numeric;
  v_int      numeric;
  v_cuota_m  numeric;
  v_adj      numeric := COALESCE(p_cuota_ajustada, 0);
  v_desemb   text := lower(NULLIF(trim(COALESCE(p_desembolso, '')), ''));
  v_metodo   text := COALESCE(p_metodo, 'simple');
  v_venc     boolean := (v_metodo = 'vencimiento');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;
  IF v_desemb IS NOT NULL AND v_desemb NOT IN ('efectivo', 'transferencia', 'cheque') THEN
    RAISE EXCEPTION 'Desembolso inválido: %', p_desembolso;
  END IF;

  -- Secuencia a prueba de numeros legacy ('PT-0000002-200000002' del SiiF).
  SELECT COALESCE(MAX(t.n), 0) + 1
    INTO v_seq
  FROM (
    SELECT substring(numero from 4)::bigint AS n
    FROM public.prestamos
    WHERE tenant_id = v_tenant AND numero ~ '^PT-\d+$'
  ) t
  WHERE t.n < 9000000;

  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota,
    garantia, notas, desembolso, es_solo_interes, base_interes_dias
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_tipo,'financiamiento'),
    v_metodo, p_monto, COALESCE(p_tasa,0), p_plazo,
    COALESCE(p_frecuencia,'mensual'), COALESCE(p_mora_pct,0), v_fecha1,
    p_garantia, p_notas, v_desemb, v_venc,
    30   -- mes comercial: los prestamos nuevos cobran 333.33/dia en 100k al 10%
  ) RETURNING id INTO v_id;

  v_cuotas := public.calc_amortizacion(p_monto, p_tasa, p_plazo, v_metodo, COALESCE(p_frecuencia,'mensual'), v_fecha1);

  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    v_cap := (c->>'capital')::numeric;
    -- En 'vencimiento' la unica linea es capital puro: la cuota ajustada no aplica.
    IF v_adj > 0 AND NOT v_venc THEN
      v_cuota_m := v_adj;
      v_int     := round(v_adj - v_cap, 2);
    ELSE
      v_cuota_m := (c->>'monto_cuota')::numeric;
      v_int     := (c->>'interes')::numeric;
    END IF;

    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_tenant, v_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      v_cap, v_int, v_cuota_m
    );
  END LOOP;

  RETURN json_build_object('id', v_id, 'numero', v_numero, 'cuota_ajustada', v_adj, 'cuotas', v_cuotas);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2b) get_prestamos_cliente: el interes corriente de los dias sueltos usa
--     la BASE de cada prestamo (30 = nuevos, 365 = los de siempre).
--     Copia de sql/interes_corriente_prestamos_a_interes.sql; el unico
--     cambio esta en las CTE ic/ic2/ic3 (base_dias).
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
      COALESCE(
        MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0),
        CASE WHEN p.es_solo_interes
             THEN COALESCE(v_ult_pago, p.fecha_inicio) END
      ) AS ult_int_venc,
      MAX(p.tasa_interes) AS tasa,
      -- 30 = mes comercial (prestamos nuevos) · 365 = como siempre (los viejos)
      MAX(COALESCE(p.base_interes_dias, 365)) AS base_dias
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
    GROUP BY p.id, p.numero, p.fecha_inicio, p.es_solo_interes
  ),
  ic2 AS (
    SELECT
      prestamo_id, prestamo_numero, fecha_inicio, cap_base, ult_int_venc, tasa, base_dias,
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
      -- meses cumplidos a tasa completa + los dias sueltos prorrateados
      -- segun la base del prestamo (30 dias comerciales o 365/12).
      ( n_meses * round(cap_base * (tasa/100.0), 2)
        + round(cap_base * (tasa/100.0)
                * GREATEST(0, (v_today - (ult_int_venc + make_interval(months => n_meses))::date))::numeric
                / (CASE WHEN base_dias = 30 THEN 30.0 ELSE 365.0/12.0 END), 2)
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

-- ---------------------------------------------------------------------
-- 3) Reparar PT-0026587 (el primero digitado con la forma vieja).
--    Sin abonos aplicados, asi que se rehace su calendario sin riesgo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_p record;
BEGIN
  SELECT id, tenant_id, monto_capital, plazo_cuotas, fecha_primera_cuota
    INTO v_p
  FROM public.prestamos
  WHERE numero = 'PT-0026587'
    AND tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
    AND metodo_interes = 'vencimiento';

  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM public.prestamo_pago_detalle d
    JOIN public.prestamo_cuotas q ON q.id = d.cuota_id
    WHERE q.prestamo_id = v_p.id
  ) THEN
    DELETE FROM public.prestamo_cuotas WHERE prestamo_id = v_p.id;

    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_p.tenant_id, v_p.id, 1,
      (v_p.fecha_primera_cuota + ((v_p.plazo_cuotas - 1) || ' months')::interval)::date,
      round(v_p.monto_capital, 2), 0, round(v_p.monto_capital, 2)
    );

    -- Es un prestamo NUEVO (digitado hoy): mes comercial de 30 dias.
    UPDATE public.prestamos
       SET es_solo_interes = true, base_interes_dias = 30
     WHERE id = v_p.id;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('prestamo_vencimiento_interes_corriente.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: PT-0026587 con UNA cuota de capital, marcado y en base 30
SELECT p.numero, p.metodo_interes, p.monto_capital, p.tasa_interes,
       p.es_solo_interes, p.base_interes_dias, count(q.id) AS cuotas,
       MIN(q.fecha_vencimiento) AS vence, SUM(q.capital) AS capital, SUM(q.interes) AS interes
FROM public.prestamos p
LEFT JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id
WHERE p.numero = 'PT-0026587'
GROUP BY p.numero, p.metodo_interes, p.monto_capital, p.tasa_interes,
         p.es_solo_interes, p.base_interes_dias;

-- Cuantos prestamos quedan en cada base (los viejos NO se tocaron)
SELECT base_interes_dias, count(*) AS prestamos
FROM public.prestamos WHERE estado = 'activo'
GROUP BY base_interes_dias ORDER BY base_interes_dias;
