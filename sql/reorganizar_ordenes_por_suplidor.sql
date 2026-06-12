-- ============================================================
-- Reorganizar lineas de ordenes de compra por suplidor correcto
-- ============================================================
-- Problema: cuando se cambia productos.suplidor_id despues de
-- haber agregado una linea a una orden pendiente, la linea queda
-- en la orden "vieja" (suplidor incorrecto).
--
-- Solucion:
--   1. RPC reorganizar_ordenes_pendientes_por_suplidor()
--      Recorre TODAS las ordenes Pendiente y mueve las lineas
--      cuyo productos.suplidor_id no coincide con la orden.
--      Para cada linea huerfana:
--        - Si el suplidor correcto tiene orden Pendiente: la mueve alli
--          (sumando cantidad si ya existe el producto)
--        - Si no: crea una nueva orden Pendiente para ese suplidor
--      Recalcula totales de las ordenes afectadas.
--
--   2. RPC reorganizar_orden_pendiente_one(orden_id)
--      Misma logica pero solo para una orden especifica.
--
--   3. Trigger trg_mover_lineas_al_cambiar_suplidor:
--      Cuando se UPDATE productos.suplidor_id, busca lineas en
--      ordenes Pendiente del suplidor viejo y las mueve al nuevo.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) Funcion auxiliar: mover una linea a la orden correcta
-- ---------------------------------------------------------------
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
  -- 1. Cargar el detalle y su orden origen
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

  -- 2. Buscar orden Pendiente existente del suplidor correcto en mismo tenant
  SELECT id INTO v_orden_destino
  FROM public.ordenes_compra
  WHERE suplidor_id = p_nuevo_suplidor
    AND estado = 'Pendiente'
    AND tenant_id IS NOT DISTINCT FROM v_tenant_id
  ORDER BY fecha_orden DESC
  LIMIT 1;

  IF v_orden_destino.id IS NULL THEN
    -- 3a. No hay orden, crear nueva
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

    -- Mover la linea
    UPDATE public.ordenes_compra_detalle
       SET orden_compra_id = v_nueva_orden_id
     WHERE id = p_detalle_id;

  ELSE
    -- 3b. Ya hay orden destino. Ver si el producto ya esta ahi
    SELECT id, cantidad INTO v_existing_det
    FROM public.ordenes_compra_detalle
    WHERE orden_compra_id = v_orden_destino.id
      AND producto_id = v_detalle.producto_id
    LIMIT 1;

    IF v_existing_det.id IS NOT NULL THEN
      -- Sumar cantidad y borrar la linea duplicada
      UPDATE public.ordenes_compra_detalle
         SET cantidad = COALESCE(cantidad, 0) + COALESCE(v_detalle.cantidad, 0),
             importe  = (COALESCE(cantidad, 0) + COALESCE(v_detalle.cantidad, 0))
                        * COALESCE(precio, 0)
       WHERE id = v_existing_det.id;

      DELETE FROM public.ordenes_compra_detalle WHERE id = p_detalle_id;
    ELSE
      -- Solo mover
      UPDATE public.ordenes_compra_detalle
         SET orden_compra_id = v_orden_destino.id
       WHERE id = p_detalle_id;
    END IF;

    v_nueva_orden_id := v_orden_destino.id;
  END IF;

  -- 4. Recalcular totales de ambas ordenes
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

-- ---------------------------------------------------------------
-- Funcion auxiliar de recalculo de totales (idempotente)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._recalcular_totales_orden_compra(
  p_orden_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_aplicar_itbis BOOLEAN;
  v_total_exento  NUMERIC := 0;
  v_total_gravado NUMERIC := 0;
  v_descuento     NUMERIC := 0;
  v_itbis         NUMERIC := 0;
  v_total         NUMERIC := 0;
  v_row           RECORD;
  v_subtotal      NUMERIC;
  v_desc_pct      NUMERIC;
  v_itbis_pct     NUMERIC;
  v_desc_monto    NUMERIC;
  v_base          NUMERIC;
BEGIN
  SELECT COALESCE(aplicar_itbis, true) INTO v_aplicar_itbis
  FROM public.ordenes_compra WHERE id = p_orden_id;

  FOR v_row IN
    SELECT * FROM public.ordenes_compra_detalle WHERE orden_compra_id = p_orden_id
  LOOP
    v_subtotal  := COALESCE(v_row.cantidad, 0) * COALESCE(v_row.precio, 0);
    v_desc_pct  := COALESCE(v_row.descuento_pct, 0) / 100.0;
    v_itbis_pct := COALESCE(v_row.itbis_pct, 0);
    IF v_itbis_pct > 1 THEN v_itbis_pct := v_itbis_pct / 100.0; END IF;

    v_desc_monto := v_subtotal * v_desc_pct;
    v_base       := v_subtotal - v_desc_monto;
    v_descuento  := v_descuento + v_desc_monto;

    IF v_itbis_pct > 0 AND v_aplicar_itbis THEN
      v_total_gravado := v_total_gravado + v_base;
      v_itbis         := v_itbis + (v_base * v_itbis_pct);
    ELSE
      v_total_exento := v_total_exento + v_base;
    END IF;
  END LOOP;

  v_total := v_total_gravado + v_total_exento + v_itbis;

  UPDATE public.ordenes_compra
     SET total_exento    = v_total_exento,
         total_gravado   = v_total_gravado,
         descuento_total = v_descuento,
         itbis_total     = v_itbis,
         total_orden     = v_total
   WHERE id = p_orden_id;
END;
$$;

-- ---------------------------------------------------------------
-- 2) Reorganizar TODAS las ordenes Pendiente del tenant actual
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorganizar_ordenes_pendientes_por_suplidor()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id  UUID;
  v_row        RECORD;
  v_moved      INT := 0;
  v_orphans    JSON;
  v_movimientos JSON[] := ARRAY[]::JSON[];
  v_res        JSON;
