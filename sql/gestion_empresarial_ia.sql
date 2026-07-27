-- =====================================================================
-- GESTIÓN EMPRESARIAL IA — proyección a 6 meses
-- ---------------------------------------------------------------------
-- (2026-07-26) Submódulo de MOTOFLOW IA CEO. Responde: "¿cuánto tengo que
-- facturar cada mes para cubrir lo que la empresa ya debe?"
--
-- Para el mes actual y los 5 siguientes (6 meses) calcula:
--   · compromisos  = compromisos fijos por pagar que vencen ese mes
--                    (nómina, alquiler, luz…; los recurrentes se proyectan)
--   · suplidores   = cuentas por pagar pendientes que vencen ese mes
--                    (cada pagaré vence en fecha + dias_credito)
--   · gastos       = gasto operativo ESTIMADO del mes = promedio diario real
--                    de los últimos 90 días x días del mes
--   · total_cubrir = compromisos + suplidores + gastos
--   · facturacion_necesaria = lo que hay que facturar para cubrir ese total.
--     Si la empresa tiene margen bruto conocido (ventas vs costo de los
--     últimos 90 días), se divide entre el margen: vender RD$100 no deja
--     RD$100 libres. Sin datos de margen, se informa el total tal cual y se
--     marca margen_pct = NULL para que la pantalla lo diga.
--
-- Devuelve además el historial real de gastos de los últimos 6 meses.
-- Idempotente. Correr en PRODUCCIÓN.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gestion_empresarial_ia(
  p_meses int DEFAULT 6
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mes_ini  date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_n        int  := GREATEST(COALESCE(p_meses, 6), 1);
  v_gasto_d  numeric := 0;   -- gasto promedio por día (últimos 90 días)
  v_margen   numeric;        -- margen bruto (0-1) de los últimos 90 días
  v_ventas   numeric := 0;
  v_costo    numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Gasto operativo promedio por día (real, últimos 90 días)
  SELECT COALESCE(SUM(monto), 0) / 90.0 INTO v_gasto_d
  FROM public.gastos_diarios
  WHERE tenant_id = v_tenant
    AND fecha >= (v_hoy - 90) AND fecha <= v_hoy
    AND COALESCE(anulado, false) = false;

  -- Margen bruto de los últimos 90 días: (venta - costo) / venta
  SELECT COALESCE(SUM(d.importe), 0),
         COALESCE(SUM(COALESCE(d.costo_unitario, 0) * d.cantidad), 0)
    INTO v_ventas, v_costo
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
  WHERE f.tenant_id = v_tenant
    AND f.fecha >= (v_hoy - 90)
    AND COALESCE(f.estado, '') <> 'ANULADA';
  v_margen := CASE WHEN v_ventas > 0 AND v_costo > 0 AND v_costo < v_ventas
                   THEN (v_ventas - v_costo) / v_ventas
                   ELSE NULL END;

  WITH meses AS (
    SELECT (v_mes_ini + (n || ' month')::interval)::date AS mes
    FROM generate_series(0, v_n - 1) n
  ),
  compromisos_mes AS (  -- fijos por pagar (los ya pagados no cuentan)
    SELECT date_trunc('month', c.fecha)::date AS mes,
           SUM(c.monto)  AS monto,
           COUNT(*)      AS cant
    FROM public.compromisos c
    WHERE c.tenant_id = v_tenant
      AND COALESCE(c.activo, true) = true          -- activo = aún por pagar
      AND c.fecha >= v_mes_ini
    GROUP BY 1
  ),
  suplidores_mes AS (  -- CxP pendientes por mes de vencimiento
    SELECT date_trunc('month', (co.fecha + COALESCE(co.dias_credito, 0))::date)::date AS mes,
           SUM(COALESCE(co.monto_pendiente, 0)) AS monto,
           COUNT(*)                              AS cant
    FROM public.compras co
    WHERE co.tenant_id = v_tenant
      AND co.estado = 'PENDIENTE'
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.monto_pendiente, 0) > 0
    GROUP BY 1
  ),
  filas AS (
    SELECT
      m.mes,
      COALESCE(cm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      -- gasto estimado del mes = promedio diario x días de ese mes
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
  ),
  hist AS (  -- gasto REAL de los últimos 6 meses (para el historial)
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(g.monto) AS monto,
           COUNT(*)     AS cant
    FROM public.gastos_diarios g
    WHERE g.tenant_id = v_tenant
      AND g.fecha >= (v_mes_ini - interval '6 months')::date
      AND g.fecha < v_mes_ini
      AND COALESCE(g.anulado, false) = false
    GROUP BY 1
  )
  SELECT json_build_object(
    'generado',        v_hoy,
    'gasto_diario',    ROUND(v_gasto_d, 2),
    'margen_pct',      CASE WHEN v_margen IS NULL THEN NULL ELSE ROUND(v_margen * 100, 2) END,
    'meses', COALESCE((
      SELECT json_agg(json_build_object(
        'mes',              to_char(f.mes, 'YYYY-MM'),
        'compromisos',      ROUND(f.compromisos, 2),
        'compromisos_cant', f.compromisos_cant,
        'suplidores',       ROUND(f.suplidores, 2),
        'suplidores_cant',  f.suplidores_cant,
        'gastos',           f.gastos,
        'total_cubrir',     ROUND(f.compromisos + f.suplidores + f.gastos, 2),
        -- Con margen conocido hay que facturar MÁS que la obligación.
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL
               THEN ROUND(f.compromisos + f.suplidores + f.gastos, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos) / v_margen, 2) END
      ) ORDER BY f.mes)
      FROM filas f
    ), '[]'::json),
    'totales', (
      SELECT json_build_object(
        'compromisos',  ROUND(COALESCE(SUM(compromisos), 0), 2),
        'suplidores',   ROUND(COALESCE(SUM(suplidores), 0), 2),
        'gastos',       ROUND(COALESCE(SUM(gastos), 0), 2),
        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL
               THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0) / v_margen, 2) END
      ) FROM filas
    ),
    'historial_gastos', COALESCE((
      SELECT json_agg(json_build_object(
        'mes',   to_char(h.mes, 'YYYY-MM'),
        'monto', ROUND(h.monto, 2),
        'cant',  h.cant
      ) ORDER BY h.mes)
      FROM hist h
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_empresarial_ia.sql');
  END IF;
END $$;

SELECT 'get_gestion_empresarial_ia lista (proyeccion a 6 meses)' AS status;
