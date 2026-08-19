-- =====================================================================
-- El punto rojo se apaga al abrir la conversacion
-- ---------------------------------------------------------------------
-- (2026-08-19) En la bandeja de TikTok hay 86 conversaciones con punto
-- rojo, muchas de julio. El punto significaba "escribio y no se le ha
-- contestado", asi que solo se apagaba CONTESTANDO — y a un mensaje de
-- hace un mes ya no se contesta. Resultado: 86 avisos permanentes, que es
-- lo mismo que ninguno; el numero deja de mirarse y entonces el que si
-- importa tampoco se ve.
--
-- Faltaba poder decir "esto ya lo vi". No habia donde: un intento anterior
-- de "marcar como leida" ponia a cero dos campos que la vista ni siquiera
-- publica, y por eso se quito. Aqui se le da un sitio real.
--
-- >>> LO QUE NO CAMBIA <<<
-- "Sin responder" sigue siendo sin responder. Ver algo no es contestarlo,
-- y meterlo todo en la misma señal seria volver a perder la diferencia:
-- el filtro sigue mirando quien escribio y no tuvo respuesta, mientras el
-- punto pasa a decir lo que el dueño necesita de un vistazo — que hay algo
-- que todavia no ha mirado.
--
-- Idempotente. No toca dinero.
-- =====================================================================

ALTER TABLE public.sales_conversations
  ADD COLUMN IF NOT EXISTS visto_at timestamptz;

COMMENT ON COLUMN public.sales_conversations.visto_at IS
  'Cuando se abrio por ultima vez en la bandeja. Apaga el punto mientras no llegue un mensaje mas nuevo.';

-- La vista nombra sus columnas una por una: sin esto la extension nunca lo
-- ve. Va al FINAL porque CREATE OR REPLACE VIEW solo deja anadir ahi.
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
    c.visto_at
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
          GROUP BY sales_leads.conversation_id) l ON l.conversation_id = c.id;

-- ------------------------------------------------------------
-- MARCAR VISTA
-- ------------------------------------------------------------
-- Un PATCH directo desde la extension valdria, pero esto se llama en CADA
-- clic de la lista: aqui se escribe solo cuando hay algo nuevo que ver, y
-- asi abrir la misma conversacion diez veces no son diez escrituras.
CREATE OR REPLACE FUNCTION public.sales_conversacion_marcar_vista(
  p_conversation_id uuid
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_ahora  timestamptz := now();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  UPDATE public.sales_conversations
     SET visto_at = v_ahora
   WHERE id = p_conversation_id
     AND tenant_id = v_tenant
     AND (visto_at IS NULL OR visto_at < COALESCE(last_message_at, visto_at));

  RETURN v_ahora;
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_conversacion_marcar_vista(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_conversacion_marcar_vista(uuid) TO authenticated;

-- ------------------------------------------------------------
-- MARCAR TODO EL CANAL
-- ------------------------------------------------------------
-- El dia que esto se enciende hay 86 conversaciones de TikTok con punto,
-- casi todas de julio. Apagarlas de una en una son 86 clics para llegar al
-- mismo sitio: nadie lo hace, y la señal nace ya inservible. Esto es el
-- "empezar de cero" que hace falta una vez.
--
-- No cambia ningun estado ni cierra nada: lo que estaba sin responder
-- sigue sin responder y sigue saliendo en su filtro. Solo dice "ya los mire".
CREATE OR REPLACE FUNCTION public.sales_conversaciones_marcar_vistas(
  p_platform text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_n      integer;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  UPDATE public.sales_conversations
     SET visto_at = now()
   WHERE tenant_id = v_tenant
     -- Sin plataforma es la Bandeja: todo lo que no es WhatsApp, igual que
     -- lo que esa pantalla enseña.
     AND (CASE WHEN p_platform IS NULL THEN platform <> 'whatsapp'
               ELSE platform = p_platform END)
     AND (visto_at IS NULL OR visto_at < COALESCE(last_message_at, visto_at));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_conversaciones_marcar_vistas(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_conversaciones_marcar_vistas(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('conversacion_vista.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='sales_conversations' AND column_name='visto_at')
       THEN 'OK  la conversacion recuerda cuando se vio' ELSE '*** FALLO ***' END AS campo,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='sales_conversations_view' AND column_name='visto_at')
       THEN 'OK  la vista lo publica' ELSE '*** FALLO *** la extension no lo veria' END AS vista,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='sales_conversacion_marcar_vista')
       THEN 'OK  se puede marcar' ELSE '*** FALLO ***' END AS rpc,
  (SELECT count(*) FROM public.sales_conversations WHERE visto_at IS NULL) AS sin_ver_todavia;
