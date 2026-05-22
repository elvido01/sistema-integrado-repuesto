-- ============================================================
-- FIX: facturas a credito cuyo abono inicial NO se desconto del
-- pendiente ni genero recibo de ingreso.
-- Causa: la venta enviaba p_abonos_data como texto (JSON.stringify),
-- el RPC crear_recibo_ingreso_y_actualizar_facturas fallaba en silencio.
-- Afectadas detectadas: FT-1850, FT-1723, FT-1691.
-- ------------------------------------------------------------
-- Este script, por cada factura afectada SIN recibo:
--   1. Crea el recibo de ingreso por el monto ya cobrado (monto_recibido).
--   2. Crea el detalle del recibo.
--   3. Ajusta monto_pendiente = total - monto_recibido (>= 0) y estado.
--   4. Recalcula el balance de los clientes afectados.
--
-- NOTA: la forma de pago se registra como 'Efectivo'. Si algun abono fue
-- por transferencia/cheque, ajustalo luego en el recibo correspondiente.
-- Idempotente: solo toca facturas que NO tengan ya un recibo.
-- ============================================================

DO $$
DECLARE
  v_f RECORD;
  v_recibo_id uuid;
  v_recibo_numero text;
  v_pendiente numeric;
BEGIN
  FOR v_f IN
    SELECT f.id, f.numero, f.cliente_id, f.total, f.monto_recibido, f.fecha
    FROM public.facturas f
    WHERE f.numero IN ('1850','1723','1691')
      AND f.forma_pago = 'CREDITO'
      AND COALESCE(f.monto_recibido,0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.recibos_ingreso_detalle d WHERE d.factura_id = f.id
      )
  LOOP
    v_recibo_numero := get_next_recibo_ingreso_numero();

    INSERT INTO public.recibos_ingreso (numero, cliente_id, fecha, monto_pagado, concepto, formas_pago)
    VALUES (
      v_recibo_numero,
      v_f.cliente_id,
      (v_f.fecha)::date,
      v_f.monto_recibido,
      'Abono al momento de la venta (correccion FT-' || v_f.numero || ')',
      jsonb_build_array(jsonb_build_object('forma','Efectivo','monto',v_f.monto_recibido,'referencia',''))
    )
    RETURNING id INTO v_recibo_id;

    INSERT INTO public.recibos_ingreso_detalle (recibo_id, factura_id, monto_abonado)
    VALUES (v_recibo_id, v_f.id, v_f.monto_recibido);

    v_pendiente := GREATEST(0, v_f.total - v_f.monto_recibido);

    UPDATE public.facturas
    SET monto_pendiente = v_pendiente,
        estado = CASE WHEN v_pendiente <= 0.01 THEN 'PAGADA' ELSE 'PENDIENTE' END
    WHERE id = v_f.id;

    RAISE NOTICE 'FT-% corregida: recibo %, pendiente %', v_f.numero, v_recibo_numero, v_pendiente;
  END LOOP;

  -- Recalcular balance de los clientes de esas facturas
  UPDATE public.clientes c
  SET balance = (
    SELECT COALESCE(SUM(monto_pendiente),0)
    FROM public.facturas
    WHERE cliente_id = c.id AND estado = 'PENDIENTE'
  )
  WHERE c.id IN (
    SELECT cliente_id FROM public.facturas WHERE numero IN ('1850','1723','1691')
  );
END $$;

-- Verificacion: deben quedar consistentes (pagado + pendiente = total)
SELECT numero, total, monto_recibido, monto_pendiente, estado
FROM public.facturas
WHERE numero IN ('1850','1723','1691')
ORDER BY numero;
