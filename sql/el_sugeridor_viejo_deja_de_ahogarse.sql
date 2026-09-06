-- ============================================================
-- EL SUGERIDOR VIEJO DEJA DE AHOGARSE
-- ============================================================
-- El dueno abrio Mercancias -> AGRUPANDO -> Sugerencias y le contesto
-- `canceling statement due to statement timeout`. Esa pantalla ya no existe en
-- el sistema publicado (el navegador tenia la version vieja en cache), pero la
-- FUNCION que llamaba sigue viva y sigue ahogandose. Mientras exista, cualquier
-- pestana vieja, cualquier atajo guardado o cualquier herramienta que la llame
-- va a recibir el mismo error.
--
-- >>> POR QUE SE AHOGABA <<<
-- `sugerir_grupos_por_similitud` cruzaba la tabla de productos contra si misma
-- comparando descripciones completas con similarity(): 3,803 x 3,803 = 14
-- millones de comparaciones que ningun indice puede resolver, porque el indice
-- GIN de pg_trgm solo sirve para el operador %, no para similarity() >= x.
-- El LIMIT no ayuda: se aplica DESPUES de comparar todo.
--
-- >>> QUE HACE AHORA <<<
-- La misma firma y las mismas columnas — no se le rompe nada a quien la llame —
-- pero sirviendo lo que el motor nuevo ya dejo calculado en
-- `producto_grupo_sugerencias`. De cada grupo propuesto salen sus parejas. Es
-- instantaneo, y ademas contesta lo mismo que la pantalla nueva: una sola
-- verdad, no dos sugeridores que se contradicen.
--
-- La equivalencia de campos:
--   similitud  = la confianza del grupo / 100 (0.65 a 0.99)
--   ventas_combinadas_30d = se calcula igual que antes, para las parejas que
--                           de verdad se devuelven (no para las 14 millones).
-- ============================================================

SELECT public.registrar_migracion('el_sugeridor_viejo_deja_de_ahogarse.sql');

CREATE OR REPLACE FUNCTION public.sugerir_grupos_por_similitud(
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_min_similarity numeric DEFAULT 0.4,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  producto_a_id         uuid,
  codigo_a              text,
  descripcion_a         text,
  producto_b_id         uuid,
  codigo_b              text,
  descripcion_b         text,
  similitud             numeric,
  ventas_combinadas_30d numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- Ojo: ya no compara nada. Lee lo que el motor nuevo dejo hecho.
  RETURN QUERY
  WITH pares AS (
    SELECT ma.producto_id AS a, mb.producto_id AS b,
           ROUND((s.confianza::numeric / 100), 2) AS sim
    FROM public.producto_grupo_sugerencias s
    JOIN public.producto_grupo_sugerencia_miembros ma ON ma.sugerencia_id = s.id
    JOIN public.producto_grupo_sugerencia_miembros mb
      ON mb.sugerencia_id = s.id AND mb.producto_id > ma.producto_id
    WHERE s.tenant_id = v_tenant
      AND s.estado = 'pendiente'
      AND (s.confianza::numeric / 100) >= COALESCE(p_min_similarity, 0)
    ORDER BY s.vendidas_180d DESC, s.confianza DESC
    LIMIT COALESCE(p_limit, 50)
  )
  SELECT pa.id, pa.codigo::text, pa.descripcion::text,
         pb.id, pb.codigo::text, pb.descripcion::text,
         pr.sim,
         (
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                      JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = pa.id
                       AND f.fecha >= CURRENT_DATE - 30
                       AND f.estado <> 'Anulada'), 0)
           +
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                      JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = pb.id
                       AND f.fecha >= CURRENT_DATE - 30
                       AND f.estado <> 'Anulada'), 0)
         )::numeric
  FROM pares pr
  JOIN public.productos pa ON pa.id = pr.a
  JOIN public.productos pb ON pb.id = pr.b
  ORDER BY pr.sim DESC;
END;
$fn$;

COMMENT ON FUNCTION public.sugerir_grupos_por_similitud(uuid, numeric, integer) IS
  'COMPATIBILIDAD. Sirve las parejas de los grupos que ya calculo recalcular_sugerencias_equivalentes. La version vieja comparaba 14 millones de pares al vuelo y moria por timeout. Lo bueno esta en get_sugerencias_equivalentes, que devuelve GRUPOS y no parejas.';

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — que conteste rapido y que conteste algo
-- ============================================================
DO $prueba$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  n        INT;
  t0       timestamptz;
  ms       numeric;
BEGIN
  SELECT s.tenant_id INTO v_tenant
    FROM public.producto_grupo_sugerencias s
   WHERE s.estado = 'pendiente'
   GROUP BY s.tenant_id ORDER BY count(*) DESC LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'No hay propuestas todavia. Funcion reemplazada igual.';
    RETURN;
  END IF;

  SELECT p.id INTO v_user
    FROM public.profiles p
    JOIN public.usuario_tenant_activo a ON a.user_id = p.id AND a.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_tenant LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.sugerir_grupos_por_similitud(NULL, 0.4, 100);
  ms := extract(epoch FROM (clock_timestamp() - t0)) * 1000;

  RESET ROLE;

  IF n = 0 THEN
    RAISE EXCEPTION 'La funcion de compatibilidad no devolvio ni una pareja teniendo propuestas pendientes.';
  END IF;

  IF ms > 5000 THEN
    RAISE EXCEPTION 'Sigue lenta: % ms para % parejas.', round(ms), n;
  END IF;

  RAISE NOTICE 'Compatibilidad OK: % parejas en % ms (antes: timeout).', n, round(ms);
END $prueba$;
