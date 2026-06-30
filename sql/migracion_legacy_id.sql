-- =====================================================================
-- Migración SiiF/SCV8 → MotoFlow: columna legacy_id para carga idempotente
-- ---------------------------------------------------------------------
-- Guarda el id de la tabla vieja en cada registro migrado, para poder
-- re-correr el ETL con el respaldo de cada día haciendo UPSERT sin duplicar.
-- Único por (tenant_id, legacy_id). Re-ejecutable.
-- =====================================================================

ALTER TABLE public.clientes  ADD COLUMN IF NOT EXISTS legacy_id bigint;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS legacy_id bigint;

-- prestamos puede no existir en todos los tenants; protegido.
DO $$
BEGIN
  IF to_regclass('public.prestamos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS legacy_id bigint';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS prestamos_tenant_legacy_uq ON public.prestamos (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_tenant_legacy_uq
  ON public.clientes (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS productos_tenant_legacy_uq
  ON public.productos (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
SELECT 'legacy_id listo en clientes/productos/prestamos' AS status;
