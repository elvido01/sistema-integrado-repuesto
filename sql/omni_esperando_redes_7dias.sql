-- =====================================================================
-- CLIENTES ESPERANDO: INSTAGRAM Y FACEBOOK 7 DÍAS (22/10/2026)
-- ---------------------------------------------------------------------
-- La lista "⏰ clientes esperando respuesta" del panel miraba 3 días para
-- todos. En Instagram un cliente que escribe el viernes y nadie contesta
-- desaparecía el lunes de la lista, con la venta todavía posible.
--   · WhatsApp: 3 días, como antes.
--   · Instagram / Facebook / TikTok: 7 días, con `ventana_cerrada` cuando
--     pasaron más de 24 h (ya no sale desde MotoFlow: se contesta desde la
--     app; la ficha lo marca con ⛔ y abre la conversación en la bandeja).
--   · Tampoco salen las ganadas ni las internas (lista "no dar seguimiento").
-- =====================================================================
CREATE OR REPLACE FUNCTION public.omni_clientes_esperando(p_minutos integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(x ORDER BY x.desde), '[]'::jsonb)
    FROM (
      SELECT c.id, c.platform, c.external_conversation_id,
             coalesce(nullif(c.customer_name, ''), c.customer_phone, c.external_conversation_id) AS nombre,
             c.last_user_message_at AS desde,
             left(c.last_message_preview, 120) AS preview,
             (c.platform <> 'whatsapp' AND c.last_user_message_at < now() - interval '24 hours') AS ventana_cerrada
        FROM public.sales_conversations c
       WHERE c.tenant_id = public.get_user_tenant()
         AND c.last_user_message_at > now() - CASE WHEN c.platform = 'whatsapp' THEN interval '3 days' ELSE interval '7 days' END
         AND c.last_user_message_at < now() - make_interval(mins => greatest(coalesce(p_minutos, 60), 1))
         AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
         AND coalesce(c.etapa, '') NOT IN ('perdido', 'ganado', 'spam')
         AND coalesce(c.status, '') NOT IN ('cerrado', 'closed')
         AND NOT EXISTS (SELECT 1 FROM public.omni_chats_excluidos e
                          WHERE e.tenant_id = c.tenant_id AND e.clave = c.external_conversation_id)
       ORDER BY c.last_user_message_at
       LIMIT 30
    ) x
$function$;

SELECT public.registrar_migracion('omni_esperando_redes_7dias.sql');
