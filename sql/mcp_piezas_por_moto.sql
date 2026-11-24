-- ============================================================
-- mcp_piezas_por_moto.sql (24/11/2026)
-- ------------------------------------------------------------
-- Herramienta nueva de Hermes: recorrer el catálogo de UNA moto.
--
-- buscar_piezas ya usa el modelo, pero solo si la palabra del cliente está
-- en el nombre del modelo o en la descripción. No sirve cuando:
--   · el cliente no sabe cómo se llama la pieza ("el plástico de abajo del
--     asiento de la Wave"): hay que poder ver QUÉ tipos de pieza hay para esa
--     moto y escoger;
--   · escribe el modelo mal ("estraiker", "plátina"): aquí se busca por
--     parecido (pg_trgm), no por igualdad;
--   · pregunta por un TIPO ("plásticos", "eléctrico"): el tipo de producto no
--     entraba en ninguna búsqueda.
--
-- Sin p_tipo devuelve los tipos de pieza que hay para esa moto (con cuántas
-- y cuántas con existencia). Con p_tipo, las piezas de ese tipo para esa
-- moto, con precio, existencia y foto si la tiene.
-- Solo LEE, con la empresa de la sesión (get_user_tenant).
-- ============================================================

-- Cómo se escriben las motos en RD, normalizado igual en los dos lados:
-- "estraiker" y "STRYKER" quedan "striker"; "jonda" y "Honda", "onda".
-- Sin dígitos: los números ("125") no deciden el modelo, solo desempatan.
CREATE OR REPLACE FUNCTION public._moto_norm(p text)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $f$
  SELECT btrim(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             lower(public._sin_tildes(COALESCE(p, ''))),
             '[0-9]+', ' ', 'g'),
             '\mes([bcdfgkpqstv])', '\1', 'g'),
             '(ai|ay|ei|ey|y)', 'i', 'g'),
             '\m[hj]', '', 'g'),
             'v', 'b', 'g'),
             '[zk]', 'c', 'g'),
           '\s+', ' ', 'g'));
