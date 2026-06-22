-- =====================================================================
-- Modulo FINANCIERA: prestamos con amortizacion + recibo de pago
-- ---------------------------------------------------------------------
-- Para empresas tipo financiera (ej. MotoPrestamos Los Naranjos).
-- Reconstruye el "Recibo de Pago" del sistema viejo (ADR):
--   - Prestamos PT-xxxx con tabla de cuotas (capital + interes).
--   - Mora por atraso calculada automaticamente.
--   - Pago que se reparte (abono) entre cuotas vencidas:
--     primero mora, luego interes, luego capital; cuota mas vieja primero.
--
-- Seguridad: RPCs SECURITY DEFINER que resuelven el tenant del usuario
-- (get_user_tenant). RLS por tenant en todas las tablas.
-- =====================================================================

-- 0) Feature flag por empresa
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_financiera boolean NOT NULL DEFAULT false;

-- Activar para MotoPrestamos (ajusta el filtro si hace falta)
UPDATE public.config_empresa
   SET feat_financiera = true
 WHERE nombre ILIKE '%motoprestamo%' OR nombre ILIKE '%naranjo%';


-- 1) Tablas ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.prestamos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  numero            text NOT NULL,                       -- PT-0000001
  cliente_id        uuid NOT NULL REFERENCES public.clientes(id),
  tipo              text NOT NULL DEFAULT 'financiamiento', -- financiamiento | personal
  metodo_interes    text NOT NULL DEFAULT 'simple',       -- simple (flat) | frances (cuota fija)
  monto_capital     numeric(14,2) NOT NULL,
  tasa_interes      numeric(7,4)  NOT NULL DEFAULT 0,      -- % por periodo (mensual/quincenal/semanal)
  plazo_cuotas      int NOT NULL,
  frecuencia        text NOT NULL DEFAULT 'mensual',       -- mensual | quincenal | semanal
  mora_pct          numeric(7,4)  NOT NULL DEFAULT 0,      -- % del saldo de la cuota por periodo de atraso
  fecha_inicio      date NOT NULL DEFAULT current_date,
  fecha_primera_cuota date NOT NULL,
  garantia          text,                                 -- matricula/vehiculo, etc.
  estado            text NOT NULL DEFAULT 'activo',        -- activo | saldado | anulado
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, numero)
);

CREATE TABLE IF NOT EXISTS public.prestamo_cuotas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  prestamo_id       uuid NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  numero_cuota      int NOT NULL,
  fecha_vencimiento date NOT NULL,
  capital           numeric(14,2) NOT NULL DEFAULT 0,
  interes           numeric(14,2) NOT NULL DEFAULT 0,
  monto_cuota       numeric(14,2) NOT NULL DEFAULT 0,      -- capital + interes
  capital_pagado    numeric(14,2) NOT NULL DEFAULT 0,
  interes_pagado    numeric(14,2) NOT NULL DEFAULT 0,
  mora_pagada       numeric(14,2) NOT NULL DEFAULT 0,
  estado            text NOT NULL DEFAULT 'pendiente',     -- pendiente | parcial | pagada
  UNIQUE (tenant_id, prestamo_id, numero_cuota)
);

CREATE TABLE IF NOT EXISTS public.prestamo_pagos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  numero            text NOT NULL,                         -- 0147252
  cliente_id        uuid NOT NULL REFERENCES public.clientes(id),
  fecha             date NOT NULL DEFAULT current_date,
  cobrador          text,
  forma_pago        text NOT NULL DEFAULT 'Efectivo',      -- Efectivo | Cheque | Tarjeta
  cuenta_numero     text,
  banco             text,
  total_pagado      numeric(14,2) NOT NULL DEFAULT 0,
  balance_anterior  numeric(14,2) NOT NULL DEFAULT 0,
  balance_actual    numeric(14,2) NOT NULL DEFAULT 0,
  comentarios       text,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, numero)
);

