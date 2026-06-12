-- ============================================================
-- Fix: actualizar fecha al reutilizar orden Pendiente existente
-- ============================================================
-- 1. Reemplaza la RPC _mover_linea_a_suplidor_correcto con la
--    version corregida (refresca fecha_orden y fecha_vencimiento
--    cuando reutiliza orden existente).
-- 2. Corrige ORD-0043 y cualquier otra orden con vencimiento mal.
-- ============================================================

CREATE OR REPLACE FUNCTION public._mover_linea_a_suplidor_correcto(
  p_detalle_id      UUID,
  p_nuevo_suplidor  UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_detalle         RECORD;
  v_orden_origen_id UUID;
  v_orden_destino   RECORD;
  v_tenant_id       UUID;
  v_existing_det    RECORD;
  v_next_numero     TEXT;
  v_nueva_orden_id  UUID;
  v_costo           NUMERIC;
  v_itbis_pct       NUMERIC;
BEGIN
  SELECT d.*, oc.tenant_id
    INTO v_detalle
  FROM public.ordenes_compra_detalle d
  JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
  WHERE d.id = p_detalle_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'detalle no encontrado');
  END IF;

  v_orden_origen_id := v_detalle.orden_compra_id;
  v_tenant_id       := v_detalle.tenant_id;
  v_costo           := COALESCE(v_detalle.precio, 0);
  v_itbis_pct       := COALESCE(v_detalle.itbis_pct, 0);

  SELECT id INTO v_orden_destino
  FROM public.ordenes_compra
  WHERE suplidor_id = p_nuevo_suplidor
    AND estado = 'Pendiente'
    AND tenant_id IS NOT DISTINCT FROM v_tenant_id
  ORDER BY fecha_orden DESC
  LIMIT 1;

  IF v_orden_destino.id IS NULL THEN
    BEGIN
      SELECT public.get_next_orden_compra_numero() INTO v_next_numero;
    EXCEPTION WHEN OTHERS THEN
      v_next_numero := NULL;
    END;

    INSERT INTO public.ordenes_compra (
      numero, fecha_orden, fecha_vencimiento, notas,
      aplicar_itbis, itbis_incluido,
      suplidor_id, estado,
      total_exento, total_gravado, descuento_total, itbis_total, total_orden,
      tenant_id
    ) VALUES (
      v_next_numero,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'Generada automaticamente (reorganizacion por suplidor)',
      false, true,
      p_nuevo_suplidor, 'Pendiente',
      0, 0, 0, 0, 0,
      v_tenant_id
    )
    RETURNING id INTO v_nueva_orden_id;

    UPDATE public.ordenes_compra_detalle
       SET orden_compra_id = v_nueva_orden_id
     WHERE id = p_detalle_id;

  ELSE
    SELECT id, cantidad INTO v_existing_det
    FROM public.ordenes_compra_detalle
    WHERE orden_compra_id = v_orden_destino.id
      AND producto_id = v_detalle.producto_id
    LIMIT 1;

    IF v_existing_det.id IS NOT NULL THEN
      UPDATE public.ordenes_compra_detalle
         SET cantidad = COALESCE(cantidad, 0) + COALESCE(v_detalle.cantidad, 0),
             importe  = (COALESCE(cantidad, 0) + COALESCE(v_detalle.cantidad, 0))
                        * COALESCE(precio, 0)
       WHERE id = v_existing_det.id;

      DELETE FROM public.ordenes_compra_detalle WHERE id = p_detalle_id;
    ELSE
      UPDATE public.ordenes_compra_detalle
         SET orden_compra_id = v_orden_destino.id
       WHERE id = p_detalle_id;
    END IF;

    v_nueva_orden_id := v_orden_destino.id;

    -- FIX: refrescar fecha al reutilizar orden existente
    UPDATE public.ordenes_compra
       SET fecha_orden       = CURRENT_DATE,
           fecha_vencimiento = CURRENT_DATE + INTERVAL '15 days'
     WHERE id = v_nueva_orden_id;
  END IF;

  PERFORM public._recalcular_totales_orden_compra(v_orden_origen_id);
  PERFORM public._recalcular_totales_orden_compra(v_nueva_orden_id);

  RETURN json_build_object(
    'ok', true,
    'detalle_id', p_detalle_id,
    'orden_origen', v_orden_origen_id,
    'orden_destino', v_nueva_orden_id
  );
END;
$$;

-- ============================================================
-- Corregir ORD-0043 manualmente (fecha y vencimiento)
-- ============================================================
UPDATE public.ordenes_compra
   SET fecha_orden       = CURRENT_DATE,
       fecha_vencimiento = CURRENT_DATE + INTERVAL '15 days'
 WHERE numero = 'ORD-0043';

-- Opcional: corregir TODAS las ordenes Pendiente que tengan
-- fecha_vencimiento <= fecha_orden (bug de vencimientos invalidos)
UPDATE public.ordenes_compra
   SET fecha_vencimiento = fecha_orden + INTERVAL '15 days'
 WHERE estado = 'Pendiente'
   AND (fecha_vencimiento IS NULL OR fecha_vencimiento < fecha_orden);

NOTIFY pgrst, 'reload schema';

SELECT 'fix_fecha aplicado' AS status;
