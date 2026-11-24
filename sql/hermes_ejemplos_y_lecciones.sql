-- ============================================================
-- hermes_ejemplos_y_lecciones.sql (24/11/2026)
-- ------------------------------------------------------------
-- Dos formas más rápidas de enseñarle a Hermes (pedido del dueño):
--
-- 1. EJEMPLOS PARECIDOS. hermes_contexto_sugerencia le daba 6 ejemplos de
--    cómo contesta la tienda escogidos AL AZAR (ORDER BY random()): a una
--    pregunta por gomas le podían tocar saludos o cadenas. Ahora son los 6
--    más parecidos a lo que dijo el cliente (pg_trgm + palabras de la
--    búsqueda), sin los mensajes automáticos. Cambia SOLO ese bloque; el resto
--    es la definición que estaba en producción hoy (pg_get_functiondef).
--
-- 2. LECCIONES. El juez del modo sombra anota lecciones; se agrupan en
--    hermes_lecciones y el dueño las aprueba en el Sales Hub. Las aprobadas
--    entran a las instrucciones de Hermes (hermes-sugerir).
-- ============================================================

-- ============================================================
-- 1. EJEMPLOS PARECIDOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.hermes_contexto_sugerencia(p_conversation_id uuid, p_hasta_message uuid DEFAULT NULL::uuid)
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
  v_consulta text;
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
  -- (24/11/2026) Ejemplos PARECIDOS a lo que pregunta el cliente, no al azar:
  -- si pregunta por una goma, ve como contesto la tienda sobre gomas. El
  -- parecido sale de lo que dijo el cliente en sus ultimos mensajes (pg_trgm)
  -- mas un punto por cada palabra de la busqueda que aparezca. Fuera los
  -- mensajes automaticos ("Gracias por comunicarte..."): se copiarian.
  -- En sombra, nunca ejemplos de ESTA conversacion ni posteriores a la pregunta.
  SELECT left(string_agg(x.message_text, ' '), 400) INTO v_consulta
  FROM (
    SELECT m.message_text FROM public.sales_messages m
    WHERE m.conversation_id = p_conversation_id AND m.sender_type = 'user'
      AND NULLIF(btrim(m.message_text), '') IS NOT NULL
      AND (COALESCE(m.enviado_en, m.created_at), m.created_at)
          <= (COALESCE(v_msg.enviado_en, v_msg.created_at), v_msg.created_at)
    ORDER BY COALESCE(m.enviado_en, m.created_at) DESC, m.created_at DESC
    LIMIT 3
  ) x;
  v_consulta := lower(COALESCE(v_consulta, ''));

  SELECT COALESCE(json_agg(json_build_object('pregunta', z.pregunta, 'respuesta', z.respuesta)), '[]'::json) INTO v_ejem
  FROM (
    SELECT left(t.customer_message, 160) AS pregunta,
           left(t.human_reply, 220)      AS respuesta
    FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.human_reply IS NOT NULL
      AND length(t.human_reply) BETWEEN 8 AND 220
      AND t.human_reply !~* '(gracias por (comunicarte|tu mensaje|su mensaje|escribir)|no podemos responder|en este momento no estamos)'
      AND t.customer_message ~* '(precio|cu[aá]nto|tiene|hay |disponib|sirve|compatib|modelo|goma|filtro|aceite|buj[ií]a|cadena|pastilla|bater|kit|cilindro|parrilla|reten|corona|pi[ñn]on)'
      AND (p_hasta_message IS NULL OR (t.conversation_id IS DISTINCT FROM p_conversation_id AND t.created_at < v_hasta_c))
    ORDER BY public.similarity(lower(t.customer_message), v_consulta)
             + 0.15 * (SELECT count(*) FROM unnest(COALESCE(v_palabras, '{}'::text[])) w
                        WHERE t.customer_message ILIKE '%' || w || '%') DESC,
             t.created_at DESC
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

-- ============================================================
-- 2. LECCIONES DE HERMES (las aprueba el dueño)
-- ------------------------------------------------------------
-- El juez del modo sombra anota una lección cada vez que la tienda contestó
-- mejor que Hermes. Aquí se juntan: una lección parecida a otra ya anotada
-- (pg_trgm > 0.5) suma "veces" en vez de repetirse, y guarda los 3 casos más
-- recientes como prueba. Nada entra a las instrucciones de Hermes hasta que
-- el dueño o un administrador la APRUEBA (o la escribe él mismo).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hermes_lecciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  texto         text NOT NULL CHECK (length(btrim(texto)) BETWEEN 5 AND 400),
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'descartada')),
  origen        text NOT NULL DEFAULT 'juez' CHECK (origen IN ('juez', 'dueno')),
  veces         integer NOT NULL DEFAULT 1,
  ejemplos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  visto_ultimo  timestamptz NOT NULL DEFAULT now(),
  decidido_por  uuid,
  decidido_en   timestamptz
);
CREATE INDEX IF NOT EXISTS hermes_lecciones_tenant_estado ON public.hermes_lecciones (tenant_id, estado);

