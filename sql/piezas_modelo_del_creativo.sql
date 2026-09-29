-- Las piezas modelo del dueño: el listón de estilo que GPT Image 2 mira en
-- cada escena del Comercial-Creativo (supabase/functions/creativo-escena).
-- 29/09/2026: el dueño comparó lo que salía con sus piezas hechas en ChatGPT
-- (tambor, amortiguador, casco, candado...) y pidió poder "subirle modelos".
--
-- Bucket privado, una carpeta por empresa (<tenant_id>/archivo.png). La
-- función de la escena entra con la service key; desde la pantalla, solo el
-- dueño de Equipo IA ve y cambia las de SU empresa.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipo-estilo', 'equipo-estilo', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS equipo_estilo_ver ON storage.objects;
CREATE POLICY equipo_estilo_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipo-estilo'
         AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND public.equipo_ia_permitido());

DROP POLICY IF EXISTS equipo_estilo_subir ON storage.objects;
CREATE POLICY equipo_estilo_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipo-estilo'
              AND (storage.foldername(name))[1] = public.get_user_tenant()::text
              AND public.equipo_ia_permitido());

DROP POLICY IF EXISTS equipo_estilo_borrar ON storage.objects;
CREATE POLICY equipo_estilo_borrar ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipo-estilo'
         AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND public.equipo_ia_permitido());

SELECT public.registrar_migracion('piezas_modelo_del_creativo.sql');

-- ===== VERIFICACION =====
SELECT b.id, b.public,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname LIKE 'equipo_estilo_%') AS politicas
FROM storage.buckets b WHERE b.id = 'equipo-estilo';
