-- =====================================================================
-- Migracion SiiF -> MotoFlow: legacy_id en facturas y recibos_ingreso
-- ---------------------------------------------------------------------
-- La fase fase-caminero-cxc.mjs carga el libro de CxC de CAMINERO MOTORS
-- (cxc_mov_master) como clientes + facturas + recibos. Para que sea
-- IDEMPOTENTE (correr cada dia sin duplicar) necesita rastrear cada fila
-- migrada por el id del movimiento original -> legacy_id.
-- (Mismo patron que clientes.legacy_id e inventario_movimientos.legacy_id.)
-- =====================================================================

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS legacy_id bigint;

CREATE INDEX IF NOT EXISTS idx_facturas_tenant_legacy
  ON public.facturas (tenant_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

ALTER TABLE public.recibos_ingreso
  ADD COLUMN IF NOT EXISTS legacy_id bigint;

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_tenant_legacy
  ON public.recibos_ingreso (tenant_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

SELECT 'legacy_id en facturas y recibos_ingreso listo' AS status;
