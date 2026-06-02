-- ============================================================
-- Modulo Captut Pro para MORLA AI CEO - ENTERPRISE
-- ============================================================
-- Guarda proyectos de edicion de video por tenant.
-- Nota: por seguridad del navegador, el JSON guarda metadata del archivo
-- fuente y las decisiones de edicion, no el archivo local original.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.captut_video_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL DEFAULT 'Video sin nombre',
  aspect        TEXT NOT NULL DEFAULT 'vertical' CHECK (aspect IN ('vertical','square','landscape')),
  duration      NUMERIC DEFAULT 0,
  source_name   TEXT,
  source_url    TEXT,
  source_path   TEXT,
  content       JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  rendered_url  TEXT,
  status        TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','renderizado','publicado','archivado')),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captut_video_projects_tenant
  ON public.captut_video_projects(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_captut_video_projects_status
  ON public.captut_video_projects(tenant_id, status, updated_at DESC);

ALTER TABLE public.captut_video_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS captut_video_projects_tenant_rw ON public.captut_video_projects;
CREATE POLICY captut_video_projects_tenant_rw ON public.captut_video_projects
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.captut_video_projects TO authenticated;
GRANT ALL ON public.captut_video_projects TO service_role;

CREATE OR REPLACE FUNCTION public.touch_captut_video_projects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_captut_video_projects_updated_at ON public.captut_video_projects;
CREATE TRIGGER trg_captut_video_projects_updated_at
  BEFORE UPDATE ON public.captut_video_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_captut_video_projects_updated_at();
