-- =====================================================================
-- La foto también habla
-- ---------------------------------------------------------------------
-- (2026-08-29) Un cliente mandó la foto de unos balancines y escribió
-- "necesito saber si tienen esa pieza de loncin 200 pruss del nuevo". Al
-- pulsar Sugerir, el agente contestó sobre un mensaje de DOCE HORAS antes.
-- La foto no le llegó nunca.
--
-- La cadena se rompía en tres sitios, y en ninguno era culpa del modelo
-- (gpt-4o-mini lee imágenes de sobra):
--
--   1. El espejo detectaba la foto por `img[src^="blob:"]`, apuntaba el tipo
--      y tiraba los bytes. Un blob: solo existe dentro de esa pestaña.
--      → arreglado en la extensión (src/utils/fotoDelChat.js)
--
--   2. ESTA función descartaba los mensajes sin texto —`message_text <> ''`,
--      dos veces: para elegir la pregunta y para armar el historial—. La
--      foto no existía ni como dato: el agente ni sabía que hubo una.
--
--   3. hermes-sugerir armaba el prompt solo con texto.
--
-- Y el hueco no era anecdótico: 249 fotos de clientes por WhatsApp, 186 de
-- ellas SIN una sola palabra. 186 veces contestando a otra pregunta.
--
-- >>> LO QUE SE ARREGLA AQUI <<<
--   a) permiso para que la extensión suba al bucket whatsapp-media, en la
--      carpeta de SU empresa y nada más;
--   b) el espejo guarda media_url también al re-espejar (antes solo al
--      insertar, así que una foto que llegara tarde no se recuperaba nunca);
--   c) el contexto de sugerencia ve las fotos y las entrega.
--
-- >>> EL LIMITE HONESTO <<<
-- Si el último mensaje del cliente es SOLO una foto, la fila de aprendizaje
-- no existe: el trigger que las crea filtra los mensajes sin texto que
-- sirvan de ejemplo. Esa sugerencia se redacta pero no se guarda para
-- aprender. Es aceptable —una foto sin texto no enseña a escribir— y es
-- mejor que la alternativa de hoy, que es contestar a otra cosa.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Que la extensión pueda dejar la foto, y solo en su carpeta
-- ---------------------------------------------------------------------
-- El bucket existe desde mayo y es público, con 331 objetos dentro; las
-- subía la Edge Function con service_role, así que nunca hizo falta una
-- política. La extensión entra como el usuario, y sin política no entra.
--
-- La ruta es <tenant>/espejo/<id>.jpg y la política mira esa primera
-- carpeta: nadie puede escribir en la de otra empresa aunque adivine el
-- nombre. Se usa get_user_tenant() —la empresa ACTIVA— y no profiles, que
-- con un usuario que cambia de empresa apunta a la que no es.
DROP POLICY IF EXISTS whatsapp_media_espejo_insert ON storage.objects;
CREATE POLICY whatsapp_media_espejo_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant()::text
  );

DROP POLICY IF EXISTS whatsapp_media_espejo_update ON storage.objects;
CREATE POLICY whatsapp_media_espejo_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant()::text
  )
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant()::text
  );

DROP POLICY IF EXISTS whatsapp_media_espejo_select ON storage.objects;
CREATE POLICY whatsapp_media_espejo_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant()::text
  );

