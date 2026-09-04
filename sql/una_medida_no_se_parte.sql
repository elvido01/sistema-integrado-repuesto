-- ============================================================
-- UNA MEDIDA NO SE PARTE EN PEDAZOS
-- ============================================================
-- Se buscó `100/90-10` en el buscador de piezas y salieron 1,095 resultados:
-- amortiguadores, asientos, bandas de freno… y las gomas 100/90-10 enterradas
-- más allá del puesto 500, donde nadie llega. Escribiendo `GOMA 100/90`
-- aparecían al instante. El dueño lo dijo en una línea: "debió filtrar sin la
-- necesidad de escribir GOMA".
--
-- >>> EL TROCEADOR SE COMÍA LAS CIFRAS <<<
-- `_hermes_palabras('100/90-10')` devolvía **{100}**. Nada más. Parte el texto
-- por los separadores y luego tira todo lo que no llegue a tres caracteres —
-- una regla que nació para el chat de WhatsApp, donde "de", "el" y "la" son
-- ruido. Pero "90" y "10" no son ruido: son la medida de la goma. Así que
-- buscar `100/90-10` era buscar `100`, y `100` está en cada pieza de una AX100.
--
-- Peor todavía: `2.75-17` devolvía **{}** — el array vacío apaga el filtro de
-- palabras y devuelve el catálogo entero.
--
-- Y un tercer roto: la `x` entre cifras es alfanumérica, así que `90x18` no se
-- partía y quedaba como palabra obligatoria. No existe en ningún producto (el
-- catálogo los escribe `90/90-18`), de modo que la búsqueda no daba NADA.
--
-- >>> LO QUE SE ARREGLA, EN DOS PASOS <<<
-- 1. El troceador ya no tira las cifras de una medida, y trata la `x` entre
--    números como el separador que es. `100/90-10` → {100, 90, 10}.
--    Esto solo ya baja de 1,095 a 94, y aprovecha a los cuatro buscadores que
--    comparten el troceador (el modal, Hermes, el MCP y las sugerencias).
--
-- 2. El buscador de piezas, además, exige la medida ENTERA y con el separador
--    que sea: `100[^0-9]{0,3}90[^0-9]{0,3}10`. De 94 a **8**, y son las ocho
--    gomas correctas — incluida `GOMA 100-90-10 AA`, escrita con guiones, que
--    una búsqueda literal se habría perdido.
--
-- El catálogo escribe la misma medida de seis maneras (`100/90-10`,
-- `100-90-10`, `2.75 X 17`, `2.75X17`, `2.75-17`, `2.50/2.75 17`). Por eso el
-- patrón no busca lo que se escribió, sino las cifras en orden con cualquier
-- cosa en medio.
--
-- Idempotente. Ninguna función cambia de firma.
-- ============================================================

