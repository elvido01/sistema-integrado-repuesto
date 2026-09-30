-- =====================================================================
-- ISABEL DEL ROSARIO (Odalys, PT-0000880): recibo 0007191 como el SiiF
-- ---------------------------------------------------------------------
-- (2026-09-30) El recibo de hoy (5,100 = 900 cargo + interés + capital) se
-- grabó con la fórmula vieja: 2,790.06 de interés y 1,409.94 a capital. El
-- SiiF cobró 2,836.68 de interés (71 días reales, ver
-- interes_dias_reales_odalys.sql) y 1,363.32 a capital. Decisión del dueño:
-- corregirlo para que el saldo quede igual que el SiiF (13,827.24).
--
-- Se pasan 46.62 de capital a interés. El total cobrado (5,100), el cargo
-- de 900 y la caja NO cambian. Solo este recibo, solo Odalys.
-- Si alguna fila no está como la dejó el recibo, no toca nada.
-- =====================================================================

DO $$
DECLARE
  v_tenant  constant uuid := 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005';
  v_pago    constant uuid := 'caaf0345-2436-4473-8592-b95fce0f51a7';
  v_q_int   constant uuid := '91c13ce2-6012-4a05-9da3-a4fcc419dc03';  -- cuota de interés del 30/09
  v_q_cap   constant uuid := '55d8f0bf-9b1e-45dd-b010-5c578ce6fe80';  -- cuota de capital
  v_d_int   constant uuid := '2202c184-4d98-4bde-aba5-4eef23f3fe90';
  v_d_cap   constant uuid := '9d7545c0-9f16-4962-8005-58eb73608abd';
  n int;
BEGIN
  -- Ya corregido: no repetir.
  IF EXISTS (SELECT 1 FROM public.prestamo_cuotas WHERE id = v_q_int AND interes = 2836.68) THEN
    RAISE NOTICE 'Ya estaba corregido.';
    RETURN;
  END IF;

  UPDATE public.prestamo_cuotas SET interes = 2836.68, monto_cuota = 2836.68, interes_pagado = 2836.68
   WHERE id = v_q_int AND tenant_id = v_tenant AND interes = 2790.06 AND interes_pagado = 2790.06;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'cuota de interés no está como se esperaba'; END IF;

  UPDATE public.prestamo_cuotas SET capital_pagado = 1363.32
   WHERE id = v_q_cap AND tenant_id = v_tenant AND capital_pagado = 1409.94;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'cuota de capital no está como se esperaba'; END IF;

  UPDATE public.prestamo_pago_detalle SET abono_interes = 2836.68, abono_total = 2836.68
   WHERE id = v_d_int AND pago_id = v_pago AND abono_interes = 2790.06;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'detalle de interés no está como se esperaba'; END IF;

  UPDATE public.prestamo_pago_detalle SET abono_capital = 1363.32, abono_total = 1363.32
   WHERE id = v_d_cap AND pago_id = v_pago AND abono_capital = 1409.94;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'detalle de capital no está como se esperaba'; END IF;

  -- Saldo antes: 15,190.56 capital + 2,836.68 interés + 900 cargo = 18,927.24.
  UPDATE public.prestamo_pagos SET balance_anterior = 18927.24, balance_actual = 13827.24
   WHERE id = v_pago AND tenant_id = v_tenant AND total_pagado = 5100.00 AND balance_actual = 13780.62;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'recibo no está como se esperaba'; END IF;
END $$;

SELECT public.registrar_migracion('odalys_isabel_recibo_0007191_como_siif.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT capital - capital_pagado FROM public.prestamo_cuotas WHERE id = '55d8f0bf-9b1e-45dd-b010-5c578ce6fe80') AS capital_pendiente_13827_24,
  (SELECT sum(abono_total) FROM public.prestamo_pago_detalle WHERE pago_id = 'caaf0345-2436-4473-8592-b95fce0f51a7') AS detalle_4200,
  (SELECT total_pagado || ' / ' || balance_actual FROM public.prestamo_pagos WHERE id = 'caaf0345-2436-4473-8592-b95fce0f51a7') AS recibo;
