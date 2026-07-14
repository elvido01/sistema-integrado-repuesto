-- =====================================================================
-- FIX: numeración de pagos_suplidores debe ser ÚNICA POR TENANT
-- ---------------------------------------------------------------------
-- Bug (2026-07-14): al pagar al primer suplidor de Caminero Motors salía
--   "duplicate key value violates unique constraint pagos_suplidores_numero_key".
-- Causa: get_next_pago_suplidor_numero() numera por tenant (Caminero vacío →
--   PS-000001), pero la constraint UNIQUE era GLOBAL sobre `numero`, y Morla
--   ya tenía PS-000001 → colisión entre empresas.
-- Fix: reemplazar la unicidad global por (tenant_id, numero).
-- Seguro: (tenant_id, numero) es MÁS permisivo que (numero), así que si antes
--   no había duplicados globales, tampoco los hay ahora. Idempotente.
-- =====================================================================

ALTER TABLE public.pagos_suplidores
  DROP CONSTRAINT IF EXISTS pagos_suplidores_numero_key;

-- por si en algún ambiente quedó como índice en vez de constraint
DROP INDEX IF EXISTS public.pagos_suplidores_numero_key;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_suplidores_tenant_numero_key
  ON public.pagos_suplidores (tenant_id, numero);

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_pagos_suplidores_numero_tenant.sql');
  END IF;
END $$;

SELECT 'pagos_suplidores: numeración única por tenant (fix aplicado)' AS status;
