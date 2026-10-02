-- =====================================================================
-- ESPEJO DE TIKTOK: UNA SOLA CUENTA (y las 430 conversaciones repetidas)
-- ---------------------------------------------------------------------
-- (2026-10-02) Revisando las cuentas repetidas de social_accounts (TikTok y
-- YouTube tenían cada una la fila MANUAL vieja, sin token, y la conexión
-- OAuth nueva). El publicador y la pantalla ya elegían bien (solo
-- 'connected', la más nueva). Pero omni_mirror_hilo hacía
--     SELECT external_account_id ... WHERE platform = v_plat LIMIT 1
-- SIN ORDER BY. Hasta el 30/09 TikTok tenía una sola fila (la manual, sin
-- id): todas las conversaciones quedaron como 'tiktok:mirror:<cliente>'.
-- Al conectar TikTok por OAuth el 30/09 la consulta empezó a devolver el id
-- de la cuenta nueva y, al releer el historial, el espejo abrió 430
-- conversaciones 'tiktok:-000ruOR...:<cliente>' — 429 de clientes que ya
-- tenían la suya. Estaban VACÍAS (1 mensaje entre todas): los mensajes ya
-- existían y su ON CONFLICT los deja en la conversación vieja. Pero todo
-- mensaje nuevo habría caído en la vacía, partiendo cada historial en dos.
--
-- Arreglo (solo Repuestos Morla, solo TikTok):
--   1. El espejo elige SIEMPRE la misma cuenta: la conectada, la más nueva.
--   2. Cada conversación vieja ('mirror') absorbe a su repetida (el mensaje
--      y la fila de entrenamiento que tenga), la repetida se borra y la
--      vieja pasa a llamarse con la cuenta de verdad. El historial queda
--      entero en una sola conversación.
--   3. Se borran las dos filas manuales viejas (TikTok y YouTube): sin
--      token, sin secretos, sin eventos, nadie las usa.
-- Si algo no está como se encontró, no toca nada.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.omni_mirror_hilo(p_plataforma text, p_payload jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_plat     text := lower(btrim(COALESCE(p_plataforma, '')));
  v_cuenta   text;
  v_thread   text := NULLIF(btrim(p_payload ->> 'thread_id'), '');
  v_user     text := NULLIF(btrim(p_payload ->> 'user_id'), '');
  v_handle   text := NULLIF(btrim(p_payload ->> 'handle'), '');
  v_nombre   text := NULLIF(btrim(p_payload ->> 'nombre'), '');
  -- El nombre DE VERDAD, que puede perfectamente no venir. Se separa del
  -- identificador a proposito: ver el ON CONFLICT de mas abajo.
  v_bueno    text := COALESCE(NULLIF(btrim(p_payload ->> 'nombre'), ''),
                              NULLIF(btrim(p_payload ->> 'handle'), ''));
  v_ext      text;
  v_conv     uuid;
  v_msgs     jsonb := COALESCE(p_payload -> 'messages', '[]'::jsonb);
  m          jsonb;
  v_nuevos   int := 0;
  v_ultimo   text := '';
  v_id       text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la empresa del usuario';
  END IF;

  -- La plataforma la decide el código, no el payload: una lista cerrada
  -- evita que una llamada suelta escriba un canal inventado.
  IF v_plat NOT IN ('instagram', 'facebook', 'tiktok') THEN
    RAISE EXCEPTION 'Canal no admitido para el espejo: %', p_plataforma;
  END IF;

  -- Sin con quién ni con qué, no hay nada que espejar.
  IF COALESCE(v_user, v_handle, v_thread) IS NULL OR jsonb_array_length(v_msgs) = 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'payload incompleto');
  END IF;

  -- La cuenta del negocio en esa red, para armar el id igual que el webhook.
  SELECT external_account_id INTO v_cuenta
  FROM public.social_accounts
  WHERE tenant_id = v_tenant AND platform = v_plat
    AND external_account_id IS NOT NULL
  -- (02/10) SIEMPRE la misma: la conectada y, entre varias, la más nueva.
  -- Sin ORDER BY, con dos filas de TikTok (la manual vieja y la conexión
  -- del 30/09) cada lote podía caer en una distinta y el 30/09 se abrieron
  -- 430 conversaciones repetidas. Ver sql/espejo_tiktok_una_sola_cuenta.sql.
  ORDER BY (status = 'connected') DESC, connected_at DESC NULLS LAST, id
  LIMIT 1;
  v_cuenta := COALESCE(v_cuenta, 'mirror');

  v_ext := v_plat || ':' || v_cuenta || ':' || COALESCE(v_user, v_handle, v_thread);

  -- Preview: el texto del último mensaje del lote.
  SELECT COALESCE(x ->> 'texto', '') INTO v_ultimo
  FROM jsonb_array_elements(v_msgs) x
  ORDER BY COALESCE(x ->> 'ts', '') DESC
  LIMIT 1;

  INSERT INTO public.sales_conversations (
    tenant_id, platform, external_conversation_id,
    customer_name, customer_external_id, status, bot_enabled,
    last_message_preview, metadata
  ) VALUES (
    v_tenant, v_plat, v_ext,
    COALESCE(v_bueno, v_user, v_thread), COALESCE(v_user, v_handle),
    'nuevo', false,
    left(COALESCE(v_ultimo, ''), 180),
    jsonb_build_object('source', 'omni_mirror_' || v_plat, 'handle', v_handle, 'thread_id', v_thread)
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id) DO UPDATE SET
    -- >>> EL NOMBRE SOLO MEJORA <<<
    -- Aquí NO se puede mirar EXCLUDED.customer_name: ese valor nunca viene
    -- vacío, porque cuando no hay nombre lleva el identificador dentro. Con
    -- EXCLUDED, un lote sin nombre le pisaba "Juan Motos" y dejaba la
    -- conversación llamándose "7123456789012345678" — comprobado el
    -- 2026-08-19 con una prueba en producción y ROLLBACK. Venía heredado
    -- del espejo de Instagram.
    --
    -- En TikTok esto pasa TODO el rato, no de vez en cuando: los mensajes
    -- llegan en binario y los nombres en otra respuesta aparte, así que hay
    -- lotes enteros sin nombre. Por eso se mira v_bueno, que es el nombre
    -- de verdad y vale NULL cuando no lo hay.
    customer_name        = COALESCE(v_bueno, public.sales_conversations.customer_name),
    customer_external_id = COALESCE(public.sales_conversations.customer_external_id, EXCLUDED.customer_external_id),
    -- La vista previa NO se toca aquí. La pone el disparador de cada
    -- mensaje, que es el único que sabe cuál es el más nuevo. Poniéndola
    -- aquí, subir a leer la historia de marzo dejaba la lista de
    -- conversaciones enseñando textos de hace medio año — comprobado el
    -- 2026-08-19 con una prueba en producción y ROLLBACK.
    metadata             = public.sales_conversations.metadata || EXCLUDED.metadata
  RETURNING id INTO v_conv;

  IF v_conv IS NULL THEN
    SELECT id INTO v_conv FROM public.sales_conversations
    WHERE tenant_id = v_tenant AND platform = v_plat AND external_conversation_id = v_ext;
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(v_msgs) LOOP
    -- El id real que manda la red. Si no viniera, se arma uno
    -- determinístico para que releer el hilo no duplique.
    v_id := NULLIF(btrim(m ->> 'id'), '');
    IF v_id IS NULL THEN
      v_id := 'mirror:' || md5(v_ext || COALESCE(m ->> 'ts', '') || COALESCE(m ->> 'texto', ''));
    END IF;

    INSERT INTO public.sales_messages (
      tenant_id, conversation_id, platform, sender_type, message_type,
      message_text, media_url, external_message_id, status, raw_data
    ) VALUES (
      v_tenant, v_conv, v_plat,
      CASE WHEN COALESCE(m ->> 'de', 'user') = 'agent' THEN 'agent' ELSE 'user' END,
      COALESCE(NULLIF(m ->> 'tipo', ''), 'text'),
      COALESCE(m ->> 'texto', ''),
      CASE WHEN m ->> 'media_url' LIKE 'http%' THEN m ->> 'media_url' END,
      v_id,
      CASE WHEN COALESCE(m ->> 'de', 'user') = 'agent' THEN 'sent' ELSE 'received' END,
      jsonb_build_object('source', 'mirror', 'ts', m ->> 'ts')
    )
    ON CONFLICT (tenant_id, platform, external_message_id) DO UPDATE SET
      media_url    = COALESCE(
        CASE WHEN EXCLUDED.media_url LIKE 'http%' THEN EXCLUDED.media_url END,
        CASE WHEN sales_messages.media_url LIKE 'http%' THEN sales_messages.media_url END);

    IF FOUND THEN v_nuevos := v_nuevos + 1; END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'canal', v_plat,
    'conversacion', v_conv,
    'external_id', v_ext,
    'recibidos', jsonb_array_length(v_msgs),
    'nuevos', v_nuevos
  );
