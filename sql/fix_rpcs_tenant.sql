-- ============================================================
-- FIX: RPCs del Dashboard - Filtrar por tenant_id
-- + RLS para config_empresa
-- VERSIÓN CORREGIDA (v2) - Columnas correctas
-- Ejecutar en produccion
-- ============================================================

-- 0. config_empresa: asegurar tenant_id + RLS
ALTER TABLE config_empresa ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE config_empresa SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE config_empresa ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE config_empresa ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

CREATE INDEX IF NOT EXISTS idx_config_empresa_tenant ON config_empresa(tenant_id);

ALTER TABLE config_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON config_empresa;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON config_empresa;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON config_empresa;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON config_empresa;

DROP POLICY IF EXISTS "tenant_select_config_empresa" ON config_empresa;
DROP POLICY IF EXISTS "tenant_insert_config_empresa" ON config_empresa;
DROP POLICY IF EXISTS "tenant_update_config_empresa" ON config_empresa;
DROP POLICY IF EXISTS "tenant_delete_config_empresa" ON config_empresa;

CREATE POLICY "tenant_select_config_empresa" ON config_empresa FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_config_empresa" ON config_empresa FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_config_empresa" ON config_empresa FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_config_empresa" ON config_empresa FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- 1. get_stats_dashboard - CORREGIDO: usa inventario_movimientos
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

  SELECT COALESCE(SUM(total), 0) INTO v_ventas_hoy
  FROM facturas
  WHERE (fecha AT TIME ZONE 'America/Santo_Domingo')::date = (now() AT TIME ZONE 'America/Santo_Domingo')::date
    AND estado != 'ANULADA'
    AND tenant_id = v_tenant;

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

  SELECT COUNT(*) INTO v_clientes_activos
  FROM clientes
  WHERE activo = true
    AND tenant_id = v_tenant;

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

-- 2. get_sales_quality
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

  SELECT COALESCE(SUM(total), 0) INTO v_contado
  FROM facturas
  WHERE UPPER(forma_pago) != 'CREDITO'
    AND estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

  SELECT COALESCE(SUM(total), 0) INTO v_credito
  FROM facturas
  WHERE UPPER(forma_pago) = 'CREDITO'
    AND estado != 'ANULADA'
    AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    AND tenant_id = v_tenant;

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

-- 3. get_commitments_week
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

-- 4. get_sales_metrics
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

-- 5. get_monthly_growth
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

-- 6. get_weekly_financials - CORREGIDO: devuelve los campos correctos
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

  SELECT COALESCE(SUM(monto), 0) INTO v_total_compromisos
  FROM compromisos
  WHERE activo = true
    AND fecha BETWEEN inicio_semana AND fin_semana
    AND tenant_id = v_tenant;

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