$f$;
REVOKE ALL ON FUNCTION public._moto_norm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._moto_norm(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_piezas_por_moto(p_moto text, p_tipo text DEFAULT NULL, p_limite integer DEFAULT 15)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_q       text := lower(public._sin_tildes(btrim(COALESCE(p_moto, ''))));
  v_qn      text := public._moto_norm(p_moto);
  v_nums    text[] := ARRAY(SELECT m[1] FROM regexp_matches(COALESCE(p_moto, ''), '([0-9]{2,4})', 'g') m);
  v_mods    uuid[];
  v_nombres json;
  v_mejor   numeric;
  v_pal     text[];
  v_exp     text[];
  v_out     json;
  v_tipos   json;
  v_lim     int := GREATEST(1, LEAST(COALESCE(p_limite, 15), 30));
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;
  IF length(v_q) < 2 THEN
    RETURN json_build_object('ok', false, 'nota', 'Falta el modelo de la motocicleta. Pregunta: ¿de qué moto es?');
  END IF;

  -- Los modelos que más se parecen a lo que escribió el cliente. Se quedan
  -- los que están cerca del mejor (hasta 3): "platina" puede ser PLATINA y
  -- ENDURIX PLATINA 125, y las dos son respuesta válida.
  WITH m AS (
    SELECT mo.id,
           btrim(concat_ws(' ', ma.nombre, mo.nombre)) AS nombre,
           CASE WHEN length(v_qn) < 2 THEN
                  -- Solo dijo un número ("la 125"): parecido por el texto tal cual.
                  public.similarity(lower(public._sin_tildes(concat_ws(' ', ma.nombre, mo.nombre))), v_q)
                ELSE GREATEST(
                  public.similarity(public._moto_norm(concat_ws(' ', ma.nombre, mo.nombre)), v_qn),
                  -- lo que escribió el cliente DENTRO del nombre del modelo
                  public.word_similarity(v_qn, public._moto_norm(concat_ws(' ', ma.nombre, mo.nombre))) - 0.1,
                  -- o el nombre del modelo dentro de lo que escribió ("la navi azul")
                  CASE WHEN length(public._moto_norm(mo.nombre)) >= 4
                       THEN public.word_similarity(public._moto_norm(mo.nombre), v_qn) ELSE 0 END)
           END
           -- El número desempata: "stryker 125" prefiere STRYKER 125.
           + CASE WHEN EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE mo.nombre ~ ('\m' || n || '\M')) THEN 0.08 ELSE 0 END
             AS parecido
    FROM public.modelos mo
    LEFT JOIN public.marcas ma ON ma.id = mo.marca_id
    WHERE mo.tenant_id = v_tenant AND COALESCE(mo.activo, true)
  ), top AS (
    SELECT * FROM m WHERE parecido >= 0.55 ORDER BY parecido DESC, nombre LIMIT 3
  )
  SELECT array_agg(id), json_agg(json_build_object('modelo', nombre, 'parecido', round(parecido::numeric, 2)) ORDER BY parecido DESC), max(parecido)
    INTO v_mods, v_nombres, v_mejor
  FROM top
  WHERE parecido >= (SELECT max(parecido) FROM top) - 0.12;

  IF v_mods IS NULL THEN
    RETURN json_build_object(
      'ok', false, 'moto', p_moto,
      'nota', 'No encontré ese modelo en el catálogo. Pregunta la marca y el modelo, o usa buscar_piezas con la pieza.',
      'parecidos', (SELECT COALESCE(json_agg(x.nombre), '[]'::json) FROM (
          SELECT btrim(concat_ws(' ', ma.nombre, mo.nombre)) AS nombre
          FROM public.modelos mo LEFT JOIN public.marcas ma ON ma.id = mo.marca_id
          WHERE mo.tenant_id = v_tenant AND COALESCE(mo.activo, true)
          ORDER BY public.similarity(lower(public._sin_tildes(concat_ws(' ', ma.nombre, mo.nombre))), v_q) DESC
          LIMIT 6) x)
    );
  END IF;

  -- SIN tipo: el índice del catálogo de esa moto.
  IF NULLIF(btrim(COALESCE(p_tipo, '')), '') IS NULL THEN
    SELECT COALESCE(json_agg(t ORDER BY t.con_existencia DESC, t.piezas DESC), '[]'::json) INTO v_tipos
    FROM (
      SELECT COALESCE(tp.nombre, 'Sin tipo') AS tipo,
             count(*) AS piezas,
             count(*) FILTER (WHERE COALESCE(public.get_stock_actual(p.id), 0) > 0) AS con_existencia
      FROM public.productos p
      LEFT JOIN public.tipos_producto tp ON tp.id = p.tipo_id
      WHERE p.tenant_id = v_tenant AND COALESCE(p.activo, true)
        AND (p.modelo_id = ANY(v_mods) OR p.modelos_ids && v_mods)
      GROUP BY 1
      ORDER BY 3 DESC, 2 DESC
      LIMIT 30
    ) t;
    RETURN json_build_object(
      'ok', true, 'moto', p_moto, 'modelos', v_nombres, 'tipos', v_tipos,
      'nota', 'Estos son los tipos de pieza que hay para esa moto. Vuelve a llamar con tipo para ver las piezas.'
    );
  END IF;

  -- CON tipo: las piezas. El tipo se busca en el nombre del tipo de producto
  -- Y en la descripción, con las mismas equivalencias que buscar_piezas.
  v_pal := public._hermes_palabras(p_tipo);
  SELECT array_agg(DISTINCT w) INTO v_exp FROM (
    SELECT unnest(v_pal) AS w
    UNION SELECT s.equivale_a FROM unnest(v_pal) b(w) JOIN public.busqueda_sinonimos s ON s.palabra = b.w
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
    UNION SELECT s.palabra FROM unnest(v_pal) b(w) JOIN public.busqueda_sinonimos s ON s.equivale_a = b.w
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
  ) z;
  -- Categorías: el cliente dice "plásticos" y en Morla se llaman GUARDALODO,
  -- CARETA, TAPA LATERAL, COVER... Se expanden a los nombres del catálogo.
  SELECT array_agg(DISTINCT w) INTO v_exp FROM (
    SELECT unnest(COALESCE(v_exp, '{}'::text[])) AS w
    UNION
    SELECT unnest(c.nombres) FROM (VALUES
      (ARRAY['plastico','plasticos','carroceria','carenado','cover'], ARRAY['plastico','guardalodo','careta','tapa lateral','tapas lateral','cover','carenado','kit plastico','tapas','cola','mascara','frontal']),
      (ARRAY['electrico','electrica','electricos','luces','luz'], ARRAY['farol','bombillo','switch','regulador','cdi','bobina','direccional','relay','rele','arranque','bateria','instalacion','pito','corneta']),
      (ARRAY['freno','frenos'], ARRAY['banda','pastilla','bomba de freno','manecilla freno','cable freno','disco','zapata','caliper']),
      (ARRAY['motor'], ARRAY['piston','cilindro','junta','juntas','anillo','biela','cigueñal','valvula','arbol de leva','empaque','cadenilla']),
      (ARRAY['transmision','arrastre'], ARRAY['kit catalina y cadena','catalina','pinon','cadena','corona','sprocket']),
      (ARRAY['suspension'], ARRAY['amortiguador','barra','retenedora','tijera','brazo'])
    ) AS c(dice, nombres)
    WHERE c.dice && v_exp
  ) cat;
  -- Singular también: "plasticos" tiene que encontrar PLASTICO, "gomas" GOMA.
  SELECT array_agg(DISTINCT w) INTO v_exp FROM (
    SELECT unnest(COALESCE(v_exp, '{}'::text[])) AS w
    UNION SELECT regexp_replace(e, 'es$', '') FROM unnest(COALESCE(v_exp, '{}'::text[])) e WHERE e ~ '[^aeiou]es$' AND length(e) > 4
    UNION SELECT regexp_replace(e, 's$', '') FROM unnest(COALESCE(v_exp, '{}'::text[])) e WHERE e ~ '[aeiou]s$' AND length(e) > 3
  ) q;
  IF v_exp IS NULL THEN
    RETURN json_build_object('ok', false, 'nota', 'No entendí qué tipo de pieza. Llama sin tipo para ver los tipos que hay para esa moto.');
  END IF;

  SELECT COALESCE(json_agg(y), '[]'::json) INTO v_out
  FROM (
    SELECT p.codigo, p.descripcion,
           round(COALESCE(p.precio, 0), 2) AS precio,
           COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
           NULLIF(btrim(COALESCE(p.ubicacion, '')), '') AS ubicacion,
           tp.nombre AS tipo,
           NULLIF(public.get_nombres_modelos(p.modelos_ids), '') AS modelos,
           NULLIF(btrim(COALESCE(p.imagen_url, '')), '') AS foto,
           (SELECT count(*) FROM unnest(COALESCE(v_exp, '{}'::text[])) w
             WHERE public._sin_tildes(concat_ws(' ', p.descripcion, tp.nombre)) ILIKE '%' || w || '%') AS aciertos
    FROM public.productos p
    LEFT JOIN public.tipos_producto tp ON tp.id = p.tipo_id
    WHERE p.tenant_id = v_tenant AND COALESCE(p.activo, true)
      AND (p.modelo_id = ANY(v_mods) OR p.modelos_ids && v_mods)
      AND EXISTS (SELECT 1 FROM unnest(COALESCE(v_exp, '{}'::text[])) w
                   WHERE public._sin_tildes(concat_ws(' ', p.descripcion, tp.nombre)) ILIKE '%' || w || '%')
    ORDER BY aciertos DESC, (COALESCE(public.get_stock_actual(p.id), 0) > 0) DESC, p.descripcion
    LIMIT v_lim
  ) y;

  RETURN json_build_object(
    'ok', true, 'moto', p_moto, 'tipo', p_tipo, 'modelos', v_nombres,
    'encontradas', json_array_length(v_out), 'piezas', v_out
  );
END
$function$;
REVOKE ALL ON FUNCTION public.mcp_piezas_por_moto(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_piezas_por_moto(text, text, integer) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('mcp_piezas_por_moto.sql');
