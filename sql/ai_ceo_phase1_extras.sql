-- ============================================================
-- MORLA AI CEO — Fase 1 extras
-- ============================================================
-- Funciones complementarias:
--   - ai_capture_metrics_snapshot(tenant, type) — guarda snapshot diario
--   - ai_resolve_alerts_for_product(producto_id) — resuelve alertas automáticas cuando se corrige el producto
-- ============================================================

-- ────────────────────────────────────────────────
-- Snapshot diario de métricas
-- ────────────────────────────────────────────────
-- Toma fotos del estado del negocio para poder mostrar trends.
-- Idempotente: si ya hay snapshot para hoy lo actualiza.
CREATE OR REPLACE FUNCTION public.ai_capture_metrics_snapshot(
  p_tenant_id UUID,
  p_snapshot_type VARCHAR DEFAULT 'daily'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_health JSON;
  v_score INT;
  v_sales NUMERIC;
  v_overdue NUMERIC;
  v_pendiente NUMERIC;
  v_low_stock INT;
  v_dead_stock INT;
  v_margen_neg INT;
  v_id UUID;
BEGIN
  v_health := public.ai_business_health_score(p_tenant_id);
  v_score := (v_health->>'score')::INT;

  v_sales := COALESCE((v_health->'metricas'->>'ventas_30d')::NUMERIC, 0);
  v_pendiente := COALESCE((v_health->'metricas'->>'monto_pendiente_cobrar')::NUMERIC, 0);
  v_margen_neg := COALESCE((v_health->'metricas'->>'productos_margen_negativo')::INT, 0);

  -- Mora: facturas vencidas con monto pendiente
  SELECT COALESCE(SUM(monto_pendiente), 0)
  INTO v_overdue
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND monto_pendiente > 0
    AND estado != 'Anulada'
    AND dias_credito > 0
    AND (fecha + (dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE;

  -- Productos con stock bajo (cuenta)
  SELECT COUNT(*) INTO v_low_stock
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND p.min_stock > 0
    AND public.get_stock_actual(p.id) < p.min_stock;

  -- Productos lentos (180+ días sin venta con stock)
  SELECT COUNT(*) INTO v_dead_stock
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND public.get_stock_actual(p.id) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id
        AND f.tenant_id = p_tenant_id
        AND f.fecha >= CURRENT_DATE - INTERVAL '180 days'
        AND f.estado != 'Anulada'
    );

  INSERT INTO public.ai_metrics_snapshots (
    tenant_id, snapshot_type, fecha,
    sales_total, accounts_receivable, overdue_amount,
    low_stock_count, dead_stock_count, health_score, metadata
  ) VALUES (
    p_tenant_id, p_snapshot_type, CURRENT_DATE,
    v_sales, v_pendiente, v_overdue,
    v_low_stock, v_dead_stock, v_score, v_health
  )
  ON CONFLICT (tenant_id, snapshot_type, fecha) DO UPDATE
  SET sales_total = EXCLUDED.sales_total,
      accounts_receivable = EXCLUDED.accounts_receivable,
      overdue_amount = EXCLUDED.overdue_amount,
      low_stock_count = EXCLUDED.low_stock_count,
      dead_stock_count = EXCLUDED.dead_stock_count,
      health_score = EXCLUDED.health_score,
      metadata = EXCLUDED.metadata
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'ok', true,
    'snapshot_id', v_id,
    'score', v_score,
    'sales_30d', v_sales,
    'overdue_amount', v_overdue,
    'low_stock_count', v_low_stock,
    'dead_stock_count', v_dead_stock,
    'productos_margen_negativo', v_margen_neg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_capture_metrics_snapshot(UUID, VARCHAR) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT proname FROM pg_proc
WHERE proname IN ('ai_capture_metrics_snapshot','ai_run_deterministic_alerts','ai_business_health_score')
ORDER BY proname;
