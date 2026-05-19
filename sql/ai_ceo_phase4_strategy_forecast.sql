-- ============================================================
-- MORLA AI CEO — Fase 4: Estrategia + Forecasting
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. AI Estrategia — resumen trimestral (90 días)
-- ────────────────────────────────────────────────
-- Analiza tendencias largas para el reporte trimestral del CEO.
CREATE OR REPLACE FUNCTION public.get_estrategia_summary(
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_ventas_trimestre_actual NUMERIC;
  v_ventas_trimestre_prev NUMERIC;
  v_crecimiento_trimestre NUMERIC;
  v_dependencia_suplidores JSON;
  v_dependencia_clientes JSON;
  v_top_categorias JSON;
  v_evolucion_mensual JSON;
  v_clientes_nuevos INT;
BEGIN
  -- Ventas trimestre actual (últimos 90d) vs anterior (90-180d)
  SELECT COALESCE(SUM(total), 0) INTO v_ventas_trimestre_actual
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - INTERVAL '90 days'
    AND estado != 'Anulada';

  SELECT COALESCE(SUM(total), 0) INTO v_ventas_trimestre_prev
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - INTERVAL '180 days'
    AND fecha <  CURRENT_DATE - INTERVAL '90 days'
    AND estado != 'Anulada';

  v_crecimiento_trimestre := CASE WHEN v_ventas_trimestre_prev > 0
    THEN ROUND(((v_ventas_trimestre_actual - v_ventas_trimestre_prev) / v_ventas_trimestre_prev * 100)::NUMERIC, 2)
    ELSE NULL END;

  -- Evolución mensual últimos 6 meses
  SELECT json_agg(row_to_json(t) ORDER BY t.mes ASC) FROM (
    SELECT
      to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
      COUNT(*) AS num_facturas,
      SUM(total) AS total_ventas,
      COUNT(DISTINCT cliente_id) AS clientes_unicos,
      ROUND(AVG(total)::NUMERIC, 2) AS ticket_promedio
    FROM public.facturas
    WHERE tenant_id = p_tenant_id
      AND fecha >= CURRENT_DATE - INTERVAL '180 days'
      AND estado != 'Anulada'
    GROUP BY date_trunc('month', fecha)
    ORDER BY mes ASC
  ) t INTO v_evolucion_mensual;

  -- Dependencia: top 5 suplidores por % de compras
  SELECT json_agg(row_to_json(t)) FROM (
    WITH totales AS (
      SELECT SUM(total_compra) AS gran_total
      FROM public.compras
      WHERE tenant_id = p_tenant_id
        AND fecha >= CURRENT_DATE - INTERVAL '90 days'
        AND estado != 'Anulada'
    )
    SELECT
      p.nombre,
      SUM(c.total_compra) AS total,
      ROUND((SUM(c.total_compra) / NULLIF((SELECT gran_total FROM totales), 0) * 100)::NUMERIC, 1) AS porcentaje
    FROM public.compras c
    JOIN public.proveedores p ON p.id = c.suplidor_id
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND c.estado != 'Anulada'
    GROUP BY p.id, p.nombre
    ORDER BY SUM(c.total_compra) DESC
    LIMIT 5
  ) t INTO v_dependencia_suplidores;

  -- Dependencia: top 5 clientes por % de ventas
  SELECT json_agg(row_to_json(t)) FROM (
    WITH totales AS (
      SELECT SUM(total) AS gran_total
      FROM public.facturas
      WHERE tenant_id = p_tenant_id
        AND fecha >= CURRENT_DATE - INTERVAL '90 days'
        AND estado != 'Anulada'
    )
    SELECT
      c.nombre,
      SUM(f.total) AS total,
      ROUND((SUM(f.total) / NULLIF((SELECT gran_total FROM totales), 0) * 100)::NUMERIC, 1) AS porcentaje,
      COUNT(f.id) AS num_facturas
    FROM public.facturas f
    JOIN public.clientes c ON c.id = f.cliente_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND f.estado != 'Anulada'
    GROUP BY c.id, c.nombre
    ORDER BY SUM(f.total) DESC
    LIMIT 5
  ) t INTO v_dependencia_clientes;

  -- Top categorías (por marca de producto)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      COALESCE(m.nombre, 'Sin marca') AS marca,
      SUM(fd.cantidad * fd.precio) AS ingreso_90d,
      SUM(fd.cantidad) AS unidades_vendidas
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    LEFT JOIN public.productos p ON p.id = fd.producto_id
    LEFT JOIN public.marcas m ON m.id = p.marca_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - INTERVAL '90 days'
      AND f.estado != 'Anulada'
    GROUP BY m.nombre
    ORDER BY SUM(fd.cantidad * fd.precio) DESC
    LIMIT 8
  ) t INTO v_top_categorias;

  -- Clientes nuevos en el trimestre
  SELECT COUNT(*) INTO v_clientes_nuevos
  FROM public.clientes
  WHERE tenant_id = p_tenant_id
    AND created_at >= CURRENT_DATE - INTERVAL '90 days';

  RETURN json_build_object(
    'ventas_trimestre_actual', v_ventas_trimestre_actual,
    'ventas_trimestre_prev', v_ventas_trimestre_prev,
    'crecimiento_trimestre_pct', v_crecimiento_trimestre,
    'evolucion_mensual', COALESCE(v_evolucion_mensual, '[]'::json),
    'dependencia_suplidores', COALESCE(v_dependencia_suplidores, '[]'::json),
    'dependencia_clientes', COALESCE(v_dependencia_clientes, '[]'::json),
    'top_categorias', COALESCE(v_top_categorias, '[]'::json),
    'clientes_nuevos_90d', v_clientes_nuevos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_estrategia_summary(UUID) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- 2. Forecast simple de ventas (regresión lineal de últimos 90d)
-- ────────────────────────────────────────────────
-- Predice ventas próximos 30 días basado en tendencia 90d.
CREATE OR REPLACE FUNCTION public.ai_forecast_ventas(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_avg_diario NUMERIC;
  v_pendiente NUMERIC;        -- slope
  v_ventas_pred_30d NUMERIC;
  v_dias_data INT;
BEGIN
  -- Calcula promedio diario y tendencia con regresión lineal
  WITH ventas_diarias AS (
    SELECT
      fecha::date AS dia,
      SUM(total) AS total_dia,
      (fecha::date - (CURRENT_DATE - INTERVAL '90 days')::date)::NUMERIC AS dia_idx
    FROM public.facturas
    WHERE tenant_id = p_tenant_id
      AND fecha::date >= CURRENT_DATE - INTERVAL '90 days'
      AND fecha::date <= CURRENT_DATE
      AND estado != 'Anulada'
    GROUP BY fecha::date
  )
  SELECT
    AVG(total_dia),
    regr_slope(total_dia, dia_idx),
    COUNT(*)
  INTO v_avg_diario, v_pendiente, v_dias_data
  FROM ventas_diarias;

  v_avg_diario := COALESCE(v_avg_diario, 0);
  v_pendiente := COALESCE(v_pendiente, 0);

  -- Proyección: promedio actual + (tendencia × días futuros) × 30 días
  -- Aplicar suavizado: si tendencia es muy agresiva, atenuar
  v_ventas_pred_30d := GREATEST(0, (v_avg_diario + (v_pendiente * 15)) * 30);

  RETURN json_build_object(
    'avg_diario_actual', ROUND(v_avg_diario, 2),
    'tendencia_diaria', ROUND(v_pendiente, 2),
    'tendencia_direccion', CASE
      WHEN v_pendiente > v_avg_diario * 0.01 THEN 'subiendo'
      WHEN v_pendiente < -(v_avg_diario * 0.01) THEN 'bajando'
      ELSE 'estable' END,
    'ventas_pred_30d', ROUND(v_ventas_pred_30d, 2),
    'dias_data', v_dias_data,
    'confianza', CASE WHEN v_dias_data >= 60 THEN 'alta' WHEN v_dias_data >= 30 THEN 'media' ELSE 'baja' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_forecast_ventas(UUID) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- 3. Predicción de quiebres de stock
-- ────────────────────────────────────────────────
-- Detecta productos que se quedarán sin stock en X días según velocidad.
CREATE OR REPLACE FUNCTION public.ai_predict_stockouts(
  p_tenant_id UUID,
  p_dias_alerta INT DEFAULT 14
)
RETURNS TABLE (
  producto_id UUID,
  codigo TEXT,
  descripcion TEXT,
  existencia NUMERIC,
  velocidad_diaria NUMERIC,
  dias_para_agotarse NUMERIC,
  fecha_estimada_stockout DATE
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH velocidad AS (
    SELECT
      fd.producto_id,
      SUM(fd.cantidad)::NUMERIC / 30 AS vel_diaria
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
      AND f.estado != 'Anulada'
    GROUP BY fd.producto_id
    HAVING SUM(fd.cantidad) > 0
  )
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    public.get_stock_actual(p.id) AS existencia,
    ROUND(v.vel_diaria, 2) AS velocidad_diaria,
    ROUND((public.get_stock_actual(p.id) / NULLIF(v.vel_diaria, 0))::NUMERIC, 1) AS dias_para_agotarse,
    (CURRENT_DATE + (public.get_stock_actual(p.id) / NULLIF(v.vel_diaria, 0) * INTERVAL '1 day'))::DATE AS fecha_estimada_stockout
  FROM public.productos p
  JOIN velocidad v ON v.producto_id = p.id
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND public.get_stock_actual(p.id) > 0
    AND v.vel_diaria > 0
    AND (public.get_stock_actual(p.id) / v.vel_diaria) <= p_dias_alerta
  ORDER BY (public.get_stock_actual(p.id) / v.vel_diaria) ASC
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.ai_predict_stockouts(UUID, INT) TO service_role, authenticated;


-- Verificación
SELECT proname FROM pg_proc
WHERE proname IN ('get_estrategia_summary','ai_forecast_ventas','ai_predict_stockouts')
ORDER BY proname;
