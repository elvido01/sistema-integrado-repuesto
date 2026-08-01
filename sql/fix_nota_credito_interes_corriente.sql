-- =====================================================================
-- FIX: "invalid input syntax for type uuid: IC-..." al grabar la nota
-- ---------------------------------------------------------------------
-- (2026-08-01) Al acreditar los 369.50 de >>INTERES<< a NICOLAS GUERRERO,
-- la nota de crédito NC-0000002 reventó con:
--
--   invalid input syntax for type uuid: "IC-f18a6a84-0677-49d2-ace5-..."
--
-- >>> QUÉ ES ESA FILA <<<
-- El interés corriente NO es una cuota guardada: get_prestamos_cliente lo
-- calcula al vuelo (capital pendiente x tasa x meses desde el último
-- vencimiento con interés) y lo devuelve como una fila virtual con
-- cuota_id = 'IC-<prestamo_id>'. La pantalla la muestra como >>INTERES<<
-- y manda ese id de vuelta al grabar. El RPC lo casteaba a uuid a ciegas.
--
-- Esto YA se había arreglado para el recibo de ingreso en
-- sql/fix_pago_interes_corriente.sql. La nota de crédito nació con el mismo
-- casteo y nadie la había probado contra un préstamo a interés. Se aplica el
-- mismo remedio, no uno nuevo: dos caminos distintos para lo mismo son dos
-- sitios donde volver a equivocarse.
--
-- >>> EL REMEDIO <<<
-- Al ver una fila 'IC-', el interés se MATERIALIZA como cuota real (capital
-- 0, interés = el monto que mostró la pantalla, vencimiento = la fecha de la
-- nota) y se acredita ahí. Además de dar dónde guardar el detalle, apaga el
-- cálculo: ult_int_venc pasa a ser hoy, así que el interés corriente vuelve
-- a 0 y la fila virtual desaparece sola. Si no se materializara, la nota
-- perdonaría un interés que reaparecería al recargar.
--
-- El reparto automático (cuando la pantalla no manda filas marcadas) salta
-- las virtuales, igual que el recibo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.registrar_nota_credito_prestamo(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_fecha        date DEFAULT NULL,
  p_comentarios  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL,
  p_abonos       jsonb DEFAULT NULL,   -- [{cuota_id, capital, interes, mora}]  cuota_id puede ser 'IC-<prestamo>'
  p_cargos       jsonb DEFAULT NULL    -- [{cargo_id, monto}]
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_rol      text;
  v_total    numeric := round(COALESCE(p_monto,0), 2);
  v_restante numeric;
  v_bal_ant  numeric;
  v_bal_act  numeric;
  v_nota_id  uuid;
  v_numero   text;
  v_seq      int;
  v_estado   json;
  v_asof     date := COALESCE(p_fecha, current_date);
  rec        record;
  a          jsonb;
  q          record;
  cg         record;
  ab_mora    numeric;
  ab_int     numeric;
  ab_cap     numeric;
  ab_cargo   numeric;
  v_ic_prestamo uuid;
  v_ic_monto    numeric;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto acreditado debe ser mayor que cero'; END IF;

  -- Solo roles administrativos pueden condonar deuda
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(v_rol,'') NOT IN ('admin','owner','manager','gerente') THEN
    RAISE EXCEPTION 'Solo un administrador o gerente puede grabar notas de credito';
  END IF;

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);
  IF v_total > v_bal_ant + 0.01 THEN
    RAISE EXCEPTION 'El monto acreditado (%) excede el balance pendiente (%)', v_total, v_bal_ant;
  END IF;

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_notas_credito WHERE tenant_id = v_tenant;
  v_numero := 'NC-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamo_notas_credito (
    tenant_id, numero, cliente_id, fecha, monto, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, v_asof, v_total, v_bal_ant, 0, p_comentarios
  ) RETURNING id INTO v_nota_id;

  -- ====== Abonos a cargos manuales (Otras Transacciones) ======
  IF p_cargos IS NOT NULL AND jsonb_array_length(p_cargos) > 0 THEN
    FOR a IN SELECT * FROM jsonb_array_elements(p_cargos) LOOP
      SELECT * INTO cg FROM public.prestamo_cargos
        WHERE id = (a->>'cargo_id')::uuid AND tenant_id = v_tenant
          AND COALESCE(anulado,false) = false;
      IF NOT FOUND THEN CONTINUE; END IF;
      ab_cargo := LEAST(round(COALESCE((a->>'monto')::numeric,0),2), GREATEST(cg.monto - cg.monto_pagado, 0));
      IF ab_cargo > 0 THEN
        INSERT INTO public.prestamo_nota_credito_detalle (tenant_id, nota_id, cargo_id, abono_total)
        VALUES (v_tenant, v_nota_id, cg.id, ab_cargo);
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
        -- >>INTERES<<: fila virtual. Se materializa como cuota real con el
        -- MISMO monto que mostró la pantalla y se acredita ahí. Mismo
        -- procedimiento que el recibo (fix_pago_interes_corriente.sql).
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
        INSERT INTO public.prestamo_nota_credito_detalle (tenant_id, nota_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total)
        VALUES (v_tenant, v_nota_id, q.id, ab_cap, ab_int, ab_mora, ab_cap+ab_int+ab_mora);

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
    -- ====== Reparto automatico: mora e intereses primero (mas viejo
    -- primero), el capital de ULTIMO — como la pantalla del sistema viejo ======
    -- Solo cuotas reales: las filas virtuales 'IC-' no se castean a uuid.
    v_restante := v_total;

    -- Pasada 1: mora + intereses
    FOR rec IN
      SELECT (c->>'cuota_id')::uuid AS cuota_id,
             (c->>'mora_pend')::numeric AS mora_pend,
             (c->>'interes_pend')::numeric AS interes_pend
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'
        AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'
        AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
      ORDER BY (c->>'fecha_vencimiento')::date
    LOOP
      EXIT WHEN v_restante <= 0;
      ab_mora := LEAST(v_restante, rec.mora_pend);    v_restante := round(v_restante - ab_mora, 2);
      ab_int  := LEAST(v_restante, rec.interes_pend); v_restante := round(v_restante - ab_int, 2);
      IF (ab_mora + ab_int) > 0 THEN
        INSERT INTO public.prestamo_nota_credito_detalle (tenant_id, nota_id, cuota_id, abono_interes, abono_mora, abono_total)
        VALUES (v_tenant, v_nota_id, rec.cuota_id, ab_int, ab_mora, (ab_int+ab_mora));
        UPDATE public.prestamo_cuotas q2
           SET interes_pagado = q2.interes_pagado + ab_int,
               mora_pagada    = q2.mora_pagada + ab_mora,
               estado = CASE WHEN q2.capital_pagado >= q2.capital
                              AND (q2.interes_pagado + ab_int) >= q2.interes THEN 'pagada' ELSE 'parcial' END
         WHERE q2.id = rec.cuota_id AND q2.tenant_id = v_tenant;
      END IF;
    END LOOP;

    -- Pasada 2: capital (mas viejo primero)
    FOR rec IN
      SELECT (c->>'cuota_id')::uuid AS cuota_id,
             (c->>'capital_pend')::numeric AS capital_pend
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE COALESCE(c->>'es_interes_corriente','false') <> 'true'
        AND (c->>'cuota_id') ~ '^[0-9a-fA-F-]{36}$'
        AND (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
      ORDER BY (c->>'fecha_vencimiento')::date
    LOOP
      EXIT WHEN v_restante <= 0;
      ab_cap := LEAST(v_restante, rec.capital_pend); v_restante := round(v_restante - ab_cap, 2);
      IF ab_cap > 0 THEN
        INSERT INTO public.prestamo_nota_credito_detalle (tenant_id, nota_id, cuota_id, abono_capital, abono_total)
        VALUES (v_tenant, v_nota_id, rec.cuota_id, ab_cap, ab_cap);
        UPDATE public.prestamo_cuotas q2
           SET capital_pagado = q2.capital_pagado + ab_cap,
               estado = CASE WHEN (q2.capital_pagado + ab_cap) >= q2.capital
                              AND q2.interes_pagado >= q2.interes THEN 'pagada' ELSE 'parcial' END
         WHERE q2.id = rec.cuota_id AND q2.tenant_id = v_tenant;
      END IF;
    END LOOP;
  END IF;

  -- marcar prestamos saldados (una NC puede saldar el prestamo completo)
  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_tenant AND p.cliente_id = p_cliente_id AND p.estado = 'activo'
     AND NOT EXISTS (SELECT 1 FROM public.prestamo_cuotas q3 WHERE q3.prestamo_id = p.id AND q3.estado <> 'pagada');

  -- NO se crea recibo de ingreso (no entra dinero a caja) y NO se tocan
  -- las gestiones de cobro (una NC no es un pago del cliente).

  v_bal_act := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_notas_credito SET balance_actual = v_bal_act WHERE id = v_nota_id;

  RETURN json_build_object('nota_id', v_nota_id, 'numero', v_numero, 'monto', v_total,
    'balance_anterior', v_bal_ant, 'balance_actual', v_bal_act);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.registrar_nota_credito_prestamo(uuid,numeric,date,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_nota_credito_prestamo(uuid,numeric,date,text,uuid,jsonb,jsonb) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_nota_credito_interes_corriente.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) QUE LA FUNCIÓN YA SABE DE 'IC-'
SELECT position('IC-%' in pg_get_functiondef(p.oid)) > 0 AS maneja_interes_corriente
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_nota_credito_prestamo';
-- esperado: true

-- 2) EL CASO QUE FALLÓ — NICOLAS GUERRERO, 369.50 DE INTERÉS
-- Después de grabar la nota desde la pantalla:
SELECT nc.numero, nc.fecha, nc.monto, nc.balance_anterior, nc.balance_actual,
       d.abono_capital, d.abono_interes, d.abono_mora
FROM public.prestamo_notas_credito nc
LEFT JOIN public.prestamo_nota_credito_detalle d ON d.nota_id = nc.id
WHERE nc.cliente_id = (SELECT id FROM public.clientes WHERE rnc = '028-0034536-1' LIMIT 1)
ORDER BY nc.created_at DESC LIMIT 5;
-- esperado: una NC de 369.50 con abono_interes 369.50,
-- balance_anterior 15,149.50 y balance_actual 14,780.00

-- 3) QUE EL INTERÉS NO VUELVA A APARECER
-- La cuota materializada queda con vencimiento = la fecha de la nota, así
-- que ult_int_venc pasa a ser esa fecha y el interés corriente vuelve a 0.
SELECT numero_cuota, fecha_vencimiento, capital, interes, interes_pagado, estado
FROM public.prestamo_cuotas
WHERE prestamo_id = 'f18a6a84-0677-49d2-ace5-fe8c879507f2'
ORDER BY numero_cuota DESC LIMIT 3;
-- esperado: la última con capital 0, interes 369.50, interes_pagado 369.50, 'pagada'
