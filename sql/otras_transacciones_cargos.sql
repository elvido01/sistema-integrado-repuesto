-- =====================================================================
-- OTRAS TRANSACCIONES: cargos manuales al cliente (ej. CARGO POR ABOGADOS)
-- ---------------------------------------------------------------------
-- En MotoPrestamos Los Naranjos / Caminero, cuando un cliente debe ser
-- mandado a buscar fisicamente se le aplica un cargo (abogado/cobro). Ese
-- cargo NO es parte de la tabla de amortizacion: es una transaccion aparte
-- que sube el balance del cliente y se cobra en el Recibo de Pago.
--
-- Replica el modulo "Otras Transacciones" del sistema viejo:
--   - numero AB-xxxxxxx por tenant
--   - tipo (CARGO POR ABOGADOS, GASTOS DE COBRO, ...) + concepto
--   - balance anterior / monto / balance actual
--
-- Este archivo:
--   1. Crea la tabla prestamo_cargos (+ RLS, grants).
--   2. crear_cargo_cliente(...) -> inserta el cargo y devuelve balances.
--   3. Recrea get_prestamos_cliente para incluir los cargos pendientes como
--      filas cobrables y sumarlos al balance_total.
--   4. Recrea registrar_pago_prestamo para aceptar p_cargos (abonos a cargos).
-- Re-ejecutable.
-- =====================================================================

-- 1) TABLA -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prestamo_cargos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  numero        text NOT NULL,                       -- AB-0000001
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id),
  prestamo_id   uuid REFERENCES public.prestamos(id),-- opcional
  tipo          text NOT NULL DEFAULT 'CARGO POR ABOGADOS',
  concepto      text,
  descripcion   text,
  fecha         date NOT NULL DEFAULT current_date,
  monto         numeric(14,2) NOT NULL DEFAULT 0,
  monto_pagado  numeric(14,2) NOT NULL DEFAULT 0,
  estado        text NOT NULL DEFAULT 'pendiente',   -- pendiente | parcial | pagado
  anulado       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_prestamo_cargos_cliente
  ON public.prestamo_cargos (tenant_id, cliente_id) WHERE anulado = false;

-- RLS por tenant (mismo patron que las demas tablas de prestamos)
ALTER TABLE public.prestamo_cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prestamo_cargos_tenant ON public.prestamo_cargos;
CREATE POLICY prestamo_cargos_tenant ON public.prestamo_cargos FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, UPDATE ON public.prestamo_cargos TO authenticated;


