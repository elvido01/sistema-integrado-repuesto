-- =====================================================================
-- Espejo de TikTok → Sales Hub (sin API de TikTok)
-- ---------------------------------------------------------------------
-- (2026-08-19) "TikTok es mi red social con más movimiento". Y es la única
-- de las tres donde no hay puerta oficial: la API de mensajería de TikTok
-- (Business Messaging) exige cuenta Business verificada con correo de
-- empresa y aprobación de la plataforma. Mientras eso no exista, los DM de
-- TikTok entran por el mismo camino que ya usan WhatsApp e Instagram: la
-- extensión lee lo que el navegador del vendedor YA recibió y lo espeja.
--
-- >>> LO QUE CAMBIA RESPECTO A INSTAGRAM <<<
-- Nada del lado de la base. Y eso es a propósito: en vez de copiar
-- omni_mirror_instagram y dejar dos cuerpos casi iguales condenados a
-- separarse, el cuerpo pasa a ser UNO — omni_mirror_hilo(plataforma,
-- payload) — y las dos funciones de antes quedan como puertas a lo mismo.
-- Un arreglo en el espejo arregla los dos canales.
--
-- Lo que sí cambia es el lado del navegador: Instagram contesta JSON y se
-- lee de una; TikTok contesta protobuf crudo, que hay que traducir antes.
-- Eso vive en la extensión (tt-protobuf.js) y está probado con datos hechos
-- a mano en tests/tiktokProtobuf.test.js.
--
-- >>> ESTO ENTRA, PERO TODAVIA NO SALE <<<
-- El puente es de una sola dirección. Instagram sí deja contestar desde el
-- CRM porque su dirección web dice qué conversación está abierta
-- (/direct/t/<hilo>), y así el mensaje del vendedor solo se escribe en el
-- chat que ya tiene delante. La bandeja de TikTok Web es un panel encima de
-- la página y NO cambia la dirección: no hay forma de saber con certeza qué
-- conversación está abierta. Escribir a ciegas ahí es mandarle a un cliente
-- lo que era para otro, y eso no se arregla con un "perdón".
--
-- >>> SEGURIDAD <<<
-- SECURITY DEFINER pero estrictamente acotada: escribe solo en el tenant de
-- quien llama, resuelto con get_user_tenant(). El payload nunca decide el
-- tenant. Si no hay sesión, no escribe nada.
--
-- Idempotente / re-ejecutable. Re-espejar la misma conversación no duplica.
-- =====================================================================

-- ------------------------------------------------------------
-- 0) TIKTOK COMO CANAL VALIDO
-- ------------------------------------------------------------
-- sales_conversations y sales_messages sólo aceptaban whatsapp, instagram,
-- facebook y youtube. social_accounts ya aceptaba tiktok desde que se hizo
-- el módulo de Marketing, así que la única que faltaba era la mensajería.
ALTER TABLE public.sales_conversations DROP CONSTRAINT IF EXISTS sales_conversations_platform_check;
ALTER TABLE public.sales_conversations ADD CONSTRAINT sales_conversations_platform_check
  CHECK (platform = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'facebook'::text, 'youtube'::text, 'tiktok'::text]));

ALTER TABLE public.sales_messages DROP CONSTRAINT IF EXISTS sales_messages_platform_check;
ALTER TABLE public.sales_messages ADD CONSTRAINT sales_messages_platform_check
  CHECK (platform = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'facebook'::text, 'youtube'::text, 'tiktok'::text]));

