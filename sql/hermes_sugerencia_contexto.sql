-- =====================================================================
-- Hermes le sugiere la respuesta al vendedor
-- ---------------------------------------------------------------------
-- (2026-08-07) Los datos dijeron por dónde ir: de las 1,000 preguntas
-- capturadas, solo 55 son de negocio, y de los 184 pares con respuesta solo
-- 32 son consultas de repuestos. Pero esos 32 enseñan algo importante:
--
--   "Hola la parrilla tienen"     →  "Cuesta 1,400"
--   "Tienen de esa macha"         →  "no líder creo que llegan para fin de mes"
--
-- La respuesta depende del INVENTARIO, no del estilo. Ningún historial de
-- chat le enseña a Hermes si una pieza está en stock: eso está aquí, en la
-- base. Por eso el camino no es acumular más ejemplos sino darle los datos.
--
-- >>> QUÉ DEVUELVE <<<
-- Todo lo que hace falta para redactar una respuesta, en UNA llamada:
--   · la pregunta del cliente y las últimas líneas de la conversación
--   · las piezas candidatas CON precio y existencia real
--   · unos pocos ejemplos del tono de la casa
--
-- Los ejemplos van aparte de los productos a propósito: enseñan CÓMO se
-- contesta, no QUÉ se contesta. El qué sale del inventario.
--
-- >>> POR QUÉ AQUÍ Y NO EN LA EDGE FUNCTION <<<
-- La búsqueda vive donde están los datos: aquí hay tenant, RLS y el stock.
-- La función de afuera solo redacta. Si mañana se cambia de proveedor de
-- IA, esto no se toca.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- PALABRAS QUE SIRVEN PARA BUSCAR
-- ------------------------------------------------------------
-- De "Hola buenas, la parrilla del TVS tienen?" solo sirven 'parrilla' y
-- 'tvs'. Los saludos y los verbos ensucian la búsqueda: 'tienen' aparece en
-- media tienda.
CREATE OR REPLACE FUNCTION public._hermes_palabras(p_texto text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(p), '{}')
  FROM (
    SELECT DISTINCT lower(unnest) AS p
    FROM unnest(regexp_split_to_array(COALESCE(p_texto, ''), '[^[:alnum:]]+'))
    WHERE length(unnest) >= 3
      AND lower(unnest) NOT IN (
        'hola','buenas','buenos','dias','días','tardes','noches','saludo','saludos',
        'que','qué','como','cómo','para','por','con','del','las','los','una','uno',
        'tiene','tienen','tienes','hay','esta','este','esa','ese','eso','esto',
        'precio','cuanto','cuánto','cuesta','vale','favor','gracias','usted','ustedes',
        'mande','manda','dime','decir','saber','quiero','necesito','busco','tengo',
        'ahi','ahí','alla','allá','aqui','aquí','señor','amigo','hermano','lider','líder',
        'ok','okay','bien','claro','ver','tambien','también','pero','porque','cual','cuál'
      )
  ) x;
$$;

