-- Configuracion por tenant para descuentos automaticos de Precio 2 y Precio 3.
-- Estos porcentajes son internos; no afectan DGII, NCF, e-CF ni calculo fiscal.

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS precio2_descuento_pct NUMERIC(6,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS precio3_descuento_pct NUMERIC(6,2) DEFAULT 15;

UPDATE public.config_empresa
SET
  precio2_descuento_pct = COALESCE(precio2_descuento_pct, 10),
  precio3_descuento_pct = COALESCE(precio3_descuento_pct, 15);

COMMENT ON COLUMN public.config_empresa.precio2_descuento_pct IS
  'Descuento automatico aplicado a P1 para calcular Precio 2.';

COMMENT ON COLUMN public.config_empresa.precio3_descuento_pct IS
  'Descuento automatico aplicado a P1 para calcular Precio 3.';