CREATE TABLE IF NOT EXISTS public.prestamo_pago_detalle (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  pago_id           uuid NOT NULL REFERENCES public.prestamo_pagos(id) ON DELETE CASCADE,
  cuota_id          uuid NOT NULL REFERENCES public.prestamo_cuotas(id),
  abono_capital     numeric(14,2) NOT NULL DEFAULT 0,
  abono_interes     numeric(14,2) NOT NULL DEFAULT 0,
  abono_mora        numeric(14,2) NOT NULL DEFAULT 0,
  abono_total       numeric(14,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prestamos_cliente   ON public.prestamos(tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_prestamo     ON public.prestamo_cuotas(tenant_id, prestamo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente       ON public.prestamo_pagos(tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_pago_det_pago       ON public.prestamo_pago_detalle(tenant_id, pago_id);


-- 2) RLS ---------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prestamos','prestamo_cuotas','prestamo_pagos','prestamo_pago_detalle']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON public.%I FOR ALL TO authenticated
         USING (tenant_id = public.get_user_tenant())
         WITH CHECK (tenant_id = public.get_user_tenant());', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated;', t);
  END LOOP;
END $$;


-- 3) Calculo de amortizacion (sin guardar) ----------------------------
-- Devuelve un array json de cuotas {numero_cuota, fecha_vencimiento, capital, interes, monto_cuota}
CREATE OR REPLACE FUNCTION public.calc_amortizacion(
  p_monto        numeric,
  p_tasa         numeric,   -- % por periodo
  p_plazo        int,
  p_metodo       text,      -- simple | frances
  p_frecuencia   text,      -- mensual | quincenal | semanal
  p_fecha_primera date
)
RETURNS json
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  i           numeric := COALESCE(p_tasa,0) / 100.0;
  saldo       numeric := p_monto;
  cuota_fija  numeric;
  cap         numeric;
  interes     numeric;
  cuota       numeric;
  k           int;
  v_fecha     date;
  sum_cap     numeric := 0;
  arr         jsonb := '[]'::jsonb;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_plazo IS NULL OR p_plazo <= 0 THEN
    RETURN '[]'::json;
  END IF;

  -- cuota fija para metodo frances
  IF p_metodo = 'frances' AND i > 0 THEN
    cuota_fija := round(p_monto * i / (1 - power(1 + i, -p_plazo)), 2);
  END IF;

  FOR k IN 1..p_plazo LOOP
    v_fecha := CASE p_frecuencia
                 WHEN 'semanal'   THEN p_fecha_primera + ((k-1) * 7)
                 WHEN 'quincenal' THEN p_fecha_primera + ((k-1) * 15)
                 ELSE (p_fecha_primera + ((k-1) || ' months')::interval)::date
               END;

    IF p_metodo = 'frances' THEN
      IF i > 0 THEN
        interes := round(saldo * i, 2);
        cuota   := cuota_fija;
        cap     := round(cuota - interes, 2);
      ELSE
        cap     := round(p_monto / p_plazo, 2);
        interes := 0;
        cuota   := cap;
      END IF;
    ELSE
      -- simple / flat: capital igual por cuota, interes fijo sobre el capital original
      cap     := round(p_monto / p_plazo, 2);
      interes := round(p_monto * i, 2);
      cuota   := cap + interes;
    END IF;

    -- ultima cuota: ajustar capital por redondeo para que sume el monto exacto
    IF k = p_plazo THEN
      cap   := round(p_monto - sum_cap, 2);
      cuota := round(cap + interes, 2);
    END IF;
    sum_cap := sum_cap + cap;
    saldo   := round(saldo - cap, 2);

    arr := arr || jsonb_build_object(
      'numero_cuota',      k,
      'fecha_vencimiento', v_fecha,
      'capital',           cap,
      'interes',           interes,
      'monto_cuota',       cuota
    );
  END LOOP;

  RETURN arr::json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_amortizacion(numeric,numeric,int,text,text,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calc_amortizacion(numeric,numeric,int,text,text,date) TO authenticated, service_role;


-- 4) Crear prestamo (genera las cuotas) -------------------------------
CREATE OR REPLACE FUNCTION public.crear_prestamo(
  p_cliente_id     uuid,
  p_monto          numeric,
  p_tasa           numeric,
  p_plazo          int,
  p_metodo         text DEFAULT 'simple',
  p_frecuencia     text DEFAULT 'mensual',
  p_mora_pct       numeric DEFAULT 0,
  p_tipo           text DEFAULT 'financiamiento',
  p_fecha_primera  date DEFAULT NULL,
  p_garantia       text DEFAULT NULL,
  p_notas          text DEFAULT NULL
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
  v_fecha1   date := COALESCE(p_fecha_primera, (current_date + interval '1 month')::date);
  v_cuotas   json;
  c          jsonb;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  -- numero PT-xxxxxxx (siguiente por tenant)
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamos WHERE tenant_id = v_tenant;
  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota,
    garantia, notas
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_tipo,'financiamiento'),
    COALESCE(p_metodo,'simple'), p_monto, COALESCE(p_tasa,0), p_plazo,
    COALESCE(p_frecuencia,'mensual'), COALESCE(p_mora_pct,0), v_fecha1,
    p_garantia, p_notas
  ) RETURNING id INTO v_id;

  v_cuotas := public.calc_amortizacion(p_monto, p_tasa, p_plazo, COALESCE(p_metodo,'simple'), COALESCE(p_frecuencia,'mensual'), v_fecha1);

  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_tenant, v_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      (c->>'capital')::numeric, (c->>'interes')::numeric, (c->>'monto_cuota')::numeric
    );
  END LOOP;

  RETURN json_build_object('id', v_id, 'numero', v_numero, 'cuotas', v_cuotas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_prestamo(uuid,numeric,numeric,int,text,text,numeric,text,date,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.crear_prestamo(uuid,numeric,numeric,int,text,text,numeric,text,date,text,text) TO authenticated, service_role;


-- 5) Estado de cuenta de prestamos de un cliente ----------------------
-- Cuotas pendientes (con mora calculada) + totales. Alimenta el Recibo de Pago.
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital  - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes  - q.interes_pagado, 0) AS interes_pend,
      -- meses de atraso (>=0); la mora aplica por periodo vencido
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
    'capital_pendiente',  COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente',     COALESCE(SUM(mora_pend), 0),
    'balance_total',      COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
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


