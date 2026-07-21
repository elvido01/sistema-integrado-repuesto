-- =====================================================================
-- Cuentas bancarias PREDETERMINADAS POR MÓDULO
-- ---------------------------------------------------------------------
-- Una empresa puede usar cuentas distintas según el flujo. Ej:
--   ventas / recibo  → Cuenta Operativa
--   cierre_caja      → Cuenta Depósitos
--   pago_suplidor    → Cuenta Pagos
-- Cada flujo trae preseleccionada SU cuenta; si no hay una configurada
-- para ese módulo, cae a la cuenta general
-- (config_empresa.cuenta_bancaria_default_id) y luego a la primera.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cuentas_bancarias_default (
  tenant_id  uuid NOT NULL DEFAULT public.get_user_tenant(),
  modulo     text NOT NULL,   -- 'ventas' | 'recibo' | 'cierre_caja' | 'pago_suplidor' | 'compromiso'
  cuenta_id  uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, modulo)
);

ALTER TABLE public.cuentas_bancarias_default ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuentas_bancarias_default_tenant ON public.cuentas_bancarias_default;
CREATE POLICY cuentas_bancarias_default_tenant ON public.cuentas_bancarias_default
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

COMMENT ON TABLE public.cuentas_bancarias_default IS
  'Cuenta predeterminada por módulo (ventas/recibo/cierre_caja/pago_suplidor/compromiso). Fallback: config_empresa.cuenta_bancaria_default_id. Ver sql/cuentas_default_modulo.sql';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cuentas_default_modulo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'cuentas_bancarias_default' AS objeto, to_regclass('public.cuentas_bancarias_default')::text AS existe;
