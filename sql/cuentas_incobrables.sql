-- =====================================================================
-- Cuentas Incobrables / Vehículos Robados (castigo de cartera)
-- ---------------------------------------------------------------------
-- Un préstamo con estado='castigado' sale de cobranza, del recibo y de las
-- métricas (todas esas vistas filtran estado='activo'), pero NO se borra:
-- si el cliente aparece a pagar (recuperación), se registra y limpia su buró.
--
--   motivo_castigo:  incobrable | vehiculo_robado | perdida_total
--   castigado_manual: true = la clasificación la puso una persona; la
--                     migración diaria NO cambia el estado de ese préstamo
--                     (respeta tanto castigos como reactivaciones manuales).
--   fecha_castigo:   cuándo se castigó (para reportes).
-- Correr una vez en el editor SQL de Supabase.
-- =====================================================================

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS motivo_castigo   text,
  ADD COLUMN IF NOT EXISTS fecha_castigo    date,
  ADD COLUMN IF NOT EXISTS castigado_manual boolean NOT NULL DEFAULT false;

-- Índice para el módulo de incobrables (listar castigadas por tenant).
CREATE INDEX IF NOT EXISTS idx_prestamos_castigados
  ON public.prestamos (tenant_id, estado)
  WHERE estado = 'castigado';

NOTIFY pgrst, 'reload schema';

SELECT 'cuentas incobrables: columnas listas' AS status;
