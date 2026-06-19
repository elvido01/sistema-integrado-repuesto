-- Mantiene las notas/comentarios del pedido cuando se convierte en factura.
-- Idempotente: se puede ejecutar varias veces sin romper la tabla.

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS notas text;

COMMENT ON COLUMN public.facturas.notas IS
  'Notas y comentarios visibles en la factura, incluyendo las heredadas desde pedidos.';