-- ------------------------------------------------------------
-- 1) EL ESPEJO, UNO SOLO PARA TODAS LAS REDES
-- ------------------------------------------------------------
-- Escribe en las MISMAS tablas que el webhook de Meta y con el MISMO
-- formato de identificadores:
--
--   external_conversation_id = '<red>:<cuenta>:<remitente>'
--   external_message_id      = el id que traiga la red
--
-- Eso no es un detalle. El día que una de estas redes abra su API y empiece
-- a entregar por webhook, las conversaciones NO se duplican: caen sobre las
-- mismas filas y la conversación sigue donde estaba. El espejo se apaga y ya.
CREATE OR REPLACE FUNCTION public.omni_mirror_hilo(p_plataforma text, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    'canal', v_plat,
    'conversacion', v_conv,
    'external_id', v_ext,
    'recibidos', jsonb_array_length(v_msgs),
    'nuevos', v_nuevos
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_hilo(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_hilo(text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 2) LAS PUERTAS DE CADA RED
-- ------------------------------------------------------------
-- omni_mirror_instagram existe desde el 2026-08-07 y la extensión instalada
-- la llama por su nombre. Se conserva tal cual la ve quien llama; por
-- dentro pasa a delegar en el cuerpo común.
CREATE OR REPLACE FUNCTION public.omni_mirror_instagram(p_payload jsonb)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.omni_mirror_hilo('instagram', p_payload) $$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_instagram(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_instagram(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.omni_mirror_tiktok(p_payload jsonb)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.omni_mirror_hilo('tiktok', p_payload) $$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_tiktok(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_tiktok(jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 3) ¿ESTA VIVO EL ESPEJO?
-- ------------------------------------------------------------
-- La lección del espejo de WhatsApp: cuando se rompe, no avisa. Se queda
-- callado y todo el mundo cree que simplemente no han escrito. Esto
-- distingue "nadie ha escrito" de "hace tres días que no entra nada".
CREATE OR REPLACE FUNCTION public.get_omni_espejo_estado(p_plataforma text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_plat    text := lower(btrim(COALESCE(p_plataforma, '')));
  v_convs   int;
  v_msgs    int;
  v_ultimo  timestamptz;
  v_horas   numeric;
  v_cola    int;
  v_fallos  int;
  v_estado  text;
BEGIN
  IF v_tenant IS NULL THEN RETURN json_build_object('estado', 'sin_sesion'); END IF;

  SELECT COUNT(DISTINCT c.id), COUNT(m.id), MAX(m.created_at)
    INTO v_convs, v_msgs, v_ultimo
  FROM public.sales_conversations c
  LEFT JOIN public.sales_messages m ON m.conversation_id = c.id
  WHERE c.tenant_id = v_tenant AND c.platform = v_plat;

  SELECT COUNT(*) FILTER (WHERE status = 'queued'),
         COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_cola, v_fallos
  FROM public.sales_messages
  WHERE tenant_id = v_tenant AND platform = v_plat AND sender_type = 'agent';

  v_horas := CASE WHEN v_ultimo IS NULL THEN NULL
                  ELSE round(EXTRACT(EPOCH FROM (now() - v_ultimo)) / 3600.0, 1) END;

  v_estado := CASE
    -- Nunca entró nada: o no han escrito, o el espejo jamás corrió. No se
    -- puede distinguir todavía, y decir "roto" sería mentir.
    WHEN v_msgs = 0        THEN 'sin_datos'
    WHEN v_horas <= 24     THEN 'ok'
    WHEN v_horas <= 72     THEN 'tranquilo'
    ELSE                        'revisar'
  END;

  RETURN json_build_object(
    'canal', v_plat,
    'estado', v_estado,
    'conversaciones', v_convs,
    'mensajes', v_msgs,
    'ultimo', v_ultimo,
    'horas_sin_captura', v_horas,
    'en_cola', v_cola,
    'fallidos', v_fallos
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_omni_espejo_estado(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_omni_espejo_estado(text) TO authenticated;

-- La de Instagram sigue existiendo con su nombre y su firma de siempre.
CREATE OR REPLACE FUNCTION public.get_omni_ig_estado()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.get_omni_espejo_estado('instagram') $$;

REVOKE EXECUTE ON FUNCTION public.get_omni_ig_estado() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_omni_ig_estado() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('omni_espejo_tiktok.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Lo que importa: que tiktok sea un canal válido en las dos tablas, que
-- existan las tres puertas, y que Instagram siga entrando por la suya.
SELECT
  CASE WHEN (SELECT pg_get_constraintdef(oid) FROM pg_constraint
             WHERE conname = 'sales_conversations_platform_check') LIKE '%tiktok%'
       THEN 'OK  conversaciones admiten tiktok' ELSE '*** FALLO ***' END AS conversaciones,
  CASE WHEN (SELECT pg_get_constraintdef(oid) FROM pg_constraint
             WHERE conname = 'sales_messages_platform_check') LIKE '%tiktok%'
       THEN 'OK  mensajes admiten tiktok' ELSE '*** FALLO ***' END AS mensajes,
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('omni_mirror_hilo', 'omni_mirror_tiktok', 'omni_mirror_instagram')) = 3
       THEN 'OK  las tres puertas' ELSE '*** FALLO *** falta alguna funcion' END AS funciones;

-- Lo que hay hoy en cada red, para comparar después de abrir TikTok.
SELECT platform,
       count(*) AS conversaciones,
       count(*) FILTER (WHERE status = 'nuevo') AS sin_tocar,
       max(last_message_at) AS ultimo
FROM public.sales_conversations
GROUP BY platform
ORDER BY conversaciones DESC;
