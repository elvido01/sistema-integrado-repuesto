-- WhatsApp CRM - Baileys outgoing sync
-- Allows messages sent from the linked phone/WhatsApp Web to be stored once.

WITH duplicated AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, whatsapp_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.crm_whatsapp_messages
  WHERE whatsapp_message_id IS NOT NULL
)
DELETE FROM public.crm_whatsapp_messages m
USING duplicated d
WHERE m.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS crm_whatsapp_messages_wamid_unique
  ON public.crm_whatsapp_messages (tenant_id, whatsapp_message_id);
