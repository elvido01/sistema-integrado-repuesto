-- ============================================================
-- WhatsApp CRM - flujo comercial y seguimientos
-- Amplia los estados de conversacion sin romper el MVP existente.
-- ============================================================

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'crm_whatsapp_conversations'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.crm_whatsapp_conversations DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.crm_whatsapp_conversations
  ADD CONSTRAINT crm_whatsapp_conversations_status_check
  CHECK (status IN (
    'abierta',
    'esperando_cliente',
    'cotizando',
    'cerrada',
    'nuevo',
    'en_atencion',
    'cotizacion_enviada',
    'cliente_interesado',
    'pendiente_pago',
    'listo_facturar',
    'venta_cerrada',
    'venta_perdida',
    'producto_agotado',
    'seguimiento_futuro'
  ));

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS estado_comercial TEXT NOT NULL DEFAULT 'borrador'
  CHECK (estado_comercial IN (
    'borrador',
    'enviada',
    'aceptada',
    'convertida',
    'vencida',
    'cancelada',
    'perdida'
  ));

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

CREATE INDEX IF NOT EXISTS idx_crm_wa_conversations_status
  ON public.crm_whatsapp_conversations(tenant_id, status, last_message_at DESC);

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
  c.metadata,
  cot.numero AS cotizacion_numero,
  cot.estado AS cotizacion_estado,
  cot.estado_comercial AS cotizacion_estado_comercial,
  cot.fecha_cotizacion,
  cot.total_cotizacion,
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
LEFT JOIN public.cotizaciones cot ON cot.id = c.cotizacion_id
LEFT JOIN (
  SELECT conversation_id, COUNT(*) AS items_count, SUM(cantidad * precio_unitario) AS quote_total
  FROM public.crm_whatsapp_quote_items
  WHERE selected = TRUE
  GROUP BY conversation_id
) q ON q.conversation_id = c.id;

GRANT SELECT ON public.crm_whatsapp_conversations_view TO authenticated;
