-- ============================================================
-- Captut Pro - guardar video fuente en Storage
-- ============================================================
-- Ejecutar despues de ai_captut_pro_module.sql y ai_captut_pro_storage.sql.
-- Permite reabrir proyectos sin reimportar el archivo local.
-- ============================================================

ALTER TABLE public.captut_video_projects
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_path TEXT;

COMMENT ON COLUMN public.captut_video_projects.source_url IS
  'URL publica del video fuente subido al bucket captut-pro.';

COMMENT ON COLUMN public.captut_video_projects.source_path IS
  'Ruta interna del video fuente dentro del bucket captut-pro.';
