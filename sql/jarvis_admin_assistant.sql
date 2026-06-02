-- ============================================================
-- Jarvis admin assistant
-- Disponible solo para administradores de tenants Enterprise.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jarvis_admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  input_text TEXT NOT NULL,
  answer_text TEXT,
  intent TEXT,
  provider TEXT,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_admin_logs_tenant_created
  ON public.jarvis_admin_logs (tenant_id, created_at DESC);

ALTER TABLE public.jarvis_admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jarvis_admin_logs_tenant ON public.jarvis_admin_logs;
CREATE POLICY jarvis_admin_logs_tenant ON public.jarvis_admin_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.is_superadmin = TRUE)
    )
  );

GRANT SELECT ON public.jarvis_admin_logs TO authenticated;
