-- ============================================================
-- Agregar forma de pago a compromisos
-- ============================================================
-- Permite registrar como se pago cada compromiso: Efectivo,
-- Transferencia o Cheque, con referencia opcional (numero
-- de cheque o de transferencia). Histórico queda con NULL.
-- ============================================================

ALTER TABLE public.compromisos
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS referencia_pago text;

NOTIFY pgrst, 'reload schema';
