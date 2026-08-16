-- =====================================================================
-- VOLVER A ENCHUFAR EL ARREGLO DE LAS TILDES
-- ---------------------------------------------------------------------
-- (2026-08-15) Medido contra el catálogo real de Morla:
--
--     bujía   →  0 resultados        bujia   → 50
--     válvula →  1                   valvula → 50
--     CG      →  0                   (se descartaba por tener 2 letras)
--
-- Escribir bien el español rompía la búsqueda. Y lo peor: una pregunta
-- descriptiva como "algo para que el motor no se recaliente" devolvía
-- CINCUENTA productos que no tenían nada que ver, porque le bastaba con
-- encontrar la palabra "motor" suelta. Devolver basura es peor que no
-- devolver nada: lo primero no se nota y lo segundo sí.
--
-- >>> LO QUE NO HAY QUE INVENTAR <<<
-- Esto ya se arregló el 07/08 (fix_hermes_busqueda_tildes_y_modelos.sql),
-- después de que un cliente escribiera "cigueñal g2 vini" y la pieza —que
-- existía— no apareciera. De ahí salieron dos ayudantes que siguen vivas
-- y funcionando en producción:
--
--     _sin_tildes('BUJÍA CIGÜEÑAL')       → 'bujia ciguenal'
--     _hermes_palabras('cigueñal g2 vini') → {vini, g2, ciguenal}
--
-- El 12/08 se reescribió hermes.buscar_producto para hacerla RÁPIDA, y la
-- versión nueva no las usó: volvió a partir palabras a mano con
-- `length(w) >= 3` y a comparar con tildes. La optimización de velocidad
-- se llevó por delante el arreglo de correctitud, y nadie se enteró
-- porque no había nada vigilándolo.
--
-- Este archivo no arregla nada nuevo. Vuelve a enchufar lo que ya estaba.
--
-- >>> Y ESTA VEZ, SIN PERDER LA VELOCIDAD <<<
-- El motivo por el que tentaba no usarlas es que aplicar una función a la
-- columna deja fuera el índice. Como las dos son IMMUTABLE, se puede
-- indexar el resultado. Así se busca sin tildes Y por índice.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. ÍNDICES SOBRE EL TEXTO YA NORMALIZADO
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_productos_desc_sin_tildes_trgm
  ON public.productos USING gin (public._sin_tildes(descripcion) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_codigo_sin_tildes_trgm
  ON public.productos USING gin (public._sin_tildes(codigo) gin_trgm_ops);

-- ------------------------------------------------------------
-- 2. LA BÚSQUEDA DE LOS AGENTES
-- ------------------------------------------------------------
-- Cambia respecto a la del 12/08 en tres cosas y solo tres:
--   · las palabras salen de _hermes_palabras (conserva "g2", "CG", "R6")
--   · se compara sin tildes de los DOS lados
--   · hay un mínimo de palabras que tienen que cruzar
--
-- Ese mínimo es lo que mata la basura. Con una sola palabra suelta de
-- cinco, "motor" ya no alcanza para colar un espejo en una pregunta sobre
-- refrigeración. Si nada llega al mínimo, se devuelve VACÍO — que es la
-- respuesta correcta y la que Jarvis sabe decir ("no encontré nada").
CREATE OR REPLACE FUNCTION hermes.buscar_producto(
  p_texto text,
  p_limite integer DEFAULT 10,
  p_incluir_inactivos boolean DEFAULT false)
RETURNS TABLE(codigo text, descripcion text, marca text, modelo text,
              precio numeric, existencia numeric, ubicacion text,
              itbis_pct numeric, activo boolean, coincidencias integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH palabras AS (
    SELECT unnest(public._hermes_palabras(p_texto)) AS w
  ),
  meta AS (
    SELECT array_agg(w) AS ws,
           count(*)::int AS n,
           -- El 60% redondeado hacia arriba. Con dos palabras pide las
           -- dos ("filtro aceite" no puede colar cualquier filtro); con
           -- cinco pide tres. No es una constante mágica: es "la mayoría".
           GREATEST(1, CEIL(count(*) * 0.6))::int AS minimo
    FROM palabras
  ),
  cribados AS (
    -- Etapa 1, la barata: una sola palabra contra el índice. Aquí solo se
    -- descarta; puntuar bien cuesta y se hace después, con pocos.
    SELECT p.id, p.codigo, p.referencia, p.descripcion, p.marca_id,
           p.modelos_ids, p.precio, p.ubicacion, p.itbis_pct, p.activo
    FROM public.productos p, meta
    WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (p_incluir_inactivos OR p.activo IS TRUE)
      AND meta.n > 0
      AND EXISTS (
        SELECT 1 FROM unnest(meta.ws) AS w
        WHERE public._sin_tildes(p.descripcion) LIKE '%' || w || '%'
           OR public._sin_tildes(p.codigo)      LIKE '%' || w || '%'
           OR public._sin_tildes(COALESCE(p.referencia, '')) LIKE '%' || w || '%'
      )
    LIMIT 400
  ),
  puntuados AS (
    SELECT cr.codigo, cr.descripcion, ma.nombre AS marca, mo.nombre AS modelo,
           cr.precio, COALESCE(s.stk, 0)::numeric AS existencia,
           cr.ubicacion, cr.itbis_pct, cr.activo,
           (SELECT count(*)::int FROM unnest(meta.ws) AS w
             WHERE public._sin_tildes(concat_ws(' ', cr.codigo, cr.referencia,
                     cr.descripcion, ma.nombre, mo.nombre)) LIKE '%' || w || '%'
           ) AS coincidencias,
           meta.minimo
    -- meta va al final y con CROSS JOIN: con una coma, el LEFT JOIN se
    -- ataría a `meta` en vez de a `cribados` y no compila.
    FROM cribados cr
    LEFT JOIN public.marcas ma ON ma.id = cr.marca_id
    LEFT JOIN LATERAL (SELECT public.get_nombres_modelos(cr.modelos_ids) AS nombre) mo ON true
    LEFT JOIN LATERAL (
      SELECT SUM(im.cantidad)::numeric AS stk
      FROM public.inventario_movimientos im
      WHERE im.producto_id = cr.id
        AND im.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    ) s ON true
    CROSS JOIN meta
  )
  SELECT pt.codigo, pt.descripcion, pt.marca, pt.modelo, pt.precio,
         pt.existencia, pt.ubicacion, pt.itbis_pct, pt.activo, pt.coincidencias
  FROM puntuados pt
  WHERE pt.coincidencias >= pt.minimo
  ORDER BY pt.coincidencias DESC,
           (COALESCE(pt.existencia, 0) > 0) DESC,
           pt.descripcion
  LIMIT GREATEST(1, LEAST(coalesce(p_limite, 10), 50));
$$;

REVOKE ALL ON FUNCTION hermes.buscar_producto(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.buscar_producto(text, integer, boolean) TO hermes_readonly;

-- ------------------------------------------------------------
-- 3. LA BÚSQUEDA DE LOS VENDEDORES
-- ------------------------------------------------------------
-- Esta tenía un problema DISTINTO y peor de lo que parecía: buscaba el
-- texto entero tal cual, sin partirlo. Si el vendedor escribía
-- "filtro aceite" y el catálogo decía "FILTRO DE ACEITE", no encontraba
-- nada. Por ese "DE" en el medio.
--
-- Ahora se parte en palabras y se piden TODAS. Un vendedor que escribe
-- dos palabras quiere las dos, no una: es más estricto que antes y a la
-- vez encuentra mucho más, porque el orden y lo que haya en medio dejan
-- de importar.
--
-- Todo lo demás de la función queda igual: mismos filtros, mismo orden,
-- mismas columnas. Solo cambia cómo se compara el texto.
CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer, p_offset integer, p_search_term text,
  p_marca_filter text, p_modelo_filter text,
  p_include_zero_stock boolean DEFAULT true, p_tipo_filter text DEFAULT NULL)
RETURNS TABLE(id uuid, codigo text, referencia text, descripcion text,
              ubicacion text, costo numeric, precio numeric, itbis_pct numeric,
              marca_nombre text, modelo_nombre text, tipo_nombre text,
              existencia numeric, presentaciones json, min_stock numeric,
              imagen_url text, total_count bigint)
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
        OR public._sin_tildes(p.descripcion)            LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(p.codigo)                 LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(COALESCE(p.referencia,'')) LIKE '%' || v_palabras[1] || '%'
        OR public._sin_tildes(COALESCE(p.ubicacion,''))  LIKE '%' || v_palabras[1] || '%')
      -- Y después TODAS, sobre los pocos que sobrevivieron.
      AND (v_palabras IS NULL OR cardinality(v_palabras) = 0
        OR (SELECT bool_and(
              public._sin_tildes(concat_ws(' ', p.codigo, p.referencia,
                p.descripcion, p.ubicacion)) LIKE '%' || w || '%')
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

REVOKE ALL ON FUNCTION public.get_productos_paginados(integer,integer,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_productos_paginados(integer,integer,text,text,text,boolean,text) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('busqueda_reconectar_tildes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Las mismas nueve búsquedas con las que se midió el problema.
SELECT jsonb_pretty(jsonb_build_object(
  'con_tilde_bujia',   (SELECT count(*) FROM hermes.buscar_producto('bujía', 50, false)),
  'sin_tilde_bujia',   (SELECT count(*) FROM hermes.buscar_producto('bujia', 50, false)),
  'con_tilde_valvula', (SELECT count(*) FROM hermes.buscar_producto('válvula', 50, false)),
  'sin_tilde_valvula', (SELECT count(*) FROM hermes.buscar_producto('valvula', 50, false)),
  'modelo_cg',         (SELECT count(*) FROM hermes.buscar_producto('CG', 50, false)),
  'modelo_ax100',      (SELECT count(*) FROM hermes.buscar_producto('AX 100', 50, false)),
  'ciguenal_g2_vini',  (SELECT count(*) FROM hermes.buscar_producto('cigueñal g2 vini', 50, false)),
  'filtro_aceite',     (SELECT count(*) FROM hermes.buscar_producto('filtro aceite', 50, false)),
  'descriptiva_basura',(SELECT count(*) FROM hermes.buscar_producto('algo para que el motor no se recaliente', 50, false))
));
