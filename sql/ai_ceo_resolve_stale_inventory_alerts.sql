-- MORLA AI CEO - resolver alertas de inventario obsoletas
-- Caso típico: una alerta decía existencia -2, luego el inventario se ajusta a 0,
-- pero la alerta queda pendiente porque ai_alerts guarda el snapshot antiguo.

CREATE OR REPLACE FUNCTION public.ai_resolve_alerts_for_product(p_producto_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_existencia NUMERIC;
  v_min_stock NUMERIC;
  v_ubicacion TEXT;
  v_deleted INTEGER := 0;
  v_updated INTEGER := 0;
  v_count INTEGER := 0;
BEGIN
  SELECT
    p.tenant_id,
    public.get_stock_actual(p.id),
    COALESCE(p.min_stock, 0),
    COALESCE(NULLIF(BTRIM(p.ubicacion), ''), NULL)
  INTO v_tenant_id, v_existencia, v_min_stock, v_ubicacion
  FROM public.productos p
  WHERE p.id = p_producto_id;

  IF v_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT
      a.id,
      a.tenant_id,
      a.alert_type,
      a.related_id,
      ROW_NUMBER() OVER (
        PARTITION BY a.tenant_id, a.alert_type, a.related_id
        ORDER BY CASE a.status WHEN 'pending' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC
      ) AS rn,
      EXISTS (
        SELECT 1
        FROM public.ai_alerts r
        WHERE r.tenant_id = a.tenant_id
          AND r.alert_type = a.alert_type
          AND r.related_id = a.related_id
          AND r.status = 'resolved'
      ) AS has_resolved
    FROM public.ai_alerts a
    WHERE a.tenant_id = v_tenant_id
      AND a.related_table = 'productos'
      AND a.related_id = p_producto_id
      AND a.status IN ('pending', 'reviewed')
      AND (
        (a.alert_type = 'existencia_negativa' AND v_existencia >= 0)
        OR (a.alert_type = 'stock_bajo' AND (v_min_stock <= 0 OR v_existencia >= v_min_stock))
        OR (a.alert_type = 'sin_ubicacion' AND (v_existencia <= 0 OR v_ubicacion IS NOT NULL))
      )
  )
  DELETE FROM public.ai_alerts a
  USING candidates c
  WHERE a.id = c.id
    AND (c.has_resolved OR c.rn > 1);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.ai_alerts a
  SET
    status = 'resolved',
    resolved_at = NOW(),
    resolution_notes = COALESCE(a.resolution_notes, 'Resuelta automaticamente: la condicion de inventario ya no aplica.'),
    metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
      'resolved_auto', true,
      'existencia_actual', v_existencia,
      'resolved_reason', 'inventory_condition_cleared'
    )
  WHERE a.tenant_id = v_tenant_id
    AND a.related_table = 'productos'
    AND a.related_id = p_producto_id
    AND a.status IN ('pending', 'reviewed')
    AND NOT EXISTS (
      SELECT 1
      FROM public.ai_alerts r
      WHERE r.tenant_id = a.tenant_id
        AND r.alert_type = a.alert_type
        AND r.related_id = a.related_id
        AND r.status = 'resolved'
    )
    AND (
      (a.alert_type = 'existencia_negativa' AND v_existencia >= 0)
      OR (a.alert_type = 'stock_bajo' AND (v_min_stock <= 0 OR v_existencia >= v_min_stock))
      OR (a.alert_type = 'sin_ubicacion' AND (v_existencia <= 0 OR v_ubicacion IS NOT NULL))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_count := v_deleted + v_updated;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_resolve_stale_inventory_alerts(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_updated INTEGER := 0;
  v_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT
      a.id,
      a.tenant_id,
      a.alert_type,
      a.related_id,
      ROW_NUMBER() OVER (
        PARTITION BY a.tenant_id, a.alert_type, a.related_id
        ORDER BY CASE a.status WHEN 'pending' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC
      ) AS rn,
      EXISTS (
        SELECT 1
        FROM public.ai_alerts r
        WHERE r.tenant_id = a.tenant_id
          AND r.alert_type = a.alert_type
          AND r.related_id = a.related_id
          AND r.status = 'resolved'
      ) AS has_resolved
    FROM public.ai_alerts a
    JOIN public.productos p ON p.id = a.related_id
    WHERE a.tenant_id = p_tenant_id
      AND p.tenant_id = p_tenant_id
      AND a.related_table = 'productos'
      AND a.status IN ('pending', 'reviewed')
      AND (
        (a.alert_type = 'existencia_negativa' AND public.get_stock_actual(p.id) >= 0)
        OR (a.alert_type = 'stock_bajo' AND (COALESCE(p.min_stock, 0) <= 0 OR public.get_stock_actual(p.id) >= COALESCE(p.min_stock, 0)))
        OR (a.alert_type = 'sin_ubicacion' AND (public.get_stock_actual(p.id) <= 0 OR COALESCE(NULLIF(BTRIM(p.ubicacion), ''), NULL) IS NOT NULL))
      )
  )
  DELETE FROM public.ai_alerts a
  USING candidates c
  WHERE a.id = c.id
    AND (c.has_resolved OR c.rn > 1);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.ai_alerts a
  SET
    status = 'resolved',
    resolved_at = NOW(),
    resolution_notes = COALESCE(a.resolution_notes, 'Resuelta automaticamente: la condicion de inventario ya no aplica.'),
    metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
      'resolved_auto', true,
      'existencia_actual', public.get_stock_actual(p.id),
      'resolved_reason', 'inventory_condition_cleared'
    )
  FROM public.productos p
  WHERE a.tenant_id = p_tenant_id
    AND p.tenant_id = p_tenant_id
    AND a.related_table = 'productos'
    AND a.related_id = p.id
    AND a.status IN ('pending', 'reviewed')
    AND NOT EXISTS (
      SELECT 1
      FROM public.ai_alerts r
      WHERE r.tenant_id = a.tenant_id
        AND r.alert_type = a.alert_type
        AND r.related_id = a.related_id
        AND r.status = 'resolved'
    )
    AND (
      (a.alert_type = 'existencia_negativa' AND public.get_stock_actual(p.id) >= 0)
      OR (a.alert_type = 'stock_bajo' AND (COALESCE(p.min_stock, 0) <= 0 OR public.get_stock_actual(p.id) >= COALESCE(p.min_stock, 0)))
      OR (a.alert_type = 'sin_ubicacion' AND (public.get_stock_actual(p.id) <= 0 OR COALESCE(NULLIF(BTRIM(p.ubicacion), ''), NULL) IS NOT NULL))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_count := v_deleted + v_updated;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_resolve_inventory_alerts_after_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.ai_resolve_alerts_for_product(COALESCE(NEW.producto_id, OLD.producto_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_resolve_inventory_alerts_after_product_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.ai_resolve_alerts_for_product(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_resolve_inventory_alerts_on_movement ON public.inventario_movimientos;
CREATE TRIGGER trg_ai_resolve_inventory_alerts_on_movement
AFTER INSERT OR UPDATE OR DELETE ON public.inventario_movimientos
FOR EACH ROW
EXECUTE FUNCTION public.ai_resolve_inventory_alerts_after_stock_change();

DROP TRIGGER IF EXISTS trg_ai_resolve_inventory_alerts_on_product ON public.productos;
CREATE TRIGGER trg_ai_resolve_inventory_alerts_on_product
AFTER UPDATE OF min_stock, ubicacion, activo ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.ai_resolve_inventory_alerts_after_product_change();

GRANT EXECUTE ON FUNCTION public.ai_resolve_alerts_for_product(UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_resolve_stale_inventory_alerts(UUID) TO service_role, authenticated;

SELECT public.ai_resolve_stale_inventory_alerts(t.id) AS resolved_alerts
FROM public.tenants t;
