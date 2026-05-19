-- ============================================================
-- MORLA AI CEO — Fase 3: SQL Helpers (Compras, Marketing, Chat)
-- ============================================================

-- ────────────────────────────────────────────────
-- AI Compras — resumen de suplidores + recomendaciones
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_compras_summary(
  p_tenant_id UUID,
  p_dias INT DEFAULT 90,
  p_limit INT DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_top_suplidores JSON;
  v_costos_subiendo JSON;
  v_productos_reordenar JSON;
  v_total_compras_90d NUMERIC;
  v_num_suplidores INT;
BEGIN
  -- Top suplidores por monto comprado
  SELECT json_agg(row_to_json(t)), COUNT(*) FROM (
    SELECT
      p.nombre,
      p.id AS suplidor_id,
      p.telefono,
      p.rnc,
      COUNT(DISTINCT c.id) AS num_compras,
      SUM(c.total_compra) AS total_comprado,
      ROUND((AVG(c.total_compra))::NUMERIC, 2) AS promedio_compra,
      MAX(c.fecha) AS ultima_compra
    FROM public.compras c
    JOIN public.proveedores p ON p.id = c.suplidor_id
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
      AND c.estado != 'Anulada'
    GROUP BY p.id, p.nombre, p.telefono, p.rnc
    ORDER BY SUM(c.total_compra) DESC
    LIMIT p_limit
  ) t INTO v_top_suplidores, v_num_suplidores;

  -- Productos con costo subiendo (último vs promedio 90d) — TOP 15
  SELECT json_agg(row_to_json(t)) FROM (
    WITH costos AS (
      SELECT
        cd.producto_id,
        cd.descripcion,
        cd.codigo,
        AVG(cd.costo_unitario) FILTER (WHERE cd.created_at >= CURRENT_DATE - INTERVAL '90 days' AND cd.created_at < CURRENT_DATE - INTERVAL '30 days') AS costo_prev,
        AVG(cd.costo_unitario) FILTER (WHERE cd.created_at >= CURRENT_DATE - INTERVAL '30 days') AS costo_actual,
        COUNT(*) FILTER (WHERE cd.created_at >= CURRENT_DATE - INTERVAL '90 days') AS compras_90d
      FROM public.compras_detalle cd
      WHERE cd.tenant_id = p_tenant_id
        AND cd.costo_unitario > 0
      GROUP BY cd.producto_id, cd.descripcion, cd.codigo
    )
    SELECT
      codigo,
      descripcion,
      ROUND(costo_prev::NUMERIC, 2) AS costo_prev,
      ROUND(costo_actual::NUMERIC, 2) AS costo_actual,
      ROUND(((costo_actual - costo_prev) / costo_prev * 100)::NUMERIC, 1) AS cambio_pct,
      compras_90d
    FROM costos
    WHERE costo_prev > 0
      AND costo_actual > costo_prev * 1.15
      AND compras_90d >= 2
    ORDER BY (costo_actual - costo_prev) / costo_prev DESC
    LIMIT 15
  ) t INTO v_costos_subiendo;

  -- Productos a reordenar (stock bajo con velocidad)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      p.codigo,
      p.descripcion,
      pr.nombre AS suplidor_principal,
      public.get_stock_actual(p.id) AS existencia,
      p.min_stock,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
          AND f.estado != 'Anulada'
      ), 0) AS vendidos_30d,
      p.costo
    FROM public.productos p
    LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND p.min_stock > 0
      AND public.get_stock_actual(p.id) < p.min_stock
    ORDER BY (p.min_stock - public.get_stock_actual(p.id)) DESC
    LIMIT p_limit
  ) t INTO v_productos_reordenar;

  -- Total compras 90d
  SELECT COALESCE(SUM(total_compra), 0) INTO v_total_compras_90d
  FROM public.compras
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
    AND estado != 'Anulada';

  RETURN json_build_object(
    'total_compras_90d', v_total_compras_90d,
    'num_suplidores_activos', v_num_suplidores,
    'top_suplidores', COALESCE(v_top_suplidores, '[]'::json),
    'costos_subiendo', COALESCE(v_costos_subiendo, '[]'::json),
    'productos_reordenar', COALESCE(v_productos_reordenar, '[]'::json),
    'dias_analizados', p_dias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_summary(UUID, INT, INT) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- AI Marketing — productos a promocionar / contenido
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_summary(
  p_tenant_id UUID,
  p_limit INT DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_top_margen JSON;
  v_buenos_relanzar JSON;
  v_alta_rotacion JSON;
BEGIN
  -- Productos con buen margen y stock (candidatos a promocionar para ganar margen)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      p.codigo,
      p.descripcion,
      public.get_stock_actual(p.id) AS existencia,
      p.precio,
      p.costo,
      ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1) AS margen_pct,
      ROUND((p.precio - p.costo)::NUMERIC, 2) AS ganancia_unitaria,
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
      AND p.precio > 0 AND p.costo > 0
      AND public.get_stock_actual(p.id) > 5
      AND ((p.precio - p.costo) / p.precio) > 0.30  -- margen > 30%
    ORDER BY (p.precio - p.costo) * public.get_stock_actual(p.id) DESC
    LIMIT p_limit
  ) t INTO v_top_margen;

  -- Productos buenos para relanzar (margen alto + stock pero baja venta reciente)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      p.codigo,
      p.descripcion,
      public.get_stock_actual(p.id) AS existencia,
      ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1) AS margen_pct,
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
      AND p.precio > 0 AND p.costo > 0
      AND public.get_stock_actual(p.id) > 10  -- buen stock
      AND ((p.precio - p.costo) / p.precio) > 0.40  -- margen muy bueno
      AND COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '60 days'
          AND f.estado != 'Anulada'
      ), 0) < 3  -- baja venta
    ORDER BY public.get_stock_actual(p.id) * (p.precio - p.costo) DESC
    LIMIT 10
  ) t INTO v_buenos_relanzar;

  -- Productos de alta rotación (que ya están funcionando)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      fd.codigo,
      fd.descripcion,
      SUM(fd.cantidad) AS cantidad_30d,
      COUNT(DISTINCT fd.factura_id) AS facturas_30d,
      SUM(fd.cantidad * fd.precio) AS ingreso_30d
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
      AND f.estado != 'Anulada'
    GROUP BY fd.codigo, fd.descripcion
    HAVING COUNT(DISTINCT fd.factura_id) >= 8
    ORDER BY SUM(fd.cantidad) DESC
    LIMIT 10
  ) t INTO v_alta_rotacion;

  RETURN json_build_object(
    'top_margen', COALESCE(v_top_margen, '[]'::json),
    'buenos_relanzar', COALESCE(v_buenos_relanzar, '[]'::json),
    'alta_rotacion', COALESCE(v_alta_rotacion, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketing_summary(UUID, INT) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- AI Chat — contexto comprehensivo para el chat CEO
-- ────────────────────────────────────────────────
-- Devuelve un snapshot completo del estado del negocio
-- que el chat puede usar como contexto. Estructura compacta
-- para no inflar el prompt.
CREATE OR REPLACE FUNCTION public.ai_chat_context_summary(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_health JSON;
  v_top_alertas JSON;
  v_top_morosos JSON;
  v_top_muertos JSON;
  v_ultimos_reportes JSON;
  v_decisiones_pendientes JSON;
BEGIN
  v_health := public.ai_business_health_score(p_tenant_id);

  -- Top 10 alertas críticas pendientes
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT title, area, severity, description, recommendation
    FROM public.ai_alerts
    WHERE tenant_id = p_tenant_id AND status = 'pending'
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 10
  ) t INTO v_top_alertas;

  -- Top 5 clientes morosos
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT c.nombre, c.telefono, SUM(f.monto_pendiente) AS deuda,
           MAX((CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE)) AS dias_vencido
    FROM public.clientes c
    JOIN public.facturas f ON f.cliente_id = c.id
    WHERE c.tenant_id = p_tenant_id AND f.tenant_id = p_tenant_id
      AND f.monto_pendiente > 0 AND f.estado != 'Anulada' AND f.dias_credito > 0
      AND (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE
    GROUP BY c.id, c.nombre, c.telefono
    ORDER BY SUM(f.monto_pendiente) DESC
    LIMIT 5
  ) t INTO v_top_morosos;

  -- Top 5 productos con más capital muerto
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT p.codigo, p.descripcion,
           public.get_stock_actual(p.id) AS existencia,
           ROUND((public.get_stock_actual(p.id) * COALESCE(p.costo, 0))::NUMERIC, 2) AS capital
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND public.get_stock_actual(p.id) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '180 days' AND f.estado != 'Anulada'
      )
    ORDER BY (public.get_stock_actual(p.id) * COALESCE(p.costo, 0)) DESC
    LIMIT 5
  ) t INTO v_top_muertos;

  -- Últimos reportes CEO Principal
  SELECT json_agg(row_to_json(t) ORDER BY t.fecha DESC) FROM (
    SELECT fecha, titulo, resumen, prioridad, detalles->'parsed'->'top_acciones' AS top_acciones
    FROM public.ai_reports
    WHERE tenant_id = p_tenant_id
      AND agent_key = 'ai_ceo_principal'
      AND estado != 'descartado'
    ORDER BY fecha DESC, created_at DESC
    LIMIT 3
  ) t INTO v_ultimos_reportes;

  -- Decisiones pendientes
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT title, area, risk_level, expected_impact
    FROM public.ai_decisions
    WHERE tenant_id = p_tenant_id AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 10
  ) t INTO v_decisiones_pendientes;

  RETURN json_build_object(
    'fecha', CURRENT_DATE,
    'health', v_health,
    'top_alertas_pendientes', COALESCE(v_top_alertas, '[]'::json),
    'top_morosos', COALESCE(v_top_morosos, '[]'::json),
    'top_capital_muerto', COALESCE(v_top_muertos, '[]'::json),
    'ultimos_reportes_ceo', COALESCE(v_ultimos_reportes, '[]'::json),
    'decisiones_pendientes', COALESCE(v_decisiones_pendientes, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_chat_context_summary(UUID) TO service_role, authenticated;


-- Verificación
SELECT proname FROM pg_proc
WHERE proname IN ('get_compras_summary','get_marketing_summary','ai_chat_context_summary')
ORDER BY proname;
