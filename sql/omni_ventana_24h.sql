-- =====================================================================
-- Reloj de las 24 horas en la bandeja (18/10/2026)
-- ---------------------------------------------------------------------
-- Instagram y Messenger solo dejan contestar un mensaje directo dentro de
-- las 24 h siguientes al ÚLTIMO mensaje directo del cliente. En 30 días, 10
-- de 13 conversaciones por privado se quedaron sin respuesta hasta cerrarse
-- (Wil Arroyo Zamora: preguntó el 16/10 7:31 pm, la respuesta del 18/10
-- quedó "NO SALIÓ"). La extensión pinta cuánto queda y ordena por eso.
--
-- La vista publica ultimo_dm_cliente_at: el último mensaje del cliente que
-- NO es un comentario (un comentario no abre la ventana del privado). Se
-- agrega al final: CREATE OR REPLACE VIEW solo admite columnas nuevas al
-- final y con el mismo orden de las que ya están.
-- =====================================================================

CREATE OR REPLACE VIEW public.sales_conversations_view AS
 SELECT c.id,
    c.tenant_id,
    c.channel_id,
    c.platform,
    c.external_conversation_id,
    c.customer_name,
    c.customer_phone,
    c.customer_external_id,
    c.status,
    c.assigned_to,
    c.lead_score,
    c.intent,
    c.bot_enabled,
    c.crm_whatsapp_conversation_id,
    c.cotizacion_id,
    c.last_message_at,
    c.last_user_message_at,
    c.last_agent_message_at,
    c.last_message_preview,
    c.metadata,
    c.created_at,
    c.updated_at,
    COALESCE(m.messages_count, 0::bigint)::integer AS messages_count,
    COALESCE(l.leads_count, 0::bigint)::integer AS leads_count,
    q.numero AS cotizacion_numero,
    q.estado AS cotizacion_estado,
    q.estado_comercial AS cotizacion_estado_comercial,
    q.total_cotizacion,
    c.cliente_id,
    cl.nombre AS cliente_nombre,
    c.visto_at,
    dm.ultimo_dm_cliente_at
   FROM sales_conversations c
     LEFT JOIN cotizaciones q ON q.id = c.cotizacion_id
     LEFT JOIN clientes cl ON cl.id = c.cliente_id
     LEFT JOIN ( SELECT sales_messages.conversation_id,
            count(*) AS messages_count
           FROM sales_messages
          GROUP BY sales_messages.conversation_id) m ON m.conversation_id = c.id
     LEFT JOIN ( SELECT sales_leads.conversation_id,
            count(*) AS leads_count
           FROM sales_leads
          GROUP BY sales_leads.conversation_id) l ON l.conversation_id = c.id
     LEFT JOIN LATERAL ( SELECT max(sm.created_at) AS ultimo_dm_cliente_at
           FROM sales_messages sm
          WHERE sm.conversation_id = c.id
            AND sm.sender_type = 'user'
            AND COALESCE(sm.message_type, 'text') <> 'comment') dm ON c.platform IN ('instagram', 'facebook');

SELECT public.registrar_migracion('omni_ventana_24h.sql');

-- Verificación: las de Instagram/Messenger con su reloj
SELECT customer_name, platform, ultimo_dm_cliente_at,
       round(extract(epoch FROM (ultimo_dm_cliente_at + interval '24 hours' - now())) / 3600, 1) AS horas_que_quedan
  FROM public.sales_conversations_view
 WHERE platform IN ('instagram', 'facebook') AND ultimo_dm_cliente_at > now() - interval '3 days'
 ORDER BY ultimo_dm_cliente_at DESC;
