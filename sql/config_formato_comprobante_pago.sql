-- Formato del comprobante que se imprime al pagar compromisos desde el dashboard
-- (Compromisos a Pagar y Compromisos Suplidores).
-- Valores: 'pdf' (carta 8.5x11), 'pos_4inch' (ticket 4 pulgadas), 'pos_80mm' (ticket 80mm).

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS formato_comprobante_pago TEXT DEFAULT 'pdf';

UPDATE public.config_empresa
SET formato_comprobante_pago = COALESCE(formato_comprobante_pago, 'pdf');

COMMENT ON COLUMN public.config_empresa.formato_comprobante_pago IS
  'Formato del comprobante de pago: pdf | pos_4inch | pos_80mm.';
