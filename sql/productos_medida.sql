-- =====================================================================
-- MEDIDA: LOS NÚMEROS SALEN DE "MODELO" (23/10/2026)
-- ---------------------------------------------------------------------
-- En Repuestos Morla había "modelos" que no son motos sino medidas: aro
-- (10, 12, 17, 18…), caja de bola (6201, 6301…), cadena (420, 428, 520),
-- batería (4, 5, 6.5, 7, 9…), cilindraje (110, 125), línea de aceite
-- (5100, 7100). Se mudan a un campo propio, productos.medida, y "Modelo"
-- queda solo con motos (eso también limpia la lista de motos compatibles
-- de los reels y publicaciones).
--
-- Nada que hoy se encuentra deja de encontrarse:
--   · la búsqueda (get_productos_paginados) mira también la medida;
--   · el filtro de Modelo encuentra también por medida ("17" sigue dando
--     las gomas, tubos y aros de 17);
--   · la columna Modelo de la lista dice "AX100, GATO · MEDIDA 17".
-- Respaldo de lo que se mudó en productos_medida_mudanza_20261023.
-- SOLO Repuestos Morla. Se puede correr antes o después de la fusión de
-- modelos repetidos (modelos_fusionar_repetidos_morla.sql).
-- =====================================================================

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS medida text;

CREATE TABLE IF NOT EXISTS public.productos_medida_mudanza_20261023 (
  producto_id      uuid PRIMARY KEY,
  modelos_ids_antes uuid[],
  modelo_id_antes  uuid,
  medida_antes     text,
  medida           text,
  mudado_at        timestamptz DEFAULT now()
);
ALTER TABLE public.productos_medida_mudanza_20261023 ENABLE ROW LEVEL SECURITY;

-- 1-3. Todo en UN bloque (23/10: el editor de Supabase corre cada sentencia
-- por separado y una tabla temporal no llegaba viva a la siguiente).
DO $$
DECLARE v_num uuid[];
BEGIN
  -- Los "modelos" que son números
  SELECT coalesce(array_agg(id), '{}') INTO v_num FROM public.modelos
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
     AND btrim(nombre) ~ '^[0-9]+([.,/][0-9]+)?$';

  -- Respaldo: cómo estaba cada producto antes
  INSERT INTO public.productos_medida_mudanza_20261023 (producto_id, modelos_ids_antes, modelo_id_antes, medida_antes, medida)
  SELECT p.id, p.modelos_ids, p.modelo_id, p.medida,
         (SELECT string_agg(DISTINCT btrim(mo.nombre), ', ' ORDER BY btrim(mo.nombre))
            FROM public.modelos mo
           WHERE mo.id = ANY (v_num) AND (mo.id = ANY (p.modelos_ids) OR mo.id = p.modelo_id))
    FROM public.productos p
   WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
     AND (p.modelos_ids && v_num OR p.modelo_id = ANY (v_num))
  ON CONFLICT (producto_id) DO NOTHING;

  -- La mudanza: la medida a su campo y fuera de Modelo
  UPDATE public.productos p
     SET medida = coalesce(nullif(btrim(p.medida), ''), m.medida),
         modelos_ids = coalesce((SELECT array_agg(e.id ORDER BY e.pos)
                                   FROM unnest(p.modelos_ids) WITH ORDINALITY e(id, pos)
                                  WHERE NOT (e.id = ANY (v_num))), '{}'),
         modelo_id = CASE WHEN p.modelo_id = ANY (v_num) THEN NULL ELSE p.modelo_id END
    FROM public.productos_medida_mudanza_20261023 m
   WHERE p.id = m.producto_id
     AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
     AND (p.modelos_ids && v_num OR p.modelo_id = ANY (v_num));

  -- Fuera los "modelos" número (ya nadie los usa)
  DELETE FROM public.modelos mo
   WHERE mo.id = ANY (v_num)
     AND NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.modelo_id = mo.id OR mo.id = ANY (p.modelos_ids));
END $$;

-- 4. La búsqueda mira la medida. Se parte de la función EN PRODUCCIÓN.
-- (Todo en una línea por reemplazo: los saltos de línea del archivo no
-- tienen por qué ser los de la función guardada.)
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.get_productos_paginados(integer, integer, text, text, text, boolean, text)'::regprocedure);
  IF position('p.medida' IN d) > 0 THEN RETURN; END IF;
  n := d;
  -- a) la primera palabra
  n := replace(n, $x$OR public._sin_tildes(COALESCE(p.ubicacion,''))  LIKE '%' || v_palabras[1] || '%'$x$,
                  $x$OR public._sin_tildes(COALESCE(p.ubicacion,''))  LIKE '%' || v_palabras[1] || '%' OR public._sin_tildes(COALESCE(p.medida,'')) LIKE '%' || v_palabras[1] || '%'$x$);
  -- b) todas las palabras y la medida entera ("100/90-10")
  n := replace(n, $x$p.descripcion, p.ubicacion, ma.nombre))$x$, $x$p.descripcion, p.ubicacion, ma.nombre, p.medida))$x$);
  -- c) el filtro de Modelo también por medida
  n := regexp_replace(n, $x$(WHERE mo\.nombre ILIKE '%'\|\|p_modelo_filter\|\|'%'\s*\))$x$,
                         $x$\1 OR COALESCE(p.medida, '') ILIKE '%'||p_modelo_filter||'%'$x$);
  -- d) la columna Modelo dice también la medida
  n := replace(n, $x$get_nombres_modelos(p.modelos_ids) AS modelo_nombre_val$x$,
                  $x$concat_ws(' · ', nullif(get_nombres_modelos(p.modelos_ids), ''), CASE WHEN nullif(btrim(p.medida), '') IS NOT NULL THEN 'MEDIDA ' || btrim(p.medida) END) AS modelo_nombre_val$x$);
  IF (length(n) - length(replace(n, 'p.medida', ''))) / length('p.medida') < 6 THEN
    RAISE EXCEPTION 'get_productos_paginados cambió: no se pudieron poner todos los cambios de medida';
  END IF;
  EXECUTE n;
END $$;

SELECT public.registrar_migracion('productos_medida.sql');
