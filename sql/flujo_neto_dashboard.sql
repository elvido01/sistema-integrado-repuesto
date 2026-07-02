-- =====================================================================
-- Flujo neto acumulado del mes  (Dashboard / Inicio)
-- ---------------------------------------------------------------------
-- Reemplaza el indicador "Superavit estimado" (proyeccion de ventas -
-- compromisos) por el DINERO NETO realmente generado en el mes:
--
--   ingresos cobrados
--   - gastos diarios pagados
--   - compromisos fijos pagados
--   - pagos a suplidores
--   - compras de contado
--   = flujo neto acumulado del mes
--
-- Solo cuenta dinero REALMENTE cobrado o pagado (nada pendiente ni a
-- credito no cobrado). Compara el mes actual contra el MISMO periodo del
-- mes anterior (1..dia de hoy) y devuelve las series diarias acumuladas
-- para el grafico.
--
-- Reglas anti-duplicado (fuente de verdad por categoria):
--   ingreso_venta_contado -> facturas.forma_pago='contado'  (efectivo al vender)
--   ingreso_cobro_cliente -> recibos_ingreso                (cobros de credito/abonos)
--       * una venta a credito NO cuenta al emitirse; cuenta cuando entra
--         el cobro por recibos_ingreso -> no se duplica con facturas.
--   gasto_operativo       -> gastos_diarios
--   compromiso_fijo       -> compromisos pagados (activo=false, fecha_pago)
--   pago_suplidor         -> pagos_suplidores
--   compra_contado        -> compras.forma_pago='contado'
--       * una compra a credito NO cuenta al registrarse; cuenta cuando se
--         paga via pagos_suplidores -> no se duplica con compras.
--
-- Fecha de negocio por tabla (no created_at):
--   facturas.fecha, recibos_ingreso.fecha, gastos_diarios.fecha,
--   pagos_suplidores.fecha, compras.fecha  (columnas DATE)
--   compromisos.fecha_pago (timestamptz) -> se convierte a fecha local RD.
--
-- Zona horaria: America/Santo_Domingo para determinar "hoy" y el dia
-- contable de compromisos.
--
-- Seguridad: SECURITY DEFINER que resuelve el tenant del usuario
-- autenticado con get_user_tenant() (mismo patron que get_clientes_morosos).
-- Nunca confia en un tenant enviado desde el frontend.
-- =====================================================================

-- 1) Meta mensual de flujo neto, configurable por empresa (multi-tenant).
--    Separada de meta_ventas para no mezclar "vender" con "generar caja".
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS meta_flujo_neto_mensual NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.config_empresa.meta_flujo_neto_mensual IS
  'Meta mensual de flujo neto de caja usada por la tarjeta "Flujo neto acumulado" del Dashboard.';

