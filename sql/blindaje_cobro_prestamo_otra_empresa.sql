-- ============================================================
-- BLINDAJE: UN PRÉSTAMO SOLO SE COBRA EN SU EMPRESA (25/11/2026)
-- ============================================================
-- Pasó dos veces (28/09 Yerlin 8,000 en Caminero; 25/11 Yerlin 3,650 en
-- MotoPréstamos, préstamo de Inversiones Los Naranjos): con otra empresa
-- activa, registrar_pago_prestamo se saltaba EN SILENCIO las cuotas/cargos
-- que no eran de la empresa activa (IF NOT FOUND THEN CONTINUE) y grababa
-- igual el pago y el recibo de caja: balance 0 → 0, "Cliente Genérico", y la
-- caja de la empresa equivocada inflada. Decisión del dueño 25/11: blindar.
--
--  · Préstamo, cuota, cargo o interés corriente de otra empresa → error con
--    el nombre de la empresa dueña ("cambia a esa empresa para cobrarlo").
--  · Si al final no se aplicó NADA (ni líneas de cuota ni cargos) → error y
--    no se graba nada. Los pagos de solo cargos (pago adicional, gasto de
--    cobrador) siguen pasando: aplican cargos.
--  · Las dos versiones (con abonos/cargos, la de la pantalla; y la vieja de
--    9 argumentos). Base: las de producción del 25/11 (mismas firmas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(p_cliente_id uuid, p_monto numeric, p_fecha date DEFAULT NULL::date, p_cobrador text DEFAULT NULL::text, p_forma_pago text DEFAULT 'Efectivo'::text, p_cuenta text DEFAULT NULL::text, p_banco text DEFAULT NULL::text, p_comentarios text DEFAULT NULL::text, p_prestamo_id uuid DEFAULT NULL::uuid, p_abonos jsonb DEFAULT NULL::jsonb, p_cargos jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_asof     date;
  v_restante numeric;
  v_total    numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant  numeric;
  v_bal_act  numeric;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  v_estado   json;
  rec        record;
  a          jsonb;
  q          record;
  ab_mora    numeric;
  ab_int     numeric;
  ab_cap     numeric;
  cg         record;
  ab_cargo   numeric;
  v_ic_prestamo uuid;
  v_ic_monto    numeric;
  -- para la regla: cuanto se abona de cada cosa y cuanto queda pendiente
  v_ab_cap   numeric;
  v_ab_int   numeric;
  v_ab_mora  numeric;
  v_int_pend numeric;
  v_mor_pend numeric;
  v_falta_int  numeric;
  v_falta_mora numeric;
  v_bloq_numero text;
  v_otra     text;
  v_aplicado int := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  v_asof := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);

  -- (25/11/2026) BLINDAJE: un préstamo se cobra en SU empresa.
  IF p_prestamo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = p_prestamo_id AND tenant_id = v_tenant) THEN
    SELECT t.nombre INTO v_otra FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id WHERE p.id = p_prestamo_id;
    RAISE EXCEPTION 'Este préstamo es de %: cambia a esa empresa para cobrarlo.', COALESCE(v_otra, 'otra empresa');
  END IF;

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  -- ===================================================================
  -- REGLA: primero la mora y el interes, despues el capital
  -- ---------------------------------------------------------------
  -- Se valida ANTES de grabar nada. El camino de distribucion automatica
  -- no necesita este control: el ya reparte en ese orden.
  -- ===================================================================
  IF p_abonos IS NOT NULL AND jsonb_array_length(p_abonos) > 0 THEN
    -- >>> LA REGLA ES POR PRESTAMO, NO POR CLIENTE <<<
    -- (2026-08-18) ANDRES CARPIO no pudo pagar 700 de su PT-0026583. El
    -- sistema le exigia cobrar antes 124.51 de interes corriente... que eran
    -- de OTRO prestamo suyo, el PT-0026375 (12,624.07 al 5%, seis dias desde
    -- el 12/08). Los pagos son POR CLIENTE, y esta validacion heredo esa
    -- forma: sumaba los dos prestamos en un solo monton, asi que el interes
    -- de uno bloqueaba el capital del otro.
    --
    -- El interes de un prestamo no tiene nada que ver con el capital de otro.
    -- Se valida prestamo por prestamo: el que recibe abono a capital tiene
    -- que llevar cubiertos SU interes corriente y SU mora.
    --
    -- Y el mensaje dice CUAL prestamo. Con dos en la misma pantalla, leer
    -- "quedan 124.51" sin saber de cual no le sirve a nadie en la caja.
    WITH ab AS (
      SELECT
        CASE WHEN (x->>'cuota_id') LIKE 'IC-%'
             THEN substring(x->>'cuota_id' from 4)::uuid
             -- id::text a proposito: comparar sin castear evita que un
             -- cuota_id que no sea uuid reviente la validacion entera.
             ELSE (SELECT q4.prestamo_id FROM public.prestamo_cuotas q4
                    WHERE q4.tenant_id = v_tenant AND q4.id::text = (x->>'cuota_id'))
        END AS prestamo_id,
        round(COALESCE((x->>'capital')::numeric, 0), 2) AS cap,
        round(COALESCE((x->>'interes')::numeric, 0), 2) AS abo_int,
        round(COALESCE((x->>'mora')::numeric,    0), 2) AS abo_mora
      FROM jsonb_array_elements(p_abonos) x
    ),
    ab_p AS (
      SELECT prestamo_id, SUM(cap) AS cap, SUM(abo_int) AS abo_int, SUM(abo_mora) AS abo_mora
      FROM ab WHERE prestamo_id IS NOT NULL GROUP BY prestamo_id
    ),
    pend_p AS (
      -- Lo que se evapora, por prestamo: el interes corriente (las filas
      -- >>INTERES<<) y la mora. El interes de la tabla de amortizacion NO
      -- entra: ese esta guardado y no desaparece al bajar el capital.
      SELECT (c->>'prestamo_id')::uuid AS prestamo_id,
             MAX(c->>'prestamo_numero') AS numero,
             SUM(CASE WHEN COALESCE(c->>'es_interes_corriente','false') = 'true'
                      THEN COALESCE((c->>'interes_pend')::numeric, 0) ELSE 0 END) AS int_corr,
             SUM(COALESCE((c->>'mora_pend')::numeric, 0)) AS mora
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE (c->>'prestamo_id') IS NOT NULL
      GROUP BY (c->>'prestamo_id')::uuid
    )
    SELECT COALESCE(pp.numero, 'ese prestamo'),
           round(COALESCE(pp.int_corr, 0) - a.abo_int,  2),
           round(COALESCE(pp.mora,     0) - a.abo_mora, 2)
      INTO v_bloq_numero, v_falta_int, v_falta_mora
    FROM ab_p a
    LEFT JOIN pend_p pp ON pp.prestamo_id = a.prestamo_id
    WHERE a.cap > 0
      AND (round(COALESCE(pp.int_corr, 0) - a.abo_int,  2) > 0.01
        OR round(COALESCE(pp.mora,     0) - a.abo_mora, 2) > 0.01)
    ORDER BY 2 DESC, 3 DESC
    LIMIT 1;

    IF v_bloq_numero IS NOT NULL THEN
      RAISE EXCEPTION
        'No se puede abonar al capital del %: quedan % de interes corriente y % de mora sin cobrar EN ESE prestamo. Cobrelos primero.',
        v_bloq_numero,
        to_char(GREATEST(v_falta_int,  0), 'FM999,999,990.00'),
        to_char(GREATEST(v_falta_mora, 0), 'FM999,999,990.00');
    END IF;
  END IF;

  -- (02/11/2026) Un solo contador para el pago y su recibo de ingreso: el
  -- número sigue al MAYOR de los dos, así el recibo RI-<número del pago>
  -- nunca repite uno que ya existe (antes: 0148837 <-> RI-148844).
  v_numero := public._siguiente_numero_pago(v_tenant);

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, v_asof, p_cobrador,
    COALESCE(p_forma_pago,'Efectivo'), p_cuenta, p_banco, v_total, v_bal_ant, 0, p_comentarios
  ) RETURNING id INTO v_pago_id;

  -- ====== Abonos a cargos manuales (Otras Transacciones) ======
  IF p_cargos IS NOT NULL AND jsonb_array_length(p_cargos) > 0 THEN
    FOR a IN SELECT * FROM jsonb_array_elements(p_cargos) LOOP
      SELECT * INTO cg FROM public.prestamo_cargos
        WHERE id = (a->>'cargo_id')::uuid AND tenant_id = v_tenant
          AND COALESCE(anulado,false) = false;
      IF NOT FOUND THEN
        SELECT t.nombre INTO v_otra FROM public.prestamo_cargos c JOIN public.tenants t ON t.id = c.tenant_id
         WHERE c.id::text = (a->>'cargo_id') AND c.tenant_id <> v_tenant;
        IF v_otra IS NOT NULL THEN RAISE EXCEPTION 'Este cargo es de %: cambia a esa empresa para cobrarlo.', v_otra; END IF;
        CONTINUE;
      END IF;
      ab_cargo := LEAST(round(COALESCE((a->>'monto')::numeric,0),2), GREATEST(cg.monto - cg.monto_pagado, 0));
      IF ab_cargo > 0 THEN
        v_aplicado := v_aplicado + 1;
        UPDATE public.prestamo_cargos
           SET monto_pagado = monto_pagado + ab_cargo,
               estado = CASE WHEN (monto_pagado + ab_cargo) >= monto THEN 'pagado' ELSE 'parcial' END
         WHERE id = cg.id AND tenant_id = v_tenant;
      END IF;
    END LOOP;
  END IF;

  IF p_abonos IS NOT NULL AND jsonb_array_length(p_abonos) > 0 THEN
    -- ====== Abonos exactos por cuota (marcados/editados en cada fila) ======
    FOR a IN SELECT * FROM jsonb_array_elements(p_abonos) LOOP

      IF (a->>'cuota_id') LIKE 'IC-%' THEN
        -- Interés corriente (fila virtual >>INTERES<<): materializarlo como
        -- cuota real con el MISMO monto que mostró la pantalla y abonar ahí.
        v_ic_prestamo := substring(a->>'cuota_id' from 4)::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = v_ic_prestamo AND tenant_id = v_tenant) THEN
          SELECT t.nombre INTO v_otra FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id WHERE p.id = v_ic_prestamo;
          RAISE EXCEPTION 'Este préstamo es de %: cambia a esa empresa para cobrarlo.', COALESCE(v_otra, 'otra empresa');
        END IF;
        SELECT (c->>'interes_pend')::numeric INTO v_ic_monto
          FROM json_array_elements(v_estado->'cuotas') c
         WHERE (c->>'cuota_id') = (a->>'cuota_id');
        IF v_ic_monto IS NULL OR v_ic_monto <= 0 THEN CONTINUE; END IF;

        INSERT INTO public.prestamo_cuotas
          (tenant_id, prestamo_id, numero_cuota, fecha_vencimiento,
           capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado)
        VALUES (
          v_tenant, v_ic_prestamo,
          COALESCE((SELECT MAX(q3.numero_cuota) FROM public.prestamo_cuotas q3
                     WHERE q3.prestamo_id = v_ic_prestamo), 0) + 1,
          v_asof, 0, v_ic_monto, v_ic_monto, 0, 0, 0, 'pendiente')
        RETURNING * INTO q;
      ELSE
        SELECT * INTO q FROM public.prestamo_cuotas
          WHERE id = (a->>'cuota_id')::uuid AND tenant_id = v_tenant;
        IF NOT FOUND THEN
          SELECT t.nombre INTO v_otra FROM public.prestamo_cuotas c JOIN public.tenants t ON t.id = c.tenant_id
           WHERE c.id::text = (a->>'cuota_id') AND c.tenant_id <> v_tenant;
          IF v_otra IS NOT NULL THEN RAISE EXCEPTION 'Esta cuota es de un préstamo de %: cambia a esa empresa para cobrarlo.', v_otra; END IF;
          CONTINUE;
        END IF;
      END IF;

      ab_cap  := LEAST(round(COALESCE((a->>'capital')::numeric,0),2), GREATEST(q.capital - q.capital_pagado, 0));
      ab_int  := LEAST(round(COALESCE((a->>'interes')::numeric,0),2), GREATEST(q.interes - q.interes_pagado, 0));
      ab_mora := GREATEST(round(COALESCE((a->>'mora')::numeric,0),2), 0);

      IF (ab_cap + ab_int + ab_mora) > 0 THEN
        INSERT INTO public.prestamo_pago_detalle (tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total)
        VALUES (v_tenant, v_pago_id, q.id, ab_cap, ab_int, ab_mora, ab_cap+ab_int+ab_mora);

        UPDATE public.prestamo_cuotas
           SET capital_pagado = capital_pagado + ab_cap,
               interes_pagado = interes_pagado + ab_int,
               mora_pagada    = mora_pagada + ab_mora,
               estado = CASE WHEN (capital_pagado + ab_cap) >= capital
                              AND (interes_pagado + ab_int) >= interes THEN 'pagada' ELSE 'parcial' END
         WHERE id = q.id AND tenant_id = v_tenant;
      END IF;
    END LOOP;
  ELSIF p_cargos IS NULL OR jsonb_array_length(p_cargos) = 0 THEN
    -- ====== Compatibilidad: distribuir p_monto (cuota mas vieja primero) ======
    -- (solo cuotas reales; las filas virtuales 'IC-' no se castean a uuid)
    -- Este camino YA respeta la regla: mora, luego interes, luego capital.
    v_restante := v_total;
    FOR rec IN
      SELECT (c->>'cuota_id')::uuid AS cuota_id,
             (c->>'mora_pend')::numeric AS mora_pend,
             (c->>'interes_pend')::numeric AS interes_pend,
             (c->>'capital_pend')::numeric AS capital_pend
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'
        AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'
        AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
      ORDER BY (c->>'fecha_vencimiento')::date
    LOOP
      EXIT WHEN v_restante <= 0;
      ab_mora := LEAST(v_restante, rec.mora_pend);    v_restante := round(v_restante - ab_mora, 2);
      ab_int  := LEAST(v_restante, rec.interes_pend); v_restante := round(v_restante - ab_int, 2);
      ab_cap  := LEAST(v_restante, rec.capital_pend); v_restante := round(v_restante - ab_cap, 2);
      IF (ab_mora + ab_int + ab_cap) > 0 THEN
        INSERT INTO public.prestamo_pago_detalle (tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total)
        VALUES (v_tenant, v_pago_id, rec.cuota_id, ab_cap, ab_int, ab_mora, (ab_cap+ab_int+ab_mora));
        UPDATE public.prestamo_cuotas q2
           SET capital_pagado = q2.capital_pagado + ab_cap,
               interes_pagado = q2.interes_pagado + ab_int,
               mora_pagada    = q2.mora_pagada + ab_mora,
               estado = CASE WHEN (q2.capital_pagado + ab_cap) >= q2.capital
                              AND (q2.interes_pagado + ab_int) >= q2.interes THEN 'pagada' ELSE 'parcial' END
         WHERE q2.id = rec.cuota_id AND q2.tenant_id = v_tenant;
      END IF;
    END LOOP;
  END IF;

  -- marcar prestamos saldados
  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_tenant AND p.cliente_id = p_cliente_id AND p.estado = 'activo'
     AND NOT EXISTS (SELECT 1 FROM public.prestamo_cuotas q3 WHERE q3.prestamo_id = p.id AND q3.estado <> 'pagada');

  -- Un pago aceptado por la empresa libera automaticamente el estado SE BUSCA.
  UPDATE public.cobro_gestiones
     SET estado = 'cerrada',
         resultado = 'pago_recibido',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cerrado_por_pago', true,
           'pago_id', v_pago_id,
           'pago_numero', v_numero,
           'monto_pagado', v_total
         )
   WHERE tenant_id = v_tenant
     AND cliente_id = p_cliente_id
     AND tipo = 'mandado_buscar'
     AND estado = 'mandado_buscar';

  -- contabilidad: Recibo de Ingreso (caja / transacciones / dashboard)

  -- (25/11/2026) BLINDAJE: si no se aplicó nada (ni cuotas ni cargos) no hay
  -- cobro. Pasó dos veces (28/09 y 25/11): con otra empresa activa la función
  -- se saltaba las cuotas ajenas y grababa igual el pago y el recibo de caja
  -- (balance 0 → 0, "Cliente Genérico"). El RAISE deshace todo lo grabado.
  IF v_aplicado = 0 AND NOT EXISTS (SELECT 1 FROM public.prestamo_pago_detalle WHERE pago_id = v_pago_id) THEN
    SELECT string_agg(DISTINCT t.nombre, ', ') INTO v_otra
      FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id
     WHERE p.cliente_id = p_cliente_id AND p.tenant_id <> v_tenant AND p.estado = 'activo';
    IF v_otra IS NOT NULL THEN
      RAISE EXCEPTION 'Los préstamos de este cliente son de %: cambia a esa empresa para cobrarlo. No se grabó nada.', v_otra;
    END IF;
    RAISE EXCEPTION 'Este cobro no se aplicó a ninguna cuota ni cargo de esta empresa. No se grabó nada.';
  END IF;

  INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id)
  VALUES (
    v_tenant, public.get_next_recibo_ingreso_numero(), p_cliente_id, v_asof, v_total,
    'Pago de prestamo (financiera)',
    jsonb_build_array(jsonb_build_object('forma', COALESCE(p_forma_pago,'Efectivo'), 'monto', v_total,
      'referencia', COALESCE(NULLIF(btrim(p_cuenta),''), v_numero))),
    auth.uid()
  );

  v_bal_act := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_pagos SET balance_actual = v_bal_act WHERE id = v_pago_id;

  RETURN json_build_object('pago_id', v_pago_id, 'numero', v_numero, 'total_pagado', v_total,
    'balance_anterior', v_bal_ant, 'balance_actual', v_bal_act);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(p_cliente_id uuid, p_monto numeric, p_fecha date DEFAULT NULL::date, p_cobrador text DEFAULT NULL::text, p_forma_pago text DEFAULT 'Efectivo'::text, p_cuenta text DEFAULT NULL::text, p_banco text DEFAULT NULL::text, p_comentarios text DEFAULT NULL::text, p_prestamo_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_otra     text;
  v_asof     date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_restante numeric := round(COALESCE(p_monto,0), 2);
  v_total    numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant  numeric;
  v_bal_act  numeric;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  v_estado   json;
  rec        record;
  ab_mora    numeric;
  ab_int     numeric;
  ab_cap     numeric;
BEGIN
  -- (25/11/2026) BLINDAJE: un préstamo se cobra en SU empresa.
  IF p_prestamo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = p_prestamo_id AND tenant_id = v_tenant) THEN
    SELECT t.nombre INTO v_otra FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id WHERE p.id = p_prestamo_id;
    RAISE EXCEPTION 'Este préstamo es de %: cambia a esa empresa para cobrarlo.', COALESCE(v_otra, 'otra empresa');
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  -- Materializar el interés corriente del período como cuota real.
  INSERT INTO public.prestamo_cuotas
    (tenant_id, prestamo_id, numero_cuota, fecha_vencimiento,
     capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado)
  SELECT
    v_tenant, t.prestamo_id,
    COALESCE((SELECT MAX(numero_cuota) FROM public.prestamo_cuotas q3 WHERE q3.prestamo_id = t.prestamo_id), 0) + 1,
    v_asof, 0, t.int_corr, t.int_corr, 0, 0, 0, 'pendiente'
  FROM (
    SELECT
      g.prestamo_id,
      public.interes_corriente(g.cap_base, g.tasa, g.ult_int_venc, v_asof, 365, v_tenant) AS int_corr
    FROM (
      SELECT
        p.id AS prestamo_id,
        SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
        MAX(p.tasa_interes) AS tasa,
        MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ult_int_venc,
        (date_part('year',  age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))) * 12
         + date_part('month', age(v_asof, MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0))))::int AS n_meses
      FROM public.prestamos p
      JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
      WHERE p.tenant_id = v_tenant
        AND p.cliente_id = p_cliente_id
        AND p.estado = 'activo'
        AND (p_prestamo_id IS NULL OR p.id = p_prestamo_id)
      GROUP BY p.id
    ) g
    WHERE g.ult_int_venc IS NOT NULL
      AND g.cap_base > 0
      AND g.ult_int_venc < v_asof
  ) t
  WHERE t.int_corr > 0;

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  -- (02/11/2026) Un solo contador para el pago y su recibo de ingreso: el
  -- número sigue al MAYOR de los dos, así el recibo RI-<número del pago>
  -- nunca repite uno que ya existe (antes: 0148837 <-> RI-148844).
  v_numero := public._siguiente_numero_pago(v_tenant);

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, v_asof, p_cobrador,
    COALESCE(p_forma_pago,'Efectivo'), p_cuenta, p_banco, v_total, v_bal_ant, 0, p_comentarios
  ) RETURNING id INTO v_pago_id;

  FOR rec IN
    SELECT (c->>'cuota_id')::uuid AS cuota_id,
           (c->>'mora_pend')::numeric AS mora_pend,
           (c->>'interes_pend')::numeric AS interes_pend,
           (c->>'capital_pend')::numeric AS capital_pend
    FROM json_array_elements(v_estado->'cuotas') c
    WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'
      AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'
      AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
    ORDER BY (c->>'fecha_vencimiento')::date
  LOOP
    EXIT WHEN v_restante <= 0;

    ab_mora := LEAST(v_restante, rec.mora_pend);
    v_restante := round(v_restante - ab_mora, 2);
    ab_int := LEAST(v_restante, rec.interes_pend);
    v_restante := round(v_restante - ab_int, 2);
    ab_cap := LEAST(v_restante, rec.capital_pend);
    v_restante := round(v_restante - ab_cap, 2);

    IF (ab_mora + ab_int + ab_cap) > 0 THEN
      INSERT INTO public.prestamo_pago_detalle (
        tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total
      ) VALUES (
        v_tenant, v_pago_id, rec.cuota_id, ab_cap, ab_int, ab_mora, (ab_cap+ab_int+ab_mora)
      );

      UPDATE public.prestamo_cuotas q
         SET capital_pagado = q.capital_pagado + ab_cap,
             interes_pagado = q.interes_pagado + ab_int,
             mora_pagada    = q.mora_pagada + ab_mora,
             estado = CASE
                        WHEN (q.capital_pagado + ab_cap) >= q.capital
                         AND (q.interes_pagado + ab_int) >= q.interes THEN 'pagada'
                        ELSE 'parcial'
                      END
       WHERE q.id = rec.cuota_id AND q.tenant_id = v_tenant;
    END IF;
  END LOOP;

  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_tenant
     AND p.cliente_id = p_cliente_id
     AND p.estado = 'activo'
     AND NOT EXISTS (
       SELECT 1 FROM public.prestamo_cuotas q
       WHERE q.prestamo_id = p.id AND COALESCE(q.estado, 'pendiente') <> 'pagada'
     );

  -- Un pago aceptado por la empresa libera automaticamente el estado SE BUSCA.
  UPDATE public.cobro_gestiones
     SET estado = 'cerrada',
         resultado = 'pago_recibido',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cerrado_por_pago', true,
           'pago_id', v_pago_id,
           'pago_numero', v_numero,
           'monto_pagado', v_total
         )
   WHERE tenant_id = v_tenant
     AND cliente_id = p_cliente_id
     AND tipo = 'mandado_buscar'
     AND estado = 'mandado_buscar';


  -- (25/11/2026) BLINDAJE: si no se aplicó nada (ni cuotas ni cargos) no hay
  -- cobro. Pasó dos veces (28/09 y 25/11): con otra empresa activa la función
  -- se saltaba las cuotas ajenas y grababa igual el pago y el recibo de caja
  -- (balance 0 → 0, "Cliente Genérico"). El RAISE deshace todo lo grabado.
  IF NOT EXISTS (SELECT 1 FROM public.prestamo_pago_detalle WHERE pago_id = v_pago_id) THEN
    SELECT string_agg(DISTINCT t.nombre, ', ') INTO v_otra
      FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id
     WHERE p.cliente_id = p_cliente_id AND p.tenant_id <> v_tenant AND p.estado = 'activo';
    IF v_otra IS NOT NULL THEN
      RAISE EXCEPTION 'Los préstamos de este cliente son de %: cambia a esa empresa para cobrarlo. No se grabó nada.', v_otra;
    END IF;
    RAISE EXCEPTION 'Este cobro no se aplicó a ninguna cuota ni cargo de esta empresa. No se grabó nada.';
  END IF;

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id
  ) VALUES (
    v_tenant,
    public.get_next_recibo_ingreso_numero(),
    p_cliente_id,
    v_asof,
    v_total,
    'Pago de prestamo (financiera)',
    jsonb_build_array(jsonb_build_object(
      'forma', COALESCE(p_forma_pago, 'Efectivo'),
      'monto', v_total,
      'referencia', COALESCE(NULLIF(btrim(p_cuenta), ''), v_numero)
    )),
    auth.uid()
  );

  v_bal_act := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_pagos SET balance_actual = v_bal_act WHERE id = v_pago_id;

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'total_pagado', v_total,
    'sobrante', GREATEST(v_restante, 0),
    'balance_anterior', v_bal_ant,
    'balance_actual', v_bal_act
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $prueba$
DECLARE r json; v_ok boolean;
BEGIN
  -- Yerlin, con MotoPréstamos activa (como el 25/11)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '8eafc96c-48ee-48b2-9b42-35d8715d0967', 'role', 'authenticated')::text, true);
  IF public.get_user_tenant() <> '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' THEN RAISE EXCEPTION 'Yerlin no está en MotoPréstamos'; END IF;

  -- 1) Cobro automático a Pabel (su préstamo es de Los Naranjos): no
  BEGIN
    PERFORM public.registrar_pago_prestamo('2f3239d6-ef2c-4939-9d07-5434490849d9'::uuid, 3650::numeric, NULL::date, NULL, 'Efectivo', NULL, NULL, 'PRUEBA', NULL::uuid, NULL::jsonb, NULL::jsonb);
    RAISE EXCEPTION 'COBRÓ EN LA EMPRESA EQUIVOCADA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Los préstamos de este cliente son de INVERSIONES LOS NARANJOS%' THEN RAISE EXCEPTION 'Caso 1: %', SQLERRM; END IF;
  END;

  -- 2) Mandando la cuota de Los Naranjos: no
  BEGIN
    PERFORM public.registrar_pago_prestamo('2f3239d6-ef2c-4939-9d07-5434490849d9'::uuid, 100::numeric, NULL::date, NULL, 'Efectivo', NULL, NULL, 'PRUEBA', NULL::uuid,
      '[{"cuota_id":"4d53939a-405e-48ff-b45f-ff53d7f8ec96","capital":100,"interes":0,"mora":0}]'::jsonb, NULL::jsonb);
    RAISE EXCEPTION 'ACEPTÓ CUOTA AJENA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%INVERSIONES LOS NARANJOS%' THEN RAISE EXCEPTION 'Caso 2: %', SQLERRM; END IF;
  END;

  -- 3) Con el préstamo de otra empresa elegido: no
  BEGIN
    PERFORM public.registrar_pago_prestamo('2f3239d6-ef2c-4939-9d07-5434490849d9'::uuid, 100::numeric, NULL::date, NULL, 'Efectivo', NULL, NULL, 'PRUEBA', 'a332c992-e4fc-400a-984c-bbda677a2dd4'::uuid, NULL::jsonb, NULL::jsonb);
    RAISE EXCEPTION 'ACEPTÓ PRÉSTAMO AJENO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Este préstamo es de INVERSIONES LOS NARANJOS%' THEN RAISE EXCEPTION 'Caso 3: %', SQLERRM; END IF;
  END;

  -- 4) La versión vieja de 9 argumentos no se puede llamar (choca con la de 11, que tiene
  --    valores por omisión): queda blindada igual, pero no hay cómo probarla.

  -- 5) Un cobro normal de un cliente de MotoPréstamos sigue pasando
  r := public.registrar_pago_prestamo('eae25793-1475-4eb3-9671-537a1ff96c77'::uuid, 1::numeric, NULL::date, NULL, 'Efectivo', NULL, NULL, 'PRUEBA', NULL::uuid, NULL::jsonb, NULL::jsonb);
  IF r->>'numero' IS NULL THEN RAISE EXCEPTION 'El cobro normal no pasó: %', r; END IF;
  SELECT EXISTS (SELECT 1 FROM public.prestamo_pago_detalle WHERE pago_id = (r->>'pago_id')::uuid) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'El cobro normal no aplicó cuotas'; END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('blindaje_cobro_prestamo_otra_empresa.sql');
