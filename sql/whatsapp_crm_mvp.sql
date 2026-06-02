-- ============================================================
-- WhatsApp CRM MVP
-- Inbox multi-tenant, mensajes, items sugeridos para cotizar y
-- configuracion por tenant.
-- ============================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_crm_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT UNIQUE,
  display_phone_number TEXT,
  bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  business_hours JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","timezone":"America/Santo_Domingo"}'::jsonb,
  system_prompt TEXT NOT NULL DEFAULT 'Eres un asistente de ventas para una tienda de repuestos de motocicletas en Republica Dominicana. Responde breve, claro y sin inventar precios ni existencia.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  wa_id TEXT,
  name TEXT,
  lead_score TEXT NOT NULL DEFAULT 'sin_calificar'
    CHECK (lead_score IN ('hot', 'warm', 'cold', 'sin_calificar')),
  source TEXT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_whatsapp_contacts(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'abierta'
    CHECK (status IN ('abierta', 'esperando_cliente', 'cotizando', 'cerrada')),
  intent TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_user_message_at TIMESTAMPTZ,
  last_assistant_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_incoming_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  last_message_direction TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.crm_whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_whatsapp_contacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'agent', 'system')),
  content TEXT NOT NULL,
  whatsapp_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.crm_whatsapp_conversations(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  codigo TEXT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  itbis_pct NUMERIC NOT NULL DEFAULT 0.18,
  existencia NUMERIC,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  source_message_id UUID REFERENCES public.crm_whatsapp_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.crm_whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_incoming_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_direction TEXT,
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.crm_whatsapp_conversations
  ALTER COLUMN bot_enabled SET DEFAULT FALSE;

UPDATE public.crm_whatsapp_conversations
SET bot_enabled = FALSE
WHERE bot_enabled = TRUE;

CREATE OR REPLACE FUNCTION public.crm_whatsapp_phone_key(phone_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN LENGTH(regexp_replace(COALESCE(phone_value, ''), '\D', '', 'g')) = 11
      AND LEFT(regexp_replace(COALESCE(phone_value, ''), '\D', '', 'g'), 1) = '1'
    THEN SUBSTRING(regexp_replace(COALESCE(phone_value, ''), '\D', '', 'g') FROM 2)
    ELSE regexp_replace(COALESCE(phone_value, ''), '\D', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION public.crm_whatsapp_canonical_phone(phone_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN LENGTH(public.crm_whatsapp_phone_key(phone_value)) = 10
    THEN '1' || public.crm_whatsapp_phone_key(phone_value)
    ELSE public.crm_whatsapp_phone_key(phone_value)
  END
$$;

DO $$
DECLARE
  dup RECORD;
  keep_contact UUID;
  keep_conversation UUID;
BEGIN
  FOR dup IN
    SELECT tenant_id, public.crm_whatsapp_phone_key(phone) AS phone_key
    FROM public.crm_whatsapp_contacts
    WHERE public.crm_whatsapp_phone_key(phone) <> ''
    GROUP BY tenant_id, public.crm_whatsapp_phone_key(phone)
    HAVING COUNT(*) > 1
  LOOP
    SELECT id
    INTO keep_contact
    FROM public.crm_whatsapp_contacts
    WHERE tenant_id = dup.tenant_id
      AND public.crm_whatsapp_phone_key(phone) = dup.phone_key
    ORDER BY
      (cliente_id IS NOT NULL) DESC,
      (name IS NOT NULL AND name !~ '^[0-9+ ()-]+$') DESC,
      updated_at DESC NULLS LAST,
      created_at DESC NULLS LAST
    LIMIT 1;

    SELECT c.id
    INTO keep_conversation
    FROM public.crm_whatsapp_conversations c
    JOIN public.crm_whatsapp_contacts ct ON ct.id = c.contact_id
    WHERE ct.tenant_id = dup.tenant_id
      AND public.crm_whatsapp_phone_key(ct.phone) = dup.phone_key
    ORDER BY
      (c.contact_id = keep_contact) DESC,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC NULLS LAST
    LIMIT 1;

    IF keep_contact IS NULL OR keep_conversation IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.crm_whatsapp_messages m
    SET conversation_id = keep_conversation,
        contact_id = keep_contact
    WHERE m.tenant_id = dup.tenant_id
      AND (
        m.conversation_id IN (
          SELECT c.id
          FROM public.crm_whatsapp_conversations c
          JOIN public.crm_whatsapp_contacts ct ON ct.id = c.contact_id
          WHERE ct.tenant_id = dup.tenant_id
            AND public.crm_whatsapp_phone_key(ct.phone) = dup.phone_key
        )
        OR m.contact_id IN (
          SELECT id
          FROM public.crm_whatsapp_contacts
          WHERE tenant_id = dup.tenant_id
            AND public.crm_whatsapp_phone_key(phone) = dup.phone_key
        )
      );

    UPDATE public.crm_whatsapp_quote_items qi
    SET conversation_id = keep_conversation
    WHERE qi.tenant_id = dup.tenant_id
      AND qi.conversation_id IN (
        SELECT c.id
        FROM public.crm_whatsapp_conversations c
        JOIN public.crm_whatsapp_contacts ct ON ct.id = c.contact_id
        WHERE ct.tenant_id = dup.tenant_id
          AND public.crm_whatsapp_phone_key(ct.phone) = dup.phone_key
      );

    IF to_regclass('public.sales_conversations') IS NOT NULL THEN
      UPDATE public.sales_conversations sc
      SET crm_whatsapp_conversation_id = keep_conversation
      WHERE sc.tenant_id = dup.tenant_id
        AND sc.crm_whatsapp_conversation_id IN (
          SELECT c.id
          FROM public.crm_whatsapp_conversations c
          JOIN public.crm_whatsapp_contacts ct ON ct.id = c.contact_id
          WHERE ct.tenant_id = dup.tenant_id
            AND public.crm_whatsapp_phone_key(ct.phone) = dup.phone_key
        );
    END IF;

    DELETE FROM public.crm_whatsapp_conversations c
    USING public.crm_whatsapp_contacts ct
    WHERE c.contact_id = ct.id
      AND ct.tenant_id = dup.tenant_id
      AND public.crm_whatsapp_phone_key(ct.phone) = dup.phone_key
      AND c.id <> keep_conversation;

    UPDATE public.crm_whatsapp_conversations
    SET contact_id = keep_contact
    WHERE id = keep_conversation;

    DELETE FROM public.crm_whatsapp_contacts
    WHERE tenant_id = dup.tenant_id
      AND public.crm_whatsapp_phone_key(phone) = dup.phone_key
      AND id <> keep_contact;

    UPDATE public.crm_whatsapp_contacts
    SET phone = public.crm_whatsapp_canonical_phone(phone),
        updated_at = NOW()
    WHERE id = keep_contact;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_wa_contacts_tenant ON public.crm_whatsapp_contacts(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_wa_conversations_tenant ON public.crm_whatsapp_conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_wa_messages_conversation ON public.crm_whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_wa_messages_wamid ON public.crm_whatsapp_messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_wa_quote_items_conv ON public.crm_whatsapp_quote_items(conversation_id, selected);

ALTER TABLE public.crm_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_whatsapp_quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_wa_settings_tenant ON public.crm_whatsapp_settings;
CREATE POLICY crm_wa_settings_tenant ON public.crm_whatsapp_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS crm_wa_contacts_tenant ON public.crm_whatsapp_contacts;
CREATE POLICY crm_wa_contacts_tenant ON public.crm_whatsapp_contacts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS crm_wa_conversations_tenant ON public.crm_whatsapp_conversations;
CREATE POLICY crm_wa_conversations_tenant ON public.crm_whatsapp_conversations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS crm_wa_messages_tenant ON public.crm_whatsapp_messages;
CREATE POLICY crm_wa_messages_tenant ON public.crm_whatsapp_messages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS crm_wa_quote_items_tenant ON public.crm_whatsapp_quote_items;
CREATE POLICY crm_wa_quote_items_tenant ON public.crm_whatsapp_quote_items
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE OR REPLACE FUNCTION public.crm_whatsapp_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.crm_whatsapp_conversations
  SET last_message_at = NEW.created_at,
      last_user_message_at = CASE WHEN NEW.role = 'user' THEN NEW.created_at ELSE last_user_message_at END,
      last_assistant_message_at = CASE WHEN NEW.role IN ('assistant', 'agent') THEN NEW.created_at ELSE last_assistant_message_at END,
      last_incoming_at = CASE WHEN NEW.role = 'user' THEN NEW.created_at ELSE last_incoming_at END,
      last_message_direction = CASE WHEN NEW.role = 'user' THEN 'incoming' ELSE 'outgoing' END,
      unread_count = CASE WHEN NEW.role = 'user' THEN COALESCE(unread_count, 0) + 1 ELSE unread_count END,
      last_message_preview = LEFT(NEW.content, 180),
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_whatsapp_touch_conversation ON public.crm_whatsapp_messages;
CREATE TRIGGER trg_crm_whatsapp_touch_conversation
AFTER INSERT ON public.crm_whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.crm_whatsapp_touch_conversation();

DROP VIEW IF EXISTS public.crm_whatsapp_conversations_view;

CREATE VIEW public.crm_whatsapp_conversations_view AS
SELECT
  c.id,
  c.tenant_id,
  c.contact_id,
  c.assigned_user_id,
  c.bot_enabled,
  c.status,
  c.intent,
  c.last_message_at,
  c.last_user_message_at,
  c.last_assistant_message_at,
  c.last_message_preview,
  c.cotizacion_id,
  ct.phone,
  ct.name AS contact_name,
  ct.lead_score,
  ct.blocked,
  ct.cliente_id,
  cli.nombre AS cliente_nombre,
  COALESCE(q.items_count, 0)::INTEGER AS quote_items_count,
  COALESCE(q.quote_total, 0)::NUMERIC AS quote_total,
  cli.telefono AS cliente_telefono,
  cli.logo_url AS cliente_logo_url,
  c.unread_count,
  c.last_incoming_at,
  c.last_read_at,
  c.last_message_direction
FROM public.crm_whatsapp_conversations c
JOIN public.crm_whatsapp_contacts ct ON ct.id = c.contact_id
LEFT JOIN LATERAL (
  SELECT cli_match.*
  FROM public.clientes cli_match
  WHERE cli_match.tenant_id = c.tenant_id
    AND (
      cli_match.id = ct.cliente_id
      OR (
        CASE
          WHEN LENGTH(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g')) = 11
            AND LEFT(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g'), 1) = '1'
          THEN SUBSTRING(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g') FROM 2)
          ELSE regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g')
        END
        =
        CASE
          WHEN LENGTH(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')) = 11
            AND LEFT(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g'), 1) = '1'
          THEN SUBSTRING(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g') FROM 2)
          ELSE regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')
        END
      )
    )
  ORDER BY (
    CASE
      WHEN LENGTH(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g')) = 11
        AND LEFT(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g'), 1) = '1'
      THEN SUBSTRING(regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g') FROM 2)
      ELSE regexp_replace(COALESCE(cli_match.telefono, ''), '\D', '', 'g')
    END
    =
    CASE
      WHEN LENGTH(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')) = 11
        AND LEFT(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g'), 1) = '1'
      THEN SUBSTRING(regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g') FROM 2)
      ELSE regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g')
    END
  ) DESC,
  (cli_match.id = ct.cliente_id) DESC,
  cli_match.updated_at DESC NULLS LAST
  LIMIT 1
) cli ON TRUE
LEFT JOIN (
  SELECT conversation_id, COUNT(*) AS items_count, SUM(cantidad * precio_unitario) AS quote_total
  FROM public.crm_whatsapp_quote_items
  WHERE selected = TRUE
  GROUP BY conversation_id
) q ON q.conversation_id = c.id;

GRANT SELECT ON public.crm_whatsapp_conversations_view TO authenticated;

-- Edge Function:
--   supabase functions deploy whatsapp-crm-webhook --no-verify-jwt
-- Secrets:
--   WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
