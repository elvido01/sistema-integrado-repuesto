-- ============================================================
-- AI Operaciones — Helper SQL
-- ============================================================
-- Detecta problemas operativos: movimientos sospechosos,
-- existencias inconsistentes, productos sin código de barras,
-- pedidos viejos sin atender.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_operaciones_summary(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_existencia_negativa INT;
  v_sin_ubicacion INT;
  v_devoluciones_30d INT;
  v_devoluciones_monto NUMERIC;
  v_ordenes_pendientes INT;
  v_ordenes_viejas JSON;
  v_movimientos_negativos JSON;
BEGIN
  -- Conteo de productos con existencia negativa (data quality issue)
  SELECT COUNT(*) INTO v_existencia_negativa
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND public.get_stock_actual(p.id) < 0;

  -- Productos con stock pero sin ubicación
  SELECT COUNT(*) INTO v_sin_ubicacion
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND (p.ubicacion IS NULL OR p.ubicacion = '')
    AND public.get_stock_actual(p.id) > 0;

  -- Órdenes de compra pendientes de recibir (estado != Recibida/Anulada)
  SELECT COUNT(*) INTO v_ordenes_pendientes
  FROM public.ordenes_compra oc
  WHERE oc.tenant_id = p_tenant_id
    AND COALESCE(oc.estado, 'Pendiente') NOT IN ('Recibida','Anulada','Cancelada','Cerrada');

  -- Órdenes pendientes muy viejas (>15 días)
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      oc.numero,
      oc.fecha_orden::date AS fecha,
      (CURRENT_DATE - oc.fecha_orden::date) AS dias,
      pr.nombre AS suplidor,
      oc.total
    FROM public.ordenes_compra oc
    LEFT JOIN public.proveedores pr ON pr.id = oc.suplidor_id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') NOT IN ('Recibida','Anulada','Cancelada','Cerrada')
      AND oc.fecha_orden < CURRENT_DATE - INTERVAL '15 days'
    ORDER BY oc.fecha_orden ASC
    LIMIT 10
  ) t INTO v_ordenes_viejas;

  -- Movimientos de inventario con cantidad negativa rara (>5 absoluta no justificada)
  -- Detecta posibles errores de digitación
  SELECT json_agg(row_to_json(t)) FROM (
    SELECT
      im.fecha::date AS fecha,
      im.tipo,
      im.cantidad,
      p.codigo,
      p.descripcion,
      im.referencia_doc
    FROM public.inventario_movimientos im
    JOIN public.productos p ON p.id = im.producto_id
    WHERE im.tenant_id = p_tenant_id
      AND im.fecha >= CURRENT_DATE - INTERVAL '14 days'
      AND ABS(im.cantidad) > 50  -- movimientos muy grandes vale la pena revisar
    ORDER BY ABS(im.cantidad) DESC
    LIMIT 10
  ) t INTO v_movimientos_negativos;

  RETURN json_build_object(
    'existencia_negativa_count', v_existencia_negativa,
    'sin_ubicacion_count', v_sin_ubicacion,
    'ordenes_pendientes_count', v_ordenes_pendientes,
    'ordenes_viejas', COALESCE(v_ordenes_viejas, '[]'::json),
    'movimientos_grandes', COALESCE(v_movimientos_negativos, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operaciones_summary(UUID) TO service_role, authenticated;

SELECT proname FROM pg_proc WHERE proname = 'get_operaciones_summary';
