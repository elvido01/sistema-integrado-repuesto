-- ============================================================
-- FIX DEFINITIVO: RPCs del Dashboard con tenant + columnas correctas
-- Ejecutar en Supabase SQL Editor (producción)
-- ============================================================

-- ============================================================
-- 1. get_stats_dashboard - CORREGIDO: usa inventario_movimientos
--    en lugar de columna "existencia" que NO existe
-- ============================================================
DROP FUNCTION IF EXISTS get_stats_dashboard();
CREATE OR REPLACE FUNCTION get_stats_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
  v_ventas_hoy NUMERIC;
  v_stock_bajo INT;
  v_clientes_activos INT;
  v_productos_total INT;
BEGIN
  v_tenant := public.get_user_tenant();

  -- Ventas del dia (facturas no anuladas de hoy, timezone local)
  SELECT COALESCE(SUM(total), 0) INTO v_ventas_hoy
  FROM facturas
  WHERE (fecha AT TIME ZONE 'America/Santo_Domingo')::date = (now() AT TIME ZONE 'America/Santo_Domingo')::date
    AND estado != 'ANULADA'
    AND tenant_id = v_tenant;

  -- Stock bajo: productos activos cuyo stock calculado <= min_stock
  -- Usa LEFT JOIN en inventario_movimientos (NO la columna "existencia")
  SELECT COUNT(*) INTO v_stock_bajo
  FROM productos p
  LEFT JOIN (
    SELECT producto_id, SUM(cantidad) AS total_stock
    FROM inventario_movimientos
    WHERE tenant_id = v_tenant
    GROUP BY producto_id
  ) m ON m.producto_id = p.id
  WHERE p.activo = true
    AND p.tenant_id = v_tenant
    AND COALESCE(m.total_stock, 0) <= COALESCE(p.min_stock, 0)
    AND COALESCE(m.total_stock, 0) > 0;

  -- Clientes activos
  SELECT COUNT(*) INTO v_clientes_activos
  FROM clientes
  WHERE activo = true
    AND tenant_id = v_tenant;

  -- Productos total
  SELECT COUNT(*) INTO v_productos_total
  FROM productos
  WHERE activo = true
    AND tenant_id = v_tenant;

  RETURN json_build_object(
    'ventasHoy', v_ventas_hoy,
    'stockBajo', v_stock_bajo,
    'clientesActivos', v_clientes_activos,
    'productosTotal', v_productos_total
  );
END;
$$;

-- ============================================================
-- 2. get_sales_quality - OK, solo necesita tenant filter
-- ============================================================
DROP FUNCTION IF EXISTS get_sales_quality();
CREATE OR REPLACE FUNCTION get_sales_quality()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
  v_contado NUMERIC;
  v_credito NUMERIC;
  v_semana NUMERIC;
BEGIN
  v_tenant := public.get_user_tenant();

  -- Ventas contado del mes
  SELECT COALESCE(SUM(total), 0) INTO v_contado
  FROM facturas
  WHERE UPPER(forma_pago) != 'CREDITO'
    AND estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

  -- Ventas credito del mes
  SELECT COALESCE(SUM(total), 0) INTO v_credito
  FROM facturas
  WHERE UPPER(forma_pago) = 'CREDITO'
    AND estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

  -- Ventas de la semana
  SELECT COALESCE(SUM(total), 0) INTO v_semana
  FROM facturas
  WHERE estado != 'ANULADA'
    AND fecha >= date_trunc('week', CURRENT_DATE)
    AND tenant_id = v_tenant;

  RETURN json_build_object(
    'ventasContado', v_contado,
    'ventasCredito', v_credito,
    'ventasSemana', v_semana,
    'ventasMes', v_contado + v_credito
  );
END;
$$;

-- ============================================================
-- 3. get_commitments_week - OK
-- ============================================================
DROP FUNCTION IF EXISTS get_commitments_week();
CREATE OR REPLACE FUNCTION get_commitments_week()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
    FROM compromisos c
    WHERE c.activo = true
      AND c.tenant_id = v_tenant
  );
END;
$$;

-- ============================================================
-- 4. get_sales_metrics - OK
-- ============================================================
DROP FUNCTION IF EXISTS get_sales_metrics();
CREATE OR REPLACE FUNCTION get_sales_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
  v_total_ventas NUMERIC;
  v_primera_venta DATE;
  v_total_dias NUMERIC;
  v_ventas_mes NUMERIC;
  v_dias_mes NUMERIC;
  v_total_facturas INT;
  v_promedio_factura NUMERIC;