ALTER TABLE public.hermes_lecciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_lecciones_leer ON public.hermes_lecciones;
CREATE POLICY hermes_lecciones_leer ON public.hermes_lecciones
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
REVOKE ALL ON public.hermes_lecciones FROM anon;
GRANT SELECT ON public.hermes_lecciones TO authenticated;
GRANT ALL ON public.hermes_lecciones TO service_role;

-- El juez guarda su evaluación y, si trae lección, la anota (o la suma).
CREATE OR REPLACE FUNCTION public.hermes_sombra_guardar_evaluacion(p_id uuid, p_eval jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r      record;
  v_lec  text := btrim(COALESCE(p_eval->>'leccion', ''));
  v_id   uuid;
  v_ej   jsonb;
BEGIN
  UPDATE public.sales_ai_training_logs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('evaluacion', p_eval || jsonb_build_object('en', now()))
   WHERE id = p_id
  RETURNING tenant_id, customer_message, human_reply, metadata->'sombra'->>'texto' AS sombra INTO r;

  IF r.tenant_id IS NULL OR length(v_lec) < 5 OR p_eval->>'veredicto' = 'no_comparable' THEN
    RETURN;
  END IF;

  v_ej := jsonb_build_object('log_id', p_id, 'pregunta', left(r.customer_message, 200),
                             'hermes', left(r.sombra, 250), 'tienda', left(r.human_reply, 250));

  SELECT l.id INTO v_id FROM public.hermes_lecciones l
   WHERE l.tenant_id = r.tenant_id
     AND public.similarity(lower(l.texto), lower(v_lec)) > 0.5
   ORDER BY public.similarity(lower(l.texto), lower(v_lec)) DESC, l.creado_en
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.hermes_lecciones (tenant_id, texto, ejemplos)
    VALUES (r.tenant_id, left(v_lec, 400), jsonb_build_array(v_ej));
  ELSE
    UPDATE public.hermes_lecciones l
       SET veces = l.veces + 1,
           visto_ultimo = now(),
           ejemplos = (SELECT COALESCE(jsonb_agg(e ORDER BY n), '[]'::jsonb)
                         FROM (SELECT e, n FROM jsonb_array_elements(l.ejemplos || jsonb_build_array(v_ej)) WITH ORDINALITY a(e, n)
                               ORDER BY n DESC LIMIT 3) x)
     WHERE l.id = v_id;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.hermes_sombra_guardar_evaluacion(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hermes_sombra_guardar_evaluacion(uuid, jsonb) TO service_role;

-- Aprobar / descartar / corregir el texto. Solo dueño o administrador.
CREATE OR REPLACE FUNCTION public.hermes_leccion_decidir(p_id uuid, p_estado text, p_texto text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t  uuid := public.get_user_tenant();
  v_n  integer;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa.'; END IF;
  IF NOT public._es_admin_de(v_t) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede decidir lo que aprende Hermes.' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('pendiente', 'aprobada', 'descartada') THEN RAISE EXCEPTION 'Estado inválido: %', p_estado; END IF;
  IF p_texto IS NOT NULL AND length(btrim(p_texto)) NOT BETWEEN 5 AND 400 THEN
    RAISE EXCEPTION 'La regla debe tener entre 5 y 400 letras.';
  END IF;

  UPDATE public.hermes_lecciones
     SET estado = p_estado,
         texto = COALESCE(NULLIF(btrim(p_texto), ''), texto),
         decidido_por = auth.uid(),
         decidido_en = now()
   WHERE id = p_id AND tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Esa lección no existe en esta empresa.'; END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;
REVOKE ALL ON FUNCTION public.hermes_leccion_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_leccion_decidir(uuid, text, text) TO authenticated, service_role;

-- Una regla escrita por el dueño entra ya aprobada.
CREATE OR REPLACE FUNCTION public.hermes_leccion_agregar(p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t  uuid := public.get_user_tenant();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa.'; END IF;
  IF NOT public._es_admin_de(v_t) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede enseñarle reglas a Hermes.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_texto, ''))) NOT BETWEEN 5 AND 400 THEN
    RAISE EXCEPTION 'La regla debe tener entre 5 y 400 letras.';
  END IF;
  INSERT INTO public.hermes_lecciones (tenant_id, texto, estado, origen, decidido_por, decidido_en)
  VALUES (v_t, btrim(p_texto), 'aprobada', 'dueno', auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;
REVOKE ALL ON FUNCTION public.hermes_leccion_agregar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_leccion_agregar(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_ejemplos_y_lecciones.sql');
