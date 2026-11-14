-- =====================================================================
-- Ayudante contable: comprobante fiscal unido al gasto diario (14/11/2026)
-- ---------------------------------------------------------------------
-- Los gastos diarios no guardan NCF y por eso no entraban al 606. Ahora,
-- al anotar el gasto, se le puede tomar la foto del comprobante: se sube
-- al mismo lugar que "Comprobantes de gastos" (bucket comprobantes, la
-- lee leer-comprobante, queda "por revisar") y queda unido a ese gasto.
-- Solo entra al 606 cuando alguien lo revisa y lo aprueba (igual que hoy).
--   · gastos_comprobantes.gasto_id → gastos_diarios.id (si el gasto se
--     borra, el comprobante se queda: sigue siendo un comprobante fiscal).
-- No toca la caja, el banco ni el monto del gasto. Idempotente.
-- =====================================================================

ALTER TABLE public.gastos_comprobantes
  ADD COLUMN IF NOT EXISTS gasto_id uuid REFERENCES public.gastos_diarios(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.gastos_comprobantes.gasto_id IS
  'Gasto diario al que pertenece el comprobante (si se tomó al anotar el gasto). Solo referencia: no cambia la caja.';
CREATE INDEX IF NOT EXISTS gastos_comprobantes_gasto_idx
  ON public.gastos_comprobantes (gasto_id) WHERE gasto_id IS NOT NULL;

SELECT registrar_migracion('comprobante_de_gasto_diario.sql');
