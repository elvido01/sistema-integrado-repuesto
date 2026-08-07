-- =====================================================================
-- Anular un recibo de préstamo (y arreglar el duplicado de ANDY)
-- ---------------------------------------------------------------------
-- (2026-08-07) "el recibo de ANDY está duplicado, es uno solo: RI-147828 y
-- 147827."
--
-- Lo que pasó, en orden:
--
--   17:24  0147827  registrado por 6,000 (mal digitado)
--   17:26  0147828  registrado por 4,000, SIN ninguna línea de detalle
--   18:22  la corrección bajó el 0147827 a 4,000
--
-- ANDY pagó 4,000 UNA vez. Las cuotas están bien: tienen 4,000 aplicados en
-- total, todos del 0147827. Pero hay DOS recibos de ingreso de 4,000, así
-- que la caja del día está contando 8,000. Sobran 4,000 que nadie tiene.
--
-- Se anula el 0147828, que es el que no aplicó a ninguna cuota: nunca movió
-- deuda, solo infló la caja.
--
-- >>> LA FUNCIÓN QUE FALTABA <<<
-- No existía forma de anular un pago de préstamo. Por eso el operador
-- resolvió el error digitando el recibo otra vez, que es exactamente lo que
-- produjo el duplicado. Mientras no haya un botón de anular, esto vuelve a
-- pasar cada vez que alguien se equivoque tecleando un monto.
--
-- >>> ADEMÁS: UN DEFECTO DE _corregir_monto_recibo <<<
-- Al corregir el 0147827, la cuota 2 se quedó en 'parcial' con cero pagado.
-- La función borraba las líneas que quedaban en cero ANTES de recalcular el
-- estado, así que esas cuotas quedaban fuera del recálculo justo cuando más
-- falta hacía. Se recalcula primero y se borra después.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) ANULAR UN PAGO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._anular_pago_prestamo(p_numero text, p_tenant uuid, p_motivo text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pago   record;
  d        record;
  v_cuotas uuid[] := '{}';
  v_dig    bigint;
  v_caja   int := 0;
BEGIN
  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = p_tenant AND numero = p_numero;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  IF COALESCE(v_pago.anulado, false) THEN
    RETURN json_build_object('numero', p_numero, 'ya_estaba_anulado', true);
  END IF;

  -- (a) devolver a las cuotas lo que este recibo aplicó
  FOR d IN SELECT * FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id LOOP
    v_cuotas := v_cuotas || d.cuota_id;
    UPDATE public.prestamo_cuotas
    SET capital_pagado = GREATEST(0, COALESCE(capital_pagado,0) - COALESCE(d.abono_capital,0)),
        interes_pagado = GREATEST(0, COALESCE(interes_pagado,0) - COALESCE(d.abono_interes,0)),
        mora_pagada    = GREATEST(0, COALESCE(mora_pagada,0)    - COALESCE(d.abono_mora,0))
    WHERE id = d.cuota_id;
  END LOOP;

  DELETE FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id;

  -- (b) estado de las cuotas que quedaron libres
  UPDATE public.prestamo_cuotas c
  SET estado = CASE
        WHEN COALESCE(c.capital_pagado,0) >= COALESCE(c.capital,0) - 0.009
         AND COALESCE(c.interes_pagado,0) >= COALESCE(c.interes,0) - 0.009 THEN 'pagada'
        WHEN COALESCE(c.capital_pagado,0) + COALESCE(c.interes_pagado,0) + COALESCE(c.mora_pagada,0) > 0 THEN 'parcial'
        ELSE 'pendiente' END
  WHERE c.id = ANY(v_cuotas);

  -- (c) el recibo
  UPDATE public.prestamo_pagos
  SET anulado = true,
      comentarios = btrim(COALESCE(comentarios,'') || ' [ANULADO' ||
                          COALESCE(': ' || p_motivo, '') || ']')
  WHERE id = v_pago.id;

  -- (d) el recibo de caja: si sigue vivo, el cuadre del día lo sigue contando.
  -- Se compara por DÍGITOS ('RI-147828' contra '0147828').
  v_dig := NULLIF(regexp_replace(p_numero, '\D', '', 'g'), '')::bigint;
  UPDATE public.recibos_ingreso ri
  SET anulado = true
  WHERE ri.tenant_id = p_tenant
    AND ri.cliente_id = v_pago.cliente_id
    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint = v_dig;
  GET DIAGNOSTICS v_caja = ROW_COUNT;

  -- (e) el banco, si había entrado ahí
  DELETE FROM public.movimientos_bancarios
  WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;

  RETURN json_build_object(
    'numero', p_numero,
    'monto_devuelto', v_pago.total_pagado,
    'cuotas_liberadas', array_length(v_cuotas, 1),
    'recibo_caja_anulado', v_caja
  );
END $$;

CREATE OR REPLACE FUNCTION public.anular_pago_prestamo(
  p_numero text, p_motivo text DEFAULT NULL, p_password text DEFAULT NULL
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
  RETURN public._anular_pago_prestamo(p_numero, v_tenant, p_motivo);
END $$;

REVOKE EXECUTE ON FUNCTION public._anular_pago_prestamo(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anular_pago_prestamo(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.anular_pago_prestamo(text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) EL DEFECTO DE _corregir_monto_recibo
-- ------------------------------------------------------------
-- Recalcular el estado ANTES de borrar las líneas en cero. Al revés, las
-- cuotas que se quedaban sin abono salían del recálculo y conservaban el
-- estado viejo — así quedó la cuota 2 de ANDY en 'parcial' sin haber pagado
-- nada.
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
  v_cuotas uuid[] := '{}';
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto nuevo debe ser mayor que cero';
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = p_tenant AND numero = p_numero AND COALESCE(anulado, false) = false;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  FOR d IN SELECT * FROM public.prestamo_pago_detalle WHERE pago_id = v_pago.id LOOP
    v_cuotas := v_cuotas || d.cuota_id;
    UPDATE public.prestamo_cuotas
    SET capital_pagado = GREATEST(0, COALESCE(capital_pagado,0) - COALESCE(d.abono_capital,0)),
        interes_pagado = GREATEST(0, COALESCE(interes_pagado,0) - COALESCE(d.abono_interes,0)),
        mora_pagada    = GREATEST(0, COALESCE(mora_pagada,0)    - COALESCE(d.abono_mora,0))
    WHERE id = d.cuota_id;
  END LOOP;

  v_resto := round(p_monto, 2);

  FOR d IN
    SELECT pd.cuota_id, COALESCE(pd.abono_mora,0) AS mora_de_aquel_dia,
           c.capital, c.interes,
           COALESCE(c.capital_pagado,0) AS cap_pag, COALESCE(c.interes_pagado,0) AS int_pag
    FROM public.prestamo_pago_detalle pd
    JOIN public.prestamo_cuotas c ON c.id = pd.cuota_id
    WHERE pd.pago_id = v_pago.id
    ORDER BY c.fecha_vencimiento, c.numero_cuota
  LOOP
    v_toma := LEAST(v_resto, d.mora_de_aquel_dia);
    v_mora := round(v_toma,2); v_resto := round(v_resto - v_toma, 2);

    v_toma := LEAST(v_resto, GREATEST(0, COALESCE(d.interes,0) - d.int_pag));
    v_int := round(v_toma,2); v_resto := round(v_resto - v_toma, 2);

    v_toma := LEAST(v_resto, GREATEST(0, COALESCE(d.capital,0) - d.cap_pag));
    v_cap := round(v_toma,2); v_resto := round(v_resto - v_toma, 2);

    UPDATE public.prestamo_cuotas
    SET capital_pagado = COALESCE(capital_pagado,0) + v_cap,
        interes_pagado = COALESCE(interes_pagado,0) + v_int,
        mora_pagada    = COALESCE(mora_pagada,0)    + v_mora
    WHERE id = d.cuota_id;

    UPDATE public.prestamo_pago_detalle
    SET abono_capital = v_cap, abono_interes = v_int, abono_mora = v_mora
    WHERE pago_id = v_pago.id AND cuota_id = d.cuota_id;

    v_lineas := v_lineas + 1;
  END LOOP;

  IF v_resto > 0.009 THEN
    RAISE EXCEPTION 'Sobran % del monto: no cabe en las cuotas de este recibo.', v_resto;
  END IF;

  -- PRIMERO el estado, sobre TODAS las cuotas que tocó el recibo...
  UPDATE public.prestamo_cuotas c
  SET estado = CASE
        WHEN COALESCE(c.capital_pagado,0) >= COALESCE(c.capital,0) - 0.009
         AND COALESCE(c.interes_pagado,0) >= COALESCE(c.interes,0) - 0.009 THEN 'pagada'
        WHEN COALESCE(c.capital_pagado,0) + COALESCE(c.interes_pagado,0) + COALESCE(c.mora_pagada,0) > 0 THEN 'parcial'
        ELSE 'pendiente' END
  WHERE c.id = ANY(v_cuotas);

  -- ...y DESPUÉS se limpian las líneas que quedaron en cero.
  DELETE FROM public.prestamo_pago_detalle
  WHERE pago_id = v_pago.id
    AND COALESCE(abono_capital,0) + COALESCE(abono_interes,0) + COALESCE(abono_mora,0) = 0;

  UPDATE public.prestamo_pagos
  SET total_pagado = round(p_monto,2),
      balance_actual = round(COALESCE(balance_anterior,0) - p_monto, 2)
  WHERE id = v_pago.id;

  v_dig := NULLIF(regexp_replace(p_numero, '\D', '', 'g'), '')::bigint;
  UPDATE public.recibos_ingreso ri
  SET monto_pagado = round(p_monto,2),
      formas_pago = jsonb_build_array(jsonb_build_object(
        'forma', COALESCE(v_pago.forma_pago,'Efectivo'), 'monto', round(p_monto,2),
        'referencia', COALESCE(NULLIF(btrim(v_pago.cuenta_numero),''), p_numero)))
  WHERE ri.tenant_id = p_tenant
    AND COALESCE(ri.anulado,false) = false
    AND ri.cliente_id = v_pago.cliente_id
    AND NULLIF(regexp_replace(ri.numero,'\D','','g'),'')::bigint = v_dig;
  GET DIAGNOSTICS v_caja = ROW_COUNT;

  UPDATE public.movimientos_bancarios SET monto = round(p_monto,2)
  WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;

  RETURN json_build_object('numero', p_numero, 'monto_anterior', v_pago.total_pagado,
    'monto_nuevo', round(p_monto,2), 'cuotas_afectadas', v_lineas, 'recibo_caja_actualizado', v_caja);
END $$;

-- ------------------------------------------------------------
-- 3) EL CASO DE HOY
-- ------------------------------------------------------------
DO $$
DECLARE v_res json;
BEGIN
  -- Se anula el 0147828, que nunca aplicó a ninguna cuota.
  SELECT public._anular_pago_prestamo(
    '0147828', '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
    'duplicado de 0147827'
  ) INTO v_res;
  RAISE NOTICE 'Anulado: %', v_res;
END $$;

-- Y la cuota 2 de ANDY, que quedó 'parcial' sin haber pagado nada.
UPDATE public.prestamo_cuotas c
SET estado = CASE
      WHEN COALESCE(c.capital_pagado,0) >= COALESCE(c.capital,0) - 0.009
       AND COALESCE(c.interes_pagado,0) >= COALESCE(c.interes,0) - 0.009 THEN 'pagada'
      WHEN COALESCE(c.capital_pagado,0) + COALESCE(c.interes_pagado,0) + COALESCE(c.mora_pagada,0) > 0 THEN 'parcial'
      ELSE 'pendiente' END
FROM public.prestamos p
WHERE p.id = c.prestamo_id
  AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND c.estado <> CASE
      WHEN COALESCE(c.capital_pagado,0) >= COALESCE(c.capital,0) - 0.009
       AND COALESCE(c.interes_pagado,0) >= COALESCE(c.interes,0) - 0.009 THEN 'pagada'
      WHEN COALESCE(c.capital_pagado,0) + COALESCE(c.interes_pagado,0) + COALESCE(c.mora_pagada,0) > 0 THEN 'parcial'
      ELSE 'pendiente' END;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('anular_pago_prestamo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) UN SOLO RECIBO VIVO DE ANDY HOY
SELECT numero, total_pagado, anulado, comentarios
FROM public.prestamo_pagos
WHERE numero IN ('0147827','0147828');
-- esperado: 0147827 vivo con 4,000 · 0147828 anulado

-- 2) LA CAJA DEL DÍA YA NO CUENTA LOS 8,000
SELECT numero, monto_pagado, anulado
FROM public.recibos_ingreso
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND numero IN ('RI-147827','RI-147828');
-- esperado: RI-147827 vivo con 4,000 · RI-147828 anulado

-- 3) LAS CUOTAS DE ANDY, COHERENTES
SELECT c.numero_cuota, c.fecha_vencimiento, c.capital,
       c.capital_pagado, c.mora_pagada, c.estado
FROM public.prestamo_cuotas c
JOIN public.prestamos p ON p.id = c.prestamo_id
WHERE p.numero = 'PT-0026494'
ORDER BY c.numero_cuota LIMIT 4;
-- esperado: cuota 1 'parcial' con 3,515.88 + 484.12 de mora.
-- La cuota 2 debe decir 'pendiente', no 'parcial'.
