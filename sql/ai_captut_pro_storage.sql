-- ============================================================
-- Storage para Captut Pro
-- ============================================================
-- Bucket publico para thumbnails y renders finales.
-- Rutas esperadas:
--   <tenant_id>/<project_id>/thumb.png
--   <tenant_id>/<project_id>/render_<timestamp>.mp4|webm
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'captut-pro',
  'captut-pro',
  true,
  524288000,
  ARRAY['image/png','image/jpeg','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "captut_pro_public_read" ON storage.objects;
CREATE POLICY "captut_pro_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'captut-pro');

DROP POLICY IF EXISTS "captut_pro_tenant_insert" ON storage.objects;
CREATE POLICY "captut_pro_tenant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'captut-pro'
  AND (storage.foldername(name))[1] = public.get_user_tenant()::text
);

DROP POLICY IF EXISTS "captut_pro_tenant_update" ON storage.objects;
CREATE POLICY "captut_pro_tenant_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'captut-pro'
  AND (storage.foldername(name))[1] = public.get_user_tenant()::text
)
WITH CHECK (
  bucket_id = 'captut-pro'
  AND (storage.foldername(name))[1] = public.get_user_tenant()::text
);

DROP POLICY IF EXISTS "captut_pro_tenant_delete" ON storage.objects;
CREATE POLICY "captut_pro_tenant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'captut-pro'
  AND (storage.foldername(name))[1] = public.get_user_tenant()::text
);
