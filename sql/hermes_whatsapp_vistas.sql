-- =====================================================================
-- Vistas para HERMES — WhatsApp listo para consultar (psycopg2 directo)
-- ---------------------------------------------------------------------
-- Hermes se conecta directo a Postgres con psycopg2. El espejo ya dejó las
-- conversaciones de WhatsApp en sales_conversations/sales_messages, pero esas
-- tablas son crudas. Estas 2 vistas se lo dan masticado:
--
--   hermes_whatsapp_conversaciones → una fila por chat, con señales de
--       seguimiento (sin_responder, horas desde el cliente, último mensaje).
--   hermes_whatsapp_mensajes → todos los mensajes legibles (quien='yo'/'cliente').
--
-- security_invoker=true: si un usuario normal las consulta por PostgREST, se
-- aplica su RLS (solo su empresa). Hermes (service_role / postgres por
-- psycopg2) las ve completas y filtra por tenant_id. Idempotente.
-- =====================================================================

CREATE OR REPLACE VIEW public.hermes_whatsapp_conversaciones
WITH (security_invoker = true) AS
SELECT
  c.tenant_id,
  ce.nombre                                   AS empresa,
  c.id                                        AS conversacion_id,
  c.customer_name                             AS cliente,
  c.customer_phone                            AS telefono,
  c.external_conversation_id,
  c.last_message_at                           AS ultimo_mensaje_at,
  c.last_user_message_at                      AS ultimo_del_cliente_at,
  c.last_agent_message_at                     AS ultimo_mio_at,
  c.last_message_preview                      AS ultimo_mensaje,
  -- sin responder = el cliente escribió y yo no he contestado después
  (c.last_user_message_at IS NOT NULL
    AND (c.last_agent_message_at IS NULL
         OR c.last_user_message_at > c.last_agent_message_at)) AS sin_responder,
  CASE WHEN c.last_user_message_at IS NOT NULL
       THEN round(extract(epoch FROM (now() - c.last_user_message_at)) / 3600.0, 1)
  END                                         AS horas_desde_cliente,
  (SELECT count(*) FROM public.sales_messages m WHERE m.conversation_id = c.id) AS total_mensajes
FROM public.sales_conversations c
LEFT JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id
WHERE c.platform = 'whatsapp';

CREATE OR REPLACE VIEW public.hermes_whatsapp_mensajes
WITH (security_invoker = true) AS
SELECT
  m.tenant_id,
  m.conversation_id,
  c.customer_name                             AS cliente,
  c.customer_phone                            AS telefono,
  CASE WHEN m.sender_type = 'agent' THEN 'yo' ELSE 'cliente' END AS quien,
  m.message_type                              AS tipo,
  m.message_text                              AS texto,
  m.created_at                                AS fecha,
  (m.raw_data->>'source')                     AS origen
FROM public.sales_messages m
JOIN public.sales_conversations c ON c.id = m.conversation_id
WHERE m.platform = 'whatsapp';

GRANT SELECT ON public.hermes_whatsapp_conversaciones TO authenticated, service_role;
GRANT SELECT ON public.hermes_whatsapp_mensajes       TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_whatsapp_vistas.sql');
  END IF;
END $$;

SELECT 'Vistas Hermes WhatsApp listas' AS status;
