-- =====================================================================
-- Frecuencia de pago en solicitudes_compras (diario/semanal/quincenal/mensual)
-- ---------------------------------------------------------------------
-- El financiamiento ya no es solo mensual: la cuota puede ser diaria,
-- semanal, quincenal o mensual. tiempo_meses pasa a interpretarse como
-- "numero de cuotas" y la tasa como "tasa por periodo".
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.solicitudes_compras
  ADD COLUMN IF NOT EXISTS frecuencia text NOT NULL DEFAULT 'mensual';

ALTER TABLE public.solicitudes_compras
  DROP CONSTRAINT IF EXISTS solicitudes_compras_frecuencia_check;
ALTER TABLE public.solicitudes_compras
  ADD CONSTRAINT solicitudes_compras_frecuencia_check
  CHECK (frecuencia IN ('diario', 'semanal', 'quincenal', 'mensual'));

NOTIFY pgrst, 'reload schema';

SELECT 'solicitudes_compras.frecuencia lista (diario/semanal/quincenal/mensual)' AS status;
