-- ============================================================
-- FIX: Guardar tenant_id en recibos de ingreso y detalles
-- ============================================================
-- Sin este campo, la caja actual filtrada por tenant no suma los
-- recibos creados por la RPC crear_recibo_ingreso_y_actualizar_facturas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_recibo_ingreso_y_actualizar_facturas(p_recibo_data jsonb, p_abonos_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
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
    v_tenant_id uuid;
BEGIN
    v_cliente_id := (p_recibo_data->>'cliente_id')::uuid;
    v_tenant_id := COALESCE((p_recibo_data->>'tenant_id')::uuid, public.get_user_tenant());

    -- Generate receipt number
    v_recibo_numero := get_next_recibo_ingreso_numero();

    -- Insert receipt header
    INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id)
    VALUES (
        v_tenant_id,
        v_recibo_numero,
        v_cliente_id,
        (p_recibo_data->>'fecha')::date,
        (p_recibo_data->>'monto_pagado')::numeric,
        p_recibo_data->>'concepto',
        (p_recibo_data->>'formas_pago')::jsonb,
        auth.uid()
    ) RETURNING id INTO v_recibo_id;

    -- Iterate over payments and update invoices
    FOR v_abono_detalle IN SELECT * FROM jsonb_array_elements(p_abonos_data)
    LOOP
        v_factura_id := (v_abono_detalle->>'factura_id')::uuid;
        v_monto_abonado := (v_abono_detalle->>'monto_abono')::numeric;

        -- Insert receipt detail
        INSERT INTO public.recibos_ingreso_detalle (tenant_id, recibo_id, factura_id, monto_abonado)
        VALUES (v_tenant_id, v_recibo_id, v_factura_id, v_monto_abonado);

        -- Update invoice. Tenant guard prevents cross-tenant updates.
        UPDATE public.facturas
        SET monto_pendiente = GREATEST(0, monto_pendiente - v_monto_abonado)
        WHERE id = v_factura_id
          AND tenant_id = v_tenant_id
        RETURNING monto_pendiente INTO v_monto_pendiente_actual;

        -- If invoice is paid off, change status
        IF v_monto_pendiente_actual <= 0.01 THEN
            UPDATE public.facturas
            SET estado = 'PAGADA', monto_pendiente = 0
            WHERE id = v_factura_id
              AND tenant_id = v_tenant_id;
        END IF;
    END LOOP;

    -- Update client balance
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
