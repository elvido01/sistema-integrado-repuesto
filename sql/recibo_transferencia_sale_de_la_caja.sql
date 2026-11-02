-- ════════════════════════════════════════════════════════════════════
-- Recibos de préstamo: el recibo de ingreso correcto, siempre
-- (02/11/2026, MotoPréstamos: recibos 0148836 y 0148837)
-- ════════════════════════════════════════════════════════════════════
-- Cambiar un recibo de Efectivo a Transferencia metía el dinero en el banco
-- pero NO lo sacaba de la caja: el cierre lo seguía contando como efectivo.
-- La causa: el recibo de ingreso (lo que lee el cierre) se buscaba por los
-- DÍGITOS del número, y los dos contadores se separaron (0148837 <->
-- RI-148844; en el último mes 240 de 556 pagos no coinciden).
--
-- El mismo error estaba al ANULAR un pago (anulaba el recibo de ingreso de
-- OTRO día del mismo cliente, o ninguno, y la caja seguía contando dinero
-- anulado) y al CORREGIR EL MONTO (cambiaba el monto de otro recibo).
--
-- Arreglo de raíz: _recibo_ingreso_de_pago(pago) devuelve UN solo recibo de
-- ingreso, por prioridad:
--   1) mismo cliente y creado en el MISMO instante que el pago (los dos se
--      graban en la misma transacción),
--   2) mismo cliente y su referencia es el número del pago,
--   3) mismo cliente, mismos dígitos y mismo monto.
-- Lo usan editar_forma_pago_recibo, _anular_pago_prestamo y
-- _corregir_monto_recibo. Además el recibo guarda banco/cuenta/alias de la
-- cuenta elegida: el cierre de caja dice a QUÉ CUENTA fue el dinero.
--
-- Repara los dos recibos de hoy. El 0148703 del 21/10 NO se toca: su cierre
-- ya pasó (decisión del dueño 20/08: los cierres viejos se quedan).
-- Hecho sobre las versiones de producción del 02/11 (mismas firmas).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._recibo_ingreso_de_pago(p_pago_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ri.id
    FROM public.prestamo_pagos p
    JOIN public.recibos_ingreso ri
      ON ri.tenant_id = p.tenant_id
     AND ri.cliente_id = p.cliente_id
     AND COALESCE(ri.anulado, false) = false
   WHERE p.id = p_pago_id
     AND (
       ri.created_at = p.created_at
       -- Los respaldos, solo con recibos de ±1 día: nunca el de otra semana.
       OR (abs(extract(epoch FROM ri.created_at - p.created_at)) < 86400
           AND (EXISTS (SELECT 1 FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(ri.formas_pago) = 'array' THEN ri.formas_pago ELSE '[]'::jsonb END) f
                         WHERE f->>'referencia' = p.numero)
                OR (ri.monto_pagado = p.total_pagado
                    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint
                      = NULLIF(regexp_replace(p.numero, '\D', '', 'g'), '')::bigint)))
     )
   ORDER BY
     CASE WHEN ri.created_at = p.created_at THEN 1
          WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(ri.formas_pago) = 'array' THEN ri.formas_pago ELSE '[]'::jsonb END) f
                WHERE f->>'referencia' = p.numero) THEN 2
          ELSE 3 END,
     (ri.monto_pagado = p.total_pagado) DESC,
     abs(extract(epoch FROM ri.created_at - p.created_at)),
     ri.id
   LIMIT 1
$function$;