END $function$;

DO $$
DECLARE
  v_t      constant uuid := '00000000-0000-0000-0000-000000000001';
  v_cuenta constant text := '-000ruORaBbqKRN44DwxaxoNRmlFEm_tI2I4';
  n int;
BEGIN
  -- Comprobación: lo que se encontró el 02/10.
  IF (SELECT count(*) FROM public.sales_conversations
       WHERE tenant_id = v_t AND platform = 'tiktok'
         AND external_conversation_id LIKE 'tiktok:' || v_cuenta || ':%') > 435 THEN
    RAISE EXCEPTION 'Hay más conversaciones nuevas de las esperadas: revisar a mano';
  END IF;

  CREATE TEMP TABLE _par ON COMMIT DROP AS
  SELECT v.id AS vieja, n.id AS nueva
    FROM public.sales_conversations v
    JOIN public.sales_conversations n
      ON n.tenant_id = v.tenant_id AND n.platform = v.platform
     AND n.external_conversation_id = 'tiktok:' || v_cuenta || ':' || substr(v.external_conversation_id, length('tiktok:mirror:') + 1)
   WHERE v.tenant_id = v_t AND v.platform = 'tiktok'
     AND v.external_conversation_id LIKE 'tiktok:mirror:%';

  -- Lo poco que tenga la repetida pasa a la vieja.
  UPDATE public.sales_messages m SET conversation_id = p.vieja
    FROM _par p WHERE m.conversation_id = p.nueva;
  UPDATE public.sales_ai_training_logs l SET conversation_id = p.vieja
    FROM _par p WHERE l.conversation_id = p.nueva;
  UPDATE public.sales_leads l SET conversation_id = p.vieja
    FROM _par p WHERE l.conversation_id = p.nueva;
  UPDATE public.sales_notifications x SET conversation_id = p.vieja
    FROM _par p WHERE x.conversation_id = p.nueva;
  UPDATE public.crm_seguimiento x SET conversation_id = p.vieja
    FROM _par p WHERE x.conversation_id = p.nueva;

  IF EXISTS (SELECT 1 FROM public.sales_messages m JOIN _par p ON m.conversation_id = p.nueva) THEN
    RAISE EXCEPTION 'Quedaron mensajes en las repetidas';
  END IF;

  DELETE FROM public.sales_conversations c USING _par p WHERE c.id = p.nueva;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'repetidas borradas: %', n;

  -- Las viejas toman el nombre con la cuenta de verdad (las que tenían par
  -- y las que no), para que el espejo las encuentre de aquí en adelante.
  UPDATE public.sales_conversations
     SET external_conversation_id = 'tiktok:' || v_cuenta || ':' || substr(external_conversation_id, length('tiktok:mirror:') + 1)
   WHERE tenant_id = v_t AND platform = 'tiktok'
     AND external_conversation_id LIKE 'tiktok:mirror:%'
     AND NOT EXISTS (SELECT 1 FROM public.sales_conversations x
                      WHERE x.tenant_id = v_t AND x.platform = 'tiktok'
                        AND x.external_conversation_id = 'tiktok:' || v_cuenta || ':' || substr(sales_conversations.external_conversation_id, length('tiktok:mirror:') + 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'viejas renombradas: %', n;

  -- Las dos filas manuales que sobran (sin token, sin secretos, sin eventos).
  DELETE FROM public.social_accounts a
   WHERE a.tenant_id = v_t
     AND a.id IN ('14848475-ea8c-4124-a64c-e61220a4feed', 'b082bf60-4414-4100-a25a-f5cd7e92c6d7')
     AND a.status = 'manual'
     AND NOT EXISTS (SELECT 1 FROM public.social_account_secrets s WHERE s.account_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM public.meta_webhook_events e WHERE e.social_account_id = a.id);
END $$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('espejo_tiktok_una_sola_cuenta.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM public.sales_conversations
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'tiktok') AS conversaciones_tiktok,
  (SELECT count(*) FROM public.sales_conversations
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'tiktok'
      AND external_conversation_id LIKE 'tiktok:mirror:%') AS quedan_mirror,
  (SELECT count(*) FROM public.sales_messages m JOIN public.sales_conversations c ON c.id = m.conversation_id
    WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001' AND c.platform = 'tiktok') AS mensajes_tiktok,
  (SELECT string_agg(platform || ':' || status, ', ' ORDER BY platform) FROM public.social_accounts
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001') AS cuentas;