BEGIN
  v_tenant := public.get_user_tenant();

  -- Total ventas históricas y primera venta
  SELECT COALESCE(SUM(total), 0), MIN(fecha::date)
  INTO v_total_ventas, v_primera_venta
  FROM facturas
  WHERE estado != 'ANULADA'
    AND tenant_id = v_tenant;

  IF v_primera_venta IS NULL THEN
    v_total_dias := 1;
  ELSE
    v_total_dias := GREATEST(CURRENT_DATE - v_primera_venta, 1);
  END IF;

  -- Ventas del mes actual
  SELECT COALESCE(SUM(total), 0), COUNT(*), COALESCE(AVG(total), 0)
  INTO v_ventas_mes, v_total_facturas, v_promedio_factura
  FROM facturas
  WHERE estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

  v_dias_mes := EXTRACT(DAY FROM CURRENT_DATE);
  IF v_dias_mes = 0 THEN v_dias_mes := 1; END IF;

  RETURN json_build_object(
    'total_ventas', v_total_ventas,
    'total_dias', v_total_dias,
    'ventas_mes_actual', v_ventas_mes,
    'dias_transcurridos_mes', v_dias_mes,
    'totalMes', v_ventas_mes,
    'totalFacturas', v_total_facturas,
    'promedioFactura', v_promedio_factura
  );
END;
$$;

-- ============================================================
-- 5. get_monthly_growth - OK
-- ============================================================
DROP FUNCTION IF EXISTS get_monthly_growth();
CREATE OR REPLACE FUNCTION get_monthly_growth()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
  v_mes_actual NUMERIC;
  v_mes_anterior NUMERIC;
  v_crecimiento NUMERIC;
BEGIN
  v_tenant := public.get_user_tenant();

  SELECT COALESCE(SUM(total), 0) INTO v_mes_actual
  FROM facturas
  WHERE estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

  SELECT COALESCE(SUM(total), 0) INTO v_mes_anterior
  FROM facturas
  WHERE estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
    AND tenant_id = v_tenant;

  IF v_mes_anterior > 0 THEN
    v_crecimiento := ((v_mes_actual - v_mes_anterior) / v_mes_anterior) * 100;
  ELSE
    v_crecimiento := 0;
  END IF;

  RETURN json_build_object(
    'mesActual', v_mes_actual,
    'mesAnterior', v_mes_anterior,
    'crecimiento', v_crecimiento
  );
END;
$$;

-- ============================================================
-- 6. get_weekly_financials - CORREGIDO: devuelve los campos
--    que el frontend espera (total_compromisos_semana, etc.)
-- ============================================================
DROP FUNCTION IF EXISTS get_weekly_financials();
CREATE OR REPLACE FUNCTION get_weekly_financials()
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant UUID;
  v_total_compromisos NUMERIC;
  v_total_suplidores NUMERIC;
  inicio_semana DATE;
  fin_semana DATE;
BEGIN
  v_tenant := public.get_user_tenant();

  inicio_semana := date_trunc('week', CURRENT_DATE)::date;
  fin_semana := (inicio_semana + interval '6 days')::date;

  -- Compromisos activos de la semana
  SELECT COALESCE(SUM(monto), 0) INTO v_total_compromisos
  FROM compromisos
  WHERE activo = true
    AND fecha BETWEEN inicio_semana AND fin_semana
    AND tenant_id = v_tenant;

  -- Pagos pendientes a suplidores de la semana
  SELECT COALESCE(SUM(
    COALESCE(monto_pendiente, total_compra - COALESCE(monto_pagado, 0))
  ), 0) INTO v_total_suplidores
  FROM compras
  WHERE estado = 'PENDIENTE'
    AND forma_pago ILIKE 'CREDITO'
    AND (COALESCE(monto_pendiente, total_compra - COALESCE(monto_pagado, 0)) > 0)
    AND (fecha + (COALESCE(dias_credito, 0) * interval '1 day'))::date BETWEEN inicio_semana AND fin_semana
    AND tenant_id = v_tenant;

  RETURN json_build_object(
    'total_compromisos_semana', v_total_compromisos,
    'total_pagos_suplidores_semana', v_total_suplidores
  );
END;
$$;
