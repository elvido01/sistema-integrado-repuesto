-- =====================================================================
-- SAN — Deudas Personales
-- ---------------------------------------------------------------------
-- (2026-07-26) Dentro del módulo SAN se lleva una lista de DEUDAS
-- PERSONALES: nombre de la deuda + monto. Queda guardada de forma
-- permanente (no pertenece a un SAN en particular), así sirve para los SAN
-- futuros: se ve cuánto se debe antes de comprometerse con un ahorro nuevo.
--
-- `activo` permite marcar una deuda como saldada sin borrar el historial.
-- Mismo patrón multi-tenant + RLS que el resto del módulo (san_modulo.sql).
-- Idempotente / re-ejecutable. Correr en PRODUCCIÓN.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.san_deudas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  monto      numeric NOT NULL DEFAULT 0 CHECK (monto >= 0),
  notas      text,
  activo     boolean NOT NULL DEFAULT true,   -- false = ya saldada
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_san_deudas_tenant
  ON public.san_deudas (tenant_id, activo, created_at DESC);

COMMENT ON TABLE public.san_deudas IS
  'Deudas personales del módulo SAN (nombre + monto). Persisten entre SAN. Ver sql/san_deudas_personales.sql';

DROP TRIGGER IF EXISTS trg_san_deudas_updated ON public.san_deudas;
CREATE TRIGGER trg_san_deudas_updated
  BEFORE UPDATE ON public.san_deudas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS estándar por tenant (igual que san / san_pagos / san_transacciones)
ALTER TABLE public.san_deudas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS san_deudas_tenant ON public.san_deudas;
CREATE POLICY san_deudas_tenant ON public.san_deudas
  FOR ALL
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

REVOKE ALL ON public.san_deudas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.san_deudas TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_deudas_personales.sql');
  END IF;
END $$;

-- Verificación
SELECT 'san_deudas' AS tabla,
       (SELECT count(*)::text FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'san_deudas') AS existe;
