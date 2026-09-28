-- ═══════════════════════════════════════════════════════════════════════════
--  "QUÉ PROMOCIONAR HOY" ELIGE DE VERDAD LAS MEJORES — Y DE CADA TIPO
--  sql/promocionar_de_verdad_las_mejores.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> EL BUG <<<
--  equipo_candidatos_promocion(p_limite) cortaba con LIMIT ANTES de ordenar:
--
--      SELECT ... FROM unico u WHERE ... LIMIT p_limite      <- sin ORDER BY
--      ... jsonb_agg(x.fila ORDER BY x.prio, x.capital DESC)  <- ordena después
--
--  `unico` sale ordenado por el id del producto (lo exige el DISTINCT ON), así
--  que las "cinco mejores" eran las cinco de UUID más bajo que pasaran los
--  filtros, y después se ordenaban para que pareciera un ranking. Medido el
--  28/09/2026: con 5 salían 4531, 2756, Y-9048, 2759 y 842071003517; las
--  cinco primeras de la lista completa eran JK122021, 4531, JZ401077, 2782 y
--  2756. JK122021 no salía nunca.
--
--  Y como el resultado dependía solo de los ids, era SIEMPRE el mismo: el
--  botón de refrescar volvía a pedir la lista y traía las mismas cinco. El
--  dueño le daba a actualizar y no cambiaba nada.
--
--  >>> EL ARREGLO <<<
--  1. Se ordena ANTES de cortar. Lo que devuelve con 5 es exactamente el
--     principio de lo que devuelve con 50: la prueba de abajo lo exige.
--
--  2. El orden va POR RONDAS de cajón: primero la mejor pieza de cada cajón
--     (baja rotación, alta existencia, buen margen, recién llegados, más
--     vendidos), después la segunda de cada uno, y así. Cortar por prioridad
--     pura daba cinco "casi no se mueve" seguidas, y cinco razones iguales no
--     son un menú para elegir. Dentro de cada cajón manda el orden en que lo
--     entregó get_marketing_candidates, que es quien hizo el análisis.
--
--  Con eso la pantalla pide la lista entera y el botón pasa a la ronda
--  siguiente: cinco nuevas cada vez, y cada tanda con razones distintas.
--
--  Misma firma (p_limite integer): CREATE OR REPLACE sirve y no deja
--  sobrecarga. Los scripts de Hermes en el VPS que la llamen siguen igual.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.equipo_candidatos_promocion(p_limite integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  -- `get_marketing_candidates` no devuelve filas: devuelve UN json con el
  -- catálogo repartido en cinco cajones —baja rotación, alta existencia,
  -- buen margen, recién llegados, más vendidos—. Se aplana, y de paso el
  -- cajón del que sale la pieza ES el porqué: no hay que deducirlo de los
  -- números, ya viene decidido por quien hizo el análisis.
  --
  -- WITH ORDINALITY guarda el puesto de cada pieza DENTRO de su cajón: ese
  -- es el ranking que hizo el análisis, y hay que respetarlo.
  WITH bruto AS (
    SELECT public.get_marketing_candidates(v_tenant, false, GREATEST(p_limite * 4, 20))::jsonb AS d
  ),
  plano AS (
    SELECT cat.k AS cajon, cat.prio, e.p, e.pos
    FROM bruto,
         LATERAL (VALUES ('baja_rotacion', 1), ('alta_existencia', 2),
                         ('buen_margen', 3), ('recien_llegados', 4),
                         ('mas_vendidos', 5)) AS cat(k, prio),
         LATERAL jsonb_array_elements(COALESCE(bruto.d -> cat.k, '[]'::jsonb))
           WITH ORDINALITY AS e(p, pos)
  ),
  -- Una pieza puede salir en varios cajones. Se queda con el que más
  -- justifica promocionarla, no con el primero que toque.
  unico AS (
    SELECT DISTINCT ON ((p ->> 'id')) cajon, prio, pos, p
    FROM plano
    WHERE COALESCE(p ->> 'imagen_url', '') <> ''
    ORDER BY (p ->> 'id'), prio
  ),
  elegibles AS (
    SELECT u.*
    FROM unico u
    WHERE
      -- Lo que el dueño marcó como "no promocionar" no vuelve a aparecer.
      NOT EXISTS (
        SELECT 1 FROM public.marketing_promocion_manual m
        WHERE m.tenant_id = v_tenant AND m.producto_id = (u.p ->> 'id')::uuid
          AND (m.permanente OR m.fecha > now() - interval '14 days'))
      -- Ni lo que ya se promocionó hace poco: repetir la misma pieza dos
      -- semanas seguidas quema el producto y aburre a quien te sigue.
      AND NOT EXISTS (
        SELECT 1 FROM public.equipo_trabajos w
        WHERE w.tenant_id = v_tenant AND w.tipo = 'promocion'
          AND w.creado_en > now() - interval '14 days'
          AND w.estado <> 'cancelled'
          AND w.peticion LIKE '%' || (u.p ->> 'codigo') || '%')
  ),
  -- La ronda: 1 = la mejor de cada cajón, 2 = la segunda de cada uno...
  -- Se numera DESPUÉS de filtrar, para que un cajón no pierda su turno
  -- porque su mejor pieza ya se promocionó la semana pasada.
  con_ronda AS (
    SELECT e.*,
           row_number() OVER (PARTITION BY e.cajon ORDER BY e.pos) AS ronda
    FROM elegibles e
  ),
  ordenado AS (
    SELECT
      c.ronda,
      c.prio,
      (c.p || jsonb_build_object('razon',
        CASE c.cajon
          WHEN 'baja_rotacion' THEN format('Casi no se mueve: %s vendidos en 30 días y tienes RD$%s dormidos ahí.',
            COALESCE(c.p ->> 'vendidos_30d', '0'),
            to_char(COALESCE((c.p ->> 'capital_inmovilizado')::numeric, 0), 'FM999G999G990D00'))
          WHEN 'alta_existencia' THEN format('Tienes %s en el estante, más de lo que se vende.',
            COALESCE(c.p ->> 'existencia', '0'))
          WHEN 'buen_margen' THEN format('Deja %s%% de margen: de lo que más rinde por unidad.',
            round(COALESCE((c.p ->> 'margen_pct')::numeric, 0)))
          WHEN 'recien_llegados' THEN 'Acaba de entrar. Nadie sabe todavía que lo tienes.'
          ELSE format('Se vende bien (%s en 30 días): la gente ya lo busca.',
            COALESCE(c.p ->> 'vendidos_30d', '0'))
        END)) AS fila
    FROM con_ronda c
    -- EL ARREGLO: se ordena ANTES de cortar.
    ORDER BY c.ronda, c.prio
    LIMIT p_limite
  )
  SELECT COALESCE(jsonb_agg(o.fila ORDER BY o.ronda, o.prio), '[]'::jsonb)
    INTO v_out
  FROM ordenado o;

  RETURN v_out;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
--  PRUEBA — contra producción, como el dueño
-- ═══════════════════════════════════════════════════════════════════════════
do $prueba$
declare
  v5  jsonb;
  v10 jsonb;
  v50 jsonb;
  v_pref text;
  v_top  text;
  v_razones int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb","role":"authenticated"}', true);
  v5  := public.equipo_candidatos_promocion(5);
  v10 := public.equipo_candidatos_promocion(10);
  v50 := public.equipo_candidatos_promocion(50);
  reset role;

  -- 1. Lo de 5 tiene que ser EXACTAMENTE el principio de lo de 50. Es el bug
  --    que había: antes eran cinco piezas distintas.
  select string_agg(e->>'id', ',' order by n) into v_pref
    from jsonb_array_elements(v5) with ordinality as t(e, n);
  select string_agg(e->>'id', ',' order by n) into v_top
    from (select e, n from jsonb_array_elements(v50) with ordinality as t(e, n) where n <= 5) x;
  if v_pref is distinct from v_top then
    raise exception 'PRUEBA FALLIDA: con 5 no salen las 5 primeras de la lista completa.';
  end if;

  -- 2. La segunda tanda (6 a 10) no repite ninguna de la primera.
  if exists (
    select 1
      from (select e->>'id' id from jsonb_array_elements(v10) with ordinality as t(e, n) where n > 5) b
     where b.id in (select e->>'id' from jsonb_array_elements(v5) e)
  ) then
    raise exception 'PRUEBA FALLIDA: la segunda tanda repite piezas de la primera.';
  end if;

  -- 3. Si hay más de un cajón con piezas, la primera tanda trae más de una
  --    razón: cinco "casi no se mueve" seguidas no son un menú.
  select count(distinct split_part(e->>'razon', ':', 1)) into v_razones
    from jsonb_array_elements(v5) e;
  if jsonb_array_length(v50) > 5 and v_razones < 2 then
    raise exception 'PRUEBA FALLIDA: la primera tanda trae una sola razón (%).', v_razones;
  end if;

  raise notice 'Qué promocionar hoy: las mejores de verdad, por rondas de cajón, % en total.',
    jsonb_array_length(v50);
end;
$prueba$;

select public.registrar_migracion('promocionar_de_verdad_las_mejores.sql');
