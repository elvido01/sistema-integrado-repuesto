-- =====================================================================
-- Hermes en SOMBRA: propone solo, no envía nada, y se compara (22/11/2026)
-- ---------------------------------------------------------------------
-- Mientras llega WhatsApp oficial, el dueño quiere que Hermes "analice las
-- conversaciones que llegan a WhatsApp Web y dé sus recomendaciones, para
-- seguirlo entrenando". Hasta hoy Hermes solo redactaba cuando alguien
-- apretaba el botón: 19 propuestas para 543 preguntas en 30 días.
--
-- Cómo funciona:
--  1. Cada pregunta del cliente que copia el espejo ya crea su fila en
--     sales_ai_training_logs (_ia_captura_pregunta_espejo), y la respuesta
--     real de la tienda se le pega al lado (_ia_captura_respuesta_humana).
--  2. Cada minuto (7 am – 9 pm) la función hermes-sombra toma las preguntas
--     nuevas (con 60 s de espera, para que el cliente termine de escribir),
--     abre sesión como el usuario "Hermes" de la empresa y llama a
--     hermes-sugerir en modo sombra: redacta viendo la conversación SOLO
--     HASTA la pregunta (nunca ve lo que contestó la tienda) y lo guarda en
--     metadata.sombra. No toca bot_reply/outcome: las propuestas del botón
--     y su medida "usada/editada" siguen igual.
--  3. Cuando la tienda ya contestó (10 min después de su respuesta), un juez
--     (gpt-4o-mini) compara las dos y anota en metadata.evaluacion:
--     igual / parecida / distinta / no_comparable, si el dato (precio,
--     existencia, pieza) coincide, quién contestó mejor y la lección.
--  4. Las que la tienda contestó mejor entran como ejemplos de corrección
--     en hermes-sugerir: así sigue aprendiendo.
--  5. hermes_sombra_resumen(días): % de acierto y las lecciones.
--
-- Usuario "Hermes": hermes_sombra_config(tenant_id, user_id). Lo crea
-- scripts/hermes-sombra-usuario.mjs (rol vendedor, sin contraseña conocida;
-- la función le abre sesión con un enlace mágico que no se envía).
--
-- hermes_contexto_sugerencia gana p_hasta_message (DEFAULT NULL = igual
-- que antes). Reemplaza la versión de sql/la_foto_tambien_habla.sql y
-- fix_hermes_busqueda_tildes_y_modelos.sql (definición viva copiada con
-- pg_get_functiondef el 22/11, solo se agregó el corte).
-- =====================================================================
BEGIN;