-- 2) crear_cargo_cliente ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_cargo_cliente(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_tipo         text DEFAULT 'CARGO POR ABOGADOS',
  p_concepto     text DEFAULT NULL,
  p_descripcion  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL,
  p_fecha        date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_id       uuid;
  v_numero   text;
  v_seq      int;
  v_monto    numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant  numeric;
  v_bal_act  numeric;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto de la transaccion debe ser mayor que cero'; END IF;

  -- balance anterior = balance total actual del cliente (cuotas + mora + cargos)
  v_bal_ant := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'balance_total')::numeric, 0);

  -- numero AB-xxxxxxx (siguiente por tenant)
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_cargos WHERE tenant_id = v_tenant;
  v_numero := 'AB-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamo_cargos (
    tenant_id, numero, cliente_id, prestamo_id, tipo, concepto, descripcion, fecha, monto
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, p_prestamo_id,
    COALESCE(NULLIF(btrim(p_tipo),''), 'CARGO POR ABOGADOS'),
    NULLIF(btrim(p_concepto),''), NULLIF(btrim(p_descripcion),''),
    COALESCE(p_fecha, current_date), v_monto
  ) RETURNING id INTO v_id;

  v_bal_act := round(v_bal_ant + v_monto, 2);

  RETURN json_build_object(
    'id', v_id, 'numero', v_numero, 'monto', v_monto,
    'balance_anterior', v_bal_ant, 'balance_actual', v_bal_act
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_cargo_cliente(uuid,numeric,text,text,text,uuid,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.crear_cargo_cliente(uuid,numeric,text,text,text,uuid,date) TO authenticated, service_role;


-- 3) get_prestamos_cliente (incluye cargos pendientes) ---------------------
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_result  json;
  v_cargos  json;
  v_cargos_pend numeric;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Cargos manuales pendientes (Otras Transacciones)
  SELECT
    COALESCE(json_agg(json_build_object(
      'cargo_id',    id,
      'numero',      numero,
      'prestamo_id', prestamo_id,
      'fecha',       fecha,
      'tipo',        tipo,
      'concepto',    concepto,
      'descripcion', descripcion,
      'monto',       monto,
      'pagado',      monto_pagado,
      'pendiente',   GREATEST(monto - monto_pagado, 0)
    ) ORDER BY fecha, numero), '[]'::json),
    COALESCE(SUM(GREATEST(monto - monto_pagado, 0)), 0)
  INTO v_cargos, v_cargos_pend
  FROM public.prestamo_cargos
  WHERE tenant_id = v_tenant
    AND cliente_id = p_cliente_id
    AND COALESCE(anulado,false) = false
    AND estado <> 'pagado'
    AND GREATEST(monto - monto_pagado, 0) > 0;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital  - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes  - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (date_part('day', (now() AT TIME ZONE 'America/Santo_Domingo') - q.fecha_vencimiento) / 30)::int) AS meses_atraso,
      p.mora_pct
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_tenant
    WHERE q.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND q.estado <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      GREATEST(
        round((capital_pend + interes_pend) * (mora_pct/100.0) * meses_atraso, 2) - mora_pagada,
        0
      ) AS mora_pend
    FROM cu
  )
  SELECT json_build_object(
    'capital_pendiente',    COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente',       COALESCE(SUM(mora_pend), 0),
    'cargos_pendientes',    v_cargos_pend,
    'balance_total',        COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0) + v_cargos_pend,
    'cargos',               v_cargos,
    'cuotas', COALESCE(json_agg(json_build_object(
      'cuota_id',          id,
      'prestamo_id',       prestamo_id,
      'prestamo_numero',   prestamo_numero,
      'referencia',        lpad(numero_cuota::text,3,'0') || '/' || lpad(plazo_cuotas::text,3,'0'),
      'fecha',             fecha_inicio,
      'fecha_vencimiento', fecha_vencimiento,
      'monto_cuota',       monto_cuota,
      'capital_pend',      capital_pend,
      'interes_pend',      interes_pend,
      'mora_pend',         mora_pend,
      'pendiente',         (capital_pend + interes_pend + mora_pend),
      'vencida',           (fecha_vencimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date)
    ) ORDER BY fecha_vencimiento), '[]'::json)
  ) INTO v_result
  FROM cu2;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) TO authenticated, service_role;


-- 4) registrar_pago_prestamo (acepta p_cargos: abonos a cargos manuales) ----
DROP FUNCTION IF EXISTS public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid,jsonb);
DROP FUNCTION IF EXISTS public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid,jsonb,jsonb);

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
  p_abonos       jsonb DEFAULT NULL,   -- [{cuota_id, capital, interes, mora}]
  p_cargos       jsonb DEFAULT NULL    -- [{cargo_id, monto}]  (Otras Transacciones)
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
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
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_pagos WHERE tenant_id = v_tenant;
  v_numero := lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_fecha, current_date), p_cobrador,
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
      SELECT * INTO q FROM public.prestamo_cuotas
        WHERE id = (a->>'cuota_id')::uuid AND tenant_id = v_tenant;
      IF NOT FOUND THEN CONTINUE; END IF;

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
    v_restante := v_total;
    FOR rec IN
      SELECT (c->>'cuota_id')::uuid AS cuota_id,
             (c->>'mora_pend')::numeric AS mora_pend,
             (c->>'interes_pend')::numeric AS interes_pend,
             (c->>'capital_pend')::numeric AS capital_pend
      FROM json_array_elements(v_estado->'cuotas') c
      WHERE (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
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

  -- contabilidad: Recibo de Ingreso (caja / transacciones / dashboard)
  INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id)
  VALUES (
    v_tenant, public.get_next_recibo_ingreso_numero(), p_cliente_id, COALESCE(p_fecha, current_date), v_total,
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

SELECT 'otras_transacciones_cargos: tabla + crear_cargo_cliente + get_prestamos_cliente + registrar_pago_prestamo listos' AS status;
