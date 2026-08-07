-- =====================================================================
-- Espejo de Instagram → Sales Hub (sin API de Meta)
-- ---------------------------------------------------------------------
-- (2026-08-07) Meta no da Acceso Avanzado a instagram_manage_messages sin
-- verificación del negocio. Mientras eso se resuelve, los DM de Instagram
-- entran al CRM por el mismo camino que ya usa WhatsApp: la extensión lee
-- lo que el navegador del vendedor YA recibió y lo espeja aquí.
--
-- >>> ESCRIBE EN LAS MISMAS TABLAS QUE EL WEBHOOK <<<
-- sales_conversations y sales_messages, con el MISMO formato de
-- identificadores que usa meta-messages-webhook:
--
--   external_conversation_id = 'instagram:<cuenta_ig>:<remitente>'
--   external_message_id      = el item_id real de Instagram
--
-- Eso no es un detalle. El día que Meta apruebe el permiso y el webhook
-- empiece a entregar, las conversaciones NO se duplican: caen sobre las
-- mismas filas y la conversación sigue donde estaba. El espejo se apaga y
-- ya. Por eso se usa el item_id de Instagram y no un hash inventado.
--
-- >>> DE DÓNDE SALEN LOS DATOS <<<
-- De las respuestas que la propia página de Instagram ya recibe cuando el
-- vendedor abre su bandeja (endpoints direct_v2). No se pide nada extra ni
-- se envía nada: es una lectura de lo que ya está en pantalla.
--
-- >>> SEGURIDAD <<<
-- SECURITY DEFINER pero ESTRICTAMENTE acotada: escribe solo en el tenant de
-- quien llama, resuelto con get_user_tenant(). El payload nunca decide el
-- tenant. Si no hay sesión, no escribe nada.
--
-- Idempotente / re-ejecutable. Re-espejar la misma conversación no duplica.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.omni_mirror_instagram(p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_cuenta   text;
  v_thread   text := NULLIF(btrim(p_payload ->> 'thread_id'), '');
  v_user     text := NULLIF(btrim(p_payload ->> 'user_id'), '');
  v_handle   text := NULLIF(btrim(p_payload ->> 'handle'), '');
  v_nombre   text := NULLIF(btrim(p_payload ->> 'nombre'), '');
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

  -- Sin con quién ni con qué, no hay nada que espejar.
  IF COALESCE(v_user, v_handle, v_thread) IS NULL OR jsonb_array_length(v_msgs) = 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'payload incompleto');
  END IF;

  -- La cuenta de IG del negocio, para armar el id igual que el webhook.
  SELECT external_account_id INTO v_cuenta
  FROM public.social_accounts
  WHERE tenant_id = v_tenant AND platform = 'instagram'
  LIMIT 1;
  v_cuenta := COALESCE(v_cuenta, 'mirror');

  v_ext := 'instagram:' || v_cuenta || ':' || COALESCE(v_user, v_handle, v_thread);

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
    v_tenant, 'instagram', v_ext,
    COALESCE(v_nombre, v_handle, v_user), COALESCE(v_user, v_handle),
    'nuevo', false,
    left(COALESCE(v_ultimo, ''), 180),
    jsonb_build_object('source', 'omni_mirror_instagram', 'handle', v_handle, 'thread_id', v_thread)
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id) DO UPDATE SET
    -- El nombre solo MEJORA: si ya había uno bueno no se pisa con el id.
    customer_name        = COALESCE(NULLIF(EXCLUDED.customer_name, ''), public.sales_conversations.customer_name),
    customer_external_id = COALESCE(public.sales_conversations.customer_external_id, EXCLUDED.customer_external_id),
    last_message_preview = COALESCE(NULLIF(EXCLUDED.last_message_preview, ''), public.sales_conversations.last_message_preview),
    metadata             = public.sales_conversations.metadata || EXCLUDED.metadata
  RETURNING id INTO v_conv;

  IF v_conv IS NULL THEN
    SELECT id INTO v_conv FROM public.sales_conversations
    WHERE tenant_id = v_tenant AND platform = 'instagram' AND external_conversation_id = v_ext;
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(v_msgs) LOOP
    -- El item_id real de Instagram. Si por lo que sea no viniera, se arma uno
    -- determinístico para que re-leer el hilo no duplique.
    v_id := NULLIF(btrim(m ->> 'id'), '');
    IF v_id IS NULL THEN
      v_id := 'mirror:' || md5(v_ext || COALESCE(m ->> 'ts', '') || COALESCE(m ->> 'texto', ''));
    END IF;

    INSERT INTO public.sales_messages (
      tenant_id, conversation_id, platform, sender_type, message_type,
      message_text, media_url, external_message_id, status, raw_data
    ) VALUES (
      v_tenant, v_conv, 'instagram',
      CASE WHEN COALESCE(m ->> 'de', 'user') = 'agent' THEN 'agent' ELSE 'user' END,
      COALESCE(NULLIF(m ->> 'tipo', ''), 'text'),
      COALESCE(m ->> 'texto', ''),
      NULLIF(m ->> 'media_url', ''),
      v_id,
      CASE WHEN COALESCE(m ->> 'de', 'user') = 'agent' THEN 'sent' ELSE 'received' END,
      jsonb_build_object('source', 'mirror', 'ts', m ->> 'ts')
    )
    ON CONFLICT (tenant_id, platform, external_message_id) DO NOTHING;

    IF FOUND THEN v_nuevos := v_nuevos + 1; END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'conversacion', v_conv,
    'external_id', v_ext,
    'recibidos', jsonb_array_length(v_msgs),
    'nuevos', v_nuevos
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_instagram(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_instagram(jsonb) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('omni_mirror_instagram.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN (después de abrir la bandeja de Instagram)
-- ------------------------------------------------------------
SELECT c.external_conversation_id, c.customer_name, c.status,
       COUNT(m.id) AS mensajes,
       MAX(m.created_at) AS ultimo
FROM public.sales_conversations c
LEFT JOIN public.sales_messages m ON m.conversation_id = c.id
WHERE c.platform = 'instagram'
GROUP BY c.id, c.external_conversation_id, c.customer_name, c.status
ORDER BY ultimo DESC NULLS LAST;
-- Los espejados y los que entraron por el webhook conviven en la misma
-- lista, y si son el mismo hilo son la MISMA fila.
