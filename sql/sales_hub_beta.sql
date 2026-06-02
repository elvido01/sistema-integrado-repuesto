-- ============================================================
-- Sales Hub beta
-- Omnicanal sobre el WhatsApp CRM existente.
-- Mantiene crm_whatsapp_* y crea una capa sales_* para WhatsApp,
-- Instagram DM y Facebook Messenger.
-- ============================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_sales_hub BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.crm_whatsapp_settings
  ADD COLUMN IF NOT EXISTS sales_hub_beta_mode BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sales_hub_generic_reply TEXT NOT NULL DEFAULT 'Gracias por escribirnos. Un vendedor verificara disponibilidad, precio y compatibilidad y te respondera en breve.';

CREATE TABLE IF NOT EXISTS public.sales_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'instagram', 'facebook', 'youtube')),
  account_name TEXT,
  external_account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, external_account_id)
);

CREATE TABLE IF NOT EXISTS public.sales_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.sales_channels(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'instagram', 'facebook', 'youtube')),
  external_conversation_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_external_id TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN (
    'nuevo',
    'pendiente_revision',
    'en_atencion',
    'esperando_cliente',
    'cotizando',
    'cotizacion_enviada',
    'seguimiento',
    'seguimiento_futuro',
    'cerrado',
    'perdido'
  )),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_score INTEGER NOT NULL DEFAULT 0,
  intent TEXT,
  bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  crm_whatsapp_conversation_id UUID REFERENCES public.crm_whatsapp_conversations(id) ON DELETE SET NULL,
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_user_message_at TIMESTAMPTZ,
  last_agent_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS public.sales_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'instagram', 'facebook', 'youtube')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'assistant', 'agent', 'system')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'audio', 'image', 'video', 'document', 'sticker', 'unknown')),
  message_text TEXT,
  media_url TEXT,
  external_message_id TEXT,
  crm_whatsapp_message_id UUID REFERENCES public.crm_whatsapp_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, external_message_id)
);

