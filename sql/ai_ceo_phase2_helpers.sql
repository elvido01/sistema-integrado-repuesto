-- ============================================================
-- MORLA AI CEO — Fase 2: SQL Helpers para sub-agentes
-- ============================================================
-- Cada helper devuelve datos pre-filtrados y agregados que
-- alimentan a un sub-agente IA. Estrategia: SQL filtra duro
-- → solo enviamos lo importante al LLM.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. AI Inventario — resumen
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_inventario_summary(
  p_tenant_id UUID,
  p_dias_lento INT DEFAULT 90,
  p_dias_muerto INT DEFAULT 180,
  p_limit INT DEFAULT 25
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_top_capital_muerto JSON;
  v_top_stock_bajo JSON;
  v_total_capital_muerto NUMERIC;
  v_count_stock_bajo INT;
  v_count_muertos INT;
BEGIN
  -- Capital muerto: productos sin venta 180+ días con stock
  SELECT json_agg(row_to_json(t)), COUNT(*) FROM (
    SELECT
      p.codigo,
      p.descripcion,
      public.get_stock_actual(p.id) AS existencia,
      p.costo,
      ROUND((public.get_stock_actual(p.id) * COALESCE(p.costo, 0))::NUMERIC, 2) AS capital_inmovilizado
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND public.get_stock_actual(p.id) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - (p_dias_muerto || ' days')::INTERVAL
          AND f.estado != 'Anulada'
      )
    ORDER BY (public.get_stock_actual(p.id) * COALESCE(p.costo, 0)) DESC
    LIMIT p_limit
  ) t INTO v_top_capital_muerto, v_count_muertos;

  -- Stock bajo: existencia < min_stock con histórico de venta
  SELECT json_agg(row_to_json(t)), COUNT(*) FROM (
    SELECT
      p.codigo,
      p.descripcion,
      public.get_stock_actual(p.id) AS existencia,
      p.min_stock,
      p.max_stock,
      -- Velocidad: unidades vendidas últimos 30 días
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
          AND f.estado != 'Anulada'
      ), 0) AS vendidos_30d
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND p.min_stock > 0
      AND public.get_stock_actual(p.id) < p.min_stock
    ORDER BY (p.min_stock - public.get_stock_actual(p.id)) DESC
    LIMIT p_limit
  ) t INTO v_top_stock_bajo, v_count_stock_bajo;

  -- Total capital muerto
  SELECT COALESCE(SUM(public.get_stock_actual(p.id) * COALESCE(p.costo, 0)), 0)
  INTO v_total_capital_muerto
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND public.get_stock_actual(p.id) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id
        AND f.tenant_id = p_tenant_id
        AND f.fecha >= CURRENT_DATE - (p_dias_muerto || ' days')::INTERVAL
        AND f.estado != 'Anulada'
    );

  RETURN json_build_object(
    'total_capital_muerto', v_total_capital_muerto,
    'count_muertos', v_count_muertos,
    'count_stock_bajo', v_count_stock_bajo,
    'top_capital_muerto', COALESCE(v_top_capital_muerto, '[]'::json),
    'top_stock_bajo', COALESCE(v_top_stock_bajo, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventario_summary(UUID, INT, INT, INT) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- 2. AI Crédito — resumen
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_credito_summary(
  p_tenant_id UUID,
  p_limit INT DEFAULT 25
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_clientes_morosos JSON;
  v_total_mora NUMERIC;
  v_total_pendiente NUMERIC;
  v_count_facturas_vencidas INT;
BEGIN
  -- Top clientes morosos con total adeudado y días promedio
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      c.id AS cliente_id,
      c.codigo,
      c.nombre,
      c.telefono,
      c.limite_credito,
      COUNT(f.id) AS facturas_vencidas,
      SUM(f.monto_pendiente) AS total_adeudado,
      MAX((CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE)) AS dias_max_vencido,
      ROUND(AVG((CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE))::NUMERIC, 0) AS dias_promedio_vencido
    FROM public.clientes c
    JOIN public.facturas f ON f.cliente_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND f.tenant_id = p_tenant_id
      AND f.monto_pendiente > 0
      AND f.estado != 'Anulada'
      AND f.dias_credito > 0
      AND (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE
    GROUP BY c.id, c.codigo, c.nombre, c.telefono, c.limite_credito
    ORDER BY SUM(f.monto_pendiente) DESC
    LIMIT p_limit
  ) t INTO v_clientes_morosos;

  -- Totales
  SELECT
    COALESCE(SUM(monto_pendiente) FILTER (WHERE (fecha + (dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE), 0),
    COALESCE(SUM(monto_pendiente), 0),
    COUNT(*) FILTER (WHERE (fecha + (dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE)
  INTO v_total_mora, v_total_pendiente, v_count_facturas_vencidas
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND monto_pendiente > 0
    AND estado != 'Anulada'
    AND dias_credito > 0;

  RETURN json_build_object(
    'total_mora', v_total_mora,
    'total_pendiente', v_total_pendiente,
    'count_facturas_vencidas', v_count_facturas_vencidas,
    'clientes_morosos', COALESCE(v_clientes_morosos, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_credito_summary(UUID, INT) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- 3. AI Ventas — resumen
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ventas_summary(
  p_tenant_id UUID,
  p_dias INT DEFAULT 30,
  p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_ventas_actual NUMERIC;
  v_ventas_prev NUMERIC;
  v_crecimiento NUMERIC;
  v_ticket_promedio NUMERIC;
  v_num_facturas INT;
  v_top_productos JSON;
  v_productos_cayendo JSON;
BEGIN
  -- Ventas período actual
  SELECT COALESCE(SUM(total), 0), COUNT(*)
  INTO v_ventas_actual, v_num_facturas
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
    AND fecha <= CURRENT_DATE
    AND estado != 'Anulada';

  -- Ventas período previo
  SELECT COALESCE(SUM(total), 0) INTO v_ventas_prev
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - (2 * p_dias || ' days')::INTERVAL
    AND fecha <  CURRENT_DATE - (p_dias || ' days')::INTERVAL
    AND estado != 'Anulada';

  v_crecimiento := CASE WHEN v_ventas_prev > 0
    THEN ROUND(((v_ventas_actual - v_ventas_prev) / v_ventas_prev * 100)::NUMERIC, 2)
    ELSE NULL END;

  v_ticket_promedio := CASE WHEN v_num_facturas > 0
    THEN ROUND((v_ventas_actual / v_num_facturas)::NUMERIC, 2)
    ELSE 0 END;

  -- Top productos vendidos
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      fd.codigo,
      fd.descripcion,
      SUM(fd.cantidad) AS cantidad_vendida,
      SUM(fd.cantidad * fd.precio) AS ingreso_total,
      COUNT(DISTINCT fd.factura_id) AS num_facturas
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
      AND f.estado != 'Anulada'
    GROUP BY fd.codigo, fd.descripcion
    ORDER BY SUM(fd.cantidad * fd.precio) DESC
    LIMIT p_limit
  ) t INTO v_top_productos;

  -- Productos cayendo: vendidos en período previo pero no en el actual (o menos)
  SELECT json_agg(row_to_json(t)) FROM (
    WITH actual AS (
      SELECT fd.codigo, SUM(fd.cantidad) AS cant
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE f.tenant_id = p_tenant_id
        AND f.fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
        AND f.estado != 'Anulada'
      GROUP BY fd.codigo
    ), prev AS (
      SELECT fd.codigo, fd.descripcion, SUM(fd.cantidad) AS cant
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE f.tenant_id = p_tenant_id
        AND f.fecha >= CURRENT_DATE - (2 * p_dias || ' days')::INTERVAL
        AND f.fecha <  CURRENT_DATE - (p_dias || ' days')::INTERVAL
        AND f.estado != 'Anulada'
      GROUP BY fd.codigo, fd.descripcion
    )
    SELECT
      p.codigo,
      p.descripcion,
      p.cant AS vendidos_prev,
      COALESCE(a.cant, 0) AS vendidos_actual,
      ROUND(((COALESCE(a.cant, 0) - p.cant) / NULLIF(p.cant, 0) * 100)::NUMERIC, 1) AS cambio_pct
    FROM prev p
    LEFT JOIN actual a ON a.codigo = p.codigo
    WHERE p.cant > 5  -- ignorar volumen muy bajo
      AND (COALESCE(a.cant, 0) < p.cant * 0.5)  -- caída >50%
    ORDER BY (p.cant - COALESCE(a.cant, 0)) DESC
    LIMIT 10
  ) t INTO v_productos_cayendo;

  RETURN json_build_object(
    'ventas_actual', v_ventas_actual,
    'ventas_prev', v_ventas_prev,
    'crecimiento_pct', v_crecimiento,
    'num_facturas', v_num_facturas,
    'ticket_promedio', v_ticket_promedio,
    'top_productos', COALESCE(v_top_productos, '[]'::json),
    'productos_cayendo', COALESCE(v_productos_cayendo, '[]'::json),
    'dias_analizados', p_dias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ventas_summary(UUID, INT, INT) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- 4. AI Finanzas (CFO) — resumen consolidado
-- ────────────────────────────────────────────────
-- El CFO reusa el health score + agrega snapshot histórico
CREATE OR REPLACE FUNCTION public.get_finanzas_summary(
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_health JSON;
  v_snapshots JSON;
BEGIN
  v_health := public.ai_business_health_score(p_tenant_id);

  -- Últimos 7 snapshots diarios para ver trend
  SELECT json_agg(row_to_json(t) ORDER BY t.fecha DESC) FROM (
    SELECT fecha, health_score, sales_total, overdue_amount, low_stock_count, dead_stock_count
    FROM public.ai_metrics_snapshots
    WHERE tenant_id = p_tenant_id
      AND snapshot_type = 'daily'
    ORDER BY fecha DESC
    LIMIT 7
  ) t INTO v_snapshots;

  RETURN json_build_object(
    'health', v_health,
    'snapshots_7d', COALESCE(v_snapshots, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finanzas_summary(UUID) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT proname FROM pg_proc
WHERE proname IN ('get_inventario_summary','get_credito_summary','get_ventas_summary','get_finanzas_summary')
ORDER BY proname;