BEGIN
  v_tenant_id := public.get_user_tenant();

  -- Encontrar lineas huerfanas: orden Pendiente cuya
  -- linea apunta a un producto con suplidor distinto
  FOR v_row IN
    SELECT d.id AS detalle_id, p.suplidor_id AS suplidor_correcto,
           d.codigo, d.descripcion
    FROM public.ordenes_compra oc
    JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
    JOIN public.productos p ON p.id = d.producto_id
    WHERE oc.estado = 'Pendiente'
      AND oc.tenant_id IS NOT DISTINCT FROM v_tenant_id
      AND p.suplidor_id IS NOT NULL
      AND p.suplidor_id <> oc.suplidor_id
  LOOP
    v_res := public._mover_linea_a_suplidor_correcto(
      v_row.detalle_id, v_row.suplidor_correcto
    );
    IF (v_res->>'ok')::BOOLEAN THEN
      v_moved := v_moved + 1;
      v_movimientos := v_movimientos || json_build_object(
        'codigo', v_row.codigo,
        'descripcion', v_row.descripcion,
        'destino', v_res->'orden_destino'
      );
    END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'lineas_movidas', v_moved,
    'detalle', v_movimientos
  );
END;
$$;

-- ---------------------------------------------------------------
-- 3) Reorganizar UNA orden especifica
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorganizar_orden_pendiente_one(
  p_orden_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row    RECORD;
  v_moved  INT := 0;
  v_res    JSON;
BEGIN
  FOR v_row IN
    SELECT d.id AS detalle_id, p.suplidor_id AS suplidor_correcto
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    JOIN public.productos p ON p.id = d.producto_id
    WHERE d.orden_compra_id = p_orden_id
      AND p.suplidor_id IS NOT NULL
      AND p.suplidor_id <> oc.suplidor_id
  LOOP
    v_res := public._mover_linea_a_suplidor_correcto(
      v_row.detalle_id, v_row.suplidor_correcto
    );
    IF (v_res->>'ok')::BOOLEAN THEN
      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true, 'lineas_movidas', v_moved);
END;
$$;

-- ---------------------------------------------------------------
-- 4) Trigger: cuando se cambia productos.suplidor_id,
--    mover las lineas huerfanas a la orden correcta
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mover_lineas_al_cambiar_suplidor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row  RECORD;
BEGIN
  IF NEW.suplidor_id IS DISTINCT FROM OLD.suplidor_id
     AND NEW.suplidor_id IS NOT NULL THEN
    FOR v_row IN
      SELECT d.id AS detalle_id
      FROM public.ordenes_compra_detalle d
      JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
      WHERE d.producto_id = NEW.id
        AND oc.estado = 'Pendiente'
        AND oc.suplidor_id IS DISTINCT FROM NEW.suplidor_id
    LOOP
      PERFORM public._mover_linea_a_suplidor_correcto(
        v_row.detalle_id, NEW.suplidor_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_suplidor_change ON public.productos;
CREATE TRIGGER trg_productos_suplidor_change
  AFTER UPDATE OF suplidor_id ON public.productos
  FOR EACH ROW
  WHEN (NEW.suplidor_id IS DISTINCT FROM OLD.suplidor_id)
  EXECUTE FUNCTION public.trg_mover_lineas_al_cambiar_suplidor();

-- ---------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reorganizar_ordenes_pendientes_por_suplidor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorganizar_orden_pendiente_one(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public._mover_linea_a_suplidor_correcto(UUID, UUID)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._recalcular_totales_orden_compra(UUID)         TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'reorganizar_ordenes_por_suplidor listo' AS status;
