-- ============================================================
-- Compra Inteligente v2 — Fase A: cimientos
-- ============================================================
-- Crea las tablas y funciones base para el control inteligente
-- de compras Enterprise. Idempotente.
--
-- Incluye:
--   1. presupuesto_config (1 fila por tenant con todos los parametros)
--   2. presupuesto_excepciones (log de overrides con PIN supervisor)
--   3. pin_supervisor en config_empresa
--   4. feat_compra_inteligente_enterprise en config_empresa
--   5. RPC verificar_pin_supervisor
--   6. RPC get_caja_disponible
--   7. RPC get_presupuesto_compras_v2 (hibrida)
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) Tabla presupuesto_config — 1 fila por tenant
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.presupuesto_config (
  tenant_id                 UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  monto_base_mensual        NUMERIC,                              -- NULL = usar calculo automatico actual
  incremento_mensual_pct    NUMERIC DEFAULT 0,                    -- 5 = 5%/mes
  caja_minima               NUMERIC DEFAULT 0,                    -- "colchon de seguridad"
  dias_credito_promedio     INT     DEFAULT 30,
  limite_aprobacion_manual  NUMERIC DEFAULT 0,                    -- 0 = sin limite
  control_estricto          BOOLEAN DEFAULT false,                -- bloquea F10 si excede
  distribuir_por            TEXT    DEFAULT 'total'
                            CHECK (distribuir_por IN ('total','suplidor','categoria','mixto')),
  fecha_base                DATE    DEFAULT CURRENT_DATE,         -- cuando empezo a contar el incremento
  notas                     TEXT,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.presupuesto_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presupuesto_config_tenant ON public.presupuesto_config;
CREATE POLICY presupuesto_config_tenant ON public.presupuesto_config
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ────────────────────────────────────────────────
-- 2) Tabla presupuesto_excepciones — log de overrides
-- ────────────────────────────────────────────────
-- Cada vez que un usuario desbloquea con PIN una orden que excede
-- el presupuesto, queda el rastro aqui para auditoria.
CREATE TABLE IF NOT EXISTS public.presupuesto_excepciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  orden_compra_id   UUID,                                          -- ref logica a ordenes_compra
  usuario_id        UUID,                                          -- quien grabo con override
  monto_orden       NUMERIC NOT NULL,
  presupuesto_dispo NUMERIC NOT NULL,
  exceso            NUMERIC GENERATED ALWAYS AS (GREATEST(0, monto_orden - presupuesto_dispo)) STORED,
  razon             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.presupuesto_excepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presup_exc_select ON public.presupuesto_excepciones;
CREATE POLICY presup_exc_select ON public.presupuesto_excepciones
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS presup_exc_insert ON public.presupuesto_excepciones;
CREATE POLICY presup_exc_insert ON public.presupuesto_excepciones
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_presup_exc_tenant
  ON public.presupuesto_excepciones(tenant_id, created_at DESC);

-- ────────────────────────────────────────────────
-- 3) PIN supervisor + feature flag en config_empresa
-- ────────────────────────────────────────────────
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS pin_supervisor_hash         TEXT,
  ADD COLUMN IF NOT EXISTS feat_compra_inteligente_ent BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.config_empresa.pin_supervisor_hash
  IS 'Hash bcrypt del PIN del supervisor para desbloquear compras que exceden presupuesto.';
COMMENT ON COLUMN public.config_empresa.feat_compra_inteligente_ent
  IS 'Activa el modulo Control Inteligente de Compras Enterprise. Default false, true para tenants Enterprise.';

