-- =====================================================================
-- HERMES: SI EL CLIENTE NOMBRA EL MODELO, PRIMERO LAS PIEZAS DE ESE MODELO
-- ---------------------------------------------------------------------
-- (2026-10-03) Prueba del video de Meta: un cliente pidio "banda de freno
-- de Platina 125" por Instagram. Hermes sugirio una banda del ALMACEN VIEJO
-- a RD$241.23; la buena, "BANDA DELANTERA PLATINA 125 BAJAJ ORG" (RD$330,
-- 16 en existencia), ni aparecio.
--
-- Por que: _hermes_buscar_en puntua cada palabra por lo RARA que es en el
-- catalogo (idf). "platina" esta en cientos de piezas y vale poco; "freno"
-- vale mas. La pieza buena no dice "freno" en la descripcion, asi que siete
-- bandas DE FRENO de Navi, Stryker, DT, CG... le ganaron el puesto (limite 8).
--
-- Arreglo: las palabras que nombran un modelo de moto (las que casan con la
-- tabla modelos, sin contar numeros: "125" esta en mil modelos) ordenan
-- PRIMERO. Dentro de eso, el orden de siempre. Si no se nombra modelo, nada
-- cambia. Misma firma: CREATE OR REPLACE reemplaza, no duplica.
--
-- Comprobado con la misma pregunta (ensayo con rollback): antes 0 piezas de
-- Platina; despues la banda de RD$330 sale segunda.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._hermes_buscar_en(p_tenant uuid, p_pal text[], p_limite integer)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pal AS (
    SELECT unnest(p_pal) AS palabra
  ), mod_hit AS (
    -- Qué modelos responden a cada palabra. Se resuelve UNA vez contra la
    -- tabla de modelos, que es chica, en vez de preguntárselo a los miles
    -- de productos uno por uno.
    SELECT pal.palabra, mo.id
    FROM pal
    JOIN public.modelos mo
      ON public._sin_tildes(mo.nombre) LIKE '%' || pal.palabra || '%'
    WHERE mo.tenant_id = p_tenant
  ), cand AS (
    -- El texto contra el que se compara se arma UNA vez por producto.
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.ubicacion,
           p.modelo_id, p.modelos_ids, ma.nombre AS marca,
           public._sin_tildes(concat_ws(' ', p.descripcion, p.codigo, ma.nombre)) AS texto
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant
      AND COALESCE(p.activo, true) = true
  ), hit AS (
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
  ), modelo_pal AS (
    -- (03/10/2026) Las palabras que nombran un MODELO de moto (no numeros:
    -- "125" esta en mil modelos). Si el cliente dijo el modelo, las piezas de
    -- ese modelo van primero. Antes "banda de freno platina 125" sacaba
    -- bandas de Navi y Stryker (dicen "freno", palabra rara que puntua alto)
    -- y dejaba fuera "BANDA DELANTERA PLATINA 125" (no dice "freno";
    -- "platina" esta en cientos de piezas y puntua poco). Hermes acabo
    -- ofreciendo una del almacen viejo a RD$241.23 en vez de la de RD$330.
    SELECT DISTINCT palabra FROM mod_hit WHERE palabra !~ '^[0-9]+$'
  ), puntuado AS (
    SELECT h.id,
           count(*) AS aciertos,
           count(*) FILTER (WHERE h.palabra IN (SELECT palabra FROM modelo_pal)) AS del_modelo,
           sum(GREATEST(ln((SELECT piezas FROM total) / (1 + d.piezas)), 0.05)) AS puntos
    FROM hit h JOIN df d ON d.palabra = h.palabra
    GROUP BY h.id
  ), con_stock AS (
    SELECT c.*, pu.aciertos, pu.del_modelo, pu.puntos,
           COALESCE(public.get_stock_actual(c.id), 0) AS existencia
    FROM cand c JOIN puntuado pu ON pu.id = c.id
  ), elegidas AS (
    -- La existencia entra en el ORDEN, no solo en el resultado: entre dos
    -- piezas que puntúan igual, la que está en el almacén gana el puesto.
    SELECT * FROM con_stock
    ORDER BY del_modelo DESC, puntos DESC, existencia DESC, descripcion
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 8), 25))
  )
  SELECT COALESCE(json_agg(y), '[]'::json)
  FROM (
    SELECT e.codigo, e.descripcion,
           round(COALESCE(e.precio, 0), 2) AS precio,
           e.existencia,
           NULLIF(btrim(COALESCE(e.ubicacion, '')), '') AS ubicacion,
           -- Marca y modelos VIAJAN en la respuesta. Sin esto el agente
           -- encuentra la pieza pero no puede confirmar para qué moto es.
           e.marca,
           NULLIF(public.get_nombres_modelos(e.modelos_ids), '') AS modelos
    FROM elegidas e
    ORDER BY e.del_modelo DESC, e.puntos DESC, e.existencia DESC, e.descripcion
  ) y;
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_primero_el_modelo_que_nombra.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT (SELECT e->>'codigo' FROM json_array_elements(public._hermes_buscar_en(
          '00000000-0000-0000-0000-000000000001',
          public._hermes_palabras('banda de freno de Platina 125'), 8)) WITH ORDINALITY AS x(e, n)
         WHERE e->>'codigo' = 'DE151037') AS banda_platina_aparece;