-- 1) Configuración --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hermes_sombra_config (
  tenant_id  uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  activo     boolean NOT NULL DEFAULT true,
  desde      timestamptz NOT NULL DEFAULT now(),
  creado_en  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hermes_sombra_config ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo servidor
REVOKE ALL ON public.hermes_sombra_config FROM PUBLIC, anon, authenticated;

-- 2) Contexto con corte "hasta la pregunta" --------------------------------------
DROP FUNCTION IF EXISTS public.hermes_contexto_sugerencia(uuid);
CREATE FUNCTION public.hermes_contexto_sugerencia(p_conversation_id uuid, p_hasta_message uuid DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- (22/11/2026) Modo sombra: todo se corta en la pregunta. Orden real =
  -- (hora de WhatsApp, hora de copia): el histórico trae la hora al minuto y
  -- la respuesta de la tienda puede tener la MISMA hora que la pregunta.
  v_hasta    timestamptz;
  v_hasta_c  timestamptz;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;

  SELECT * INTO v_conv FROM public.sales_conversations
  WHERE id = p_conversation_id AND tenant_id = v_tenant;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;

  IF p_hasta_message IS NOT NULL THEN
    SELECT * INTO v_msg FROM public.sales_messages
    WHERE id = p_hasta_message AND conversation_id = p_conversation_id AND sender_type = 'user';
    IF v_msg.id IS NULL THEN RAISE EXCEPTION 'Ese mensaje no es una pregunta de esta conversación'; END IF;
    v_hasta   := COALESCE(v_msg.enviado_en, v_msg.created_at);
    v_hasta_c := v_msg.created_at;
  ELSE
    -- La última pregunta del cliente. Ahora una FOTO también es una pregunta:
    -- "¿tienen esto?" dicho sin escribir. Antes esta linea exigia texto y la
    -- foto no contaba, asi que se contestaba el ultimo "Buenas" o el mensaje
    -- de la vispera.
    SELECT * INTO v_msg FROM public.sales_messages
    WHERE conversation_id = p_conversation_id AND sender_type = 'user'
      AND (COALESCE(btrim(message_text), '') <> '' OR media_url IS NOT NULL)
    ORDER BY COALESCE(enviado_en, created_at) DESC
    LIMIT 1;
  END IF;

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
      AND (v_hasta IS NULL OR (COALESCE(enviado_en, created_at), created_at) <= (v_hasta, v_hasta_c))
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
      AND COALESCE(enviado_en, created_at) > COALESCE(v_hasta, now()) - interval '24 hours'
      AND (v_hasta IS NULL OR (COALESCE(enviado_en, created_at), created_at) <= (v_hasta, v_hasta_c))
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
  -- En sombra, nunca ejemplos de ESTA conversación (sería ver la respuesta).
  SELECT COALESCE(json_agg(z), '[]'::json) INTO v_ejem
  FROM (
    SELECT left(t.customer_message, 160) AS pregunta,
           left(t.human_reply, 220)      AS respuesta
    FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.human_reply IS NOT NULL
      AND length(t.human_reply) BETWEEN 8 AND 220
      AND t.customer_message ~* '(precio|cu[aá]nto|tiene|hay |disponib|sirve|compatib|modelo|goma|filtro|aceite|buj[ií]a|cadena|pastilla|bater|kit|cilindro|parrilla|reten|corona|pi[ñn]on)'
      AND (p_hasta_message IS NULL OR t.conversation_id IS DISTINCT FROM p_conversation_id)
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
END $function$;
REVOKE ALL ON FUNCTION public.hermes_contexto_sugerencia(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_contexto_sugerencia(uuid, uuid) TO authenticated, service_role;

-- 3) Guardar la propuesta en sombra (la llama hermes-sugerir con la sesión de Hermes)
CREATE OR REPLACE FUNCTION public.hermes_guardar_sombra(p_message_id uuid, p_texto text, p_datos jsonb DEFAULT '{}'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  UPDATE public.sales_ai_training_logs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('sombra',
           jsonb_build_object('texto', p_texto, 'en', now()) || COALESCE(p_datos, '{}'::jsonb))
   WHERE message_id = p_message_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('guardado', v_n > 0);
END $$;
REVOKE ALL ON FUNCTION public.hermes_guardar_sombra(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_guardar_sombra(uuid, text, jsonb) TO authenticated, service_role;

-- 4) Lo que hermes-sombra (service_role) necesita ---------------------------------
-- Preguntas por proponer: con 60 s de espera; de una ráfaga del cliente
-- (varios mensajes seguidos) solo la ÚLTIMA; máximo 6 h de antigüedad; 2
-- intentos.
CREATE OR REPLACE FUNCTION public.hermes_sombra_pendientes(p_limite int DEFAULT 4)
RETURNS TABLE (message_id uuid, conversation_id uuid, tenant_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.message_id, t.conversation_id, t.tenant_id, c.user_id
    FROM public.sales_ai_training_logs t
    JOIN public.hermes_sombra_config c ON c.tenant_id = t.tenant_id AND c.activo
   WHERE t.message_id IS NOT NULL AND t.conversation_id IS NOT NULL
     AND t.created_at >= GREATEST(c.desde, now() - interval '6 hours')
     AND t.created_at <= now() - interval '60 seconds'
     AND NOT (COALESCE(t.metadata, '{}'::jsonb) ? 'sombra')
     AND COALESCE((t.metadata -> 'sombra_error' ->> 'n')::int, 0) < 2
     AND NOT EXISTS (SELECT 1 FROM public.sales_ai_training_logs t2
                      WHERE t2.conversation_id = t.conversation_id AND t2.id <> t.id
                        AND t2.created_at > t.created_at AND t2.created_at <= t.created_at + interval '3 minutes')
   ORDER BY t.created_at
   LIMIT GREATEST(1, LEAST(p_limite, 10));
$$;

CREATE OR REPLACE FUNCTION public.hermes_sombra_marcar_error(p_message_id uuid, p_error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.sales_ai_training_logs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('sombra_error', jsonb_build_object(
           'n', COALESCE((metadata -> 'sombra_error' ->> 'n')::int, 0) + 1,
           'ultimo', left(p_error, 300), 'en', now()))
   WHERE message_id = p_message_id;
$$;

-- Para el juez: la tienda ya contestó hace 10 min (para tener la respuesta
-- completa si la mandó en varios mensajes).
CREATE OR REPLACE FUNCTION public.hermes_sombra_por_evaluar(p_limite int DEFAULT 8)
RETURNS TABLE (id uuid, pregunta text, sombra text, humano text, piezas jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.customer_message, t.metadata -> 'sombra' ->> 'texto', t.human_reply,
         COALESCE(t.metadata -> 'sombra' -> 'piezas', '[]'::jsonb)
    FROM public.sales_ai_training_logs t
   WHERE t.metadata -> 'sombra' ->> 'texto' IS NOT NULL
     AND t.human_reply IS NOT NULL
     AND NOT (t.metadata ? 'evaluacion')
     AND COALESCE((t.metadata ->> 'respondido_en')::timestamptz, t.created_at) <= now() - interval '10 minutes'
     AND t.created_at > now() - interval '7 days'
   ORDER BY t.created_at
   LIMIT GREATEST(1, LEAST(p_limite, 20));
$$;

CREATE OR REPLACE FUNCTION public.hermes_sombra_guardar_evaluacion(p_id uuid, p_eval jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.sales_ai_training_logs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('evaluacion', p_eval || jsonb_build_object('en', now()))
   WHERE id = p_id;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.hermes_sombra_pendientes(integer)', 'public.hermes_sombra_marcar_error(uuid,text)',
                           'public.hermes_sombra_por_evaluar(integer)', 'public.hermes_sombra_guardar_evaluacion(uuid,jsonb)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- 5) El resumen -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_sombra_resumen(p_dias int DEFAULT 7, p_tenant uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := COALESCE(p_tenant, public.get_user_tenant()); v_res json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  PERFORM public._exigir_acceso_empresa(v_tenant);
  WITH base AS (
    SELECT t.*, t.metadata -> 'evaluacion' AS ev
      FROM public.sales_ai_training_logs t
     WHERE t.tenant_id = v_tenant AND t.created_at > now() - make_interval(days => GREATEST(p_dias, 1))
  )
  SELECT json_build_object(
    'dias', p_dias,
    'preguntas', (SELECT count(*) FROM base),
    'propuestas', (SELECT count(*) FROM base WHERE metadata -> 'sombra' ->> 'texto' IS NOT NULL),
    'no_contestar', (SELECT count(*) FROM base WHERE (metadata -> 'sombra' ->> 'no_responder')::boolean),
    'evaluadas', (SELECT count(*) FROM base WHERE ev IS NOT NULL AND ev ->> 'veredicto' <> 'no_comparable'),
    'veredictos', (SELECT json_object_agg(v, n) FROM (SELECT ev ->> 'veredicto' v, count(*) n FROM base WHERE ev IS NOT NULL GROUP BY 1) s),
    'acierto_pct', (SELECT round(100.0 * count(*) FILTER (WHERE ev ->> 'veredicto' IN ('igual','parecida'))
                                 / NULLIF(count(*), 0), 0)
                      FROM base WHERE ev IS NOT NULL AND ev ->> 'veredicto' <> 'no_comparable'),
    'dato_correcto_pct', (SELECT round(100.0 * count(*) FILTER (WHERE ev ->> 'mismo_dato' = 'si')
                                 / NULLIF(count(*) FILTER (WHERE ev ->> 'mismo_dato' IN ('si','no')), 0), 0)
                      FROM base WHERE ev IS NOT NULL),
    'hermes_mejor', (SELECT count(*) FROM base WHERE ev ->> 'quien_mejor' = 'hermes'),
    'lecciones', (SELECT COALESCE(json_agg(l ORDER BY l.cuando DESC), '[]'::json) FROM (
                    SELECT left(customer_message, 120) AS pregunta, ev ->> 'leccion' AS leccion,
                           ev ->> 'error_de_hermes' AS error, created_at AS cuando
                      FROM base WHERE COALESCE(ev ->> 'leccion', '') <> '' ORDER BY created_at DESC LIMIT 15) l)
  ) INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.hermes_sombra_resumen(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_sombra_resumen(integer, uuid) TO authenticated, service_role, hermes_readonly;

-- 6) Cada minuto, 7 am – 9 pm (hora RD = UTC-4) ---------------------------------
CREATE OR REPLACE FUNCTION public.hermes_sombra_llamar()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Con la clave pública, como crm_clasificador_llamar: la función solo
  -- procesa lo pendiente (cada pregunta una vez), así que llamarla de más no
  -- hace daño.
  SELECT net.http_post(
    url     := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/hermes-sombra',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000);
$$;
REVOKE ALL ON FUNCTION public.hermes_sombra_llamar() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hermes-sombra';
SELECT cron.schedule('hermes-sombra', '* 0,1,11-23 * * *', 'SELECT public.hermes_sombra_llamar()');

COMMIT;

-- Comprobación
SELECT jsonb_build_object(
  'contexto_nuevo', to_regprocedure('public.hermes_contexto_sugerencia(uuid,uuid)') IS NOT NULL,
  'contexto_viejo_borrado', to_regprocedure('public.hermes_contexto_sugerencia(uuid)') IS NULL,
  'anon_cerrado', NOT has_function_privilege('anon', 'public.hermes_guardar_sombra(uuid,text,jsonb)', 'EXECUTE'),
  'pendientes_solo_servidor', NOT has_function_privilege('authenticated', 'public.hermes_sombra_pendientes(integer)', 'EXECUTE'),
  'cron', (SELECT schedule FROM cron.job WHERE jobname = 'hermes-sombra'),
  'empresas_activas', (SELECT count(*) FROM public.hermes_sombra_config WHERE activo)
) AS r;

SELECT public.registrar_migracion('hermes_sombra.sql');
