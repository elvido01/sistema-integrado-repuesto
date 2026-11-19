-- =====================================================================
-- WhatsApp oficial: Hermes aprende de esos mensajes y el espejo se aparta
-- ---------------------------------------------------------------------
-- (19/11/2026) Fase 2 del CRM vendible (plan:
-- https://claude.ai/artifact/S6eV7xsKbWij3HCHmkNEzs).
--
-- 1. APRENDER. La captura de preguntas para Hermes (_ia_captura_pregunta_espejo)
--    solo miraba lo que traia el espejo (raw_data.source='mirror'). Lo que
--    entra por la conexion oficial trae source='whatsapp_oficial' y un origen:
--      cliente   -> lo escribe el cliente ahora          (SE CAPTURA)
--      app       -> lo contesta la empresa desde el telefono (es respuesta:
--                   ya la recoge _ia_captura_respuesta_humana, sender agent)
--      historial -> los 6 meses que Meta manda al conectar (NO: llegan en
--                   tandas desordenadas y emparejarian mal pregunta/respuesta)
--    Los audios entran como "Audio" y la transcripcion llega DESPUES con un
--    UPDATE del texto: por eso el disparador ahora tambien oye UPDATE OF
--    message_text, solo para los oficiales y solo si el texto cambio.
--
-- 2. APARTAR EL ESPEJO. Una empresa con su WhatsApp conectado oficialmente
--    (whatsapp_conexiones viva) ya recibe todo por Meta. Si ademas tiene la
--    extension abierta, el mismo chat entraria dos veces con claves distintas
--    (whatsapp:<numero> y whatsapp:<phone_number_id>:<numero>). La extension
--    no dice cual es el numero de la empresa, y la regla es UNA conexion viva
--    por empresa: con conexion viva, omni_mirror_whatsapp no copia nada y
--    responde oficial=true. Instagram/TikTok por el espejo no cambian.
--
-- Base: definiciones VIVAS de produccion leidas el 19/11 (no los .sql viejos).
-- =====================================================================

-- ── 1. Captura de preguntas ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ia_captura_pregunta_espejo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src text := COALESCE(NEW.raw_data ->> 'source', '');
  v_oficial boolean := v_src = 'whatsapp_oficial' AND COALESCE(NEW.raw_data ->> 'origen', '') = 'cliente';
BEGIN
  -- Preguntas de clientes que llegan por el espejo o por WhatsApp oficial.
  -- Lo que trae otro webhook ya crea su fila (y con intencion detectada).
  IF NEW.sender_type <> 'user' OR NOT (v_src = 'mirror' OR v_oficial) THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo interesa la transcripcion de un audio oficial.
  IF TG_OP = 'UPDATE' AND (NOT v_oficial OR OLD.message_text IS NOT DISTINCT FROM NEW.message_text) THEN
    RETURN NEW;
  END IF;

  -- Los mismos dos filtros que usa la captura de la respuesta, para que la
  -- basura no entre por un lado si se limpia por el otro: adjuntos sin
  -- contenido, el saludo del bot, los "ok" sueltos; y los contactos que el
  -- dueno excluyo a mano.
  IF NOT public._ia_sirve_de_ejemplo(NEW.message_text)
     OR public._ia_conversacion_excluida(NEW.conversation_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_ai_training_logs (
    tenant_id, conversation_id, message_id, platform, customer_message, metadata, created_at
  ) VALUES (
    NEW.tenant_id, NEW.conversation_id, NEW.id, NEW.platform, NEW.message_text,
    jsonb_build_object('source', CASE WHEN v_oficial THEN 'trigger_whatsapp_oficial' ELSE 'trigger_espejo' END),
    COALESCE(NEW.enviado_en, NEW.created_at, now())
  )
  ON CONFLICT (tenant_id, message_id) WHERE message_id IS NOT NULL DO NOTHING;

  RETURN NEW;
-- Recoger material para entrenar NUNCA puede tumbar la entrada de un
-- mensaje: si esto falla, el mensaje entra igual y se pierde el ejemplo.
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_ia_captura_pregunta ON public.sales_messages;
CREATE TRIGGER trg_ia_captura_pregunta
  AFTER INSERT OR UPDATE OF message_text ON public.sales_messages
  FOR EACH ROW EXECUTE FUNCTION public._ia_captura_pregunta_espejo();

-- ── 2. El espejo se aparta si hay WhatsApp oficial ───────────────────
CREATE OR REPLACE FUNCTION public.omni_mirror_whatsapp(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_ext_conv   text := NULLIF(trim(p_payload->>'external_conversation_id'), '');
  v_phone      text := NULLIF(regexp_replace(COALESCE(p_payload->>'phone',''), '\D', '', 'g'), '');
  v_name       text := NULLIF(trim(p_payload->>'name'), '');
  v_conv_id    uuid;
  v_msg        jsonb;
  v_sender     text;
  v_ts         timestamptz;
  v_rowc       int;
  v_inserted   int := 0;
  v_fotos      int := 0;
  v_last_ts        timestamptz := NULL;
  v_last_preview   text := NULL;
  v_last_user_ts   timestamptz := NULL;
  v_last_agent_ts  timestamptz := NULL;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_ext_conv IS NULL THEN RAISE EXCEPTION 'external_conversation_id requerido'; END IF;

  -- (19/11/2026) WhatsApp conectado oficialmente: ya entra todo por Meta.
  -- Copiarlo tambien desde la pestana lo duplicaria con otra clave.
  IF EXISTS (SELECT 1 FROM public.whatsapp_conexiones w
              WHERE w.tenant_id = v_tenant AND w.estado <> 'desconectado') THEN
    RETURN jsonb_build_object('ok', true, 'oficial', true, 'insertados', 0);
  END IF;

  -- (14/10/2026) Chats que el dueño marcó "No copiar" (personales): no entran.
  IF EXISTS (SELECT 1 FROM public.omni_chats_excluidos x
              WHERE x.tenant_id = v_tenant
                AND x.clave IN (v_ext_conv, NULLIF(trim(p_payload->>'name_key'), ''),
                                CASE WHEN v_phone IS NOT NULL THEN 'whatsapp:' || v_phone END)) THEN
    RETURN jsonb_build_object('ok', true, 'excluido', true, 'insertados', 0);
  END IF;

  INSERT INTO public.sales_conversations (
    tenant_id, platform, external_conversation_id, customer_name, customer_phone,
    status, bot_enabled, metadata
  ) VALUES (
    v_tenant, 'whatsapp', v_ext_conv, COALESCE(v_name, v_phone, v_ext_conv), v_phone,
    'nuevo', false, jsonb_build_object('source', 'motoflow_omni_extension_mirror')
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id)
  DO UPDATE SET
    customer_name  = COALESCE(EXCLUDED.customer_name, sales_conversations.customer_name),
    customer_phone = COALESCE(EXCLUDED.customer_phone, sales_conversations.customer_phone),
    updated_at     = now()
  RETURNING id INTO v_conv_id;

  FOR v_msg IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'messages', '[]'::jsonb))
  LOOP
    CONTINUE WHEN NULLIF(trim(v_msg->>'external_message_id'), '') IS NULL;
    v_sender := CASE WHEN (v_msg->>'direction') = 'out' THEN 'agent' ELSE 'user' END;
    v_ts     := COALESCE(NULLIF(v_msg->>'ts','')::timestamptz, now());
    IF NULLIF(v_msg->>'media_url','') IS NOT NULL THEN v_fotos := v_fotos + 1; END IF;

    INSERT INTO public.sales_messages (
      tenant_id, conversation_id, platform, sender_type, message_type,
      message_text, media_url, external_message_id, status, raw_data, created_at
    ) VALUES (
      v_tenant, v_conv_id, 'whatsapp', v_sender,
      COALESCE(NULLIF(v_msg->>'message_type',''), 'text'),
      COALESCE(v_msg->>'text',''), NULLIF(v_msg->>'media_url',''),
      v_msg->>'external_message_id',
      CASE WHEN v_sender = 'agent' THEN 'sent' ELSE 'received' END,
      jsonb_build_object('source', 'mirror', 'pre', v_msg->>'pre'),
      v_ts
    )
    ON CONFLICT (tenant_id, platform, external_message_id) DO UPDATE SET
      sender_type  = EXCLUDED.sender_type,
      status       = EXCLUDED.status,
      message_type = EXCLUDED.message_type,
      message_text = CASE WHEN COALESCE(EXCLUDED.message_text,'') <> ''
                          THEN EXCLUDED.message_text ELSE sales_messages.message_text END,
      -- La foto puede llegar en una vuelta posterior (WhatsApp la descarga
      -- despues de pintar la fila). Nunca se BORRA una que ya estaba.
      media_url    = COALESCE(EXCLUDED.media_url, sales_messages.media_url);

    GET DIAGNOSTICS v_rowc = ROW_COUNT;
    IF v_rowc > 0 THEN v_inserted := v_inserted + 1; END IF;

    IF v_last_ts IS NULL OR v_ts >= v_last_ts THEN
      v_last_ts := v_ts;
      v_last_preview := left(COALESCE(NULLIF(v_msg->>'text',''),
        CASE WHEN COALESCE(v_msg->>'message_type','text') <> 'text'
             THEN '['||(v_msg->>'message_type')||']' ELSE '' END), 180);
    END IF;
    IF v_sender = 'user'  AND (v_last_user_ts  IS NULL OR v_ts >= v_last_user_ts)  THEN v_last_user_ts  := v_ts; END IF;
    IF v_sender = 'agent' AND (v_last_agent_ts IS NULL OR v_ts >= v_last_agent_ts) THEN v_last_agent_ts := v_ts; END IF;
  END LOOP;

  UPDATE public.sales_conversations SET
    last_message_at       = GREATEST(last_message_at, v_last_ts),
    last_user_message_at  = GREATEST(last_user_message_at, v_last_user_ts),
    last_agent_message_at = GREATEST(last_agent_message_at, v_last_agent_ts),
    last_message_preview  = COALESCE(v_last_preview, last_message_preview),
    updated_at            = now()
  WHERE id = v_conv_id;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id,
                            'mensajes', v_inserted, 'fotos', v_fotos);
