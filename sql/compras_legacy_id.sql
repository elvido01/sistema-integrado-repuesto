-- =====================================================================
-- compras.legacy_id — para la migración de CUENTAS POR PAGAR del SiiF
-- ---------------------------------------------------------------------
-- La fase fase-caminero-cxp.mjs (respaldo diario) upserta las facturas de
-- suplidores del SiiF como compras a crédito. legacy_id identifica cada
-- documento del sistema viejo para no duplicar en corridas diarias.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS legacy_id text;

-- Único por tenant+legacy (los NULL no chocan entre sí: filas normales
-- del sistema no se afectan).
CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_tenant_legacy
  ON public.compras (tenant_id, legacy_id);

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compras_legacy_id.sql');
  END IF;
END $$;

SELECT 'compras.legacy_id listo (CxP del respaldo diario)' AS status;
