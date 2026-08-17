-- =====================================================================
-- EL INTERES SOLO DESAPARECE SI SE PAGA (o si lo rebaja una nota de credito)
-- ---------------------------------------------------------------------
-- Reportado 2026-08-17 (ALTAGRACIA SUERO GARCIA, PT-0026576).
--
-- LO QUE PASO
--   14:00:40  recibo 0147923 · 16,000 · aplicado al PT-0026212 (otro prestamo)
--   14:04:14  recibo 0147924 ·  5,000 · al PT-0026576, TODO a capital
--   El PT-0026576 tenia 615.07 de interes corriente acumulado
--   (10,000 al 5% mensual desde el 10/07: 1 mes = 500.00 + 7 dias = 115.07).
--   Ese interes no se cobro, no se rebajo: DESAPARECIO.
--
--   La prueba esta en el propio recibo:
--     balance_anterior 0147923 = 50,615.07
--       = 49,600.00 capital + 400.00 cargo + 615.07 interes
--     balance_actual              = 34,000.00
--     bajo 16,615.07 habiendo pagado 16,000.00  -> se perdieron 615.07
--
-- LA CAUSA
--   El ancla del interes corriente era el ULTIMO PAGO DEL CLIENTE, buscado
--   sin filtrar por prestamo:
--     SELECT MAX(fecha) INTO v_ult_pago FROM prestamo_pagos
--      WHERE cliente_id = p_cliente_id          -- <- cualquier prestamo
--   Al grabar el pago de OTRO prestamo, el ancla del PT-0026576 salto a hoy.
--   Y como ic2 exige `ult_int_venc < v_today`, el prestamo se cayo de la
--   consulta y el interes mostro 0.00. Cuatro minutos despues los 5,000
--   entraron completos a capital.
--
--   El reloj del interes se reiniciaba con CUALQUIER pago, aunque el interes
--   no se hubiera cobrado. Sin dos prestamos tambien pasa: basta abonar
--   capital sin tocar la fila >>INTERES<<.
--
-- ALCANCE MEDIDO (tenant 766fe3d6, MotoPrestamos Los Naranjos)
--   52 prestamos a solo interes activos · 22 con cliente de mas de un prestamo
--   27 pagos donde el balance bajo mas de lo pagado · RD$ 5,932.03 perdidos
--
-- LA REGLA (dictada por el dueño, 2026-08-17)
--   "El interes de los prestamos solo puede desaparecer cuando se le aplica
--    un pago. Si un prestamo tiene 700 de interes y el cliente abona 600,
--    los otros 100 deben quedar pendientes con la fecha de su mes. No puede
--    volver a desaparecer ni un solo centavo si no tiene un pago
--    correspondiente, o si no es rebajado por el modulo de nota de credito."
--
-- EL ARREGLO
--   El ancla deja de ser "el ultimo pago" y pasa a ser "hasta cuando esta
--   COBRADO el interes" (prestamos.interes_cobrado_hasta). Esa fecha solo
--   avanza por los dos caminos legitimos, que ya materializan el interes
--   como cuota real y por lo tanto mandan por la PRIMERA rama del COALESCE:
--     * recibo de pago  -> sql/fix_pago_interes_corriente.sql
--     * nota de credito -> sql/fix_nota_credito_interes_corriente.sql
--   Un abono a capital ya no mueve nada. Un pago a otro prestamo tampoco.
--   Y el abono parcial queda solo: la cuota materializada guarda
--   interes=700 / interes_pagado=600, y los 100 siguen pendientes con su
--   fecha — que es exactamente lo que pide la regla.
--
-- SE CONGELA EL PASADO
--   interes_cobrado_hasta se rellena con el ancla que la funcion vieja
--   calcula HOY. El dia que corra esto, ningun balance se mueve y ningun
--   cliente recibe un cobro sorpresa. Los 5,932.03 ya perdidos NO se
--   reclaman (decision del dueño). De aqui en adelante no se pierde mas.
--
-- Base: sql/fix_interes_corriente_desde_inicio.sql (la version viva en
-- produccion, confirmada en schema_migraciones el 2026-07-22 20:37).
-- OJO futuro: al reescribir get_prestamos_cliente, partir de ESTE archivo.
-- Idempotente / re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Hasta cuando esta cobrado el interes de cada prestamo
-- ---------------------------------------------------------------------
ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS interes_cobrado_hasta date;

COMMENT ON COLUMN public.prestamos.interes_cobrado_hasta IS
  'Prestamos a solo interes: fecha hasta la cual el interes esta saldado. '
  'Es el ancla desde donde corre el interes corriente. Solo avanza cuando el '
  'interes se COBRA (recibo de pago) o se REBAJA (nota de credito) — ambos '
  'caminos lo materializan como cuota real. Ningun otro pago la mueve.';

