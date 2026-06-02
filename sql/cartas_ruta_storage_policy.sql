-- ============================================================
-- Storage policy para imágenes de Carta de Ruta
-- ============================================================
-- Permite a usuarios autenticados subir/actualizar/borrar imágenes
-- SOLO en la carpeta cartas-ruta/<tenant_id>/ del bucket
-- product-images, con aislamiento por tenant.
-- La lectura ya está cubierta por public_view_product_images.
--
-- Estructura de ruta: cartas-ruta/<tenant_id>/carta_<ts>.<ext>
--   foldername[1] = 'cartas-ruta'
--   foldername[2] = tenant_id
-- ============================================================

DROP POLICY IF EXISTS "cartas_ruta_storage_insert" ON storage.objects;
CREATE POLICY "cartas_ruta_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'cartas-ruta'
    AND (storage.foldername(name))[2]::uuid = public.get_user_tenant()
  );

DROP POLICY IF EXISTS "cartas_ruta_storage_update" ON storage.objects;
CREATE POLICY "cartas_ruta_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'cartas-ruta'
    AND (storage.foldername(name))[2]::uuid = public.get_user_tenant()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'cartas-ruta'
    AND (storage.foldername(name))[2]::uuid = public.get_user_tenant()
  );

DROP POLICY IF EXISTS "cartas_ruta_storage_delete" ON storage.objects;
CREATE POLICY "cartas_ruta_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'cartas-ruta'
    AND (storage.foldername(name))[2]::uuid = public.get_user_tenant()
  );

-- Verificación
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname LIKE 'cartas_ruta_storage%'
ORDER BY policyname;
