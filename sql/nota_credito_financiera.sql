-- =====================================================================
-- NOTA DE CREDITO (modulo financiera)
-- ---------------------------------------------------------------------
-- Replica la pantalla "Nota de Credito" del sistema viejo (CPF): un
-- descuento/condonacion que baja el balance del cliente SIN que entre
-- dinero a caja. El monto acreditado se reparte entre las lineas
-- pendientes (mora e intereses primero, capital de ultimo) o se marca
-- a mano por fila, igual que el Recibo de Pago.
--
-- Decisiones (usuario 2026-07-04):
--   - Solo descuento: NO genera recibo de ingreso ni toca la caja.
--   - Reparto automatico: mora/intereses primero, capital de ultimo.
--   - Solo admin/gerente pueden grabarla (condona deuda).
--   - NO cuenta como "pago": no toca cobro_gestiones ni el ultimo pago.
--
-- Este archivo:
--   1. Tablas prestamo_notas_credito + prestamo_nota_credito_detalle
--      (+ RLS, grants) — separadas de prestamo_pagos para que las
--      metricas de cobros/ultimo pago no las cuenten.
--   2. registrar_nota_credito_prestamo(...) -> aplica los abonos a las
--      cuotas/cargos (mismas columnas *_pagado que un pago) y devuelve
--      numero NC- y balances.
-- Re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

-- 1) TABLAS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prestamo_notas_credito (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  numero           text NOT NULL,                     -- NC-0000001
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id),
  fecha            date NOT NULL DEFAULT current_date,
  monto            numeric(14,2) NOT NULL DEFAULT 0,  -- total acreditado
  balance_anterior numeric(14,2) NOT NULL DEFAULT 0,
  balance_actual   numeric(14,2) NOT NULL DEFAULT 0,
  comentarios      text,
  anulada          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_prestamo_nc_cliente
  ON public.prestamo_notas_credito (tenant_id, cliente_id) WHERE anulada = false;

ALTER TABLE public.prestamo_notas_credito ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prestamo_nc_tenant ON public.prestamo_notas_credito;
CREATE POLICY prestamo_nc_tenant ON public.prestamo_notas_credito FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, UPDATE ON public.prestamo_notas_credito TO authenticated;

CREATE TABLE IF NOT EXISTS public.prestamo_nota_credito_detalle (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  nota_id        uuid NOT NULL REFERENCES public.prestamo_notas_credito(id) ON DELETE CASCADE,
  cuota_id       uuid REFERENCES public.prestamo_cuotas(id),
  cargo_id       uuid REFERENCES public.prestamo_cargos(id),
  abono_capital  numeric(14,2) NOT NULL DEFAULT 0,
  abono_interes  numeric(14,2) NOT NULL DEFAULT 0,
  abono_mora     numeric(14,2) NOT NULL DEFAULT 0,
  abono_total    numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prestamo_nc_detalle_nota
  ON public.prestamo_nota_credito_detalle (nota_id);

ALTER TABLE public.prestamo_nota_credito_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prestamo_nc_det_tenant ON public.prestamo_nota_credito_detalle;
CREATE POLICY prestamo_nc_det_tenant ON public.prestamo_nota_credito_detalle FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT ON public.prestamo_nota_credito_detalle TO authenticated;


-- 2) registrar_nota_credito_prestamo ------------------------------------
DROP FUNCTION IF EXISTS public.registrar_nota_credito_prestamo(uuid,numeric,date,text,uuid,jsonb,jsonb);

CREATE OR REPLACE FUNCTION public.registrar_nota_credito_prestamo(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_fecha        date DEFAULT NULL,
  p_comentarios  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL,
  p_abonos       jsonb DEFAULT NULL,   -- [{cuota_id, capital, interes, mora}]
  p_cargos       jsonb DEFAULT NULL    -- [{cargo_id, monto}]
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  rec        record;
  a          jsonb;
  q          record;
  cg         record;
  ab_mora    numeric;
  ab_int     numeric;
  ab_cap     numeric;
  ab_cargo   numeric;
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
    v_tenant, v_numero, p_cliente_id, COALESCE(p_fecha, current_date), v_total, v_bal_ant, 0, p_comentarios
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
      SELECT * INTO q FROM public.prestamo_cuotas
        WHERE id = (a->>'cuota_id')::uuid AND tenant_id = v_tenant;
      IF NOT FOUND THEN CONTINUE; END IF;

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
    v_restante := v_total;

    -- Pasada 1: mora + intereses
    FOR rec IN
      SELECT (c->>'cuota_id')::uuid AS cuota_id,
             (c->>'mora_pend')::numeric AS mora_pend,
             (c->>'interes_pend')::numeric AS interes_pend
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
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
      WHERE (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
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
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_nota_credito_prestamo(uuid,numeric,date,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_nota_credito_prestamo(uuid,numeric,date,text,uuid,jsonb,jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'Nota de Credito (tablas + RPC) lista' AS status;
