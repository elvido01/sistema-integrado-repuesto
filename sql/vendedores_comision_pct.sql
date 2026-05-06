-- ============================================================
-- Agregar % de comision a la tabla vendedores
-- ============================================================
-- Cada empresa paga porcentajes distintos de comision a sus
-- vendedores (ej. 1% para vendedores junior, 3% para senior).
-- Antes el % se ingresaba manual cada vez en Pago Comisiones.
-- ============================================================

ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS comision_pct numeric(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.vendedores.comision_pct IS 'Porcentaje de comision sobre venta neta (sin ITBIS). Ej. 1.50 = 1.5%';

-- Constraint defensivo: rango razonable
ALTER TABLE public.vendedores
  DROP CONSTRAINT IF EXISTS vendedores_comision_pct_range;
ALTER TABLE public.vendedores
  ADD CONSTRAINT vendedores_comision_pct_range
  CHECK (comision_pct >= 0 AND comision_pct <= 100);

NOTIFY pgrst, 'reload schema';
