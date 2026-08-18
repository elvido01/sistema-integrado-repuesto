-- La regla de "primero el interes" se aplica POR PRESTAMO, no por cliente.
--
-- >>> EL CASO <<<
-- (2026-08-18) ANDRES CARPIO fue a pagar 700 pesos de su PT-0026583 -- dos
-- cuotas de 350 de un financiamiento diario -- y el sistema lo rechazo:
--
--     "No se puede abonar al capital: quedan 124.51 de interes corriente
--      y 0.00 de mora sin cobrar. Cobrelos primero."
--
-- Ese 124.51 no era del prestamo que estaba pagando. Era del PT-0026375,
-- el OTRO prestamo del mismo cliente: 12,624.07 de capital al 5%, seis dias
-- corridos desde el 12/08.  12,624.07 x 5% x 6 / 30.4167 = 124.51, al centavo.
--
-- >>> POR QUE PASO <<<
-- Los pagos en este sistema son por CLIENTE, no por prestamo: un recibo se
-- puede repartir entre varias deudas. La validacion que puse ayer heredo esa
-- forma y sumo todo junto -- el interes corriente de los dos prestamos contra
-- los abonos de los dos -- asi que el interes de uno bloqueaba el capital del
-- otro.
--
-- Es el mismo error de concepto de ayer, en otra dimension: aquella vez
-- mezcle el interes de la tabla de amortizacion con el que se evapora; esta
-- vez mezcle dos prestamos distintos. La regla del dueno siempre fue sobre
-- UNA deuda: no se le abona al capital de un prestamo si ESE prestamo tiene
-- interes o mora pendiente.
--
-- >>> QUE CAMBIA <<<
-- Solo el bloque de validacion. Todo lo demas de registrar_pago_prestamo
-- queda igual: este archivo se genero a partir de la definicion VIVA en
-- produccion, sin re-transcribir a mano el codigo que mueve dinero.
--
--   1. Se agrupan los abonos por prestamo (resolviendo cuota_id -> prestamo,
--      y el 'IC-<uuid>' de la fila virtual de interes corriente).
--   2. Se agrupa lo pendiente por prestamo: interes corriente y mora.
--   3. Se bloquea solo el prestamo que recibe capital sin cubrir LO SUYO.
--   4. El mensaje dice cual prestamo es.
--
-- Lo que sigue protegido: TEODORA y DANNY, que fue de donde salio la regla.
-- A un prestamo con mora o interes corriente pendiente se le sigue negando
-- el abono a capital -- pero solo a ESE.

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
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  v_asof := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);

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

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_pagos WHERE tenant_id = v_tenant;
  v_numero := lpad(v_seq::text, 7, '0');

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
      IF NOT FOUND THEN CONTINUE; END IF;
      ab_cargo := LEAST(round(COALESCE((a->>'monto')::numeric,0),2), GREATEST(cg.monto - cg.monto_pagado, 0));
      IF ab_cargo > 0 THEN
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
        IF NOT FOUND THEN CONTINUE; END IF;
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
$function$
;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
WITH f AS (
  SELECT string_agg(pg_get_functiondef(p.oid), chr(10)) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'registrar_pago_prestamo'
)
SELECT
  CASE WHEN position('LA REGLA ES POR PRESTAMO' in def) > 0
       THEN 'OK  la regla nueva esta puesta'
       ELSE '*** FALLO *** no se aplico' END           AS regla_por_prestamo,
  CASE WHEN position('EN ESE prestamo' in def) > 0
       THEN 'OK  el mensaje dice cual prestamo'
       ELSE '*** FALLO *** mensaje viejo' END          AS mensaje,
  CASE WHEN position('mora_pendiente' in def) = 0
       THEN 'OK  ya no usa la mora total del cliente'
       ELSE '*** FALLO *** quedo la suma vieja' END    AS sin_suma_de_cliente
FROM f;

-- El caso de ANDRES CARPIO, con numeros. El PT-0026583 no genera interes
-- corriente (ninguna cuota suya tiene interes), asi que su capital se puede
-- abonar; el PT-0026375 si lo genera y sigue protegido.
SELECT p.numero,
       sum(greatest(q.capital - q.capital_pagado, 0))        AS capital_pend,
       sum(q.interes)                                        AS interes_del_plan,
       max(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) AS ancla_interes,
       CASE WHEN max(q.fecha_vencimiento) FILTER (WHERE q.interes > 0) IS NULL
            THEN 'sin interes corriente: su capital se abona libre'
            ELSE 'genera interes corriente: primero se cobra ese' END AS veredicto
FROM public.prestamos p
JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id
WHERE p.numero IN ('PT-0026583','PT-0026375')
GROUP BY p.numero
ORDER BY p.numero;

SELECT public.registrar_migracion('regla_interes_por_prestamo.sql');