CREATE TABLE IF NOT EXISTS public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.sales_conversations(id) ON DELETE SET NULL,
  cliente_nombre TEXT,
  cliente_contacto TEXT,
  canal TEXT,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN (
    'nuevo',
    'pendiente_revision',
    'en_atencion',
    'esperando_cliente',
    'cotizando',
    'cotizacion_enviada',
    'seguimiento',
    'cerrado',
    'perdido'
  )),
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
  score INTEGER NOT NULL DEFAULT 0,
  resumen TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'new_message',
  title TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_ai_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.sales_messages(id) ON DELETE SET NULL,
  platform TEXT,
  detected_intent TEXT,
  customer_message TEXT,
  bot_reply TEXT,
  human_reply TEXT,
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_channels_tenant ON public.sales_channels(tenant_id, platform, status);
CREATE INDEX IF NOT EXISTS idx_sales_conversations_tenant ON public.sales_conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_conversations_platform ON public.sales_conversations(tenant_id, platform, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_conversations_status ON public.sales_conversations(tenant_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_messages_conversation ON public.sales_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_notifications_tenant ON public.sales_notifications(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_tenant ON public.sales_leads(tenant_id, estado, created_at DESC);

ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_ai_training_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_channels_tenant ON public.sales_channels;
CREATE POLICY sales_channels_tenant ON public.sales_channels
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS sales_conversations_tenant ON public.sales_conversations;
CREATE POLICY sales_conversations_tenant ON public.sales_conversations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS sales_messages_tenant ON public.sales_messages;
CREATE POLICY sales_messages_tenant ON public.sales_messages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS sales_leads_tenant ON public.sales_leads;
CREATE POLICY sales_leads_tenant ON public.sales_leads
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS sales_notifications_tenant ON public.sales_notifications;
CREATE POLICY sales_notifications_tenant ON public.sales_notifications
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS sales_ai_training_logs_tenant ON public.sales_ai_training_logs;
CREATE POLICY sales_ai_training_logs_tenant ON public.sales_ai_training_logs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE OR REPLACE FUNCTION public.sales_detect_basic_intent(_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t TEXT := lower(coalesce(_text, ''));
BEGIN
  IF t ~ 'precio|cu[aá]nto|cotiza|cotizaci[oó]n' THEN
    RETURN 'precio_cotizacion';
  ELSIF t ~ 'disponible|tiene|tienes|hay|existencia|stock' THEN
    RETURN 'disponibilidad';
  ELSIF t ~ 'compatible|le cae|sirve|modelo|a[nñ]o' THEN
    RETURN 'compatibilidad';
  ELSIF t ~ 'env[ií]o|delivery|mandar|ubicaci[oó]n|direcci[oó]n' THEN
    RETURN 'envio_ubicacion';
  ELSIF t ~ 'garant[ií]a|cambio|devoluci[oó]n' THEN
    RETURN 'garantia';
  END IF;
  RETURN 'general';
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.sales_conversations
  SET last_message_at = NEW.created_at,
      last_user_message_at = CASE WHEN NEW.sender_type = 'user' THEN NEW.created_at ELSE last_user_message_at END,
      last_agent_message_at = CASE WHEN NEW.sender_type IN ('assistant', 'agent') THEN NEW.created_at ELSE last_agent_message_at END,
      last_message_preview = LEFT(COALESCE(NEW.message_text, NEW.message_type), 180),
      intent = COALESCE(intent, CASE WHEN NEW.sender_type = 'user' THEN public.sales_detect_basic_intent(NEW.message_text) ELSE intent END),
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_touch_conversation ON public.sales_messages;
CREATE TRIGGER trg_sales_touch_conversation
AFTER INSERT ON public.sales_messages
FOR EACH ROW EXECUTE FUNCTION public.sales_touch_conversation();

CREATE OR REPLACE VIEW public.sales_conversations_view AS
SELECT
  c.*,
  COALESCE(m.messages_count, 0)::INTEGER AS messages_count,
  COALESCE(l.leads_count, 0)::INTEGER AS leads_count,
  q.numero AS cotizacion_numero,
  q.estado AS cotizacion_estado,
  q.estado_comercial AS cotizacion_estado_comercial,
  q.total_cotizacion
FROM public.sales_conversations c
LEFT JOIN public.cotizaciones q ON q.id = c.cotizacion_id
LEFT JOIN (
  SELECT conversation_id, COUNT(*) AS messages_count
  FROM public.sales_messages
  GROUP BY conversation_id
) m ON m.conversation_id = c.id
LEFT JOIN (
  SELECT conversation_id, COUNT(*) AS leads_count
  FROM public.sales_leads
  GROUP BY conversation_id
) l ON l.conversation_id = c.id;

GRANT SELECT ON public.sales_conversations_view TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_sync_whatsapp_message(_message_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  conv RECORD;
  contact RECORD;
  account_name TEXT;
  account_external_id TEXT;
  channel_id UUID;
  sales_conv_id UUID;
  sales_msg_id UUID;
  media_type TEXT;
  media_url TEXT;
BEGIN
  SELECT * INTO m FROM public.crm_whatsapp_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO conv FROM public.crm_whatsapp_conversations WHERE id = m.conversation_id;
  SELECT * INTO contact FROM public.crm_whatsapp_contacts WHERE id = m.contact_id;
  SELECT
    COALESCE(display_phone_number, 'WhatsApp'),
    COALESCE(phone_number_id, display_phone_number, 'whatsapp-' || m.tenant_id::text)
  INTO account_name, account_external_id
  FROM public.crm_whatsapp_settings
  WHERE tenant_id = m.tenant_id;

  account_name := COALESCE(account_name, 'WhatsApp');
  account_external_id := COALESCE(account_external_id, 'whatsapp-' || m.tenant_id::text);

  media_type := COALESCE(m.metadata->>'media_type', 'text');
  media_url := m.metadata->>'media_url';

  INSERT INTO public.sales_channels (tenant_id, platform, account_name, external_account_id, metadata)
  VALUES (
    m.tenant_id,
    'whatsapp',
    account_name,
    account_external_id,
    '{"source":"crm_whatsapp"}'::jsonb
  )
  ON CONFLICT (tenant_id, platform, external_account_id)
  DO UPDATE SET updated_at = NOW()
  RETURNING id INTO channel_id;

  INSERT INTO public.sales_conversations (
    tenant_id,
    channel_id,
    platform,
    external_conversation_id,
    customer_name,
    customer_phone,
    customer_external_id,
    status,
    assigned_to,
    intent,
    bot_enabled,
    crm_whatsapp_conversation_id,
    cotizacion_id,
    last_message_at,
    last_user_message_at,
    last_agent_message_at,
    last_message_preview,
    metadata
  )
  VALUES (
    conv.tenant_id,
    channel_id,
    'whatsapp',
    conv.id::text,
    contact.name,
    contact.phone,
    COALESCE(contact.wa_id, contact.phone),
    CASE
      WHEN conv.status IN ('cerrada', 'venta_cerrada') THEN 'cerrado'
      WHEN conv.status = 'venta_perdida' THEN 'perdido'
      WHEN conv.status IN ('seguimiento_futuro', 'esperando_cliente') THEN 'seguimiento'
      WHEN conv.status IN ('cotizando', 'cotizacion_enviada') THEN conv.status
      WHEN conv.status = 'en_atencion' THEN 'en_atencion'
      ELSE 'nuevo'
    END,
    conv.assigned_user_id,
    COALESCE(conv.intent, public.sales_detect_basic_intent(m.content)),
    conv.bot_enabled,
    conv.id,
    conv.cotizacion_id,
    conv.last_message_at,
    conv.last_user_message_at,
    conv.last_assistant_message_at,
    conv.last_message_preview,
    jsonb_build_object('source', 'crm_whatsapp')
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id)
  DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    customer_phone = EXCLUDED.customer_phone,
    customer_external_id = EXCLUDED.customer_external_id,
    status = EXCLUDED.status,
    assigned_to = EXCLUDED.assigned_to,
    intent = COALESCE(public.sales_conversations.intent, EXCLUDED.intent),
    bot_enabled = EXCLUDED.bot_enabled,
    cotizacion_id = EXCLUDED.cotizacion_id,
    last_message_at = EXCLUDED.last_message_at,
    last_user_message_at = EXCLUDED.last_user_message_at,
    last_agent_message_at = EXCLUDED.last_agent_message_at,
    last_message_preview = EXCLUDED.last_message_preview,
    updated_at = NOW()
  RETURNING id INTO sales_conv_id;

  INSERT INTO public.sales_messages (
    tenant_id,
    conversation_id,
    platform,
    sender_type,
    message_type,
    message_text,
    media_url,
    external_message_id,
    crm_whatsapp_message_id,
    status,
    raw_data,
    created_at
  )
  VALUES (
    m.tenant_id,
    sales_conv_id,
    'whatsapp',
    m.role,
    CASE WHEN media_type IN ('audio', 'image', 'video', 'document', 'sticker') THEN media_type ELSE 'text' END,
    m.content,
    media_url,
    m.whatsapp_message_id,
    m.id,
    m.status,
    m.metadata,
    m.created_at
  )
  ON CONFLICT (tenant_id, platform, external_message_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    raw_data = EXCLUDED.raw_data
  RETURNING id INTO sales_msg_id;

  IF m.role = 'user' THEN
    INSERT INTO public.sales_leads (
      tenant_id,
      conversation_id,
      cliente_nombre,
      cliente_contacto,
      canal,
      estado,
      prioridad,
      score,
      resumen,
      metadata
    )
    VALUES (
      m.tenant_id,
      sales_conv_id,
      contact.name,
      contact.phone,
      'whatsapp',
      'nuevo',
      CASE WHEN public.sales_detect_basic_intent(m.content) IN ('precio_cotizacion', 'disponibilidad') THEN 'alta' ELSE 'media' END,
      CASE WHEN public.sales_detect_basic_intent(m.content) IN ('precio_cotizacion', 'disponibilidad') THEN 70 ELSE 30 END,
      LEFT(m.content, 240),
      jsonb_build_object('source_message_id', m.id)
    );

    INSERT INTO public.sales_notifications (
      tenant_id,
      conversation_id,
      type,
      title,
      message,
      assigned_to
    )
    VALUES (
      m.tenant_id,
      sales_conv_id,
      'new_message',
      'Nuevo mensaje en WhatsApp',
      LEFT(m.content, 180),
      conv.assigned_user_id
    );
  END IF;

  INSERT INTO public.sales_ai_training_logs (
    tenant_id,
    conversation_id,
    message_id,
    platform,
    detected_intent,
    customer_message,
    bot_reply,
    metadata
  )
  VALUES (
    m.tenant_id,
    sales_conv_id,
    sales_msg_id,
    'whatsapp',
    public.sales_detect_basic_intent(m.content),
    CASE WHEN m.role = 'user' THEN m.content ELSE NULL END,
    CASE WHEN m.role = 'assistant' THEN m.content ELSE NULL END,
    jsonb_build_object('source', 'crm_whatsapp')
  );

  RETURN sales_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_sync_whatsapp_message_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sales_sync_whatsapp_message(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sales_sync_whatsapp_message failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_sync_whatsapp_message ON public.crm_whatsapp_messages;
CREATE TRIGGER trg_sales_sync_whatsapp_message
AFTER INSERT ON public.crm_whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.sales_sync_whatsapp_message_trigger();

INSERT INTO public.sales_channels (tenant_id, platform, account_name, external_account_id, metadata)
SELECT
  tenant_id,
  'whatsapp',
  COALESCE(display_phone_number, 'WhatsApp'),
  COALESCE(phone_number_id, display_phone_number, 'whatsapp-' || tenant_id::text),
  '{"source":"crm_whatsapp_settings"}'::jsonb
FROM public.crm_whatsapp_settings
WHERE COALESCE(phone_number_id, display_phone_number) IS NOT NULL
ON CONFLICT (tenant_id, platform, external_account_id) DO NOTHING;

SELECT public.sales_sync_whatsapp_message(id)
FROM public.crm_whatsapp_messages
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_messages sm
  WHERE sm.crm_whatsapp_message_id = crm_whatsapp_messages.id
);
