-- ============================================================
-- Carta de Ruta — campo de imagen
-- ============================================================
-- Permite adjuntar una imagen (foto de la moto, documento, etc.)
-- a la carta de ruta. Se ve en pantalla y se puede imprimir
-- individualmente. La imagen se sube al bucket 'product-images'
-- (carpeta cartas-ruta/) y aquí solo guardamos la URL pública.
--
-- Aplicar en PROD (donde vive Caminero Motors).
-- ============================================================

ALTER TABLE public.cartas_ruta
  ADD COLUMN IF NOT EXISTS imagen_url TEXT;

COMMENT ON COLUMN public.cartas_ruta.imagen_url IS
  'URL pública de imagen adjunta a la carta (foto moto/documento). Bucket product-images/cartas-ruta.';

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='cartas_ruta' AND column_name='imagen_url';
