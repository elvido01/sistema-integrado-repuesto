-- =====================================================================
-- get_resumen_cartera_financiera — reporte agregado de cartera
-- ---------------------------------------------------------------------
-- Totales de la financiera (o de cualquier empresa con préstamos):
--   💰 capital_colocado    — capital prestado que sigue afuera
--   📈 interes_por_cobrar  — interés de cuotas + interés corriente dinámico
--   ⚠️ mora_pendiente      — mora diaria prorrateada (gate del cliente)
--   🧮 total_cxc           — capital + interés + mora
--   📊 prestamos_activos   — Nº de préstamos activos del filtro
-- Más un arreglo `prestamos` (una fila por préstamo) para la tabla.
--
-- Usa la MISMA matemática que get_prestamos_cliente (ver
-- sql/mora_default_empresa.sql) para mora e interés corriente. El TOTAL a
-- cobrar es idéntico; lo que este reporte hace de más es SEPARAR bien
-- capital vs interés dentro de cada cuota:
--   La decisión es POR PRÉSTAMO (no por cuota):
--   * Si el préstamo separa el interés en ALGUNA cuota (interes>0) — p.ej.
--     cuotas de interés mensual + un balloon de capital — se RESPETA el
--     capital/interés que ya traen las cuotas.
--   * Si NINGUNA cuota trae interés (todo está metido en `capital`, típico
--     del financiamiento de moto), se reparte con amortización flat:
--     capital_cuota = monto_capital / plazo_cuotas, y el resto es interés.
--   OJO: monto_capital es el principal ORIGINAL (las cuotas ya pagadas no se
--   migraron), por eso NO se usa directo — se reparte proporcional al saldo.
-- Validado al centavo (2026-07-14):
--   Fernando PT-0026551 (todo en capital) → capital 164,500, interés 89,030.
--   Francisco PT-0026173 (interés separado) → capital 10,000, interés 8,769.86
--     (+ corriente 394.52 = 9,164.38, igual al Recibo de Pago).
--
-- Filtros (todos opcionales):
--   p_busqueda  — nombre/código de cliente o número de préstamo (ILIKE)
--   p_tipo      — prestamos.tipo ('todos'/NULL = todos)
--   p_atraso    — 'todos' | 'al_dia' | 'vencidos' | 'con_mora'
--   p_desde/p_hasta — rango de fecha_inicio del préstamo
-- Re-ejecutable. Correr en PRODUCCIÓN.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_resumen_cartera_financiera(
  p_busqueda text DEFAULT NULL,
  p_tipo     text DEFAULT NULL,
  p_atraso   text DEFAULT 'todos',
  p_desde    date DEFAULT NULL,
  p_hasta    date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
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
           pf.cliente_nombre, pf.cliente_codigo, pf.genmora,
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
           c.cliente_nombre, c.cliente_codigo, c.fecha_vencimiento, c.dias_atraso,
           (c.cap_raw + c.int_raw) AS pend,
           -- capital pendiente de la cuota:
           --   si el préstamo YA separa interés → capital crudo de la cuota;
           --   si no → reparto flat (monto_capital/plazo dentro de la cuota).
           CASE
             WHEN lf.tiene_interes THEN c.cap_raw
             WHEN COALESCE(c.monto_capital, 0) > 0 AND COALESCE(c.plazo_cuotas, 0) > 0
                  AND (c.capital + c.interes) > 0
               THEN round((c.cap_raw + c.int_raw)
                          * LEAST(c.capital, round(c.monto_capital / c.plazo_cuotas, 2))
                          / (c.capital + c.interes), 2)
             ELSE c.cap_raw
           END AS capital_pend,
           -- mora sobre el pendiente TOTAL (no cambia con el reparto)
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
      ( n_meses * round(cap_base * (tasa/100.0), 2)
        + round(cap_base * (tasa/100.0) * 12.0
                * GREATEST(0, (v_today - (ult_int_venc + make_interval(months => n_meses))::date))::numeric
                / 365.0, 2)
      ) AS int_corr
    FROM (
      SELECT prestamo_id, cap_base, ult_int_venc, tasa,
        (date_part('year',  age(v_today, ult_int_venc)) * 12
         + date_part('month', age(v_today, ult_int_venc)))::int AS n_meses
      FROM ic
      WHERE ult_int_venc IS NOT NULL AND cap_base > 0 AND ult_int_venc < v_today
    ) z
  ),
  por_prestamo AS (  -- una fila por préstamo (para tabla y filtro de atraso)
    SELECT c.prestamo_id,
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
    GROUP BY c.prestamo_id
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
$$;

REVOKE EXECUTE ON FUNCTION public.get_resumen_cartera_financiera(text,text,text,date,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_resumen_cartera_financiera(text,text,text,date,date) TO authenticated, service_role;

-- Lista de tipos de préstamo (para el dropdown del filtro)
CREATE OR REPLACE FUNCTION public.get_tipos_prestamo()
RETURNS json
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(json_agg(DISTINCT tipo ORDER BY tipo), '[]'::json)
  FROM public.prestamos
  WHERE tenant_id = public.get_user_tenant() AND estado = 'activo' AND tipo IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tipos_prestamo() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tipos_prestamo() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('resumen_cartera_financiera.sql');
  END IF;
END $$;

SELECT 'get_resumen_cartera_financiera + get_tipos_prestamo listos' AS status;
