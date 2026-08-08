-- =====================================================================
-- La búsqueda de Hermes fallaba justo cuando la pieza SÍ estaba
-- ---------------------------------------------------------------------
-- (2026-08-08) Primera prueba real. El cliente escribió:
--
--   "Hola quiero un cigueñal g2 vini"
--
-- Y la pieza existe, exacta:
--
--   CIGUENAL RACING PRESS CUB G2 VINI  ·  RD$ 2,300
--
-- La versión anterior NO la encontraba, por dos motivos que se suman:
--
-- >>> 1. LAS TILDES <<<
-- El cliente escribió "cigueñal" con Ñ. El catálogo dice "CIGUENAL" con N.
-- ILIKE compara letra por letra y la Ñ no es la N, así que no cruza.
--
-- Y no es que el catálogo esté mal escrito: tiene las DOS formas conviviendo.
-- De 38 cigüeñales, unos dicen CIGUENAL y otros CIGUEÑAL. Cualquier búsqueda
-- literal encuentra solo la mitad, escriba como escriba el cliente.
--
-- La salida no es corregir 5,342 descripciones: es comparar sin tildes de
-- los dos lados. "cigueñal" y "CIGUENAL" pasan a ser la misma palabra.
--
-- >>> 2. LOS MODELOS CORTOS <<<
-- "g2" se descartaba por tener menos de 3 letras. Pero g2, r6, c90 o 6205
-- no son ruido: son el modelo, y son lo MÁS discriminante de la frase. Sin
-- "g2" solo quedaba "vini", que devuelve cualquier cosa de esa marca.
--
-- Ahora se conservan las de 2 caracteres que mezclan letra y número. Las de
-- dos letras puras ("la", "el") siguen fuera.
--
-- >>> POR QUÉ EL RUIDO NO IMPORTA <<<
-- "g2" también aparece dentro de "CG200". Da igual: manda el número de
-- palabras que coinciden, y CIGUENAL RACING PRESS CUB G2 VINI acierta las
-- tres — cigueñal, g2 y vini — mientras que un CG200 cualquiera acierta una.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- COMPARAR SIN TILDES
-- ------------------------------------------------------------
-- Con translate() y no con la extensión unaccent: no depende de que esté
-- instalada, es IMMUTABLE y se puede indexar el día que haga falta.
CREATE OR REPLACE FUNCTION public._sin_tildes(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(lower(COALESCE(p_texto, '')),
                   'áéíóúüñàèìòùäëïöâêîôûçÁÉÍÓÚÜÑÀÈÌÒÙÄËÏÖÂÊÎÔÛÇ',
                   'aeiouunaeiouaeioaeioucaeiouunaeiouaeioaeiouc');
$$;

-- ------------------------------------------------------------
-- LAS PALABRAS QUE SIRVEN
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hermes_palabras(p_texto text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(p), '{}')
  FROM (
    SELECT DISTINCT public._sin_tildes(unnest) AS p
    FROM unnest(regexp_split_to_array(COALESCE(p_texto, ''), '[^[:alnum:]]+'))
    WHERE (
        length(unnest) >= 3
        -- modelos cortos: g2, r6, x1. Dos caracteres, pero solo si mezclan
        -- letra y número — asi entran los modelos y no entran "la" ni "el".
        OR (length(unnest) = 2 AND unnest ~ '[0-9]' AND unnest ~ '[[:alpha:]]')
      )
      AND public._sin_tildes(unnest) NOT IN (
        'hola','buenas','buenos','dias','tardes','noches','saludo','saludos',
        'que','como','para','por','con','del','las','los','una','uno',
        'tiene','tienen','tienes','hay','esta','este','esa','ese','eso','esto',
        'precio','cuanto','cuesta','vale','favor','gracias','usted','ustedes',
        'mande','manda','dime','decir','saber','quiero','necesito','busco','tengo',
        'ahi','alla','aqui','senor','amigo','hermano','lider',
        'okay','bien','claro','ver','tambien','pero','porque','cual','disponible'
      )
  ) x;
$$;

-- ------------------------------------------------------------
-- EL CONTEXTO, BUSCANDO SIN TILDES
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

  SELECT * INTO v_msg FROM public.sales_messages
  WHERE conversation_id = p_conversation_id AND sender_type = 'user'
    AND COALESCE(btrim(message_text), '') <> ''
  ORDER BY COALESCE(enviado_en, created_at) DESC
  LIMIT 1;

  IF v_msg.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'La conversación no tiene ninguna pregunta del cliente');
  END IF;

  SELECT nombre INTO v_empresa FROM public.config_empresa WHERE tenant_id = v_tenant;

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

  v_palabras := public._hermes_palabras(v_msg.message_text);

  IF array_length(v_palabras, 1) > 0 THEN
    SELECT COALESCE(json_agg(y), '[]'::json) INTO v_prods
    FROM (
      SELECT p.codigo,
             p.descripcion,
             round(COALESCE(p.precio, 0), 2) AS precio,
             COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
             (SELECT COUNT(*) FROM unnest(v_palabras) w
               WHERE public._sin_tildes(p.descripcion) LIKE '%' || w || '%'
                  OR public._sin_tildes(COALESCE(p.codigo, '')) LIKE '%' || w || '%') AS aciertos
      FROM public.productos p
      WHERE p.tenant_id = v_tenant
        AND COALESCE(p.activo, true) = true
        AND EXISTS (
          SELECT 1 FROM unnest(v_palabras) w
          WHERE public._sin_tildes(p.descripcion) LIKE '%' || w || '%'
             OR public._sin_tildes(COALESCE(p.codigo, '')) LIKE '%' || w || '%'
        )
      -- Manda cuántas palabras acierta: la pieza que cruza cigüeñal + g2 +
      -- vini gana a cualquiera que solo cruce la marca.
      ORDER BY aciertos DESC,
               COALESCE(public.get_stock_actual(p.id), 0) DESC,
               p.descripcion
      LIMIT 8
    ) y;
  ELSE
    v_prods := '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(z), '[]'::json) INTO v_ejem
  FROM (
    SELECT left(t.customer_message, 160) AS pregunta,
           left(t.human_reply, 220)      AS respuesta
    FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.human_reply IS NOT NULL
      AND length(t.human_reply) BETWEEN 8 AND 220
      AND public._sin_tildes(t.customer_message) ~
          '(precio|cuanto|tiene|hay |disponib|sirve|compatib|modelo|goma|filtro|aceite|bujia|cadena|pastilla|bater|kit|cilindro|parrilla|reten|corona|pinon|ciguenal)'
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

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_hermes_busqueda_tildes_y_modelos.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS PALABRAS, CON EL MODELO ADENTRO
SELECT public._hermes_palabras('Hola quiero un cigueñal g2 vini');
-- esperado: {ciguenal, g2, vini} — sin tilde y CON el g2.

-- 2) EL CASO REAL: ¿SALE PRIMERO LA PIEZA CORRECTA?
WITH pal AS (SELECT public._hermes_palabras('Hola quiero un cigueñal g2 vini') AS w)
SELECT p.descripcion, p.precio,
       (SELECT COUNT(*) FROM unnest((SELECT w FROM pal)) x
         WHERE public._sin_tildes(p.descripcion) LIKE '%' || x || '%') AS aciertos
FROM public.productos p
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND EXISTS (SELECT 1 FROM unnest((SELECT w FROM pal)) x
               WHERE public._sin_tildes(p.descripcion) LIKE '%' || x || '%')
ORDER BY aciertos DESC, p.descripcion
LIMIT 5;
-- esperado en la primera fila:
--   CIGUENAL RACING PRESS CUB G2 VINI · 2,300 · 3 aciertos

-- 3) QUE LAS DOS ESCRITURAS CAIGAN JUNTAS
SELECT COUNT(*) AS ciguenales
FROM public.productos
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND public._sin_tildes(descripcion) LIKE '%ciguenal%';
-- esperado: 38 — los de CIGUENAL y los de CIGUEÑAL juntos.
-- Antes, cada escritura encontraba solo su mitad.
