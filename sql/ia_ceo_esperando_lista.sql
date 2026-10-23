-- =====================================================================
-- IA CEO: LA TAREA "RESPONDE A LOS N CLIENTES" DICE CUÁLES (23/10/2026)
-- ---------------------------------------------------------------------
-- La tarea decía "Responde a los 2 clientes esperando respuesta" y el
-- dueño no los encontraba: uno era de TikTok y el otro un WhatsApp del
-- espejo, que no sale en el Sales Hub. Esta función da la lista con la
-- MISMA regla que cuenta la tarea (ia_ceo_esperando_respuesta), y el
-- panel pone un botón por cliente que abre SU chat.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ia_ceo_esperando_lista()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'canal', c.platform,
           'cliente', coalesce(nullif(btrim(c.customer_name), ''), c.customer_phone, 'cliente'),
           'telefono', CASE WHEN c.platform = 'whatsapp'
                              AND length(regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g')) >= 10
                            THEN regexp_replace(c.customer_phone, '\D', '', 'g') END,
           'desde', c.last_user_message_at,
           'preview', left(c.last_message_preview, 90))
         ORDER BY c.last_user_message_at), '[]'::jsonb)
    FROM public.sales_conversations c
   WHERE c.tenant_id = public.get_user_tenant()
     AND c.last_user_message_at > now() - interval '3 days'
     AND c.last_user_message_at < now() - interval '1 hour'
     AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
     AND coalesce(c.etapa, '') NOT IN ('perdido', 'spam', 'ganado')
     AND coalesce(c.status, '') NOT IN ('cerrado', 'cerrada')
$$;
REVOKE ALL ON FUNCTION public.ia_ceo_esperando_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_ceo_esperando_lista() TO authenticated;

SELECT public.registrar_migracion('ia_ceo_esperando_lista.sql');