-- ------------------------------------------------------------
-- EL CONTEXTO COMPLETO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_contexto_sugerencia(p_conversation_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_conv     record;
  v_msg      record;
  v_palabras text[];
  v_prods    json;
  v_hist     json;
  v_ejem     json;
  v_empresa  text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;

  SELECT * INTO v_conv FROM public.sales_conversations
  WHERE id = p_conversation_id AND tenant_id = v_tenant;
  IF v_conv.id IS NULL THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;

  -- La última pregunta del cliente: es a lo que hay que contestar.
  SELECT * INTO v_msg FROM public.sales_messages
  WHERE conversation_id = p_conversation_id AND sender_type = 'user'
    AND COALESCE(btrim(message_text), '') <> ''
  ORDER BY COALESCE(enviado_en, created_at) DESC
  LIMIT 1;

  IF v_msg.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'La conversación no tiene ninguna pregunta del cliente');
  END IF;

  SELECT nombre INTO v_empresa FROM public.config_empresa WHERE tenant_id = v_tenant;

  -- Las últimas líneas, para que Hermes no conteste fuera de contexto
  -- ("de la AX100" no se entiende sin el mensaje anterior).
  SELECT COALESCE(json_agg(x ORDER BY x.cuando), '[]'::json) INTO v_hist
  FROM (
    SELECT CASE WHEN sender_type = 'user' THEN 'cliente' ELSE 'nosotros' END AS quien,
           left(message_text, 300) AS texto,
           COALESCE(enviado_en, created_at) AS cuando
    FROM public.sales_messages
    WHERE conversation_id = p_conversation_id
      AND COALESCE(btrim(message_text), '') <> ''
    ORDER BY COALESCE(enviado_en, created_at) DESC
    LIMIT 8
  ) x;

  -- ---- LAS PIEZAS ----
  v_palabras := public._hermes_palabras(v_msg.message_text);

  IF array_length(v_palabras, 1) > 0 THEN
    SELECT COALESCE(json_agg(y), '[]'::json) INTO v_prods
    FROM (
      SELECT p.codigo,
             p.descripcion,
             round(COALESCE(p.precio, 0), 2) AS precio,
             COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
             -- cuántas de las palabras buscadas aparecen: más palabras, más
             -- probable que sea la pieza que pidió
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
  -- Pocos y buenos. Enseñan CÓMO habla la casa, no qué hay en almacén.
  SELECT COALESCE(json_agg(z), '[]'::json) INTO v_ejem
  FROM (
    SELECT left(t.customer_message, 160) AS pregunta,
           left(t.human_reply, 220)      AS respuesta
    FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.human_reply IS NOT NULL
      AND length(t.human_reply) BETWEEN 8 AND 220
      -- solo los que parecen de negocio: el resto es conversación personal
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
    'pregunta', v_msg.message_text,
    'historial', v_hist,
    'busqueda', v_palabras,
    'productos', v_prods,
    'ejemplos', v_ejem
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.hermes_contexto_sugerencia(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_contexto_sugerencia(uuid) TO authenticated;

-- ------------------------------------------------------------
-- GUARDAR LA SUGERENCIA
-- ------------------------------------------------------------
-- Va en sales_ai_training_logs.bot_reply, al lado del human_reply que ya
-- captura el disparador. Comparar las dos ES la señal de aprendizaje: si el
-- vendedor la mandó tal cual, Hermes acertó; si la reescribió, ahí está la
-- corrección; si la ignoró, falló.
CREATE OR REPLACE FUNCTION public.hermes_guardar_sugerencia(
  p_message_id uuid, p_sugerencia text, p_datos jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  UPDATE public.sales_ai_training_logs
  SET bot_reply = p_sugerencia,
      metadata  = COALESCE(metadata, '{}'::jsonb)
                  || jsonb_build_object('sugerido_en', now(), 'contexto', p_datos)
  WHERE message_id = p_message_id AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN json_build_object('guardado', v_n > 0);
END $$;

-- ------------------------------------------------------------
-- QUÉ HIZO EL VENDEDOR CON ELLA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_marcar_uso(p_message_id uuid, p_resultado text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF p_resultado NOT IN ('usada', 'editada', 'descartada') THEN
    RAISE EXCEPTION 'resultado debe ser usada, editada o descartada';
  END IF;
  UPDATE public.sales_ai_training_logs
  SET outcome = p_resultado
  WHERE message_id = p_message_id AND tenant_id = v_tenant;
  RETURN json_build_object('ok', true, 'resultado', p_resultado);
END $$;

REVOKE EXECUTE ON FUNCTION public.hermes_guardar_sugerencia(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hermes_marcar_uso(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_guardar_sugerencia(uuid, text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.hermes_marcar_uso(uuid, text) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_sugerencia_contexto.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) ¿SEPARA BIEN LAS PALABRAS ÚTILES?
SELECT public._hermes_palabras('Hola buenas, la parrilla del TVS 125 la tienen? que precio');
-- esperado: {parrilla, tvs, 125} — sin saludos ni verbos.

-- 2) EL CONTEXTO DE UNA CONVERSACIÓN REAL
-- (correr con sesión iniciada; con service_role el tenant sale NULL)
-- SELECT jsonb_pretty(public.hermes_contexto_sugerencia('<conversation_id>')::jsonb);

-- 3) CUÁNTOS EJEMPLOS DE TONO HAY DISPONIBLES
SELECT COUNT(*) AS ejemplos_de_negocio
FROM public.sales_ai_training_logs
WHERE human_reply IS NOT NULL
  AND length(human_reply) BETWEEN 8 AND 220
  AND customer_message ~* '(precio|cu[aá]nto|tiene|hay |disponib|sirve|compatib|modelo|goma|filtro|aceite|buj[ií]a|cadena|pastilla|bater|kit|cilindro|parrilla|reten|corona|pi[ñn]on)';
-- Con pocos alcanza: enseñan el tono, no el inventario.