-- ---------------------------------------------------------------------
-- 2) El espejo guarda la foto también la segunda vez
-- ---------------------------------------------------------------------
-- El ON CONFLICT no tocaba media_url. La primera vuelta del espejo puede
-- llegar antes de que WhatsApp termine de descargar la imagen: sin esto, esa
-- foto se quedaba sin url para siempre porque las vueltas siguientes solo
-- actualizaban el texto.
CREATE OR REPLACE FUNCTION public.omni_mirror_whatsapp(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
END $fn$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) El contexto deja de tirar las fotos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_contexto_sugerencia(p_conversation_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_conv     record;
  v_msg      record;
  v_palabras text[];
  v_prods    json;
  v_hist     json;
  v_ejem     json;
  v_fotos    json;
  v_empresa  text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;

  SELECT * INTO v_conv FROM public.sales_conversations
  WHERE id = p_conversation_id AND tenant_id = v_tenant;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;

  -- La última pregunta del cliente. Ahora una FOTO también es una pregunta:
  -- "¿tienen esto?" dicho sin escribir. Antes esta linea exigia texto y la
  -- foto no contaba, asi que se contestaba el ultimo "Buenas" o el mensaje
  -- de la vispera.
  SELECT * INTO v_msg FROM public.sales_messages
  WHERE conversation_id = p_conversation_id AND sender_type = 'user'
    AND (COALESCE(btrim(message_text), '') <> '' OR media_url IS NOT NULL)
  ORDER BY COALESCE(enviado_en, created_at) DESC
  LIMIT 1;

  IF v_msg.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'La conversación no tiene ninguna pregunta del cliente');
  END IF;

  SELECT nombre INTO v_empresa FROM public.config_empresa WHERE tenant_id = v_tenant;

  -- Las últimas líneas. Los adjuntos entran marcados: sin ellos, "mira esta"
  -- seguido de una foto se leia como una frase suelta sin sentido.
  SELECT COALESCE(json_agg(x ORDER BY x.cuando), '[]'::json) INTO v_hist
  FROM (
    SELECT CASE WHEN sender_type = 'user' THEN 'cliente' ELSE 'nosotros' END AS quien,
           COALESCE(NULLIF(left(message_text, 300), ''),
                    CASE message_type
                      WHEN 'image'    THEN '[mandó una foto]'
                      WHEN 'audio'    THEN '[mandó un audio]'
                      WHEN 'video'    THEN '[mandó un video]'
                      WHEN 'document' THEN '[mandó un documento]'
                      WHEN 'sticker'  THEN '[mandó un sticker]'
                      ELSE '[adjunto]'
                    END) AS texto,
           COALESCE(enviado_en, created_at) AS cuando
    FROM public.sales_messages
    WHERE conversation_id = p_conversation_id
      AND (COALESCE(btrim(message_text), '') <> '' OR message_type <> 'text')
    ORDER BY COALESCE(enviado_en, created_at) DESC
    LIMIT 10
  ) x;

  -- ---- LAS FOTOS QUE SE PUEDEN MIRAR ----
  -- Solo las del CLIENTE, solo las que de verdad tienen archivo y solo las
  -- ultimas: mandarle tres imagenes al modelo cuesta y confunde. Se limita a
  -- las 2 mas recientes de las ultimas 24 horas — una foto de hace una
  -- semana es de otra consulta.
  SELECT COALESCE(json_agg(f ORDER BY f.cuando DESC), '[]'::json) INTO v_fotos
  FROM (
    SELECT media_url AS url, COALESCE(enviado_en, created_at) AS cuando,
           NULLIF(btrim(message_text), '') AS pie
    FROM public.sales_messages
    WHERE conversation_id = p_conversation_id
      AND sender_type = 'user'
      AND message_type = 'image'
      AND media_url IS NOT NULL
      AND COALESCE(enviado_en, created_at) > now() - interval '24 hours'
    ORDER BY COALESCE(enviado_en, created_at) DESC
    LIMIT 2
  ) f;

  -- ---- LAS PIEZAS ----
  v_palabras := public._hermes_palabras(v_msg.message_text);

  IF array_length(v_palabras, 1) > 0 THEN
    SELECT COALESCE(json_agg(y), '[]'::json) INTO v_prods
    FROM (
      SELECT p.codigo,
             p.descripcion,
             round(COALESCE(p.precio, 0), 2) AS precio,
             COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
             (SELECT COUNT(*) FROM unnest(v_palabras) w
               WHERE p.descripcion ILIKE '%' || w || '%'
                  OR COALESCE(p.codigo, '') ILIKE '%' || w || '%') AS aciertos
      FROM public.productos p
      WHERE p.tenant_id = v_tenant
        AND COALESCE(p.activo, true) = true
        AND EXISTS (
          SELECT 1 FROM unnest(v_palabras) w
          WHERE p.descripcion ILIKE '%' || w || '%'
             OR COALESCE(p.codigo, '') ILIKE '%' || w || '%'
        )
      ORDER BY aciertos DESC,
               COALESCE(public.get_stock_actual(p.id), 0) DESC,
               p.descripcion
      LIMIT 8
    ) y;
  ELSE
    v_prods := '[]'::json;
  END IF;

  -- ---- EL TONO ----
  SELECT COALESCE(json_agg(z), '[]'::json) INTO v_ejem
  FROM (
    SELECT left(t.customer_message, 160) AS pregunta,
           left(t.human_reply, 220)      AS respuesta
    FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.human_reply IS NOT NULL
      AND length(t.human_reply) BETWEEN 8 AND 220
      AND t.customer_message ~* '(precio|cu[aá]nto|tiene|hay |disponib|sirve|compatib|modelo|goma|filtro|aceite|buj[ií]a|cadena|pastilla|bater|kit|cilindro|parrilla|reten|corona|pi[ñn]on)'
    ORDER BY random()
    LIMIT 6
  ) z;

  RETURN json_build_object(
    'ok', true,
    'empresa', v_empresa,
    'canal', v_conv.platform,
    'cliente', COALESCE(v_conv.customer_name, 'el cliente'),
    'message_id', v_msg.id,
    'pregunta', COALESCE(NULLIF(btrim(v_msg.message_text), ''),
                         CASE WHEN v_msg.media_url IS NOT NULL
                              THEN '(el cliente mandó una foto, sin escribir nada)'
                              ELSE '' END),
    -- Que la pantalla sepa si hubo foto aunque no se haya podido guardar:
    -- decir "no la veo" es infinitamente mejor que inventar.
    'hubo_foto', (v_msg.message_type = 'image'),
    'fotos', v_fotos,
    'historial', v_hist,
    'busqueda', v_palabras,
    'productos', v_prods,
    'ejemplos', v_ejem
  );
END $fn$;

REVOKE EXECUTE ON FUNCTION public.hermes_contexto_sugerencia(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_contexto_sugerencia(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_foto_tambien_habla.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'politicas_bucket', (SELECT json_agg(p.polname ORDER BY p.polname)
     FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='storage' AND c.relname='objects'
       AND p.polname LIKE 'whatsapp_media_espejo%'),
  'fotos_de_clientes', (SELECT count(*) FROM public.sales_messages
     WHERE sender_type='user' AND message_type='image'),
  'con_archivo', (SELECT count(*) FROM public.sales_messages
     WHERE sender_type='user' AND message_type='image' AND media_url IS NOT NULL),
  'sin_una_palabra', (SELECT count(*) FROM public.sales_messages
     WHERE sender_type='user' AND message_type='image'
       AND COALESCE(btrim(message_text),'') = '')
) AS r;