-- Solo la usan las funciones SECURITY DEFINER de abajo (corren como dueño).
REVOKE ALL ON FUNCTION public._recibo_ingreso_de_pago(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.editar_forma_pago_recibo(p_numero text, p_forma text, p_cuenta text DEFAULT NULL::text, p_banco text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_cuenta_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pago   record;
  v_cli    text;
  v_caja   int := 0;
  v_banco  text;
  v_numcta text;
  v_alias  text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_forma NOT IN ('Efectivo', 'Cheque', 'Tarjeta', 'Transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma;
  END IF;

  IF NOT public.es_usuario_admin() THEN
    IF p_password IS NULL OR NOT public.verificar_password_administrativo(p_password) THEN
      RAISE EXCEPTION 'Contraseña administrativa incorrecta';
    END IF;
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = v_tenant AND numero = p_numero AND COALESCE(anulado, false) = false
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  UPDATE public.prestamo_pagos
  SET forma_pago = p_forma, cuenta_numero = p_cuenta, banco = p_banco
  WHERE id = v_pago.id;

  -- ---- LA CAJA ----
  -- El recibo de ingreso (lo que lee el cierre), con _recibo_ingreso_de_pago:
  -- por número ya no se encuentra (0148837 <-> RI-148844).
  IF p_forma <> 'Efectivo' THEN
    IF p_cuenta_id IS NOT NULL THEN
      SELECT banco, numero_cuenta, alias INTO v_banco, v_numcta, v_alias
        FROM public.cuentas_bancarias WHERE id = p_cuenta_id;  -- puede ser de la otra empresa del grupo
    END IF;
    v_banco  := COALESCE(v_banco, NULLIF(btrim(p_banco), ''));
    v_numcta := COALESCE(v_numcta, NULLIF(btrim(p_cuenta), ''));
  END IF;

  UPDATE public.recibos_ingreso ri
  SET formas_pago = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'forma', p_forma, 'monto', v_pago.total_pagado,
        'referencia', p_numero,
        'cuenta_id', CASE WHEN p_forma = 'Efectivo' THEN NULL ELSE p_cuenta_id END,
        'banco', v_banco, 'cuenta', v_numcta, 'alias', v_alias)))
  WHERE ri.id = public._recibo_ingreso_de_pago(v_pago.id);

  GET DIAGNOSTICS v_caja = ROW_COUNT;

  -- ---- EL BANCO ----
  IF p_forma = 'Efectivo' OR p_cuenta_id IS NULL THEN
    -- Efectivo, o Cheque/Tarjeta sin cuenta: lo que había entrado al banco sale.
    DELETE FROM public.movimientos_bancarios
     WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;
  ELSIF p_cuenta_id IS NOT NULL THEN
    SELECT nombre INTO v_cli FROM public.clientes WHERE id = v_pago.cliente_id;
    PERFORM public.registrar_movimiento_bancario(
      p_cuenta_id, 'ENTRADA', v_pago.total_pagado,
      btrim('Recibo ' || p_numero || ' — ' || COALESCE(v_cli, '')),
      COALESCE(p_cuenta, p_numero),
      'recibo', v_pago.id, v_pago.fecha::date
    );
  END IF;

  RETURN json_build_object(
    'numero',      p_numero,
    'forma',       p_forma,
    'monto',       v_pago.total_pagado,
    'recibo_caja', v_caja,   -- 0 = el cierre de caja NO se entero
    'al_banco',    (p_forma <> 'Efectivo' AND p_cuenta_id IS NOT NULL)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._anular_pago_prestamo(p_numero text, p_tenant uuid, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago   record;
  d        record;
  v_cuotas uuid[] := '{}';
  v_caja   int := 0;
BEGIN
  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = p_tenant AND numero = p_numero
  -- (02/11/2026) Con números repetidos, primero el vivo y el más reciente.
  ORDER BY COALESCE(anulado, false), created_at DESC
  LIMIT 1;
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
  -- (02/11/2026) Con _recibo_ingreso_de_pago: los números ya no coinciden
  -- (0148837 <-> RI-148844) y por dígitos se anulaba el recibo de OTRO día.
  UPDATE public.recibos_ingreso ri
  SET anulado = true
  WHERE ri.id = public._recibo_ingreso_de_pago(v_pago.id);
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
END $function$;

CREATE OR REPLACE FUNCTION public._corregir_monto_recibo(p_numero text, p_monto numeric, p_tenant uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago   record;
  d        record;
  v_resto  numeric;
  v_toma   numeric;
  v_cap    numeric;
  v_int    numeric;
  v_mora   numeric;
  v_ri     uuid;
  v_caja   int := 0;
  v_lineas int := 0;
  v_cuotas uuid[] := '{}';
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto nuevo debe ser mayor que cero';
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = p_tenant AND numero = p_numero AND COALESCE(anulado, false) = false
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;
  -- (02/11/2026) El recibo de ingreso se busca ANTES de cambiar el monto:
  -- después ya no coincidiría por monto.
  v_ri := public._recibo_ingreso_de_pago(v_pago.id);

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

  -- (02/11/2026) El recibo de ingreso con _recibo_ingreso_de_pago (los
  -- números ya no coinciden). Se conservan banco/cuenta de la forma de pago,
  -- que el cierre usa para decir a qué cuenta fue el dinero.
  UPDATE public.recibos_ingreso ri
  SET monto_pagado = round(p_monto,2),
      formas_pago = jsonb_build_array(
        (CASE WHEN jsonb_typeof(ri.formas_pago) = 'array' AND jsonb_array_length(ri.formas_pago) = 1
              THEN ri.formas_pago->0 ELSE '{}'::jsonb END)
        || jsonb_build_object(
             'forma', COALESCE(v_pago.forma_pago,'Efectivo'), 'monto', round(p_monto,2),
             'referencia', p_numero))
  WHERE ri.id = v_ri;
  GET DIAGNOSTICS v_caja = ROW_COUNT;

  UPDATE public.movimientos_bancarios SET monto = round(p_monto,2)
  WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;

  RETURN json_build_object('numero', p_numero, 'monto_anterior', v_pago.total_pagado,
    'monto_nuevo', round(p_monto,2), 'cuotas_afectadas', v_lineas, 'recibo_caja_actualizado', v_caja);
END $function$;

-- ---- REPARAR LOS DOS RECIBOS DE HOY (02/11) ----
-- Mismo cambio que hace la función, con la cuenta del ÚLTIMO movimiento
-- bancario del pago (BANCO POPULAR 004110544). Solo pagos vivos, y solo si
-- el recibo sigue contando efectivo (o sin forma, que el cierre lee como efectivo).
WITH mov AS (
  SELECT DISTINCT ON (m.origen_id) m.origen_id, m.cuenta_id
    FROM public.movimientos_bancarios m
   WHERE m.origen_tipo = 'recibo'
   ORDER BY m.origen_id, m.created_at DESC
)
UPDATE public.recibos_ingreso ri
   SET formas_pago = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
         'forma', p.forma_pago, 'monto', p.total_pagado, 'referencia', p.numero,
         'cuenta_id', mov.cuenta_id, 'banco', c.banco, 'cuenta', c.numero_cuenta, 'alias', c.alias)))
  FROM public.prestamo_pagos p
  JOIN mov ON mov.origen_id = p.id
  JOIN public.cuentas_bancarias c ON c.id = mov.cuenta_id
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND p.numero IN ('0148836', '0148837')
   AND COALESCE(p.anulado, false) = false
   AND p.forma_pago = 'Transferencia'
   AND ri.id = public._recibo_ingreso_de_pago(p.id)
   AND COALESCE(ri.formas_pago->0->>'forma', 'Efectivo') = 'Efectivo';

SELECT public.registrar_migracion('recibo_transferencia_sale_de_la_caja.sql');

-- ===== VERIFICACION: deben salir los dos como Transferencia con su banco =====
SELECT p.numero AS pago, ri.numero AS recibo_ingreso, ri.monto_pagado,
       ri.formas_pago->0->>'forma' AS forma, ri.formas_pago->0->>'banco' AS banco,
       ri.formas_pago->0->>'alias' AS cuenta
  FROM public.prestamo_pagos p
  JOIN public.recibos_ingreso ri ON ri.id = public._recibo_ingreso_de_pago(p.id)
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND p.numero IN ('0148836', '0148837');
