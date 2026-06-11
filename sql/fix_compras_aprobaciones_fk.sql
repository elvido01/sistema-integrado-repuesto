-- ============================================================
-- Fix: agregar FK explicito en compras_aprobaciones.orden_id
-- ============================================================
-- Sin esto PostgREST tira:
--   "Could not find a relationship between 'compras_aprobaciones'
--    and 'ordenes_compra' in the schema cache"
-- al intentar el embed orden:ordenes_compra(...)
-- ============================================================

DO $$
BEGIN
  -- Agregar FK solo si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compras_aprobaciones_orden_id_fkey'
  ) THEN
    ALTER TABLE public.compras_aprobaciones
      ADD CONSTRAINT compras_aprobaciones_orden_id_fkey
      FOREIGN KEY (orden_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index para acelerar joins por orden
CREATE INDEX IF NOT EXISTS idx_compras_aprob_orden_id
  ON public.compras_aprobaciones(orden_id);

NOTIFY pgrst, 'reload schema';

SELECT 'FK compras_aprobaciones -> ordenes_compra agregado' AS status;
