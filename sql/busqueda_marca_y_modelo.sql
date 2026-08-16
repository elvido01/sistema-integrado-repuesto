-- =====================================================================
-- LA BÚSQUEDA APRENDE A LEER LA MARCA Y EL MODELO
-- ---------------------------------------------------------------------
-- (2026-08-16) Alguien le escribió a Jarvis "quiero un tanque del platina
-- 125 original bajaj" y contestó que no lo encontraba. La pieza estaba ahí:
--
--     código      52JK0550
--     descripción TANQUE GASOLINA NEGRO/AZUL
--     marca       BAJAJ          <- puesta
--     modelo      PLATINA        <- puesto, vía modelos_ids
--
-- De las cinco palabras que dijo, "bajaj" y "platina" estaban en la ficha
-- del producto. La búsqueda no las vio porque solo mira `descripcion` y
-- `codigo`: la marca y el modelo, que están catalogados, le eran invisibles.
--
-- >>> NO ES POCO CATÁLOGO, ES CATÁLOGO SIN LEER <<<
-- En Repuestos Morla hay 4,393 productos con marca y 2,588 con modelo. Todo
-- ese trabajo de catalogación estaba fuera del buscador — el de Jarvis y el
-- de los vendedores.
--
-- >>> POR QUÉ ESTO NO ES "ENTRENAR AL AGENTE" <<<
-- No hay nada que aprender aquí: el dato ya existe y es exacto. Enseñarle
-- sinónimos a una IA para que adivine "bajaj" cuando la ficha YA dice BAJAJ
-- sería pagar por adivinar lo que se puede leer. El aprendizaje entra
-- después, para lo que de verdad no está escrito en ningún sitio
-- ("original", "de las gordas", "la que lleva rosca fina").
--
-- >>> NO TODAS LAS PALABRAS VALEN LO MISMO <<<
-- Con marca y modelo dentro, el tanque subía del puesto 763 al 102. Seguía
-- sin salir, y por un motivo que se ve claro al contarlo:
--
--   "quiero un tanque del platina 125 original bajaj" son cinco palabras.
--   Cualquier otra pieza Bajaj Platina 125 original acierta CUATRO
--   (platina, 125, original, bajaj) sin ser un tanque. El tanque acierta
--   tres — tanque, platina, bajaj — y pierde.
--
-- Contar palabras trata "tanque" igual que "original". Pero una aparece en
-- 36 piezas del catálogo y la otra en 159: la rara es la que dice QUÉ se
-- busca, las comunes solo dicen para qué moto. Así que cada palabra pesa
-- según lo rara que sea, ln(total / piezas que la contienen).
--
-- Medido contra el catálogo real de Morla:
--
--   "quiero un tanque del platina 125 original bajaj"   puesto 102 -> 5
--   "tanque gasolina bajaj platina"                     puesto   1 -> 1
--   "cigueñal g2 vini"                                  la exacta primera
--
-- >>> Y PARA QUE ALGÚN DÍA APRENDA <<<
-- Se registra también lo que busca el agente, con origen 'jarvis'. Hasta hoy
-- las 50 búsquedas guardadas eran TODAS de vendedores: cada vez que Jarvis
-- no encontraba algo, ese fallo se perdía — justo el dato que hace falta
-- para saber qué pide la gente que el catálogo no sabe nombrar.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. QUE 'jarvis' SEA UN ORIGEN VÁLIDO
-- ---------------------------------------------------------------------
-- Aparte de 'agente' a propósito: por ese entra Hermes. Si los dos
-- escribieran lo mismo, la pregunta "¿qué es lo que Jarvis no encuentra?"
-- no se podría contestar.
ALTER TABLE public.busquedas_catalogo
  DROP CONSTRAINT IF EXISTS busquedas_catalogo_origen_check;
ALTER TABLE public.busquedas_catalogo
  ADD CONSTRAINT busquedas_catalogo_origen_check
  CHECK (origen = ANY (ARRAY['vendedor', 'agente', 'jarvis', 'movil', 'widget']));