-- ------------------------------------------------------------
-- EL PATRÓN DE UNA MEDIDA
-- ------------------------------------------------------------
-- Devuelve el regex de la primera medida que aparezca en el texto, o NULL si
-- no hay ninguna. Una medida es una cifra pegada a otra por / - . , o x.
-- Solo salen dígitos, así que no hay nada que escapar.
CREATE OR REPLACE FUNCTION public._medida_patron(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH texto AS (
    SELECT regexp_replace(public._sin_tildes(COALESCE(p_texto, '')),
                          '(?<=[0-9])x(?=[0-9])', '/', 'g') AS t
  ),
  trozo AS (
    SELECT (regexp_matches(t, '[0-9]+(?:[/.,-][0-9]+)+', 'g'))[1] AS m
    FROM texto
    LIMIT 1                      -- si escribió dos medidas, manda la primera
  )
  SELECT array_to_string(array_agg(d ORDER BY o), '[^0-9]{0,3}')
  FROM trozo,
       unnest(regexp_split_to_array(m, '[^0-9]+')) WITH ORDINALITY AS u(d, o)
  WHERE d <> '';
$function$;

REVOKE ALL ON FUNCTION public._medida_patron(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._medida_patron(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- EL TROCEADOR, SIN COMERSE LAS CIFRAS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hermes_palabras(p_texto text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH texto AS (
    -- La x pegada entre cifras es un separador, no una letra: si no se parte,
    -- queda el pegote "90x18" como palabra obligatoria y no existe en ningún
    -- producto (el catálogo escribe "90/90-18").
    SELECT regexp_replace(public._sin_tildes(COALESCE(p_texto, '')),
                          '(?<=[0-9])x(?=[0-9])', '/', 'g') AS t
  ),
  -- Las cifras de una MEDIDA no se tiran nunca, por cortas que sean.
  medida AS (
    SELECT DISTINCT d AS p
    FROM texto,
         regexp_matches(t, '[0-9]+(?:[/.,-][0-9]+)+', 'g') AS m(trozo),
         unnest(regexp_split_to_array(m.trozo[1], '[^0-9]+')) AS d
    WHERE d <> ''
  ),
  -- Lo de siempre: palabras de tres o más, o de dos si mezclan letra y
  -- número (g2, r6, x1), quitando los saludos y muletillas del chat.
  sueltas AS (
    SELECT DISTINCT u AS p
    FROM texto, unnest(regexp_split_to_array(t, '[^[:alnum:]]+')) AS u
    WHERE (
        length(u) >= 3
        OR (length(u) = 2 AND u ~ '[0-9]' AND u ~ '[[:alpha:]]')
      )
      AND u
NOT IN (
          'hola','buenas','buenos','dias','tardes','noches','saludo','saludos',
          'que','como','para','por','con','del','las','los','una','uno',
          'tiene','tienen','tienes','hay','esta','este','esa','ese','eso','esto',
          'precio','cuanto','cuesta','vale','favor','gracias','usted','ustedes',
          'mande','manda','dime','decir','saber','quiero','necesito','busco','tengo',
          'ahi','alla','aqui','senor','amigo','hermano','lider',
          'okay','bien','claro','ver','tambien','pero','porque','cual','disponible'
        )
  )
  SELECT COALESCE(array_agg(DISTINCT raiz), '{}')
  FROM (
    SELECT CASE
             WHEN length(p) >= 5 AND p LIKE '%s' THEN left(p, -1)
             ELSE p
           END AS raiz
    FROM (SELECT p FROM sueltas UNION SELECT p FROM medida) todo
  ) y;
$function$;

-- ------------------------------------------------------------
-- EL BUSCADOR DE PIEZAS: LA MEDIDA, ENTERA
-- ------------------------------------------------------------
-- Copia literal de la definición viva (pg_get_functiondef) con el filtro de
-- medida añadido. No se transcribió a mano: ver [[feedback_sql_repo_mas_viejo_que_prod]].
CREATE OR REPLACE FUNCTION public.get_productos_paginados(p_limit integer, p_offset integer, p_search_term text, p_marca_filter text, p_modelo_filter text, p_include_zero_stock boolean DEFAULT true, p_tipo_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, codigo text, referencia text, descripcion text, ubicacion text, costo numeric, precio numeric, itbis_pct numeric, marca_nombre text, modelo_nombre text, tipo_nombre text, existencia numeric, presentaciones json, min_stock numeric, imagen_url text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid;
  v_palabras text[];
  v_medida   text;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  v_palabras := public._hermes_palabras(p_search_term);
  -- Si lo escrito es una medida (100/90-10, 2.75x17), su patrón; si no, NULL.
  v_medida   := public._medida_patron(p_search_term);

  RETURN QUERY
  WITH stock AS (
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM inventario_movimientos im
    WHERE im.tenant_id = v_tenant
    GROUP BY im.producto_id
  ),
  -- Los modelos que responden a cada palabra, resueltos una sola vez.
  mod_hit AS (
    SELECT pl.palabra, mo.id
    FROM unnest(COALESCE(v_palabras, '{}'::text[])) AS pl(palabra)
    JOIN modelos mo ON public._sin_tildes(mo.nombre) LIKE '%' || pl.palabra || '%'
    WHERE mo.tenant_id = v_tenant
  ),
  filtered_products AS (
    SELECT p.id AS prod_id, p.codigo, p.referencia, p.descripcion, p.ubicacion,
           p.costo, p.precio, p.itbis_pct,
           ma.nombre AS marca_nombre_val,
           get_nombres_modelos(p.modelos_ids) AS modelo_nombre_val,
           tp.nombre AS tipo_nombre_val,
           p.min_stock, p.imagen_url AS imagen_url_val, p.modelos_ids,
           COALESCE(s.stk, 0) AS existencia_val
    FROM productos p
    LEFT JOIN stock s ON s.producto_id = p.id
    LEFT JOIN marcas ma ON ma.id = p.marca_id
    LEFT JOIN tipos_producto tp ON tp.id = p.tipo_id
    WHERE
      p.tenant_id = v_tenant
      AND p.activo = true
      AND (p_include_zero_stock OR COALESCE(s.stk, 0) > 0)
      -- Primero una palabra contra el índice: descarta barato.
      AND (v_palabras IS NULL OR cardinality(v_palabras) = 0
        OR public._sin_tildes(p.descripcion)             LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(p.codigo)                  LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(COALESCE(p.referencia,'')) LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(COALESCE(p.ubicacion,''))  LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(COALESCE(ma.nombre,''))    LIKE '%' || v_palabras[1] || '%'
        OR EXISTS (SELECT 1 FROM mod_hit mh
                    WHERE mh.palabra = v_palabras[1]
                      AND (mh.id = p.modelo_id
                        OR mh.id = ANY(COALESCE(p.modelos_ids, '{}'::uuid[])))))
      -- Y después TODAS, sobre los pocos que sobrevivieron.
      AND (v_palabras IS NULL OR cardinality(v_palabras) = 0
        OR (SELECT bool_and(
              public._sin_tildes(concat_ws(' ', p.codigo, p.referencia,
                p.descripcion, p.ubicacion, ma.nombre)) LIKE '%' || w || '%'
              OR EXISTS (SELECT 1 FROM mod_hit mh
                          WHERE mh.palabra = w
                            AND (mh.id = p.modelo_id
                              OR mh.id = ANY(COALESCE(p.modelos_ids, '{}'::uuid[])))))
            FROM unnest(v_palabras) AS w))
      -- Una MEDIDA se busca ENTERA y con el separador que sea: quien escribe
      -- "100/90-10" quiere esa goma, no las mil piezas que llevan un 100.
      AND (v_medida IS NULL
        OR public._sin_tildes(concat_ws(' ', p.codigo, p.referencia,
             p.descripcion, p.ubicacion, ma.nombre)) ~ v_medida)
      AND (p_marca_filter IS NULL OR p_marca_filter = '' OR ma.nombre ILIKE '%'||p_marca_filter||'%')
      AND (p_tipo_filter  IS NULL OR p_tipo_filter  = '' OR tp.nombre ILIKE '%'||p_tipo_filter||'%')
      AND (
        p_modelo_filter IS NULL OR p_modelo_filter = '' OR
        EXISTS (
          SELECT 1 FROM unnest(p.modelos_ids) AS mid
          JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%'||p_modelo_filter||'%'
        )
      )
  ),
  counted_products AS (
    SELECT fp.*, COUNT(*) OVER() AS total_count FROM filtered_products fp
  )
  SELECT cp.prod_id AS id, cp.codigo, cp.referencia, cp.descripcion, cp.ubicacion,
         cp.costo, cp.precio, cp.itbis_pct,
         cp.marca_nombre_val AS marca_nombre,
         cp.modelo_nombre_val AS modelo_nombre,
         cp.tipo_nombre_val AS tipo_nombre,
         cp.existencia_val AS existencia,
         (SELECT json_agg(json_build_object(
             'id', pr.id, 'tipo', pr.tipo, 'cantidad', pr.cantidad,
             'costo', pr.costo, 'precio1', pr.precio1,
             'precio2', pr.precio2, 'precio3', pr.precio3))
          FROM presentaciones pr WHERE pr.producto_id = cp.prod_id) AS presentaciones,
         cp.min_stock, cp.imagen_url_val AS imagen_url, cp.total_count
  FROM counted_products cp
  ORDER BY cp.descripcion ASC
  LIMIT p_limit OFFSET p_offset;
END $function$
;

SELECT public.registrar_migracion('una_medida_no_se_parte.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que la función exista no prueba que filtre. Se monta el caso real contra el
-- catálogo de producción y el bloque se deshace solo al final.
DO $prueba$
DECLARE
  v_pat    text;
  v_tok    text[];
  v_tenant uuid;
  v_user   uuid;
  v_total  int;
  v_malos  int;
BEGIN
  ------------------------------------------------------------------ el patrón
  v_pat := public._medida_patron('100/90-10');
  IF v_pat IS DISTINCT FROM '100[^0-9]{0,3}90[^0-9]{0,3}10' THEN
    RAISE EXCEPTION 'PATRÓN MAL: salió "%".', v_pat;
  END IF;
  IF public._medida_patron('bujia ngk') IS NOT NULL THEN
    RAISE EXCEPTION 'PATRÓN DE MÁS: "bujia ngk" no es ninguna medida.';
  END IF;

  --------------------------------------------------------- las cifras enteras
  v_tok := public._hermes_palabras('100/90-10');
  IF NOT ('100' = ANY(v_tok) AND '90' = ANY(v_tok) AND '10' = ANY(v_tok)) THEN
    RAISE EXCEPTION 'SE SIGUE COMIENDO CIFRAS: de "100/90-10" salió %.', v_tok;
  END IF;
  IF cardinality(public._hermes_palabras('2.75-17')) = 0 THEN
    RAISE EXCEPTION '"2.75-17" sigue sin dar ni una palabra: el filtro se apaga y sale el catálogo entero.';
  END IF;
  IF '90x18' = ANY(public._hermes_palabras('GOMA 90/90x18')) THEN
    RAISE EXCEPTION 'La x sigue pegada: queda el pegote "90x18", que no existe en ningún producto.';
  END IF;

  ------------------------------------------------ el buscador, contra piezas
  -- La que más tenga Y tenga con quién probar: la empresa vieja es de solo
  -- consulta y no tiene usuarios, así que no sirve de banco de pruebas.
  SELECT p.tenant_id INTO v_tenant
    FROM public.productos p
   WHERE p.activo AND public._sin_tildes(p.descripcion) ~ v_pat
     AND EXISTS (SELECT 1 FROM public.profiles pr
                  LEFT JOIN public.usuario_tenant_activo a ON a.user_id = pr.id
                 WHERE pr.tenant_id = p.tenant_id
                   AND COALESCE(a.tenant_id, pr.tenant_id) = p.tenant_id)
   GROUP BY p.tenant_id ORDER BY count(*) DESC LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Ninguna empresa tiene gomas 100/90-10: no se probó el buscador.';
    RETURN;
  END IF;

  SELECT p.id INTO v_user
    FROM public.profiles p
    LEFT JOIN public.usuario_tenant_activo a ON a.user_id = p.id
   WHERE p.tenant_id = v_tenant AND COALESCE(a.tenant_id, p.tenant_id) = v_tenant
   LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'Sin usuario de esa empresa: no se probó el buscador.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  SELECT count(*),
         count(*) FILTER (WHERE public._sin_tildes(
           concat_ws(' ', r.codigo, r.referencia, r.descripcion,
                          r.ubicacion, r.marca_nombre)) !~ v_pat)
    INTO v_total, v_malos
  FROM public.get_productos_paginados(500, 0, '100/90-10', NULL, NULL, true, NULL) r;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'SE PASÓ DE ESTRICTO: "100/90-10" ya no encuentra ni una goma.';
  END IF;
  IF v_malos > 0 THEN
    RAISE EXCEPTION 'SIGUE COLÁNDOSE RUIDO: % piezas devueltas no llevan la medida.', v_malos;
  END IF;

  RAISE EXCEPTION 'PRUEBA SUPERADA (rojo a propósito): "100/90-10" devuelve % piezas y TODAS llevan la medida. Nada de esto se guardó.', v_total;
END $prueba$;
