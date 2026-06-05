-- ============================================================
-- Product Image Studio - Storage policies
-- ============================================================
-- El modulo guarda imagenes limpias de catalogo en el bucket
-- public product-images y actualiza productos.imagen_url.
--
-- Nota: el sistema ya usa product-images desde ProductBasicInfo y
-- Configuracion. Estas policies mantienen compatibilidad con esos
-- uploads existentes y con las nuevas rutas tenant_id/archivo.png.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_insert" ON storage.objects;
CREATE POLICY "product_images_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_update" ON storage.objects;
CREATE POLICY "product_images_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images')
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_delete" ON storage.objects;
CREATE POLICY "product_images_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
