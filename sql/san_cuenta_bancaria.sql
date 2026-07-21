-- =====================================================================
-- SAN: cuenta bancaria + el abono diario SALE de esa cuenta
-- ---------------------------------------------------------------------
-- Cada SAN puede tener una cuenta bancaria asociada. Cuando se aplica un
-- abono, el monto aplicado se RESTA (SALIDA) de esa cuenta: el ahorro se
-- aparta de la cuenta operativa. Atómico dentro del RPC; idempotente por
-- la transacción del abono (origen_id = san_transacciones.id).
-- Idempotente / re-ejecutable.
-- =====================================================================

-- 1) Campo cuenta en el SAN
ALTER TABLE public.san
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid
  REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 2) Origen 'san' en el libro bancario
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso','san','ajuste','transferencia_interna'));

-- 3) san_crear ahora acepta la cuenta (el 4-arg viejo se reemplaza)
DROP FUNCTION IF EXISTS public.san_crear(text, numeric, int, date);
CREATE OR REPLACE FUNCTION public.san_crear(
  p_nombre             text,
  p_monto_objetivo     numeric,
  p_dias               int,
  p_fecha_inicio       date DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_inicio date := COALESCE(p_fecha_inicio, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_diario numeric;
  v_ultimo numeric;
  v_san    uuid;
  i        int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF NULLIF(btrim(p_nombre), '') IS NULL THEN RAISE EXCEPTION 'Ponle nombre o propósito al SAN'; END IF;
  IF COALESCE(p_monto_objetivo, 0) <= 0 THEN RAISE EXCEPTION 'Monto objetivo inválido'; END IF;
  IF COALESCE(p_dias, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad de días inválida'; END IF;

  v_diario := round(p_monto_objetivo / p_dias, 2);
  v_ultimo := round(p_monto_objetivo - v_diario * (p_dias - 1), 2);

  INSERT INTO public.san (tenant_id, nombre, monto_objetivo, dias, pago_diario,
                          fecha_inicio, fecha_fin, cuenta_bancaria_id)
  VALUES (v_tenant, btrim(p_nombre), round(p_monto_objetivo, 2), p_dias, v_diario,
          v_inicio, v_inicio + (p_dias - 1), p_cuenta_bancaria_id)
  RETURNING id INTO v_san;

  FOR i IN 1..p_dias LOOP
    INSERT INTO public.san_pagos (tenant_id, san_id, numero_dia, fecha_programada,
                                  monto_programado, saldo_pendiente)
    VALUES (v_tenant, v_san, i, v_inicio + (i - 1),
            CASE WHEN i = p_dias THEN v_ultimo ELSE v_diario END,
            CASE WHEN i = p_dias THEN v_ultimo ELSE v_diario END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'san_id', v_san, 'pago_diario', v_diario,
                            'fecha_fin', v_inicio + (p_dias - 1));
END $$;

-- 4) san_registrar_pago: el abono aplicado SALE de la cuenta del SAN
CREATE OR REPLACE FUNCTION public.san_registrar_pago(
  p_san_id        uuid,
  p_numero_dia    int,
  p_monto         numeric,
  p_observaciones text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_san      record;
  v_dia      record;
  v_resto    numeric := round(COALESCE(p_monto, 0), 2);
  v_aplicar  numeric;
  v_aplicado jsonb := '[]'::jsonb;
  v_completo boolean;
  v_trans_id uuid;
  v_aplicado_total numeric;
BEGIN
  IF v_resto <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado <> 'Activo' THEN RAISE EXCEPTION 'El SAN está % — no acepta pagos', v_san.estado; END IF;

  FOR v_dia IN
    SELECT * FROM public.san_pagos
    WHERE san_id = p_san_id AND numero_dia >= COALESCE(p_numero_dia, 1)
      AND estado <> 'Pagado'
    ORDER BY numero_dia
    FOR UPDATE
  LOOP
    EXIT WHEN v_resto <= 0;
    v_aplicar := LEAST(round(v_dia.monto_programado - v_dia.monto_pagado, 2), v_resto);
    CONTINUE WHEN v_aplicar <= 0;

    UPDATE public.san_pagos SET
      monto_pagado    = round(monto_pagado + v_aplicar, 2),
      saldo_pendiente = round(monto_programado - (monto_pagado + v_aplicar), 2),
      estado          = CASE WHEN monto_pagado + v_aplicar >= monto_programado
                             THEN 'Pagado' ELSE 'Parcial' END,
      fecha_pago      = CASE WHEN monto_pagado + v_aplicar >= monto_programado
                             THEN now() ELSE fecha_pago END,
      observaciones   = COALESCE(NULLIF(btrim(p_observaciones), ''), observaciones),
      usuario         = auth.uid()
    WHERE id = v_dia.id;

    v_aplicado := v_aplicado || jsonb_build_object('numero_dia', v_dia.numero_dia, 'monto', v_aplicar);
    v_resto := round(v_resto - v_aplicar, 2);
  END LOOP;

  IF jsonb_array_length(v_aplicado) = 0 THEN
    RAISE EXCEPTION 'Ese día ya está pagado — toca un día pendiente';
  END IF;

  v_aplicado_total := round(p_monto, 2) - v_resto;

  INSERT INTO public.san_transacciones (tenant_id, san_id, monto, aplicado, sobrante, observaciones, usuario_id)
  VALUES (v_tenant, p_san_id, v_aplicado_total, v_aplicado, v_resto,
          NULLIF(btrim(p_observaciones), ''), auth.uid())
  RETURNING id INTO v_trans_id;

  -- El abono SALE de la cuenta bancaria del SAN (ahorro apartado de la operativa).
  IF v_san.cuenta_bancaria_id IS NOT NULL AND v_aplicado_total > 0 THEN
    INSERT INTO public.movimientos_bancarios
      (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, origen_id, usuario_id)
    VALUES (v_tenant, v_san.cuenta_bancaria_id, 'SALIDA', v_aplicado_total,
            'Abono SAN: ' || v_san.nombre, 'san', v_trans_id, auth.uid())
    ON CONFLICT (tenant_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.san s SET
    monto_ahorrado = (SELECT round(sum(monto_pagado), 2) FROM public.san_pagos WHERE san_id = s.id)
  WHERE s.id = p_san_id;

  SELECT NOT EXISTS (SELECT 1 FROM public.san_pagos WHERE san_id = p_san_id AND estado <> 'Pagado')
    INTO v_completo;
  IF v_completo THEN
    UPDATE public.san SET estado = 'Completado' WHERE id = p_san_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'aplicado', v_aplicado, 'sobrante', v_resto,
                            'completado', v_completo,
                            'ahorrado', (SELECT monto_ahorrado FROM public.san WHERE id = p_san_id));
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_cuenta_bancaria.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'san.cuenta_bancaria_id' AS objeto,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_name='san' AND column_name='cuenta_bancaria_id')::text AS existe;
