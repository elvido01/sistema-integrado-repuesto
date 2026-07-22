-- ============================================================
-- MotoFlow Omni - Solicitudes por Producto Agotado
-- Flujo oficial: solicitud + orden de compra
-- ============================================================
-- Revisar y aplicar manualmente en Supabase SQL Editor.
-- No ejecutado automaticamente por Codex.

BEGIN;

-- ------------------------------------------------------------
-- 1) Campos conversacionales y relacion con compras
-- ------------------------------------------------------------
ALTER TABLE public.solicitudes_clientes
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_conversation_id text,
  ADD COLUMN IF NOT EXISTS external_contact_id text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS contact_avatar_snapshot text,
  ADD COLUMN IF NOT EXISTS created_from text DEFAULT 'motoflow_web',
  ADD COLUMN IF NOT EXISTS orden_compra_id uuid REFERENCES public.ordenes_compra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS orden_compra_detalle_id uuid REFERENCES public.ordenes_compra_detalle(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_order_added_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_order_error text,
  ADD COLUMN IF NOT EXISTS available_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_clientes_phone_norm
  ON public.solicitudes_clientes(tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_clientes_source_conv
  ON public.solicitudes_clientes(tenant_id, source_channel, source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_clientes_orden
  ON public.solicitudes_clientes(tenant_id, orden_compra_id)
  WHERE orden_compra_id IS NOT NULL;

ALTER TABLE public.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS cantidad_pedida numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_recibida numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_linea text DEFAULT 'pendiente';

-- ------------------------------------------------------------
-- 2) Recalculo local de totales
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._omni_recalcular_totales_orden_compra(
  p_orden_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_orden_tenant uuid;
  v_aplicar_itbis boolean;
  v_total_exento numeric := 0;
  v_total_gravado numeric := 0;
  v_descuento numeric := 0;
  v_itbis numeric := 0;
  v_total numeric := 0;
  v_row record;
  v_subtotal numeric;
  v_desc_pct numeric;
  v_itbis_pct numeric;
  v_desc_monto numeric;
  v_base numeric;
BEGIN
  SELECT tenant_id, COALESCE(aplicar_itbis, true)
    INTO v_orden_tenant, v_aplicar_itbis
  FROM public.ordenes_compra
  WHERE id = p_orden_id;

  IF v_orden_tenant IS NULL THEN
    RETURN;
  END IF;

  IF v_tenant IS NOT NULL AND v_orden_tenant <> v_tenant THEN
    RAISE EXCEPTION 'Acceso denegado a orden de otro tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.ordenes_compra_detalle
    WHERE orden_compra_id = p_orden_id
      AND tenant_id = v_orden_tenant
  LOOP
    v_subtotal := COALESCE(v_row.cantidad, 0) * COALESCE(v_row.precio, 0);
    v_desc_pct := COALESCE(v_row.descuento_pct, 0) / 100.0;
    v_itbis_pct := COALESCE(v_row.itbis_pct, 0);
    IF v_itbis_pct > 1 THEN
      v_itbis_pct := v_itbis_pct / 100.0;
    END IF;

    v_desc_monto := v_subtotal * v_desc_pct;
    v_base := v_subtotal - v_desc_monto;
    v_descuento := v_descuento + v_desc_monto;

    IF v_itbis_pct > 0 AND v_aplicar_itbis THEN
      v_total_gravado := v_total_gravado + v_base;
      v_itbis := v_itbis + (v_base * v_itbis_pct);
    ELSE
      v_total_exento := v_total_exento + v_base;
    END IF;
  END LOOP;

  v_total := v_total_gravado + v_total_exento + v_itbis;

  UPDATE public.ordenes_compra
     SET total_exento = v_total_exento,
         total_gravado = v_total_gravado,
         descuento_total = v_descuento,
         itbis_total = v_itbis,
         total_orden = v_total
   WHERE id = p_orden_id
     AND tenant_id = v_orden_tenant;
END;
$$;

-- ------------------------------------------------------------
-- 3) Enviar producto a orden pendiente del suplidor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._omni_enviar_producto_a_orden_compra(
  p_producto_id uuid,
  p_cantidad numeric,
  p_source text DEFAULT 'solicitud_agotada'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_producto record;
  v_suplidor record;
  v_orden record;
  v_detalle record;
  v_existing record;
  v_order_id uuid;
  v_detail_id uuid;
  v_numero text;
  v_qty numeric := GREATEST(1, CEIL(COALESCE(p_cantidad, 1)));
  v_current_qty numeric;
  v_received_qty numeric;
  v_new_qty numeric;
  v_importe numeric;
  v_is_new boolean := false;
  v_line_existing boolean := false;
  v_duplicate_ids uuid[];
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar tenant activo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, codigo, descripcion, suplidor_id, costo, itbis_pct, activo, tenant_id
    INTO v_producto
  FROM public.productos
  WHERE id = p_producto_id
    AND tenant_id = v_tenant;

  IF v_producto.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado');
  END IF;

  IF v_producto.activo IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'skipped', true, 'error', 'Producto inactivo');
  END IF;

  IF v_producto.suplidor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'missing_supplier', true, 'error', 'Producto sin suplidor');
  END IF;

  SELECT id, nombre
    INTO v_suplidor
  FROM public.proveedores
  WHERE id = v_producto.suplidor_id
    AND tenant_id = v_tenant;

  SELECT id, numero, suplidor_id
    INTO v_orden
  FROM public.ordenes_compra
  WHERE suplidor_id = v_producto.suplidor_id
    AND estado = 'Pendiente'
    AND tenant_id = v_tenant
  ORDER BY fecha_orden DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_orden.id IS NULL THEN
    v_is_new := true;
    SELECT public.get_next_orden_compra_numero() INTO v_numero;

    INSERT INTO public.ordenes_compra (
      numero,
      fecha_orden,
      fecha_vencimiento,
      notas,
      aplicar_itbis,
      itbis_incluido,
      suplidor_id,
      estado,
      total_exento,
      total_gravado,
      descuento_total,
      itbis_total,
      total_orden,
      tenant_id
    ) VALUES (
      v_numero,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'Generada automaticamente desde solicitud de producto agotado',
      false,
      true,
      v_producto.suplidor_id,
      'Pendiente',
      COALESCE(v_producto.costo, 0) * v_qty,
      0,
      0,
      0,
      COALESCE(v_producto.costo, 0) * v_qty,
      v_tenant
    )
    RETURNING id, numero INTO v_order_id, v_numero;
  ELSE
    v_order_id := v_orden.id;
    v_numero := v_orden.numero;

    IF v_numero IS NULL OR v_numero = '' THEN
      SELECT public.get_next_orden_compra_numero() INTO v_numero;
    END IF;

    UPDATE public.ordenes_compra
       SET fecha_orden = CURRENT_DATE,
           numero = COALESCE(NULLIF(numero, ''), v_numero)
     WHERE id = v_order_id
       AND tenant_id = v_tenant;
  END IF;

  SELECT id, cantidad, cantidad_recibida
    INTO v_existing
  FROM public.ordenes_compra_detalle
  WHERE orden_compra_id = v_order_id
    AND producto_id = v_producto.id
    AND tenant_id = v_tenant
  ORDER BY id ASC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_line_existing := true;

    SELECT COALESCE(SUM(cantidad), 0)
      INTO v_current_qty
    FROM public.ordenes_compra_detalle
    WHERE orden_compra_id = v_order_id
      AND producto_id = v_producto.id
      AND tenant_id = v_tenant;

    v_received_qty := COALESCE(v_existing.cantidad_recibida, 0);
    v_new_qty := v_current_qty + v_qty;
    v_importe := v_new_qty * COALESCE(v_producto.costo, 0);

    UPDATE public.ordenes_compra_detalle
       SET cantidad = v_new_qty,
           cantidad_pedida = v_new_qty,
           cantidad_recibida = v_received_qty,
           cantidad_pendiente = GREATEST(0, v_new_qty - v_received_qty),
           estado_linea = CASE
             WHEN GREATEST(0, v_new_qty - v_received_qty) <= 0 THEN 'recibida'
             WHEN v_received_qty > 0 THEN 'parcial'
             ELSE 'pendiente'
           END,
           precio = COALESCE(v_producto.costo, 0),
           descuento_pct = 0,
           itbis_pct = COALESCE(v_producto.itbis_pct, 0),
           importe = v_importe
     WHERE id = v_existing.id
       AND tenant_id = v_tenant
     RETURNING id INTO v_detail_id;

    SELECT ARRAY_AGG(id)
      INTO v_duplicate_ids
    FROM public.ordenes_compra_detalle
    WHERE orden_compra_id = v_order_id
      AND producto_id = v_producto.id
      AND tenant_id = v_tenant
      AND id <> v_existing.id;

    IF v_duplicate_ids IS NOT NULL THEN
      DELETE FROM public.ordenes_compra_detalle
      WHERE id = ANY(v_duplicate_ids)
        AND tenant_id = v_tenant;
    END IF;
  ELSE
    INSERT INTO public.ordenes_compra_detalle (
      orden_compra_id,
      producto_id,
      codigo,
      descripcion,
      cantidad,
      cantidad_pedida,
      cantidad_recibida,
      cantidad_pendiente,
      estado_linea,
      unidad,
      precio,
      descuento_pct,
      itbis_pct,
      importe,
      tenant_id
    ) VALUES (
      v_order_id,
      v_producto.id,
      v_producto.codigo,
      v_producto.descripcion,
      v_qty,
      v_qty,
      0,
      v_qty,
      'pendiente',
      'UND',
      COALESCE(v_producto.costo, 0),
      0,
      COALESCE(v_producto.itbis_pct, 0),
      COALESCE(v_producto.costo, 0) * v_qty,
      v_tenant
    )
    RETURNING id INTO v_detail_id;
  END IF;

  PERFORM public._omni_recalcular_totales_orden_compra(v_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_numero', v_numero,
    'detail_id', v_detail_id,
    'supplier_id', v_producto.suplidor_id,
    'supplier_name', COALESCE(v_suplidor.nombre, 'Suplidor'),
    'is_new_order', v_is_new,
    'line_was_existing', v_line_existing
  );
END;
$$;

-- ------------------------------------------------------------
-- 4) RPC oficial para Web/Omni
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.omni_crear_solicitudes_agotadas(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_user uuid := auth.uid();
  v_products jsonb := COALESCE(p_payload->'products', '[]'::jsonb);
  v_line jsonb;
  v_results jsonb := '[]'::jsonb;
  v_cliente_id uuid := NULLIF(p_payload->>'cliente_id', '')::uuid;
  v_customer_name text := NULLIF(BTRIM(COALESCE(p_payload->>'customer_name', p_payload->>'cliente_nombre', '')), '');
  v_phone text := NULLIF(BTRIM(COALESCE(p_payload->>'phone', p_payload->>'cliente_telefono', '')), '');
  v_phone_normalized text := NULLIF(BTRIM(COALESCE(p_payload->>'phone_normalized', '')), '');
  v_source_channel text := COALESCE(NULLIF(p_payload->>'source_channel', ''), 'motoflow_web');
  v_source_conversation_id text := NULLIF(BTRIM(COALESCE(p_payload->>'source_conversation_id', '')), '');
  v_external_contact_id text := NULLIF(BTRIM(COALESCE(p_payload->>'external_contact_id', '')), '');
  v_avatar text := NULLIF(BTRIM(COALESCE(p_payload->>'contact_avatar', p_payload->>'contact_avatar_snapshot', '')), '');
  v_created_from text := COALESCE(NULLIF(p_payload->>'created_from', ''), 'motoflow_web');
  v_notes text := NULLIF(BTRIM(COALESCE(p_payload->>'notes', p_payload->>'notas', '')), '');
  v_duplicate_action text := COALESCE(NULLIF(p_payload->>'duplicate_action', ''), 'increase');
  v_producto_id uuid;
  v_producto_texto text;
  v_cantidad numeric;
  v_solicitud record;
  v_purchase jsonb;
  v_purchase_error text;
  v_was_duplicate boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar tenant activo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un producto';
  END IF;

  IF v_cliente_id IS NULL AND v_customer_name IS NULL AND v_phone_normalized IS NULL AND v_external_contact_id IS NULL THEN
    RAISE EXCEPTION 'Debe incluir cliente, contacto, telefono o identificador externo';
  END IF;

  IF v_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = v_cliente_id
      AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece al tenant activo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_products)
  LOOP
    v_producto_id := NULLIF(v_line->>'producto_id', '')::uuid;
    v_producto_texto := NULLIF(BTRIM(COALESCE(v_line->>'producto_texto', v_line->>'descripcion', '')), '');
    v_cantidad := GREATEST(1, CEIL(COALESCE(NULLIF(v_line->>'cantidad', '')::numeric, 1)));
    v_purchase := NULL;
    v_purchase_error := NULL;
    v_was_duplicate := false;

    IF v_producto_id IS NULL AND v_producto_texto IS NULL THEN
      RAISE EXCEPTION 'Cada linea debe tener producto_id o producto_texto';
    END IF;

    IF v_producto_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.productos
      WHERE id = v_producto_id
        AND tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Producto % no pertenece al tenant activo', v_producto_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT *
      INTO v_solicitud
    FROM public.solicitudes_clientes sc
    WHERE sc.tenant_id = v_tenant
      AND sc.estado IN ('abierta', 'solicitado')
      AND (
        (v_producto_id IS NOT NULL AND sc.producto_id = v_producto_id)
        OR (v_producto_id IS NULL AND sc.producto_id IS NULL AND LOWER(sc.producto_texto) = LOWER(v_producto_texto))
      )
      AND (
        (v_cliente_id IS NOT NULL AND sc.cliente_id = v_cliente_id)
        OR (v_phone_normalized IS NOT NULL AND sc.phone_normalized = v_phone_normalized)
        OR (v_external_contact_id IS NOT NULL AND sc.external_contact_id = v_external_contact_id)
        OR (
          v_cliente_id IS NULL
          AND v_phone_normalized IS NULL
          AND v_external_contact_id IS NULL
          AND v_customer_name IS NOT NULL
          AND LOWER(COALESCE(sc.cliente_nombre, sc.customer_name_snapshot, '')) = LOWER(v_customer_name)
        )
      )
    ORDER BY sc.created_at DESC
    LIMIT 1;

    IF v_solicitud.id IS NOT NULL AND v_duplicate_action = 'increase' THEN
      v_was_duplicate := true;

      UPDATE public.solicitudes_clientes
         SET cantidad_solicitada = COALESCE(cantidad_solicitada, 0) + v_cantidad,
             notas = NULLIF(BTRIM(CONCAT_WS(' | ', notas, v_notes)), ''),
             source_channel = COALESCE(source_channel, v_source_channel),
             source_conversation_id = COALESCE(source_conversation_id, v_source_conversation_id),
             external_contact_id = COALESCE(external_contact_id, v_external_contact_id),
             phone_normalized = COALESCE(phone_normalized, v_phone_normalized),
             customer_name_snapshot = COALESCE(customer_name_snapshot, v_customer_name),
             contact_avatar_snapshot = COALESCE(contact_avatar_snapshot, v_avatar),
             created_from = COALESCE(created_from, v_created_from)
       WHERE id = v_solicitud.id
         AND tenant_id = v_tenant
       RETURNING * INTO v_solicitud;
    ELSE
      INSERT INTO public.solicitudes_clientes (
        tenant_id,
        cliente_id,
        cliente_nombre,
        cliente_telefono,
        producto_id,
        producto_texto,
        cantidad_solicitada,
        estado,
        notas,
        creado_por,
        source_channel,
        source_conversation_id,
        external_contact_id,
        phone_normalized,
        customer_name_snapshot,
        contact_avatar_snapshot,
        created_from
      ) VALUES (
        v_tenant,
        v_cliente_id,
        CASE WHEN v_cliente_id IS NULL THEN v_customer_name ELSE NULL END,
        CASE WHEN v_cliente_id IS NULL THEN v_phone ELSE NULL END,
        v_producto_id,
        v_producto_texto,
        v_cantidad,
        'abierta',
        v_notes,
        v_user,
        v_source_channel,
        v_source_conversation_id,
        v_external_contact_id,
        v_phone_normalized,
        v_customer_name,
        v_avatar,
        v_created_from
      )
      RETURNING * INTO v_solicitud;
    END IF;

    IF v_producto_id IS NOT NULL THEN
      BEGIN
        v_purchase := public._omni_enviar_producto_a_orden_compra(
          v_producto_id,
          v_cantidad,
          'solicitud_agotada'
        );

        IF COALESCE((v_purchase->>'ok')::boolean, false) THEN
          UPDATE public.solicitudes_clientes
             SET orden_compra_id = (v_purchase->>'order_id')::uuid,
                 orden_compra_detalle_id = (v_purchase->>'detail_id')::uuid,
                 purchase_order_added_at = NOW(),
                 purchase_order_error = NULL
           WHERE id = v_solicitud.id
             AND tenant_id = v_tenant
           RETURNING * INTO v_solicitud;
        ELSE
          v_purchase_error := v_purchase->>'error';
          UPDATE public.solicitudes_clientes
             SET purchase_order_error = v_purchase_error
           WHERE id = v_solicitud.id
             AND tenant_id = v_tenant
           RETURNING * INTO v_solicitud;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_purchase_error := SQLERRM;
        v_purchase := jsonb_build_object('ok', false, 'error', v_purchase_error);
        UPDATE public.solicitudes_clientes
           SET purchase_order_error = v_purchase_error
         WHERE id = v_solicitud.id
           AND tenant_id = v_tenant
         RETURNING * INTO v_solicitud;
      END;
    ELSE
      v_purchase := jsonb_build_object(
        'ok', false,
        'skipped', true,
        'reason', 'producto_libre'
      );
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'ok', true,
      'solicitud_id', v_solicitud.id,
      'duplicate', v_was_duplicate,
      'producto_id', v_producto_id,
      'producto_texto', v_producto_texto,
      'cantidad', v_solicitud.cantidad_solicitada,
      'purchase', v_purchase
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'results', v_results
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._omni_recalcular_totales_orden_compra(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._omni_enviar_producto_a_orden_compra(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._omni_recalcular_totales_orden_compra(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._omni_enviar_producto_a_orden_compra(uuid, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._omni_recalcular_totales_orden_compra(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._omni_enviar_producto_a_orden_compra(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.omni_crear_solicitudes_agotadas(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'omni_solicitudes_agotadas listo' AS status;