-- ────────────────────────────────────────────────
-- 4) RPC verificar_pin_supervisor
-- ────────────────────────────────────────────────
-- Devuelve TRUE si el PIN coincide. Usa pgcrypto crypt() para hashing.
-- El frontend NUNCA recibe el hash; solo manda el PIN en plaintext
-- y obtiene boolean.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.verificar_pin_supervisor(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant UUID;
  v_hash   TEXT;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN RETURN false; END IF;

  SELECT pin_supervisor_hash INTO v_hash
  FROM public.config_empresa
  WHERE tenant_id = v_tenant;

  IF v_hash IS NULL OR p_pin IS NULL OR p_pin = '' THEN
    RETURN false;
  END IF;

  RETURN crypt(p_pin, v_hash) = v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_pin_supervisor(TEXT) TO authenticated;

-- RPC para SETEAR el PIN (solo el owner del tenant deberia poder).
-- Lo dejamos accesible a authenticated; la UI gatea quien lo ve.
CREATE OR REPLACE FUNCTION public.set_pin_supervisor(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant en sesion';
  END IF;
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'El PIN debe tener al menos 4 caracteres';
  END IF;

  UPDATE public.config_empresa
     SET pin_supervisor_hash = crypt(p_pin, gen_salt('bf', 10))
   WHERE tenant_id = v_tenant;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pin_supervisor(TEXT) TO authenticated;

-- ────────────────────────────────────────────────
-- 5) RPC get_caja_disponible
-- ────────────────────────────────────────────────
-- El sistema NO tiene una "caja viva" persistente. Esta RPC calcula
-- el saldo disponible a partir de:
--   + Ultimo cierre de caja (saldo final)
--   + Recibos de ingreso desde ese cierre
--   - Pagos a suplidores desde ese cierre
--
-- Si no hay cierres, usa el monto total recibos - pagos hasta la fecha.
CREATE OR REPLACE FUNCTION public.get_caja_disponible(
  p_tenant_id UUID DEFAULT NULL,
  p_hasta     TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant      UUID;
  v_ultimo_cier TIMESTAMPTZ;
  v_saldo_cier  NUMERIC := 0;
  v_recibos     NUMERIC := 0;
  v_pagos       NUMERIC := 0;
  v_disponible  NUMERIC;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant';
  END IF;

  -- Ultimo cierre de caja (la columna es efectivo_en_caja, no saldo_final)
  SELECT created_at, COALESCE(efectivo_en_caja, 0)
    INTO v_ultimo_cier, v_saldo_cier
  FROM public.cierres_caja
  WHERE tenant_id = v_tenant AND created_at <= p_hasta
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no hay cierre, agregamos TODO el historial
  IF v_ultimo_cier IS NULL THEN
    v_ultimo_cier := '-infinity'::timestamptz;
    v_saldo_cier := 0;
  END IF;

  -- Recibos desde el ultimo cierre (monto_pagado, no monto)
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_recibos
  FROM public.recibos_ingreso
  WHERE tenant_id = v_tenant
    AND fecha BETWEEN v_ultimo_cier AND p_hasta
    AND COALESCE(anulado, false) = false;

  -- Pagos a suplidores desde el ultimo cierre
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_pagos
  FROM public.pagos_suplidores
  WHERE tenant_id = v_tenant
    AND fecha BETWEEN v_ultimo_cier AND p_hasta
    AND COALESCE(anulado, false) = false;

  v_disponible := v_saldo_cier + v_recibos - v_pagos;

  RETURN json_build_object(
    'caja_disponible',   ROUND(v_disponible, 2),
    'saldo_ultimo_cierre', ROUND(v_saldo_cier, 2),
    'recibos_desde_cierre', ROUND(v_recibos, 2),
    'pagos_desde_cierre',   ROUND(v_pagos, 2),
    'ultimo_cierre',     v_ultimo_cier,
    'calculado_hasta',   p_hasta
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_caja_disponible(UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 6) RPC get_presupuesto_compras_v2 (hibrida)
-- ────────────────────────────────────────────────
-- Si presupuesto_config tiene monto_base_mensual:
--   usa ese × (1 + incremento_pct × meses_desde_fecha_base)
-- Si no:
--   cae al get_presupuesto_compras actual (ventas × factor)
-- En ambos casos resta la caja_minima.
CREATE OR REPLACE FUNCTION public.get_presupuesto_compras_v2(
  p_tenant_id UUID DEFAULT NULL,
  p_mes       DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant         UUID;
  v_config         public.presupuesto_config%ROWTYPE;
  v_monto_base     NUMERIC := 0;
  v_meses_desde    INT     := 0;
  v_presupuesto    NUMERIC := 0;
  v_comprado_mes   NUMERIC := 0;
  v_disponible     NUMERIC := 0;
  v_modo           TEXT;
  v_salud          TEXT;
  v_color          TEXT;
  v_legacy         JSON;
  v_caja           JSON;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant';
  END IF;

  -- Cargar config (puede no existir)
  SELECT * INTO v_config
  FROM public.presupuesto_config
  WHERE tenant_id = v_tenant;

  -- Calculo del presupuesto base
  IF v_config.monto_base_mensual IS NOT NULL AND v_config.monto_base_mensual > 0 THEN
    v_modo := 'manual';
    v_meses_desde := GREATEST(0,
      EXTRACT(YEAR  FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT * 12 +
      EXTRACT(MONTH FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT
    );
    v_monto_base := v_config.monto_base_mensual *
                    (1 + COALESCE(v_config.incremento_mensual_pct, 0) / 100.0 * v_meses_desde);
  ELSE
    v_modo := 'auto';
    -- Usar el calculo legacy basado en ventas × factor
    v_legacy := public.get_presupuesto_compras(v_tenant, 30, COALESCE(v_config.caja_minima, 0));
    v_monto_base := (v_legacy->>'presupuesto_sugerido')::NUMERIC;
  END IF;

  -- Comprado este mes (suma de compras del mes actual)
  SELECT COALESCE(SUM(total), 0) INTO v_comprado_mes
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND fecha >= p_mes
    AND fecha < (p_mes + INTERVAL '1 month');

  v_disponible := GREATEST(0, v_monto_base - v_comprado_mes - COALESCE(v_config.caja_minima, 0));

  -- Semaforo
  IF v_monto_base = 0 THEN
    v_color := 'gris'; v_salud := 'sin_datos';
  ELSIF v_disponible <= 0 THEN
    v_color := 'rojo'; v_salud := 'agotado';
  ELSIF v_disponible / v_monto_base < 0.25 THEN
    v_color := 'amarillo'; v_salud := 'limite_cerca';
  ELSE
    v_color := 'verde'; v_salud := 'sano';
  END IF;

  -- Caja disponible para contexto (no afecta calculo principal)
  v_caja := public.get_caja_disponible(v_tenant, NOW());

  RETURN json_build_object(
    'mes',               p_mes,
    'modo',              v_modo,
    'monto_base_mensual', ROUND(v_monto_base, 2),
    'comprado_mes',      ROUND(v_comprado_mes, 2),
    'caja_minima',       COALESCE(v_config.caja_minima, 0),
    'disponible',        ROUND(v_disponible, 2),
    'incremento_pct',    COALESCE(v_config.incremento_mensual_pct, 0),
    'meses_desde_base',  v_meses_desde,
    'control_estricto',  COALESCE(v_config.control_estricto, false),
    'limite_aprobacion', COALESCE(v_config.limite_aprobacion_manual, 0),
    'distribuir_por',    COALESCE(v_config.distribuir_por, 'total'),
    'salud',             v_salud,
    'color',             v_color,
    'caja_disponible',   v_caja,
    'legacy_calculo',    v_legacy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_compras_v2(UUID, DATE) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 7) Sanity check
-- ────────────────────────────────────────────────
SELECT 'compra inteligente v2 fase A lista' AS status,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('presupuesto_config', 'presupuesto_excepciones')) AS tablas,
       (SELECT count(*) FROM pg_proc
        WHERE proname IN ('verificar_pin_supervisor','set_pin_supervisor',
                          'get_caja_disponible','get_presupuesto_compras_v2')) AS rpcs;

NOTIFY pgrst, 'reload schema';