-- 6) Registrar pago (reparte el abono: mora -> interes -> capital) -----
CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo(
  p_cliente_id   uuid,
  p_monto        numeric,
  p_fecha        date DEFAULT NULL,
  p_cobrador     text DEFAULT NULL,
  p_forma_pago   text DEFAULT 'Efectivo',
  p_cuenta       text DEFAULT NULL,
  p_banco        text DEFAULT NULL,
  p_comentarios  text DEFAULT NULL,
  p_prestamo_id  uuid DEFAULT NULL   -- opcional: limitar a un prestamo
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
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
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;

  -- balance anterior (antes de aplicar el pago)
  v_estado := public.get_prestamos_cliente(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  -- crear recibo
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

  -- aplicar a cada cuota pendiente (mas vieja primero): mora -> interes -> capital
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

  -- marcar prestamos saldados
  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_tenant
     AND p.cliente_id = p_cliente_id
     AND p.estado = 'activo'
     AND NOT EXISTS (
       SELECT 1 FROM public.prestamo_cuotas q
       WHERE q.prestamo_id = p.id AND q.estado <> 'pagada'
     );

  -- balance actual
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
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_pago_prestamo(uuid,numeric,date,text,text,text,text,text,uuid) TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';

SELECT 'modulo financiera (prestamos + recibo de pago) listo' AS status;
