-- =====================================================================
-- La búsqueda de Hermes, en dos etapas
-- ---------------------------------------------------------------------
-- (2026-08-12) Medida la primera versión sobre el catálogo real:
--
--   buscar_producto('motul', 6)                    410 ms
--   buscar_producto('careta platina 125 bajaj', 6) 2582 ms
--
-- Tres cosas la hacían lenta, y las tres eran evitables:
--
-- 1. La subconsulta que puntúa estaba escrita TRES veces —en el SELECT,
--    en el WHERE y en el ORDER BY— así que Postgres la evaluaba tres
--    veces por fila. 3,723 productos x 3 x una palabra cada uno.
--
-- 2. get_nombres_modelos() se llamaba DOS veces por fila: una para
--    devolver el modelo y otra para armar el texto buscable. 7,446
--    llamadas a una función para entregar seis resultados.
--
-- 3. Buscaba sobre lower(concat_ws(...)), un texto calculado al vuelo.
--    Hay un índice trigram en descripcion —idx_productos_descripcion_trgm—
--    y ningún índice puede servir una expresión así. Recorría todo.
--
-- >>> LA IDEA: FILTRAR BARATO, PUNTUAR CARO <<<
-- Primero se descartan de golpe los productos que no contienen ninguna de
-- las palabras, mirando SOLO columnas directas (descripcion, codigo,
-- referencia) — ahí sí entra el índice trigram. De los pocos que quedan
-- se resuelve marca y modelo y se puntúa bien.
--
-- El modelo pasa así de 7,446 llamadas a unas pocas docenas.
--
-- >>> QUÉ SE PIERDE <<<
-- Un producto que SOLO coincida por el nombre del modelo y en cuya
-- descripción no aparezca ninguna palabra de la búsqueda ya no entra. En
-- este catálogo eso casi no pasa —la descripción suele repetir el modelo,
-- "CARETA NEGRA AZUL PLATINA 125 BAJAJ"— y el filtro se cumple con UNA
-- palabra cualquiera, no con todas. A cambio, la respuesta baja de
-- segundos a milésimas.
--
-- Reemplaza a hermes_buscar_producto.sql. Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION hermes.buscar_producto(
  p_texto   text,
  p_limite  integer DEFAULT 10,
  p_incluir_inactivos boolean DEFAULT false
)
RETURNS TABLE (
  codigo       text,
  descripcion  text,
  marca        text,
  modelo       text,
  precio       numeric,
  existencia   numeric,
  ubicacion    text,
  itbis_pct    numeric,
  activo       boolean,
  coincidencias integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH palabras AS (
    SELECT DISTINCT lower(w) AS w
    FROM unnest(regexp_split_to_array(btrim(coalesce(p_texto, '')), '\s+')) AS w
    WHERE length(w) >= 3
  ),
  patrones AS (
    SELECT array_agg('%' || w || '%') AS ps FROM palabras
  ),
  -- ETAPA 1 — el descarte barato.
  -- Solo columnas directas y un ILIKE ANY: con el índice trigram sobre
  -- descripcion, Postgres puede resolverlo por índice en vez de leer la
  -- tabla entera. Aquí no se llama a ninguna función por fila.
  cribados AS (
    SELECT p.id, p.codigo, p.referencia, p.descripcion, p.marca_id,
           p.modelos_ids, p.precio, p.ubicacion, p.itbis_pct, p.activo
    FROM public.productos p, patrones
    WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (p_incluir_inactivos OR p.activo IS TRUE)
      AND patrones.ps IS NOT NULL
      AND (
           p.descripcion ILIKE ANY (patrones.ps)
        OR p.codigo      ILIKE ANY (patrones.ps)
        OR p.referencia  ILIKE ANY (patrones.ps)
      )
    -- Techo de seguridad: una palabra como "de" ya se descarta por corta,
    -- pero "aceite" puede traer cientos. Con 400 hay de sobra para elegir
    -- seis, y acota el trabajo de la etapa 2.
    LIMIT 400
  ),
  -- ETAPA 2 — la puntuación buena, ya con marca y modelo, sobre los pocos
  -- que sobrevivieron. Aquí sí se llama a get_nombres_modelos, una sola
  -- vez por fila y solo para estas.
  puntuados AS (
    SELECT
      cr.codigo, cr.descripcion, ma.nombre AS marca, mo.nombre AS modelo,
      cr.precio, COALESCE(s.stk, 0)::numeric AS existencia,
      cr.ubicacion, cr.itbis_pct, cr.activo,
      (SELECT count(*)::int FROM palabras pa
        WHERE lower(concat_ws(' ', cr.codigo, cr.referencia, cr.descripcion,
                              ma.nombre, mo.nombre)) LIKE '%' || pa.w || '%'
      ) AS coincidencias
    FROM cribados cr
    LEFT JOIN public.marcas ma ON ma.id = cr.marca_id
    LEFT JOIN LATERAL (SELECT public.get_nombres_modelos(cr.modelos_ids) AS nombre) mo ON true
    LEFT JOIN LATERAL (
      SELECT SUM(im.cantidad)::numeric AS stk
      FROM public.inventario_movimientos im
      WHERE im.producto_id = cr.id
        AND im.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    ) s ON true
  )
  SELECT
    pt.codigo, pt.descripcion, pt.marca, pt.modelo, pt.precio,
    pt.existencia, pt.ubicacion, pt.itbis_pct, pt.activo, pt.coincidencias
  FROM puntuados pt
  WHERE pt.coincidencias > 0
  ORDER BY
    pt.coincidencias DESC,
    -- A igualdad de coincidencias, primero lo que se puede vender hoy.
    (COALESCE(pt.existencia, 0) > 0) DESC,
    pt.descripcion
  LIMIT GREATEST(1, LEAST(coalesce(p_limite, 10), 50));
$$;

REVOKE ALL ON FUNCTION hermes.buscar_producto(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.buscar_producto(text, integer, boolean) TO hermes_readonly;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_buscar_producto_rapido.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN — con el reloj puesto
-- ------------------------------------------------------------
-- Antes: 2,582 ms. Si esto no baja de 300, el filtro no está entrando por
-- índice y hay que mirar el plan con EXPLAIN ANALYZE.
\timing on
SELECT codigo, descripcion, precio, existencia, coincidencias
FROM hermes.buscar_producto('careta platina 125 bajaj', 6);

SELECT codigo, descripcion, precio, existencia
FROM hermes.buscar_producto('tenemos motul 7100', 6);

-- Y que sigue encontrando lo mismo que antes: 52JK0442 arriba en la
-- primera, 784401 (57 unidades) en la segunda.
--
-- Para ver si usa el índice:
-- EXPLAIN ANALYZE SELECT * FROM hermes.buscar_producto('careta platina 125 bajaj', 6);
