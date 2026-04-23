-- ============================================================
-- Agregar columna kilometraje a productos
-- ============================================================
-- Necesario para Caminero Motors (dealer de motocicletas).
-- El formulario muestra el campo cuando el tenant tiene
-- campos de vehículo activados; el INSERT/UPDATE fallaba con
-- "Could not find the 'kilometraje' column of 'productos'".
-- ============================================================

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS kilometraje integer;

-- Forzar refresco del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
