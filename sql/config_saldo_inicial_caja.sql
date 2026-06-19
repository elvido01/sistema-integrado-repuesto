-- Saldo inicial de caja para el cálculo de efectivo real en Dashboard (Inicio).
-- Se usa como base y luego se ajusta con movimientos de caja reales.

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS saldo_inicial_caja NUMERIC DEFAULT 0;

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS caja_historial_desde DATE DEFAULT DATE '1970-01-01';

ALTER TABLE public.config_empresa
  ALTER COLUMN saldo_inicial_caja SET DEFAULT 0;

ALTER TABLE public.config_empresa
  ALTER COLUMN caja_historial_desde SET DEFAULT DATE '1970-01-01';

UPDATE public.config_empresa
SET
  saldo_inicial_caja = COALESCE(saldo_inicial_caja, 0),
  caja_historial_desde = COALESCE(caja_historial_desde, DATE '1970-01-01');

-- Corte de caja para Repuestos Morla:
-- desde esta fecha el Dashboard ignora el historial viejo y calcula:
-- saldo_inicial_caja + ventas contado + recibos - pagos - compras contado.
UPDATE public.config_empresa
SET caja_historial_desde = CURRENT_DATE
WHERE nombre ILIKE '%morla%';

COMMENT ON COLUMN public.config_empresa.saldo_inicial_caja IS
  'Saldo inicial de caja usado por el Dashboard para calcular efectivo real.';

COMMENT ON COLUMN public.config_empresa.caja_historial_desde IS
  'Fecha desde la que el Dashboard reconstruye la caja historica a partir del saldo inicial.';