-- registrar_busqueda valida el origen por su cuenta; hay que decírselo ahí
-- también o descarta la fila en silencio.
CREATE OR REPLACE FUNCTION public.registrar_busqueda(
  p_origen text, p_texto text, p_resultados integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- El agente entra sin sesión de usuario. hermes.buscar_producto ya está
  -- fijada a Repuestos Morla, así que este respaldo dice lo mismo que la
  -- búsqueda que se está registrando y no inventa un tenant.
  v_tenant uuid := COALESCE(public.get_user_tenant(),
                            '00000000-0000-0000-0000-000000000001'::uuid);
  v_uid    uuid := auth.uid();
  v_norm   text := public.normalizar_busqueda(p_texto);
  v_previa bigint;
BEGIN
  -- Menos de dos letras no es una búsqueda, es alguien empezando.
  IF v_norm IS NULL OR length(v_norm) < 2 THEN RETURN; END IF;
  IF p_origen NOT IN ('vendedor', 'agente', 'jarvis', 'movil', 'widget') THEN RETURN; END IF;

  SELECT b.id INTO v_previa
  FROM public.busquedas_catalogo b
  WHERE b.tenant_id = v_tenant
    AND b.origen = p_origen
    AND b.usuario_id IS NOT DISTINCT FROM v_uid
    AND b.creado_en > now() - interval '8 seconds'
    AND v_norm LIKE b.texto_norm || '%'
  ORDER BY b.creado_en DESC
  LIMIT 1;

  IF v_previa IS NOT NULL THEN
    UPDATE public.busquedas_catalogo
       SET texto = p_texto, texto_norm = v_norm,
           resultados = GREATEST(0, COALESCE(p_resultados, 0)), creado_en = now()
     WHERE id = v_previa;
    RETURN;
  END IF;

  INSERT INTO public.busquedas_catalogo (tenant_id, usuario_id, origen, texto, texto_norm, resultados)
  VALUES (v_tenant, v_uid, p_origen, p_texto, v_norm, GREATEST(0, COALESCE(p_resultados, 0)));
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_busqueda(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_busqueda(text, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. LA BÚSQUEDA DEL AGENTE
-- ---------------------------------------------------------------------
-- Deja de ser STABLE: ahora escribe la búsqueda en el registro. Es el mismo
-- viaje, así que no cuesta una vuelta más, y sobre todo no se puede olvidar
-- desde fuera como pasaría si lo hiciera quien la llama.
CREATE OR REPLACE FUNCTION public.mcp_buscar_piezas(p_texto text, p_limite integer DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pal    text[];
  v_out    json;
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  v_pal := public._hermes_palabras(p_texto);
  IF array_length(v_pal, 1) IS NULL THEN
    RETURN json_build_object('busqueda', p_texto, 'palabras', '[]'::json, 'piezas', '[]'::json,
      'nota', 'No quedó ninguna palabra útil para buscar. Pide la pieza y el modelo de la motocicleta.');
  END IF;

  -- Qué modelos responden a cada palabra. Se resuelve UNA vez contra la
  -- tabla de modelos, que es chica, en vez de preguntárselo a los 5,369
  -- productos uno por uno.
  WITH pal AS (
    SELECT unnest(v_pal) AS palabra
  ), mod_hit AS (
    SELECT pal.palabra, mo.id
    FROM pal
    JOIN public.modelos mo
      ON public._sin_tildes(mo.nombre) LIKE '%' || pal.palabra || '%'
    WHERE mo.tenant_id = v_tenant
  ), cand AS (
    -- El texto contra el que se compara se arma UNA vez por producto. Dentro
    -- del contador se armaría una vez por producto Y palabra: cinco veces
    -- más trabajo para el mismo resultado.
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.ubicacion,
           p.modelo_id, p.modelos_ids, ma.nombre AS marca,
           public._sin_tildes(concat_ws(' ', p.descripcion, p.codigo, ma.nombre)) AS texto
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND COALESCE(p.activo, true) = true
  ), hit AS (
    -- Qué pieza acierta qué palabra, una fila por pareja.
    SELECT c.id, pal.palabra
    FROM cand c CROSS JOIN pal
    WHERE c.texto LIKE '%' || pal.palabra || '%'
       OR EXISTS (SELECT 1 FROM mod_hit mh
                   WHERE mh.palabra = pal.palabra
                     AND (mh.id = c.modelo_id
                       OR mh.id = ANY(COALESCE(c.modelos_ids, '{}'::uuid[]))))
  ), df AS (
    SELECT palabra, count(*)::numeric AS piezas FROM hit GROUP BY palabra
  ), total AS (
    SELECT GREATEST(count(*), 1)::numeric AS piezas FROM cand
  ), puntuado AS (
    SELECT h.id,
           count(*) AS aciertos,
           sum(GREATEST(ln((SELECT piezas FROM total) / (1 + d.piezas)), 0.05)) AS puntos
    FROM hit h JOIN df d ON d.palabra = h.palabra
    GROUP BY h.id
  ), con_stock AS (
    -- El inventario se cuenta solo para las que acertaron alguna palabra, no
    -- para el catálogo entero.
    SELECT c.*, pu.aciertos, pu.puntos,
           COALESCE(public.get_stock_actual(c.id), 0) AS existencia
    FROM cand c JOIN puntuado pu ON pu.id = c.id
  ), elegidas AS (
    -- La existencia entra en el ORDEN, no solo en el resultado: entre dos
    -- piezas que puntúan igual, la que está en el almacén gana el puesto.
    -- Ordenar después del LIMIT las dejaría fuera.
    SELECT * FROM con_stock
    ORDER BY puntos DESC, existencia DESC, descripcion
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 8), 25))
  )
  SELECT COALESCE(json_agg(y), '[]'::json) INTO v_out
  FROM (
    SELECT e.codigo, e.descripcion,
           round(COALESCE(e.precio, 0), 2) AS precio,
           e.existencia,
           NULLIF(btrim(COALESCE(e.ubicacion, '')), '') AS ubicacion,
           -- Marca y modelos VIAJAN en la respuesta. Sin esto el agente
           -- encuentra la pieza pero no puede confirmar para qué moto es, que
           -- es justo lo que le preguntan ("¿es de la Platina?").
           e.marca,
           NULLIF(public.get_nombres_modelos(e.modelos_ids), '') AS modelos
    FROM elegidas e
    ORDER BY e.puntos DESC, e.existencia DESC, e.descripcion
  ) y;

  v_n := COALESCE(json_array_length(v_out), 0);

  -- Lo que se buscó queda anotado, encuentre o no. Los ceros son los que
  -- enseñan: son las palabras que la gente usa y el catálogo no conoce.
  PERFORM public.registrar_busqueda('jarvis', p_texto, v_n);

  RETURN json_build_object('busqueda', p_texto, 'palabras', to_json(v_pal),
                           'encontradas', v_n, 'piezas', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.mcp_buscar_piezas(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mcp_buscar_piezas(text, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. LA BÚSQUEDA DE LOS VENDEDORES
-- ---------------------------------------------------------------------
-- El mismo arreglo donde más se usa. Aquí las palabras se exigen TODAS
-- (bool_and) y eso no cambia: el vendedor escribe lo que tiene delante y
-- quiere pocas líneas exactas, no una lista larga.
--
-- Se conserva el filtro previo por la PRIMERA palabra, que es lo que deja
-- trabajar al índice trigram sobre _sin_tildes(descripcion). Solo se le
-- añaden dos ramas: la marca —que ya venía unida por su clave, así que sale
-- gratis— y el modelo.
CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer, p_offset integer, p_search_term text,
  p_marca_filter text, p_modelo_filter text,
  p_include_zero_stock boolean DEFAULT true, p_tipo_filter text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, codigo text, referencia text, descripcion text, ubicacion text,
              costo numeric, precio numeric, itbis_pct numeric, marca_nombre text,
              modelo_nombre text, tipo_nombre text, existencia numeric, presentaciones json,
              min_stock numeric, imagen_url text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid;
  v_palabras text[];
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  v_palabras := public._hermes_palabras(p_search_term);

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
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('busqueda_marca_y_modelo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Las dos funciones necesitan SESIÓN (get_user_tenant sale de auth.uid).
-- Desde el editor SQL devuelven vacío; eso no es que fallen. La prueba de
-- verdad es escribirle a Jarvis "tanque platina bajaj" y que salga
-- 52JK0550, o teclear "bajaj platina" en el buscador de productos.
-- =====================================================================
SELECT origen, count(*) AS busquedas,
       count(*) FILTER (WHERE resultados = 0) AS sin_resultado
FROM public.busquedas_catalogo
GROUP BY origen ORDER BY 2 DESC;
