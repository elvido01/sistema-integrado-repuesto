-- ============================================================
-- Meta webhook event log
-- ============================================================
-- Guarda cada POST recibido desde Meta para diagnosticar Instagram DM
-- y Facebook Messenger sin depender solo de los logs del dashboard.

CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  object_type TEXT,
  platform TEXT CHECK (platform IN ('instagram', 'facebook')),
  entry_id TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.sales_channels(id) ON DELETE SET NULL,
  social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'unknown',
  sender_id TEXT,
  recipient_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'unmatched_account', 'error')),
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_received
  ON public.meta_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_tenant
  ON public.meta_webhook_events(tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_entry
  ON public.meta_webhook_events(platform, entry_id, received_at DESC);

ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_webhook_events_tenant_or_admin ON public.meta_webhook_events;
CREATE POLICY meta_webhook_events_tenant_or_admin ON public.meta_webhook_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_superadmin = true
    )
  );

GRANT SELECT ON public.meta_webhook_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_webhook_events TO service_role;
