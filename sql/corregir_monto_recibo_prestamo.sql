-- =====================================================================
-- Corregir el monto de un recibo de préstamo ya grabado
-- ---------------------------------------------------------------------
-- (2026-08-07) "MotoPréstamos Los Naranjos, el 0147827 tiene un error, el
-- monto del recibo es de 4,000."
--
-- El recibo entró por 6,000 y se repartió así:
--
--   cuota 1 (vence 28/05)   capital 5,185.00 + mora 484.12 = 5,669.12  pagada
--   cuota 2 (vence 28/06)                      mora 330.88 =   330.88  parcial
--
-- Bajarlo a 4,000 no es cambiar un número: hay que devolver esos abonos a
-- las cuotas, repartir de nuevo los 4,000, recalcular el estado de cada
-- cuota, el balance del recibo y el recibo de caja que alimenta el cierre.
-- Por eso se hace con una función y no a mano.
--
-- >>> CÓMO SE REPARTE <<<
-- Igual que el sistema: cuota más vieja primero, y dentro de cada una
-- mora → interés → capital. Se reconstruye lo que estaba pendiente JUSTO
-- ANTES de este recibo (lo pendiente de hoy + lo que este recibo aplicó) y
-- sobre eso se reparte el monto nuevo.
--
-- Se usa la mora que el sistema calculó AQUEL DÍA, no una recalculada hoy:
-- la mora corre a diario y recalcularla ahora cambiaría cifras que ya se le
-- dijeron al cliente.
--
-- >>> QUEDA PARA LA PRÓXIMA <<<
-- Es un error de digitación que va a volver a pasar. La función queda
-- publicada para engancharla al botón "Editar recibo", que hoy solo cambia
-- la forma de pago.
--
-- Idempotente: correrlo dos veces con el mismo monto deja lo mismo.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL MOTOR (sin control de acceso: lo pone el envoltorio)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._corregir_monto_recibo(
  p_numero text, p_monto numeric, p_tenant uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pago   record;
  d        record;
  v_resto  numeric;
  v_toma   numeric;
  v_cap    numeric;
  v_int    numeric;
  v_mora   numeric;
  v_dig    bigint;
  v_caja   int := 0;
  v_lineas int := 0;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto nuevo debe ser mayor que cero';
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = p_tenant AND numero = p_numero AND COALESCE(anulado, false) = false;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  -- ---- (a) DEVOLVER lo que este recibo había aplicado ----
  FOR d IN
    SELECT * FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id
  LOOP
    UPDATE public.prestamo_cuotas
    SET capital_pagado = GREATEST(0, COALESCE(capital_pagado, 0) - COALESCE(d.abono_capital, 0)),
        interes_pagado = GREATEST(0, COALESCE(interes_pagado, 0) - COALESCE(d.abono_interes, 0)),
        mora_pagada    = GREATEST(0, COALESCE(mora_pagada, 0)    - COALESCE(d.abono_mora, 0))
    WHERE id = d.cuota_id;
  END LOOP;

  -- ---- (b) REPARTIR el monto nuevo ----
  -- Sobre las MISMAS cuotas que tocó el recibo, de la más vieja a la más
  -- nueva. La mora disponible es la que este recibo cobró aquel día.
  v_resto := round(p_monto, 2);

  FOR d IN
    SELECT pd.cuota_id,
           COALESCE(pd.abono_mora, 0) AS mora_de_aquel_dia,
           c.capital, c.interes,
           COALESCE(c.capital_pagado, 0) AS cap_pag,
           COALESCE(c.interes_pagado, 0) AS int_pag,
           c.fecha_vencimiento, c.numero_cuota
    FROM public.prestamo_pago_detalle pd
    JOIN public.prestamo_cuotas c ON c.id = pd.cuota_id
    WHERE pd.pago_id = v_pago.id
    ORDER BY c.fecha_vencimiento, c.numero_cuota
  LOOP
    v_mora := 0; v_int := 0; v_cap := 0;

    -- mora primero
    v_toma := LEAST(v_resto, d.mora_de_aquel_dia);
    v_mora := round(v_toma, 2); v_resto := round(v_resto - v_toma, 2);

    -- luego interés
    v_toma := LEAST(v_resto, GREATEST(0, COALESCE(d.interes, 0) - d.int_pag));
    v_int := round(v_toma, 2); v_resto := round(v_resto - v_toma, 2);

    -- por último capital
    v_toma := LEAST(v_resto, GREATEST(0, COALESCE(d.capital, 0) - d.cap_pag));
    v_cap := round(v_toma, 2); v_resto := round(v_resto - v_toma, 2);

    UPDATE public.prestamo_cuotas
    SET capital_pagado = COALESCE(capital_pagado, 0) + v_cap,
        interes_pagado = COALESCE(interes_pagado, 0) + v_int,
        mora_pagada    = COALESCE(mora_pagada, 0)    + v_mora
    WHERE id = d.cuota_id;

    UPDATE public.prestamo_pago_detalle
    SET abono_capital = v_cap, abono_interes = v_int, abono_mora = v_mora
    WHERE pago_id = v_pago.id AND cuota_id = d.cuota_id;

    v_lineas := v_lineas + 1;
  END LOOP;

  IF v_resto > 0.009 THEN
    RAISE EXCEPTION 'Sobran % del monto: no cabe en las cuotas de este recibo. Registra ese excedente aparte.', v_resto;
  END IF;

  -- Las líneas que quedaron en cero salen: un abono de 0 no es un abono.
  DELETE FROM public.prestamo_pago_detalle
  WHERE pago_id = v_pago.id
    AND COALESCE(abono_capital,0) + COALESCE(abono_interes,0) + COALESCE(abono_mora,0) = 0;

  -- ---- (c) ESTADO de cada cuota tocada ----
  UPDATE public.prestamo_cuotas c
  SET estado = CASE
        WHEN COALESCE(c.capital_pagado,0) >= COALESCE(c.capital,0) - 0.009
         AND COALESCE(c.interes_pagado,0) >= COALESCE(c.interes,0) - 0.009 THEN 'pagada'
        WHEN COALESCE(c.capital_pagado,0) + COALESCE(c.interes_pagado,0) + COALESCE(c.mora_pagada,0) > 0 THEN 'parcial'
        ELSE 'pendiente' END
  WHERE c.id IN (SELECT cuota_id FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id)
     OR c.id IN (SELECT cuota_id FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id);

  -- ---- (d) EL RECIBO ----
  UPDATE public.prestamo_pagos
  SET total_pagado   = round(p_monto, 2),
      balance_actual = round(COALESCE(balance_anterior, 0) - p_monto, 2)
  WHERE id = v_pago.id;

  -- ---- (e) EL RECIBO DE CAJA (el que lee el cierre) ----
  -- recibos_ingreso numera aparte ('RI-147827' contra '0147827'), así que se
  -- comparan los dígitos como número. Sin esto, el cuadre del día seguiría
  -- contando los 6,000.
  v_dig := NULLIF(regexp_replace(p_numero, '\D', '', 'g'), '')::bigint;

  UPDATE public.recibos_ingreso ri
  SET monto_pagado = round(p_monto, 2),
      formas_pago = jsonb_build_array(jsonb_build_object(
        'forma', COALESCE(v_pago.forma_pago, 'Efectivo'),
        'monto', round(p_monto, 2),
        'referencia', COALESCE(NULLIF(btrim(v_pago.cuenta_numero), ''), p_numero)))
  WHERE ri.tenant_id = p_tenant
    AND COALESCE(ri.anulado, false) = false
    AND ri.cliente_id = v_pago.cliente_id
    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint = v_dig;
  GET DIAGNOSTICS v_caja = ROW_COUNT;

  -- ---- (f) EL BANCO, si no fue efectivo ----
  UPDATE public.movimientos_bancarios
  SET monto = round(p_monto, 2)
  WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;

  RETURN json_build_object(
    'numero', p_numero,
    'monto_anterior', v_pago.total_pagado,
    'monto_nuevo', round(p_monto, 2),
    'cuotas_afectadas', v_lineas,
    'recibo_caja_actualizado', v_caja
  );
END $$;

-- ------------------------------------------------------------
-- 2) EL ENVOLTORIO PÚBLICO (mismo candado que Editar recibo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corregir_monto_recibo_prestamo(
  p_numero text, p_monto numeric, p_password text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;
  IF NOT public.es_usuario_admin() THEN
    IF p_password IS NULL OR NOT public.verificar_password_administrativo(p_password) THEN
      RAISE EXCEPTION 'Contraseña administrativa incorrecta';
    END IF;
  END IF;
  RETURN public._corregir_monto_recibo(p_numero, p_monto, v_tenant);
END $$;

REVOKE EXECUTE ON FUNCTION public._corregir_monto_recibo(text, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.corregir_monto_recibo_prestamo(text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.corregir_monto_recibo_prestamo(text, numeric, text) TO authenticated;

-- ------------------------------------------------------------
-- 3) EL CASO DE HOY: 0147827 → 4,000
-- ------------------------------------------------------------
DO $$
DECLARE v_res json;
BEGIN
  SELECT public._corregir_monto_recibo(
    '0147827', 4000, '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  ) INTO v_res;
  RAISE NOTICE 'Corregido: %', v_res;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('corregir_monto_recibo_prestamo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL RECIBO
SELECT numero, fecha, total_pagado, balance_anterior, balance_actual, forma_pago
FROM public.prestamo_pagos WHERE numero = '0147827';
-- esperado: 4,000.00 y balance_actual 172,183.06 (era 170,183.06 con 6,000)

-- 2) CÓMO QUEDÓ REPARTIDO
SELECT c.numero_cuota, c.fecha_vencimiento, c.capital, c.monto_cuota,
       d.abono_mora, d.abono_interes, d.abono_capital,
       c.capital_pagado, c.mora_pagada, c.estado
FROM public.prestamo_pago_detalle d
JOIN public.prestamo_cuotas c ON c.id = d.cuota_id
JOIN public.prestamo_pagos p ON p.id = d.pago_id
WHERE p.numero = '0147827'
ORDER BY c.fecha_vencimiento;
-- esperado: mora 484.12 + capital 3,515.88 en la cuota 1, que pasa a
-- 'parcial'. La cuota 2 sale del detalle: ya no recibe nada.

-- 3) LA SUMA CUADRA
SELECT SUM(abono_capital + abono_interes + abono_mora) AS reparte
FROM public.prestamo_pago_detalle d
JOIN public.prestamo_pagos p ON p.id = d.pago_id
WHERE p.numero = '0147827';
-- esperado: 4,000.00

-- 4) LA CAJA DEL DÍA
SELECT numero, monto_pagado, formas_pago
FROM public.recibos_ingreso
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND numero LIKE '%147827';
-- esperado: 4,000.00. Si sigue en 6,000, el cierre de hoy mentiría.