END $function$;

-- ── Prueba (se deshace sola) ─────────────────────────────────────────
DO $prueba$
DECLARE
  v_user uuid;
  v_t    uuid;
  v_conv uuid;
  v_msg  uuid;
  v_r    jsonb;
  v_n    int;
BEGIN
  BEGIN
    SELECT p.id INTO v_user FROM public.profiles p
     WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001' ORDER BY p.created_at LIMIT 1;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_t := public.get_user_tenant();
    IF v_t IS NULL THEN RAISE EXCEPTION 'FALLO: la prueba no pudo resolver empresa'; END IF;

    -- Sin conexion oficial, el espejo copia como siempre.
    v_r := public.omni_mirror_whatsapp(jsonb_build_object('external_conversation_id', 'whatsapp:18090000999',
      'phone', '18090000999', 'name', 'Prueba espejo',
      'messages', jsonb_build_array(jsonb_build_object('external_message_id', 'prueba-espejo-1', 'direction', 'in', 'text', 'hola prueba'))));
    IF COALESCE(v_r->>'oficial', 'false') = 'true' OR (v_r->>'mensajes')::int <> 1 THEN
      RAISE EXCEPTION 'FALLO: sin conexion oficial el espejo no copio (%)', v_r;
    END IF;

    -- Con conexion viva, el espejo se aparta.
    INSERT INTO public.whatsapp_conexiones (tenant_id, waba_id, phone_number_id, estado, modo)
      VALUES (v_t, '900000000000001', '900000000000002', 'conectado', 'coexistencia');
    v_r := public.omni_mirror_whatsapp(jsonb_build_object('external_conversation_id', 'whatsapp:18090000999',
      'messages', jsonb_build_array(jsonb_build_object('external_message_id', 'prueba-espejo-2', 'direction', 'in', 'text', 'otra'))));
    IF COALESCE(v_r->>'oficial', 'false') <> 'true'
       OR EXISTS (SELECT 1 FROM public.sales_messages WHERE tenant_id = v_t AND external_message_id = 'prueba-espejo-2') THEN
      RAISE EXCEPTION 'FALLO: con WhatsApp oficial el espejo siguio copiando (%)', v_r;
    END IF;

    -- Pregunta oficial del cliente -> Hermes la recoge.
    INSERT INTO public.sales_conversations (tenant_id, platform, external_conversation_id, customer_name, status, bot_enabled, metadata)
      VALUES (v_t, 'whatsapp', 'whatsapp:900000000000002:18090000998', 'Prueba oficial', 'nuevo', false,
              jsonb_build_object('source', 'whatsapp_oficial'))
      RETURNING id INTO v_conv;
    INSERT INTO public.sales_messages (tenant_id, conversation_id, platform, sender_type, message_type, message_text, external_message_id, status, raw_data)
      VALUES (v_t, v_conv, 'whatsapp', 'user', 'text', 'Cuanto cuesta la cadena 428 para la CG150', 'wamid.prueba1', 'received',
              jsonb_build_object('source', 'whatsapp_oficial', 'origen', 'cliente'))
      RETURNING id INTO v_msg;
    SELECT count(*) INTO v_n FROM public.sales_ai_training_logs WHERE message_id = v_msg;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALLO: la pregunta oficial no se capturo'; END IF;

    -- Historial NO se captura.
    INSERT INTO public.sales_messages (tenant_id, conversation_id, platform, sender_type, message_type, message_text, external_message_id, status, raw_data)
      VALUES (v_t, v_conv, 'whatsapp', 'user', 'text', 'Tienen el carburador de la AX100', 'wamid.prueba2', 'received',
              jsonb_build_object('source', 'whatsapp_oficial', 'origen', 'historial'))
      RETURNING id INTO v_msg;
    SELECT count(*) INTO v_n FROM public.sales_ai_training_logs WHERE message_id = v_msg;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FALLO: se capturo un mensaje del historial'; END IF;

    -- Audio: entra sin texto util y se captura cuando llega la transcripcion.
    INSERT INTO public.sales_messages (tenant_id, conversation_id, platform, sender_type, message_type, message_text, external_message_id, status, raw_data)
      VALUES (v_t, v_conv, 'whatsapp', 'user', 'audio', '🎤 Audio', 'wamid.prueba3', 'received',
              jsonb_build_object('source', 'whatsapp_oficial', 'origen', 'cliente'))
      RETURNING id INTO v_msg;
    UPDATE public.sales_messages SET message_text = '🎤 Buenas, tienen bandas de freno traseras para la Boxer' WHERE id = v_msg;
    SELECT count(*) INTO v_n FROM public.sales_ai_training_logs WHERE message_id = v_msg;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALLO: el audio transcrito no se capturo'; END IF;

    RAISE EXCEPTION 'prueba_ok';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'prueba_ok' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'whatsapp oficial (aprende + espejo): prueba OK';
END $prueba$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('whatsapp_oficial_aprende_y_apaga_espejo.sql');
