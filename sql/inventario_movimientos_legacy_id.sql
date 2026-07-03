-- =====================================================================
-- inventario_movimientos: columna legacy_id para migración idempotente
-- ---------------------------------------------------------------------
-- Permite re-cargar el kardex de Caminero Motors (inv_mov_detalle de SCV8)
-- a diario sin duplicar: la migración borra los que tengan legacy_id y los
-- vuelve a insertar. Los movimientos hechos a mano en el sistema nuevo
-- (legacy_id NULL) NO se tocan.
-- Correr una vez en el editor SQL de Supabase.
-- =====================================================================

ALTER TABLE public.inventario_movimientos
  ADD COLUMN IF NOT EXISTS legacy_id bigint;

CREATE INDEX IF NOT EXISTS idx_inv_mov_tenant_legacy
  ON public.inventario_movimientos (tenant_id, legacy_id);

NOTIFY pgrst, 'reload schema';

SELECT 'inventario_movimientos.legacy_id listo' AS status;
