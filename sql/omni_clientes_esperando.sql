-- =====================================================================
-- OMNI: CLIENTES ESPERANDO RESPUESTA (todos los canales)
-- =====================================================================
-- (15/10/2026) Para el aviso de la extensión "N clientes esperando". Una
-- conversación espera cuando el ÚLTIMO mensaje es del cliente y lleva más de
-- p_minutos sin respuesta. Al 15/10 había 3 (Oscar Gts La Cruz por WhatsApp
-- e Instagram, de 17 a 66 h) sin que nada lo dijera.
-- Fuera: etapa 'perdido', estado 'cerrado', chats marcados "No copiar", y lo
-- de más de 3 días (eso ya no es "esperando", es un seguimiento).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.omni_clientes_esperando(p_minutos int DEFAULT 60)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT coalesce(jsonb_agg(x ORDER BY x.desde), '[]'::jsonb)
    FROM (
      SELECT c.id, c.platform, c.external_conversation_id,
             coalesce(nullif(c.customer_name, ''), c.customer_phone, c.external_conversation_id) AS nombre,
             c.last_user_message_at AS desde,
             left(c.last_message_preview, 120) AS preview
        FROM public.sales_conversations c
       WHERE c.tenant_id = public.get_user_tenant()
         AND c.last_user_message_at > now() - interval '3 days'
         AND c.last_user_message_at < now() - make_interval(mins => greatest(coalesce(p_minutos, 60), 1))
         AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
         AND coalesce(c.etapa, '') <> 'perdido'
         AND coalesce(c.status, '') NOT IN ('cerrado', 'closed')
         AND NOT EXISTS (SELECT 1 FROM public.omni_chats_excluidos e
                          WHERE e.tenant_id = c.tenant_id AND e.clave = c.external_conversation_id)
       ORDER BY c.last_user_message_at
       LIMIT 30
    ) x
$fn$;

REVOKE ALL ON FUNCTION public.omni_clientes_esperando(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_clientes_esperando(int) TO authenticated;

SELECT public.registrar_migracion('omni_clientes_esperando.sql');
