-- ============================================================
-- Fix RLS para brand_kit + bucket designs
-- ============================================================
-- Hace las policies mas permisivas: cualquier usuario autenticado
-- puede leer/escribir el brand_kit y subir al bucket de disen~os.
-- Aplicar cuando get_user_tenant() no retorna el tenant esperado
-- para el usuario activo.
-- ============================================================

-- 1) BRAND KIT
DROP POLICY IF EXISTS brand_kit_tenant_rw ON public.brand_kit;
DROP POLICY IF EXISTS brand_kit_rw_all ON public.brand_kit;
CREATE POLICY brand_kit_rw_all ON public.brand_kit
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2) STORAGE bucket 'designs'
DROP POLICY IF EXISTS "designs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "designs_authenticated_write" ON storage.objects;
DROP POLICY IF EXISTS "designs_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "designs_authenticated_delete" ON storage.objects;

CREATE POLICY "designs_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'designs');

CREATE POLICY "designs_authenticated_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'designs');

CREATE POLICY "designs_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'designs')
  WITH CHECK (bucket_id = 'designs');

CREATE POLICY "designs_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'designs');