-- ---------------------------------------------------------------------
-- 2. Congelar el pasado: el ancla que la funcion vieja da HOY
--    (asi nadie ve subir su balance el dia del arreglo)
-- ---------------------------------------------------------------------
WITH ult AS (
  SELECT tenant_id, cliente_id, MAX(fecha) AS ult_pago
  FROM public.prestamo_pagos
  WHERE COALESCE(anulado, false) = false
  GROUP BY tenant_id, cliente_id
),
ancla AS (
  SELECT
    p.id,
    COALESCE(
      -- si el interes ya se materializo alguna vez, esa es la fecha buena
      (SELECT MAX(q.fecha_vencimiento) FROM public.prestamo_cuotas q
        WHERE q.prestamo_id = p.id AND q.tenant_id = p.tenant_id AND q.interes > 0),
      -- si no, lo que la funcion vieja usaba: el ultimo pago del cliente
      GREATEST(COALESCE(u.ult_pago, p.fecha_inicio), p.fecha_inicio)
    ) AS hasta
  FROM public.prestamos p
  LEFT JOIN ult u ON u.tenant_id = p.tenant_id AND u.cliente_id = p.cliente_id
  WHERE p.es_solo_interes
)
UPDATE public.prestamos p
   SET interes_cobrado_hasta = a.hasta
  FROM ancla a
 WHERE a.id = p.id
   AND p.interes_cobrado_hasta IS NULL;   -- re-ejecutable: no repisa lo ya fijado

-- ---------------------------------------------------------------------
-- 3. La funcion, con el ancla nueva
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
-- 4. El vigilante: cualquier centavo que vuelva a desaparecer sale aqui
-- ---------------------------------------------------------------------
-- Un pago solo puede bajar el balance en lo que se pago. Si bajo mas, algo
-- se esfumo sin cobrarse. Esta vista es la que hace cumplir la regla — se
-- mira cada dia, y lo normal es que salga VACIA.
DROP VIEW IF EXISTS public.v_interes_evaporado;
CREATE VIEW public.v_interes_evaporado
WITH (security_invoker = true) AS
SELECT
  pg.tenant_id,
  pg.numero        AS recibo,
  pg.fecha,
  c.nombre         AS cliente,
  pg.total_pagado,
  pg.balance_anterior,
  pg.balance_actual,
  round(pg.balance_anterior - pg.balance_actual - pg.total_pagado, 2) AS desaparecido
FROM public.prestamo_pagos pg
LEFT JOIN public.clientes c ON c.id = pg.cliente_id AND c.tenant_id = pg.tenant_id
WHERE COALESCE(pg.anulado, false) = false
  AND pg.balance_anterior > 0
  AND pg.balance_anterior - pg.balance_actual - pg.total_pagado > 0.01;

COMMENT ON VIEW public.v_interes_evaporado IS
  'Pagos donde el balance bajo MAS de lo que se pago: interes que desaparecio '
  'sin cobrarse ni rebajarse por nota de credito. Debe estar vacia para toda '
  'fecha posterior al arreglo (sql/interes_no_desaparece_sin_pago.sql). Lo de '
  'antes del 2026-08-17 es historico congelado — no se reclama.';

GRANT SELECT ON public.v_interes_evaporado TO authenticated, service_role;

DO $mig$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('interes_no_desaparece_sin_pago.sql');
  END IF;
END $mig$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICACION
-- ---------------------------------------------------------------------
-- Una sola consulta a proposito: pegando el archivo completo en el editor
-- de Supabase, esto es lo ultimo que corre y por lo tanto lo que queda en
-- pantalla. Las cinco lineas deben decir OK.
-- =====================================================================

WITH def AS (
  SELECT pg_get_functiondef(p.oid) AS src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_prestamos_cliente'
),
chequeos AS (
  SELECT 1 AS n,
         'la funcion ya no lee la tabla de pagos' AS chequeo,
         (position('prestamo_pagos' in (SELECT src FROM def)) = 0)::text AS resultado,
         'true' AS esperado
  UNION ALL
  SELECT 2, 'el ancla nueva esta en uso',
         (position('interes_cobrado_hasta' in (SELECT src FROM def)) > 0)::text, 'true'
  UNION ALL
  SELECT 3, 'prestamos a solo interes que quedaron sin ancla',
         (SELECT count(*)::text FROM public.prestamos
           WHERE es_solo_interes AND interes_cobrado_hasta IS NULL), '0'
  UNION ALL
  SELECT 4, 'ancla del PT-0026576 (congelada: no se le cobra lo perdido)',
         COALESCE((SELECT interes_cobrado_hasta::text FROM public.prestamos
                    WHERE numero = 'PT-0026576'), 'no existe'),
         (CURRENT_DATE)::text
  UNION ALL
  SELECT 5, 'interes evaporado despues del arreglo',
         (SELECT count(*)::text FROM public.v_interes_evaporado
           WHERE fecha > CURRENT_DATE), '0'
)
SELECT n, chequeo, resultado, esperado,
       CASE WHEN resultado = esperado THEN 'OK' ELSE '*** FALLO ***' END AS estado
FROM chequeos ORDER BY n;

-- Si alguna dice FALLO, no sigas: avisame con la fila que salio.
--
-- De aqui en adelante, el vigilante se mira asi (debe salir VACIO):
--   SELECT * FROM public.v_interes_evaporado WHERE fecha > '2026-08-17'
--   ORDER BY fecha DESC;