-- 2) Indices para que el RPC filtre por tenant + fecha de forma eficiente.
--    (IF NOT EXISTS evita duplicar los que ya existan.)
CREATE INDEX IF NOT EXISTS idx_facturas_tenant_fecha
  ON public.facturas (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_tenant_fecha
  ON public.recibos_ingreso (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_suplidores_tenant_fecha
  ON public.pagos_suplidores (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_compras_tenant_fecha
  ON public.compras (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_compromisos_tenant_fecha_pago
  ON public.compromisos (tenant_id, fecha_pago);
-- gastos_diarios ya tiene idx_gastos_diarios_tenant_fecha.


-- 3) RPC principal.
CREATE OR REPLACE FUNCTION public.get_flujo_neto_dashboard(
  p_fecha_referencia date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant       uuid := public.get_user_tenant();
  v_hoy          date := COALESCE(p_fecha_referencia, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_mes_ini      date := date_trunc('month', v_hoy)::date;
  v_dia          int  := (v_hoy - date_trunc('month', v_hoy)::date) + 1;          -- dias transcurridos (incluye hoy)
  v_ult_dia_mes  date := (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date;
  v_dias_en_mes  int  := extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'))::int;
  v_mes_ant_ini  date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_ult_dia_ant  date := (date_trunc('month', v_hoy) - interval '1 day')::date;   -- ultimo dia del mes anterior
  v_mes_ant_fin  date := LEAST(
                           ((date_trunc('month', v_hoy) - interval '1 month')::date + (v_dia - 1)),
                           (date_trunc('month', v_hoy) - interval '1 day')::date
                         );
  v_meta         numeric := 0;
  v_result       json;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(meta_flujo_neto_mensual, 0)
    INTO v_meta
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  WITH movimientos AS (
    -- INGRESO: ventas de contado (efectivo recibido al vender)
    SELECT f.fecha::date AS dia, f.total::numeric AS ingreso, 0::numeric AS egreso,
           'ingreso_venta_contado'::text AS categoria
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND f.fecha >= v_mes_ant_ini AND f.fecha <= v_hoy
      AND f.forma_pago ILIKE 'contado'
      AND COALESCE(f.estado, '') <> 'ANULADA'

    UNION ALL
    -- INGRESO: cobros de clientes (recibos de ingreso = cobros de credito / abonos)
    SELECT r.fecha::date, r.monto_pagado::numeric, 0, 'ingreso_cobro_cliente'
    FROM public.recibos_ingreso r
    WHERE r.tenant_id = v_tenant
      AND r.fecha >= v_mes_ant_ini AND r.fecha <= v_hoy
      AND COALESCE(r.anulado, false) = false

    UNION ALL
    -- EGRESO: gastos diarios pagados
    SELECT g.fecha::date, 0, g.monto::numeric, 'gasto_operativo'
    FROM public.gastos_diarios g
    WHERE g.tenant_id = v_tenant
      AND g.fecha >= v_mes_ant_ini AND g.fecha <= v_hoy
      AND COALESCE(g.anulado, false) = false

    UNION ALL
    -- EGRESO: compromisos fijos PAGADOS (activo=false + fecha_pago real)
    SELECT (c.fecha_pago AT TIME ZONE 'America/Santo_Domingo')::date, 0, c.monto::numeric, 'compromiso_fijo'
    FROM public.compromisos c
    WHERE c.tenant_id = v_tenant
      AND c.activo = false
      AND c.fecha_pago IS NOT NULL
      AND (c.fecha_pago AT TIME ZONE 'America/Santo_Domingo')::date >= v_mes_ant_ini
      AND (c.fecha_pago AT TIME ZONE 'America/Santo_Domingo')::date <= v_hoy

    UNION ALL
    -- EGRESO: pagos a suplidores
    SELECT ps.fecha::date, 0, ps.monto_pagado::numeric, 'pago_suplidor'
    FROM public.pagos_suplidores ps
    WHERE ps.tenant_id = v_tenant
      AND ps.fecha >= v_mes_ant_ini AND ps.fecha <= v_hoy
      AND COALESCE(ps.anulado, false) = false

    UNION ALL
    -- EGRESO: compras de contado (efectivo que sale al comprar)
    SELECT co.fecha::date, 0, co.total_compra::numeric, 'compra_contado'
    FROM public.compras co
    WHERE co.tenant_id = v_tenant
      AND co.fecha >= v_mes_ant_ini AND co.fecha <= v_hoy
      AND co.forma_pago ILIKE 'contado'
      AND COALESCE(co.estado, '') <> 'ANULADA'
  ),
  dia_neto AS (
    SELECT dia,
           SUM(ingreso)          AS ingreso,
           SUM(egreso)           AS egreso,
           SUM(ingreso - egreso) AS neto
    FROM movimientos
    GROUP BY dia
  ),
  agg AS (
    SELECT
      -- ---- PERIODO ACTUAL (mes_ini .. hoy) ----
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_venta_contado' AND dia >= v_mes_ini), 0) AS act_venta_contado,
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_cobro_cliente' AND dia >= v_mes_ini), 0) AS act_cobro_cliente,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'gasto_operativo'       AND dia >= v_mes_ini), 0) AS act_gastos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compromiso_fijo'       AND dia >= v_mes_ini), 0) AS act_compromisos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_suplidor'         AND dia >= v_mes_ini), 0) AS act_suplidores,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compra_contado'        AND dia >= v_mes_ini), 0) AS act_compras,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ini), 0)                                AS act_flujo,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia = v_hoy), 0)                                     AS flujo_hoy,
      -- ---- PERIODO ANTERIOR (mes_ant_ini .. mes_ant_fin) ----
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin), 0)   AS ant_flujo,
      COUNT(*) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin)                             AS ant_movs
    FROM movimientos
  ),
  serie_actual AS (
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ini) + 1 AS dia_mes,
             SUM(dn.neto) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_mes_ini, v_hoy, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  ),
  serie_anterior AS (
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ant_ini) + 1 AS dia_mes,
             SUM(dn.neto) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_mes_ant_ini, v_mes_ant_fin, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  )
  SELECT json_build_object(
    'periodo_actual', json_build_object(
      'fecha_inicio',            v_mes_ini,
      'fecha_fin',               v_hoy,
      'dias_transcurridos',      v_dia,
      'dias_en_mes',             v_dias_en_mes,
      'ingreso_venta_contado',   ROUND(a.act_venta_contado, 2),
      'ingreso_cobro_cliente',   ROUND(a.act_cobro_cliente, 2),
      'ingresos_cobrados',       ROUND(a.act_venta_contado + a.act_cobro_cliente, 2),
      'gastos_diarios',          ROUND(a.act_gastos, 2),
      'compromisos_fijos_pagados', ROUND(a.act_compromisos, 2),
      'pagos_suplidores',        ROUND(a.act_suplidores, 2),
      'compras_contado',         ROUND(a.act_compras, 2),
      'total_egresos',           ROUND(a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras, 2),
      'flujo_neto',              ROUND(a.act_flujo, 2),
      'flujo_hoy',               ROUND(a.flujo_hoy, 2),
      'promedio_diario',         ROUND(a.act_flujo / NULLIF(v_dia, 0), 2)
    ),
    'periodo_anterior', json_build_object(
      'fecha_inicio', v_mes_ant_ini,
      'fecha_fin',    v_mes_ant_fin,
      'flujo_neto',   ROUND(a.ant_flujo, 2),
      'tiene_datos',  (a.ant_movs > 0)
    ),
    'comparacion', json_build_object(
      'diferencia',          ROUND(a.act_flujo - a.ant_flujo, 2),
      'variacion_porcentual',
        CASE WHEN a.ant_flujo <> 0
             THEN ROUND(((a.act_flujo - a.ant_flujo) / abs(a.ant_flujo)) * 100, 2)
             ELSE NULL END
    ),
    'metas', json_build_object(
      'meta_mensual',    ROUND(v_meta, 2),
      'proyeccion',      ROUND((a.act_flujo / NULLIF(v_dia, 0)) * v_dias_en_mes, 2),
      'porcentaje_meta',
        CASE WHEN v_meta > 0
             THEN ROUND((a.act_flujo / v_meta) * 100, 2)
             ELSE NULL END
    ),
    'series', json_build_object(
      'mes_actual',   COALESCE((SELECT data FROM serie_actual),   '[]'::json),
      'mes_anterior', COALESCE((SELECT data FROM serie_anterior), '[]'::json)
    )
  )
  INTO v_result
  FROM agg a;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_flujo_neto_dashboard(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_flujo_neto_dashboard(date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'meta_flujo_neto_mensual + get_flujo_neto_dashboard listos' AS status;
