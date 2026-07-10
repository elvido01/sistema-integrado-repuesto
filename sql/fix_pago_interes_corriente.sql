-- =====================================================================
-- FIX: "invalid input syntax for type uuid: 'IC-...'" al grabar recibo.
--
-- get_prestamos_cliente muestra el interés corriente como fila virtual
-- con cuota_id = 'IC-<prestamo_id>' (>>INTERES<<). La versión de
-- registrar_pago_prestamo con abonos exactos (p_abonos, la que usa la
-- pantalla Recibo de Pago) casteaba ese id a uuid sin manejarlo.
--
-- Arreglo (igual que hace la versión automática de cobro):
--  * Si el abono es a la fila IC, se MATERIALIZA el interés corriente
--    de ese préstamo como cuota real — con el MISMO monto que mostró
--    la pantalla (tomado de get_prestamos_cliente) — y el abono se
--    aplica a esa cuota.
--  * La ruta de compatibilidad (distribución automática) ahora filtra
--    las filas virtuales para no crashear con 'IC-'.
-- Base: sql/otras_transacciones_cargos.sql (versión 11 parámetros).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_fecha        date DEFAULT NULL,
  p_cobrador     text DEFAULT NULL,
  p_forma_pago   text DEFAULT 'Efectivo',
  p_cuenta       text DEFAULT NULL,
  p_banco        text DEFAULT NULL,
  p_comentarios  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL,
  p_abonos       jsonb DEFAULT NULL,   -- [{cuota_id, capital, interes, mora}]  (cuota_id puede ser 'IC-<prestamo>')
  p_cargos       jsonb DEFAULT NULL    -- [{cargo_id, monto}]  (Otras Transacciones)
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  v_asof := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

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
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid,jsonb,jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_pago_interes_corriente.sql');
  END IF;
END $$;

SELECT 'Pago con interés corriente (fila IC) arreglado' AS status;
