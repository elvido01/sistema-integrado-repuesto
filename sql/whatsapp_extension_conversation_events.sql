-- ============================================================
-- WhatsApp extension conversation events
-- Registra eventos comerciales manuales desde la extension de
-- WhatsApp Web para alimentar memoria, seguimiento y futuro bot.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID DEFAULT auth.uid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'whatsapp_web_extension',
  -- event_type es texto libre (la app controla los valores). Antes tenia
  -- un CHECK enumerado que rompia al agregar eventos nuevos (cobranza).
  event_type TEXT NOT NULL,
  chat_id TEXT,
  chat_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT,
  note TEXT,
  quote_total NUMERIC DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Si la tabla ya existia con el CHECK viejo (p.ej. en DEV), lo quitamos
-- para permitir los event_type nuevos de cobranza.
ALTER TABLE public.crm_whatsapp_conversation_events
  DROP CONSTRAINT IF EXISTS crm_whatsapp_conversation_events_event_type_check;

CREATE INDEX IF NOT EXISTS idx_crm_wa_events_tenant_created
  ON public.crm_whatsapp_conversation_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_wa_events_chat
  ON public.crm_whatsapp_conversation_events (tenant_id, chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_wa_events_type
  ON public.crm_whatsapp_conversation_events (tenant_id, event_type, created_at DESC);

ALTER TABLE public.crm_whatsapp_conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_wa_events_tenant ON public.crm_whatsapp_conversation_events;
CREATE POLICY crm_wa_events_tenant ON public.crm_whatsapp_conversation_events
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE ON public.crm_whatsapp_conversation_events TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'crm_whatsapp_conversation_events listo (event_type sin CHECK)' AS status;
