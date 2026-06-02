-- Permite crear solicitudes libres en Suplidor Virtual sin producto creado.
-- Ejecutar una vez en Supabase.

ALTER TABLE public.suplidor_virtual_items
  ALTER COLUMN producto_id DROP NOT NULL;

COMMENT ON COLUMN public.suplidor_virtual_items.producto_id IS
  'Producto relacionado. Puede ser NULL cuando la fila es una nota libre de producto no creado.';
