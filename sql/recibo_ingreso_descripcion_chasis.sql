-- =====================================================================
-- get_datos_cliente_para_recibo: DESCRIPCION (chasis + cod. cliente)
-- SOLO para el flujo dealer/financiera (Caminero Motors / MotoPrestamos)
-- ---------------------------------------------------------------------
-- En el Recibo de Ingreso la columna DESCRIPCION mostraba 'CHASIS: <chasis>
-- | COD CLI: <codigo>'. Eso solo tiene sentido en empresas que venden
-- vehiculos/financiamiento (Caminero, MotoPrestamos), donde la linea de la
-- factura trae el chasis en facturas_detalle.codigo.
--
-- En empresas de repuestos (ej. Repuestos Morla) ese "codigo" es el codigo
-- del producto, NO un chasis, y NO debe mostrarse como tal. Por eso la
-- descripcion solo se arma cuando el tenant es dealer/financiera; para los
-- demas queda vacia (como antes).
--
-- Gate por configuracion (no UUIDs): feat_financiera, financiamiento_tipo
-- = 'terceros', o financiera_tenant_id no nulo. Re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_datos_cliente_para_recibo(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant uuid := public.get_user_tenant();
    v_is_dealer boolean := false;
    v_balance_anterior numeric;
    v_ultimo_pago json;
    v_facturas_pendientes json;
BEGIN
    -- Es una empresa del flujo dealer/financiera (motos), donde el codigo de
    -- la linea es un chasis? Solo entonces mostramos CHASIS / COD CLI.
    SELECT (
              COALESCE(ce.feat_financiera, false) = true
              OR COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
              OR ce.financiera_tenant_id IS NOT NULL
           )
      INTO v_is_dealer
    FROM public.config_empresa ce
    WHERE ce.tenant_id = v_tenant
    LIMIT 1;
    v_is_dealer := COALESCE(v_is_dealer, false);

    SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_balance_anterior
    FROM public.facturas
    WHERE cliente_id = p_cliente_id AND estado = 'PENDIENTE';

    SELECT json_build_object('fecha', fecha, 'monto_pagado', monto_pagado) INTO v_ultimo_pago
    FROM public.recibos_ingreso
    WHERE cliente_id = p_cliente_id AND (anulado IS NULL OR anulado = false)
    ORDER BY fecha DESC, created_at DESC
    LIMIT 1;

    SELECT json_agg(
        json_build_object(
            'id', f.id,
            'fecha', f.fecha,
            'fecha_vencimiento', f.fecha + (f.dias_credito || ' days')::interval,
            'origen', 'Venta',
            'referencia', 'FT-' || f.numero,
            'descripcion', CASE WHEN v_is_dealer THEN btrim(
              COALESCE(
                (SELECT 'CHASIS: ' || string_agg(NULLIF(btrim(fd.codigo), ''), ', ')
                 FROM public.facturas_detalle fd
                 WHERE fd.factura_id = f.id
                   AND NULLIF(btrim(fd.codigo), '') IS NOT NULL),
                ''
              )
              -- Si la CxC es de la financiera, mostrar el COMPRADOR real
              -- (manual_cliente_nombre); si no, el codigo del cliente.
              || CASE
                   WHEN COALESCE(btrim(f.manual_cliente_nombre), '') <> ''
                     THEN ' | COMPRADOR: ' || f.manual_cliente_nombre
                   WHEN COALESCE(btrim(cl.codigo), '') <> ''
                     THEN ' | COD CLI: ' || cl.codigo
                   ELSE ''
                 END
            ) ELSE '' END,
            'monto_total', f.total,
            'monto_pendiente', f.monto_pendiente
        )
    ) INTO v_facturas_pendientes
    FROM public.facturas f
    LEFT JOIN public.clientes cl ON cl.id = f.cliente_id
    WHERE f.cliente_id = p_cliente_id AND f.estado = 'PENDIENTE' AND f.forma_pago = 'CREDITO';

    RETURN jsonb_build_object(
        'balance_anterior', v_balance_anterior,
        'ultimo_pago', v_ultimo_pago,
        'facturas_pendientes', COALESCE(v_facturas_pendientes, '[]'::json)
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

SELECT 'get_datos_cliente_para_recibo: descripcion chasis solo dealer/financiera' AS status;
