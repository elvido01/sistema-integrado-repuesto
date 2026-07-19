-- =====================================================================
-- MÓDULO SAN (AHORRO PROGRAMADO) — MotoPréstamos Los Naranjos
-- ---------------------------------------------------------------------
-- Ahorro por meta con pagos diarios ("no rompas la cadena"):
--   san             → la meta (objetivo, días, pago diario, avance, estado)
--   san_pagos       → un cuadro por día (programado vs pagado, Parcial/Pagado)
--   san_transacciones → HISTORIAL/auditoría: cada pago real con fecha/hora,
--                       usuario, observaciones y a qué días se aplicó
--
-- Reglas del motor (mismas fórmulas que src/lib/sanUtils.js):
--   * pago_diario = objetivo / días (2 decimales); el ÚLTIMO día absorbe el
--     redondeo → la suma de los días cuadra al centavo con el objetivo.
--   * Un pago se aplica EN CASCADA desde el día tocado: si excede, llena
--     los días siguientes; si es menor, el día queda 'Parcial' con saldo.
--   * "Atrasado" NO se guarda: se deriva (fecha pasada y no Pagado).
--   * Al quedar todos los días en 'Pagado', el SAN pasa a 'Completado'.
-- Multi-tenant con RLS estándar. El módulo se muestra solo a MotoPréstamos
-- por sidebar (tenantOnly), pero las tablas son multi-tenant normales.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.san (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  monto_objetivo numeric NOT NULL CHECK (monto_objetivo > 0),
  dias           int NOT NULL CHECK (dias > 0),
  pago_diario    numeric NOT NULL DEFAULT 0,
  fecha_inicio   date NOT NULL,
  fecha_fin      date NOT NULL,
  monto_ahorrado numeric NOT NULL DEFAULT 0,
  estado         text NOT NULL DEFAULT 'Activo'
    CHECK (estado IN ('Activo','Completado','Cancelado','Archivado')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_san_tenant ON public.san (tenant_id, estado);

CREATE TABLE IF NOT EXISTS public.san_pagos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  san_id           uuid NOT NULL REFERENCES public.san(id) ON DELETE CASCADE,
  numero_dia       int NOT NULL,
  fecha_programada date NOT NULL,
  fecha_pago       timestamptz,
  monto_programado numeric NOT NULL,
  monto_pagado     numeric NOT NULL DEFAULT 0,
  saldo_pendiente  numeric NOT NULL DEFAULT 0,
  estado           text NOT NULL DEFAULT 'Pendiente'
    CHECK (estado IN ('Pendiente','Parcial','Pagado')),
  observaciones    text,
  usuario          uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (san_id, numero_dia)
);
CREATE INDEX IF NOT EXISTS idx_san_pagos_san ON public.san_pagos (tenant_id, san_id, numero_dia);

CREATE TABLE IF NOT EXISTS public.san_transacciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  san_id        uuid NOT NULL REFERENCES public.san(id) ON DELETE CASCADE,
  monto         numeric NOT NULL,
  aplicado      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{numero_dia, monto}]
  sobrante      numeric NOT NULL DEFAULT 0,
  observaciones text,
  usuario_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_san_trans_san ON public.san_transacciones (tenant_id, san_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_san_updated ON public.san;
CREATE TRIGGER trg_san_updated
  BEFORE UPDATE ON public.san
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS estándar por tenant
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['san','san_pagos','san_transacciones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (tenant_id = public.get_user_tenant())
         WITH CHECK (tenant_id = public.get_user_tenant())',
      t || '_tenant', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- RPC: crear SAN (calcula pago diario, fecha fin y genera el calendario)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_crear(
  p_nombre         text,
  p_monto_objetivo numeric,
  p_dias           int,
  p_fecha_inicio   date DEFAULT NULL
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
  v_ultimo := round(p_monto_objetivo - v_diario * (p_dias - 1), 2);  -- el último cuadra el total

  INSERT INTO public.san (tenant_id, nombre, monto_objetivo, dias, pago_diario,
                          fecha_inicio, fecha_fin)
  VALUES (v_tenant, btrim(p_nombre), round(p_monto_objetivo, 2), p_dias, v_diario,
          v_inicio, v_inicio + (p_dias - 1))
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

-- ------------------------------------------------------------
-- RPC: registrar pago (exacto, parcial o superior → cascada)
-- ------------------------------------------------------------
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
BEGIN
  IF v_resto <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado <> 'Activo' THEN RAISE EXCEPTION 'El SAN está % — no acepta pagos', v_san.estado; END IF;

  -- Cascada: desde el día tocado hacia adelante, llenando lo que falte
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

  -- Historial/auditoría del pago real (fecha+hora+usuario+detalle)
  INSERT INTO public.san_transacciones (tenant_id, san_id, monto, aplicado, sobrante, observaciones, usuario_id)
  VALUES (v_tenant, p_san_id, round(p_monto, 2) - v_resto, v_aplicado, v_resto,
          NULLIF(btrim(p_observaciones), ''), auth.uid());

  -- Avance y cierre
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

-- ------------------------------------------------------------
-- RPC: cambiar estado (Cancelar un activo / Archivar un completado)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_cambiar_estado(p_san_id uuid, p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_san    record;
BEGIN
  IF p_estado NOT IN ('Cancelado','Archivado') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT * INTO v_san FROM public.san WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF p_estado = 'Cancelado' AND v_san.estado <> 'Activo' THEN
    RAISE EXCEPTION 'Solo se cancela un SAN activo';
  END IF;
  IF p_estado = 'Archivado' AND v_san.estado <> 'Completado' THEN
    RAISE EXCEPTION 'Solo se archiva un SAN completado';
  END IF;
  UPDATE public.san SET estado = p_estado WHERE id = p_san_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ------------------------------------------------------------
-- RPC: eliminar (solo Cancelado y sin pagos — ver san_eliminar.sql)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_eliminar(p_san_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_san    record;
BEGIN
  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado <> 'Cancelado' THEN
    RAISE EXCEPTION 'Solo se elimina un SAN cancelado (este está %)', v_san.estado;
  END IF;
  IF v_san.monto_ahorrado > 0
     OR EXISTS (SELECT 1 FROM public.san_transacciones WHERE san_id = p_san_id) THEN
    RAISE EXCEPTION 'Este SAN tiene pagos registrados: se conserva por auditoría (déjalo Cancelado)';
  END IF;

  DELETE FROM public.san WHERE id = p_san_id;
  RETURN jsonb_build_object('ok', true);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'san_crear(text,numeric,int,date)',
    'san_registrar_pago(uuid,int,numeric,text)',
    'san_cambiar_estado(uuid,text)',
    'san_eliminar(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_modulo.sql');
  END IF;
END $$;

SELECT 'Módulo SAN listo (metas, calendario de pagos en cascada, historial)' AS status;
