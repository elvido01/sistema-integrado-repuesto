-- =====================================================================
-- Interés por días reales, como el SiiF — SOLO MOTO PRESTAMOS ODALYS
-- ---------------------------------------------------------------------
-- (2026-09-30) ISABEL DEL ROSARIO (PT-0000880): el SiiF quedó en 13,827.24 y
-- MotoFlow en 13,780.62 después del MISMO recibo de 5,100 (900 de cargo).
-- La diferencia (46.62) estaba toda en el interés de 71 días (21/07→30/09):
--
--   SiiF     : 71 días × tasa diaria (8% × 12 / 365 = 39.9533/día) = 2,836.68
--   MotoFlow : 2 meses a 8% fijo (1,215.24 c/u) + 9 días × 39.9533  = 2,790.06
--
-- MotoFlow cobraba cada mes cumplido como un 8% plano (≈30.4 días), pero del
-- 21/07 al 21/09 hay 62 días reales. Decisión del dueño: IGUAL QUE EL SIIF.
--
-- >>> SOLO ODALYS <<< (el dueño: "no puedes tocar ninguna otra empresa sin
-- permiso"). Va detrás de config_empresa.interes_dias_reales, encendido solo
-- para c05a1d05-...0005. Para las demás, interes_corriente() reproduce la
-- fórmula de antes tal cual (comprobado préstamo por préstamo al aplicar).
--
-- La fórmula vivía copiada en 4 funciones (y en GestionCobroPage.jsx); ahora
-- las 4 llaman a interes_corriente(). Cuerpos tomados de PRODUCCIÓN el 30/09,
-- no de los .sql viejos del repo. Los préstamos de mes comercial (base 30)
-- no cambian en ninguna empresa.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS interes_dias_reales boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.config_empresa.interes_dias_reales IS
  'Interés corriente = días reales × tasa diaria (tasa×12/365, redondeada a 4 decimales), como el SiiF. false = meses cumplidos a tasa completa + días sueltos.';

UPDATE public.config_empresa SET interes_dias_reales = true
 WHERE tenant_id = 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005';

CREATE OR REPLACE FUNCTION public.interes_corriente(
  p_cap numeric, p_tasa numeric, p_desde date, p_hasta date, p_base integer, p_tenant uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_t      numeric := COALESCE(p_tasa, 0) / 100.0;
  v_meses  int;
  v_dias   int;
BEGIN
  IF p_cap IS NULL OR p_cap <= 0 OR v_t <= 0 OR p_desde IS NULL OR p_hasta <= p_desde THEN
    RETURN 0;
  END IF;

  -- Como el SiiF: todos los días reales a tasa diaria (4 decimales, que es
  -- lo que reproduce al centavo sus recibos). Mes comercial no entra aquí.
  IF COALESCE(p_base, 365) <> 30
     AND COALESCE((SELECT interes_dias_reales FROM public.config_empresa WHERE tenant_id = p_tenant), false) THEN
    RETURN round(round(p_cap * v_t * 12.0 / 365.0, 4) * (p_hasta - p_desde), 2);
  END IF;

  -- La fórmula de siempre: meses cumplidos a tasa completa + días sueltos.
  v_meses := (date_part('year', age(p_hasta, p_desde)) * 12 + date_part('month', age(p_hasta, p_desde)))::int;
  v_dias  := GREATEST(0, (p_hasta - (p_desde + make_interval(months => v_meses))::date));
  RETURN v_meses * round(p_cap * v_t, 2)
       + round(p_cap * v_t * v_dias::numeric / (CASE WHEN p_base = 30 THEN 30.0 ELSE 365.0/12.0 END), 2);
END $$;

REVOKE EXECUTE ON FUNCTION public.interes_corriente(numeric, numeric, date, date, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.interes_corriente(numeric, numeric, date, date, integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- NOTA: aqui se buscaba el ultimo pago del cliente (en CUALQUIER prestamo)
  -- para usarlo de ancla del interes corriente. Por eso un pago a un prestamo
  -- borraba el interes de otro. Ya no se consulta: el ancla es
  -- prestamos.interes_cobrado_hasta, que solo avanza cuando el interes se
  -- cobra o se rebaja por nota de credito. Esta funcion ya no lee la tabla de
  -- pagos, y la verificacion del final lo comprueba.

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
      -- El interes que quedo a medias en una cuota materializada sigue vivo
      -- aqui, con SU fecha. Es la regla: abonar 600 de 700 deja 100 pendientes.
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
      -- El ancla es la MAS RECIENTE entre el interes ya materializado (lo cobro
      -- un recibo o lo rebajo una NC) y la fecha hasta donde esta cobrado.
      -- GREATEST y no COALESCE a proposito: si algun dia se REPONE un interes
      -- viejo como cuota (para devolver lo que se esfumo antes del arreglo),
      -- esa cuota lleva la fecha del dia en que se perdio. Con COALESCE esa
      -- fecha vieja ganaria, el reloj retrocederia y se le cobraria al cliente
      -- otra vez el tramo que se decidio congelar. GREATEST lo impide: la
      -- cuota repuesta se cobra, pero no reabre el pasado.
      -- (GREATEST ignora los NULL; devuelve NULL solo si todos lo son.)
      CASE WHEN p.es_solo_interes
           THEN GREATEST(MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0),
                         COALESCE(p.interes_cobrado_hasta, p.fecha_inicio),
                         p.fecha_inicio)
           ELSE MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0)
      END AS ult_int_venc,
      MAX(p.tasa_interes) AS tasa,
      -- 30 = mes comercial (prestamos nuevos) · 365 = como siempre (los viejos)
      MAX(COALESCE(p.base_interes_dias, 365)) AS base_dias
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
    GROUP BY p.id, p.numero, p.fecha_inicio, p.es_solo_interes, p.interes_cobrado_hasta
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
      public.interes_corriente(cap_base, tasa, ult_int_venc, v_today, base_dias, v_tenant) AS int_corr
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(p_cliente_id uuid, p_monto numeric, p_fecha date DEFAULT NULL::date, p_cobrador text DEFAULT NULL::text, p_forma_pago text DEFAULT 'Efectivo'::text, p_cuenta text DEFAULT NULL::text, p_banco text DEFAULT NULL::text, p_comentarios text DEFAULT NULL::text, p_prestamo_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      public.interes_corriente(g.cap_base, g.tasa, g.ult_int_venc, v_asof, 365, v_tenant) AS int_corr
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
$function$;

CREATE OR REPLACE FUNCTION public.get_resumen_cartera_financiera(p_busqueda text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_atraso text DEFAULT 'todos'::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_today    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_emp_mora numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  SELECT COALESCE(mora_pct_default, 0) INTO v_emp_mora
  FROM public.config_empresa WHERE tenant_id = v_tenant LIMIT 1;
  v_emp_mora := COALESCE(v_emp_mora, 0);

  WITH pf AS (  -- préstamos activos que pasan el filtro de préstamo/cliente
    SELECT p.id, p.numero, p.tipo, p.fecha_inicio, p.tasa_interes,
           p.monto_capital, p.plazo_cuotas,
           COALESCE(p.mora_pct, 0) AS prestamo_mora, p.cliente_id,
           c.nombre AS cliente_nombre, c.codigo AS cliente_codigo,
           COALESCE(c.generar_mora, true) AS genmora,
           COALESCE(c.mora_pct, 0) AS cli_mora
    FROM public.prestamos p
    JOIN public.clientes c ON c.id = p.cliente_id AND c.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
      AND p.estado = 'activo'
      AND (p_tipo IS NULL OR p_tipo = '' OR p_tipo = 'todos' OR p.tipo = p_tipo)
      AND (p_desde IS NULL OR p.fecha_inicio >= p_desde)
      AND (p_hasta IS NULL OR p.fecha_inicio <= p_hasta)
      AND (p_busqueda IS NULL OR p_busqueda = ''
           OR c.nombre  ILIKE '%' || p_busqueda || '%'
           OR c.codigo  ILIKE '%' || p_busqueda || '%'
           OR p.numero  ILIKE '%' || p_busqueda || '%')
  ),
  pflag AS (  -- ¿el préstamo separa el interés en ALGUNA cuota?
    SELECT pf.id AS prestamo_id, bool_or(q.interes > 0) AS tiene_interes
    FROM pf
    JOIN public.prestamo_cuotas q ON q.prestamo_id = pf.id AND q.tenant_id = v_tenant
    GROUP BY pf.id
  ),
  cu AS (  -- cuotas NO pagadas de esos préstamos
    SELECT pf.id AS prestamo_id, pf.numero, pf.tipo, pf.fecha_inicio,
           pf.cliente_id, pf.cliente_nombre, pf.cliente_codigo, pf.genmora,
           pf.monto_capital, pf.plazo_cuotas,
           q.capital, q.interes, q.mora_pagada, q.fecha_vencimiento,
           GREATEST(q.capital - q.capital_pagado, 0) AS cap_raw,
           GREATEST(q.interes - q.interes_pagado, 0) AS int_raw,
           GREATEST(0, (v_today - q.fecha_vencimiento))::int AS dias_atraso,
           CASE WHEN pf.cli_mora > 0 THEN pf.cli_mora
                WHEN pf.prestamo_mora > 0 THEN pf.prestamo_mora
                ELSE v_emp_mora END AS tasa_mora
    FROM pf
    JOIN public.prestamo_cuotas q ON q.prestamo_id = pf.id AND q.tenant_id = v_tenant
    WHERE COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  cu2 AS (
    SELECT c.prestamo_id, c.numero, c.tipo, c.fecha_inicio,
           c.cliente_id, c.cliente_nombre, c.cliente_codigo,
           c.fecha_vencimiento, c.dias_atraso,
           (c.cap_raw + c.int_raw) AS pend,
           CASE
             WHEN lf.tiene_interes THEN c.cap_raw
             WHEN COALESCE(c.monto_capital, 0) > 0 AND COALESCE(c.plazo_cuotas, 0) > 0
                  AND (c.capital + c.interes) > 0
               THEN round((c.cap_raw + c.int_raw)
                          * LEAST(c.capital, round(c.monto_capital / c.plazo_cuotas, 2))
                          / (c.capital + c.interes), 2)
             ELSE c.cap_raw
           END AS capital_pend,
           CASE WHEN c.genmora THEN
             GREATEST(round((c.cap_raw + c.int_raw) * (c.tasa_mora * 12.0 / 100.0)
                            * c.dias_atraso / 365.0, 2) - c.mora_pagada, 0)
           ELSE 0 END AS mora_pend
    FROM cu c
    JOIN pflag lf ON lf.prestamo_id = c.prestamo_id
  ),
  ic AS (  -- base del interés corriente por préstamo (todas las cuotas)
    SELECT pf.id AS prestamo_id,
           SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
           MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
           MAX(pf.tasa_interes) AS tasa
    FROM pf
    JOIN public.prestamo_cuotas q ON q.prestamo_id = pf.id AND q.tenant_id = v_tenant
    GROUP BY pf.id
  ),
  ic3 AS (
    SELECT prestamo_id,
      public.interes_corriente(cap_base, tasa, ult_int_venc, v_today, 365, v_tenant) AS int_corr
    FROM (
      SELECT prestamo_id, cap_base, ult_int_venc, tasa,
        (date_part('year',  age(v_today, ult_int_venc)) * 12
         + date_part('month', age(v_today, ult_int_venc)))::int AS n_meses
      FROM ic
      WHERE ult_int_venc IS NOT NULL AND cap_base > 0 AND ult_int_venc < v_today
    ) z
  ),
  por_prestamo AS (  -- una fila por préstamo (cliente_id va en el GROUP BY:
                     -- depende del préstamo, no altera el agrupamiento)
    SELECT c.prestamo_id,
           c.cliente_id,
           MAX(c.numero)          AS numero,
           MAX(c.tipo)            AS tipo,
           MAX(c.fecha_inicio)    AS fecha_inicio,
           MAX(c.cliente_nombre)  AS cliente_nombre,
           MAX(c.cliente_codigo)  AS cliente_codigo,
           SUM(c.capital_pend)    AS capital_pend,
           SUM(c.pend - c.capital_pend) + COALESCE(MAX(i.int_corr), 0) AS interes_pend,
           SUM(c.mora_pend)       AS mora_pend,
           MAX(c.dias_atraso)     AS dias_atraso,
           COUNT(*) FILTER (WHERE c.fecha_vencimiento < v_today) AS cuotas_vencidas
    FROM cu2 c
    LEFT JOIN ic3 i ON i.prestamo_id = c.prestamo_id
    GROUP BY c.prestamo_id, c.cliente_id
  ),
  filtrado AS (
    SELECT * FROM por_prestamo
    WHERE (p_atraso IS NULL OR p_atraso = 'todos'
           OR (p_atraso = 'al_dia'   AND dias_atraso = 0)
           OR (p_atraso = 'vencidos' AND cuotas_vencidas > 0)
           OR (p_atraso = 'con_mora' AND mora_pend > 0))
  )
  SELECT json_build_object(
    'capital_colocado',   COALESCE(SUM(capital_pend), 0),
    'interes_por_cobrar', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente',     COALESCE(SUM(mora_pend), 0),
    'total_cxc',          COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
    'prestamos_activos',  COUNT(*),
    'generado',           v_today,
    'prestamos', COALESCE(json_agg(json_build_object(
        'prestamo_id',     prestamo_id,
        'cliente_id',      cliente_id,
        'numero',          numero,
        'tipo',            tipo,
        'cliente',         cliente_nombre,
        'codigo',          cliente_codigo,
        'fecha_inicio',    fecha_inicio,
        'capital',         capital_pend,
        'interes',         interes_pend,
        'mora',            mora_pend,
        'total',           capital_pend + interes_pend + mora_pend,
        'dias_atraso',     dias_atraso,
        'cuotas_vencidas', cuotas_vencidas
      ) ORDER BY (capital_pend + interes_pend + mora_pend) DESC), '[]'::json)
  ) INTO v_result
  FROM filtrado;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_clientes_morosos_financiera()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- max(uuid) NO existe en Postgres (rompía el RPC con 42883): vía texto
      MIN(cliente_id::text)::uuid AS cliente_id,
      SUM(capital_pend) AS capital_base,
      MAX(fecha_vencimiento) FILTER (WHERE COALESCE(interes, 0) > 0) AS ultimo_interes_venc,
      MAX(COALESCE(tasa_interes, 0)) AS tasa_interes
    FROM cuotas_base
    GROUP BY prestamo_id
  ),
  -- Monto del interés corriente con la fórmula canónica del Recibo de Pago
  -- (get_prestamos_cliente en mora_default_empresa.sql): meses completos
  -- + parte proporcional por día sobre el capital pendiente.
  interes_monto AS (
    SELECT
      ic.*,
      CASE
        WHEN ic.capital_base > 0
         AND ic.tasa_interes > 0
         AND ic.ultimo_interes_venc IS NOT NULL
         AND ic.ultimo_interes_venc < v_today
        THEN public.interes_corriente(ic.capital_base, ic.tasa_interes, ic.ultimo_interes_venc, v_today, 365, v_tenant)
        ELSE 0
      END AS monto_interes_corriente
    FROM interes_corriente ic
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
      -- Cuotas vencidas + interés corriente (antes faltaba el interés,
      -- por eso WhatsApp decía 2,488.93 en vez de 3,072.38)
      COALESCE(SUM(v.pendiente), 0)
        + COALESCE(MAX(ic.monto_interes_corriente), 0) AS monto_vencido,
      GREATEST(
        COALESCE(MAX(v_today - v.fecha_vencimiento), 0),
        COALESCE(MAX(v_today - ic.ultimo_interes_venc), 0)
      )::int AS dias_atraso
    FROM vencidas v
    FULL JOIN interes_monto ic
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
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('interes_dias_reales_odalys.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT string_agg(tenant_id::text, ',') FROM public.config_empresa WHERE interes_dias_reales) AS empresas_con_dias_reales,
  public.interes_corriente(15190.56, 8, '2026-07-21', '2026-09-30', 365, 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005') AS isabel_odalys_2836_68,
  public.interes_corriente(15190.56, 8, '2026-07-21', '2026-09-30', 365, '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS mismo_en_naranjos_2790_06;
