-- ============================================================
-- FIX: Recibo de ingreso movil - RLS y tenant real
-- ============================================================
-- Problema:
--   La app movil puede enviar un valor tenant_id incorrecto y la RPC,
--   al no ser SECURITY DEFINER, cae en la politica RLS de recibos_ingreso.
--
-- Solucion:
--   - La RPC resuelve el tenant desde get_user_tenant() y, como respaldo,
--     desde el cliente.
--   - Ignora tenant_id enviado por el cliente movil si no coincide.
--   - Valida que cliente y facturas pertenezcan al mismo tenant.
--   - Ejecuta como SECURITY DEFINER para que la operacion transaccional
--     pueda insertar recibo/detalle y actualizar facturas sin chocar RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_recibo_ingreso_y_actualizar_facturas(
  p_recibo_data jsonb,
  p_abonos_data jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_recibo_id uuid;
    v_recibo_numero text;
    v_abono_detalle jsonb;
    v_factura_id uuid;
    v_monto_abonado numeric;
    v_monto_pendiente_actual numeric;
    v_cliente_id uuid;
    v_user_tenant uuid;
    v_cliente_tenant uuid;
    v_tenant_id uuid;
BEGIN
    v_cliente_id := (p_recibo_data->>'cliente_id')::uuid;
    v_user_tenant := public.get_user_tenant();

    SELECT c.tenant_id
      INTO v_cliente_tenant
    FROM public.clientes c
    WHERE c.id = v_cliente_id;

    v_tenant_id := COALESCE(v_user_tenant, v_cliente_tenant);

    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'No se pudo resolver el tenant del recibo.';
    END IF;

    IF v_cliente_tenant IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'El cliente no pertenece al tenant actual.';
    END IF;

    v_recibo_numero := public.get_next_recibo_ingreso_numero();

    INSERT INTO public.recibos_ingreso (
      tenant_id,
      numero,
      cliente_id,
      fecha,
      monto_pagado,
      concepto,
      formas_pago,
      usuario_id
    )
    VALUES (
      v_tenant_id,
      v_recibo_numero,
      v_cliente_id,
      (p_recibo_data->>'fecha')::date,
      (p_recibo_data->>'monto_pagado')::numeric,
      p_recibo_data->>'concepto',
      (p_recibo_data->>'formas_pago')::jsonb,
      auth.uid()
    )
    RETURNING id INTO v_recibo_id;

    FOR v_abono_detalle IN SELECT * FROM jsonb_array_elements(p_abonos_data)
    LOOP
        v_factura_id := (v_abono_detalle->>'factura_id')::uuid;
        v_monto_abonado := (v_abono_detalle->>'monto_abono')::numeric;

        IF v_monto_abonado <= 0 THEN
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.facturas f
          WHERE f.id = v_factura_id
            AND f.cliente_id = v_cliente_id
            AND f.tenant_id = v_tenant_id
        ) THEN
          RAISE EXCEPTION 'Factura % no pertenece al cliente/tenant actual.', v_factura_id;
        END IF;

        INSERT INTO public.recibos_ingreso_detalle (
          tenant_id,
          recibo_id,
          factura_id,
          monto_abonado
        )
        VALUES (
          v_tenant_id,
          v_recibo_id,
          v_factura_id,
          v_monto_abonado
        );

        UPDATE public.facturas
        SET monto_pendiente = GREATEST(0, monto_pendiente - v_monto_abonado)
        WHERE id = v_factura_id
          AND tenant_id = v_tenant_id
        RETURNING monto_pendiente INTO v_monto_pendiente_actual;

        IF v_monto_pendiente_actual <= 0.01 THEN
            UPDATE public.facturas
            SET estado = 'PAGADA',
                monto_pendiente = 0
            WHERE id = v_factura_id
              AND tenant_id = v_tenant_id;
        END IF;
    END LOOP;

    UPDATE public.clientes
    SET balance = (
        SELECT COALESCE(SUM(monto_pendiente), 0)
        FROM public.facturas
        WHERE cliente_id = v_cliente_id
          AND estado = 'PENDIENTE'
          AND tenant_id = v_tenant_id
    )
    WHERE id = v_cliente_id
      AND tenant_id = v_tenant_id;

    RETURN v_recibo_numero;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_recibo_ingreso_y_actualizar_facturas(jsonb, jsonb)
TO authenticated, service_role;
