-- =====================================================================
-- CUENTAS BANCARIAS (por empresa) — Fase 1: la base
-- ---------------------------------------------------------------------
-- Una empresa puede tener varias cuentas. El SALDO NO se guarda como un
-- número editable: se DERIVA de saldo_inicial + entradas − salidas, igual
-- que inventario y préstamos aquí. Así nunca se descuadra.
--
-- Cada transferencia (venta, recibo, cierre de caja, pago a suplidor)
-- registra un movimiento con un enlace al documento origen
-- (origen_tipo + origen_id) para NO duplicar y poder corregir si el
-- documento cambia.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cuentas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.get_user_tenant(),
  banco         text NOT NULL,                 -- 'Banco Popular'
  alias         text,                          -- 'Cuenta Operativa'
  numero_cuenta text,                          -- puede guardarse enmascarada
  tipo          text,                          -- 'corriente' | 'ahorro'
  moneda        text NOT NULL DEFAULT 'DOP',   -- 'DOP' | 'USD'
  saldo_inicial numeric NOT NULL DEFAULT 0,    -- saldo al empezar a usar MotoFlow
  activo        boolean NOT NULL DEFAULT true,
  orden         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant
  ON public.cuentas_bancarias (tenant_id, activo);

COMMENT ON TABLE public.cuentas_bancarias IS
  'Cuentas bancarias por empresa. Saldo se deriva de movimientos_bancarios. Ver sql/cuentas_bancarias.sql';

-- ---------------------------------------------------------------------
-- 2) Libro mayor de movimientos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos_bancarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant(),
  cuenta_id   uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  fecha       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  tipo        text NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
  monto       numeric NOT NULL CHECK (monto >= 0),   -- siempre positivo; el signo lo da 'tipo'
  concepto    text,
  referencia  text,                                   -- No. de transferencia
  origen_tipo text NOT NULL DEFAULT 'ajuste'
              CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','ajuste','transferencia_interna')),
  origen_id   uuid,                                   -- id del documento (factura, recibo, cierre, pago…)
  usuario_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Un solo movimiento por documento origen: si el documento se reintenta o
-- se edita, se actualiza el mismo movimiento (no duplica el saldo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_bancario_origen
  ON public.movimientos_bancarios (tenant_id, origen_tipo, origen_id)
  WHERE origen_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mov_bancario_cuenta
  ON public.movimientos_bancarios (tenant_id, cuenta_id, fecha DESC);

COMMENT ON TABLE public.movimientos_bancarios IS
  'Libro mayor de cuentas bancarias. Saldo = saldo_inicial + ENTRADAS − SALIDAS.';

-- Ampliar los orígenes (agrega 'compromiso' para pagos de gastos/servicios).
-- Idempotente: reemplaza el CHECK.
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso','ajuste','transferencia_interna'));

-- Cuenta por DEFECTO de la empresa: viene preseleccionada en ventas,
-- recibos, cierre y pagos por transferencia (pero se puede cambiar al
-- momento). Se configura en Configuración del Sistema.
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_default_id uuid
  REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3) RLS (aislamiento por empresa, estándar del sistema)
-- ---------------------------------------------------------------------
ALTER TABLE public.cuentas_bancarias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuentas_bancarias_tenant ON public.cuentas_bancarias;
CREATE POLICY cuentas_bancarias_tenant ON public.cuentas_bancarias
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS movimientos_bancarios_tenant ON public.movimientos_bancarios;
CREATE POLICY movimientos_bancarios_tenant ON public.movimientos_bancarios
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ---------------------------------------------------------------------
-- 4) Saldos EN VIVO (vista): saldo_inicial + entradas − salidas
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cuentas_bancarias_saldos
WITH (security_invoker = true) AS
  SELECT
    c.id,
    c.tenant_id,
    c.banco,
    c.alias,
    c.numero_cuenta,
    c.tipo,
    c.moneda,
    c.saldo_inicial,
    c.activo,
    c.orden,
    c.saldo_inicial
      + COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.monto
                          WHEN m.tipo = 'SALIDA'  THEN -m.monto ELSE 0 END), 0) AS saldo,
    COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.monto ELSE 0 END), 0) AS total_entradas,
    COALESCE(SUM(CASE WHEN m.tipo = 'SALIDA'  THEN m.monto ELSE 0 END), 0) AS total_salidas,
    MAX(m.created_at) AS ultimo_movimiento
  FROM public.cuentas_bancarias c
  LEFT JOIN public.movimientos_bancarios m ON m.cuenta_id = c.id
  GROUP BY c.id;

-- ---------------------------------------------------------------------
-- 5) RPC para registrar un movimiento (idempotente por documento origen)
--    Lo llaman el frontend (venta/recibo/cierre) y otras RPCs (pago
--    suplidor). SECURITY INVOKER: respeta el RLS del que llama.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_movimiento_bancario(
  p_cuenta_id   uuid,
  p_tipo        text,
  p_monto       numeric,
  p_concepto    text DEFAULT NULL,
  p_referencia  text DEFAULT NULL,
  p_origen_tipo text DEFAULT 'ajuste',
  p_origen_id   uuid DEFAULT NULL,
  p_fecha       date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_fecha date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
BEGIN
  IF p_cuenta_id IS NULL THEN RETURN NULL; END IF;   -- sin cuenta: no registra (flujo opcional)
  IF p_tipo NOT IN ('ENTRADA','SALIDA') THEN
    RAISE EXCEPTION 'tipo debe ser ENTRADA o SALIDA (%)', p_tipo;
  END IF;

  IF p_origen_id IS NOT NULL THEN
    -- upsert por documento: no duplica y refleja ediciones
    INSERT INTO public.movimientos_bancarios
      (cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
    VALUES
      (p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), p_origen_id, auth.uid())
    ON CONFLICT (tenant_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL
    DO UPDATE SET
      cuenta_id  = EXCLUDED.cuenta_id,
      fecha      = EXCLUDED.fecha,
      tipo       = EXCLUDED.tipo,
      monto      = EXCLUDED.monto,
      concepto   = EXCLUDED.concepto,
      referencia = EXCLUDED.referencia
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.movimientos_bancarios
      (cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
    VALUES
      (p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), NULL, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_bancario(uuid,text,numeric,text,text,text,uuid,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_movimiento_bancario(uuid,text,numeric,text,text,text,uuid,date) TO authenticated;

-- Revertir el movimiento de un documento (p.ej. factura anulada)
CREATE OR REPLACE FUNCTION public.revertir_movimiento_bancario(
  p_origen_tipo text, p_origen_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.movimientos_bancarios
  WHERE origen_tipo = p_origen_tipo AND origen_id = p_origen_id
    AND tenant_id = public.get_user_tenant();
$$;

REVOKE EXECUTE ON FUNCTION public.revertir_movimiento_bancario(text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revertir_movimiento_bancario(text,uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Realtime: el módulo de saldos se actualiza solo con cada movimiento
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='movimientos_bancarios') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.movimientos_bancarios;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='cuentas_bancarias') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.cuentas_bancarias;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cuentas_bancarias.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT 'cuentas_bancarias' AS objeto, to_regclass('public.cuentas_bancarias')::text AS existe
UNION ALL SELECT 'movimientos_bancarios', to_regclass('public.movimientos_bancarios')::text
UNION ALL SELECT 'vista_saldos', to_regclass('public.cuentas_bancarias_saldos')::text
UNION ALL SELECT 'rpc_registrar', to_regprocedure('public.registrar_movimiento_bancario(uuid,text,numeric,text,text,text,uuid,date)')::text;
