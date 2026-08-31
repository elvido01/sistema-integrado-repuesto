-- ============================================================
-- LA LISTA DE LA MAÑANA, Y EL TEXTO QUE ESCRIBE EL DUEÑO
-- ============================================================
-- La idea del dueño, con sus palabras:
--
--   "De los productos que Hermes diariamente me recomienda promocionar, yo
--    poder elegir uno o dos y que se lo envíe al Comercial-Creativo. Que
--    diseñe un post tipo historia, le pongo un título, le pongo una
--    descripción, y Hermes, luego de que yo lo autorice, lo mande a publicar."
--
-- El cerebro que elige ya existía y llevaba meses sin enchufarse a nada:
-- `get_marketing_candidates` mira margen, existencia, rotación de 30 y 60
-- días y cuánto capital hay dormido en cada pieza. Lo que faltaba era el
-- camino desde esa lista hasta el encargo, y el sitio donde el dueño escribe
-- SU título en vez de aprobar el del agente.
--
-- Aquí van las dos cosas. Publicar NO: eso sale a la calle solo y se diseña
-- aparte, con su propia autorización.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ PROMOCIONAR HOY
-- ------------------------------------------------------------
-- Devuelve candidatos con el PORQUÉ escrito. Un listado de códigos y
-- márgenes obliga al dueño a hacer la cuenta mental cada mañana; la razón
-- en una frase es lo que convierte la lista en una decisión.
CREATE OR REPLACE FUNCTION public.equipo_candidatos_promocion(p_limite int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
  WITH bruto AS (
    SELECT public.get_marketing_candidates(v_tenant, false, GREATEST(p_limite * 4, 20))::jsonb AS d
  ),
  plano AS (
    SELECT cat.k AS cajon, cat.prio, e AS p
    FROM bruto,
         LATERAL (VALUES ('baja_rotacion', 1), ('alta_existencia', 2),
                         ('buen_margen', 3), ('recien_llegados', 4),
                         ('mas_vendidos', 5)) AS cat(k, prio),
         LATERAL jsonb_array_elements(COALESCE(bruto.d -> cat.k, '[]'::jsonb)) e
  ),
  -- Una pieza puede salir en varios cajones. Se queda con el que más
  -- justifica promocionarla, no con el primero que toque.
  unico AS (
    SELECT DISTINCT ON ((p ->> 'id')) cajon, prio, p
    FROM plano
    WHERE COALESCE(p ->> 'imagen_url', '') <> ''
    ORDER BY (p ->> 'id'), prio
  )
  SELECT COALESCE(jsonb_agg(x.fila ORDER BY x.prio, x.capital DESC), '[]'::jsonb)
    INTO v_out
  FROM (
    SELECT
      u.prio,
      COALESCE((u.p ->> 'capital_inmovilizado')::numeric, 0) AS capital,
      (u.p || jsonb_build_object('razon',
        CASE u.cajon
          WHEN 'baja_rotacion' THEN format('Casi no se mueve: %s vendidos en 30 días y tienes RD$%s dormidos ahí.',
            COALESCE(u.p ->> 'vendidos_30d', '0'),
            to_char(COALESCE((u.p ->> 'capital_inmovilizado')::numeric, 0), 'FM999G999G990D00'))
          WHEN 'alta_existencia' THEN format('Tienes %s en el estante, más de lo que se vende.',
            COALESCE(u.p ->> 'existencia', '0'))
          WHEN 'buen_margen' THEN format('Deja %s%% de margen: de lo que más rinde por unidad.',
            round(COALESCE((u.p ->> 'margen_pct')::numeric, 0)))
          WHEN 'recien_llegados' THEN 'Acaba de entrar. Nadie sabe todavía que lo tienes.'
          ELSE format('Se vende bien (%s en 30 días): la gente ya lo busca.',
            COALESCE(u.p ->> 'vendidos_30d', '0'))
        END)) AS fila
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
    LIMIT p_limite
  ) x;

  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_candidatos_promocion(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_candidatos_promocion(int) TO authenticated;

-- ------------------------------------------------------------
-- 2. ELEGIR Y ENCARGAR, DE UN CLIC
-- ------------------------------------------------------------
-- Sin tarjeta ámbar. La tarjeta existe para cuando HERMES propone algo por
-- su cuenta y hace falta que una persona lo consienta. Aquí la persona es
-- quien inicia: pedirle que autorice lo que acaba de pulsar es papeleo.
--
-- Y los datos del producto los pone la base, no el agente: precio y
-- existencia salen del catálogo al abrir el trabajo, así que no hay forma
-- de que lleguen inventados a la pieza.
CREATE OR REPLACE FUNCTION public.equipo_encargar_promocion(
  p_producto_ids uuid[],
  p_enfoque      text DEFAULT NULL,
  p_formato      text DEFAULT 'historia')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_n       int;
  v_titulo  text;
  v_cuerpo  text := '';
  v_pet     text;
  v_abierto json;
  v_trabajo uuid;
  v_encargo json;
  r         record;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT count(*) INTO v_n FROM unnest(COALESCE(p_producto_ids, '{}'::uuid[]));
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No elegiste ningún producto.';
  END IF;
  IF v_n > 2 THEN
    RAISE EXCEPTION 'Máximo dos productos por promoción.';
  END IF;
  IF p_formato NOT IN ('historia', 'feed') THEN
    RAISE EXCEPTION 'Formato no admitido: %', p_formato;
  END IF;

  FOR r IN
    SELECT p.codigo, p.descripcion, p.precio, p.imagen_url
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.id = ANY(p_producto_ids)
    ORDER BY p.precio DESC
  LOOP
    v_cuerpo := v_cuerpo || format(
      E'· %s (código %s). Precio de catálogo: RD$ %s.\n',
      r.descripcion, r.codigo, to_char(r.precio, 'FM999G999G990D00'));
    v_titulo := COALESCE(v_titulo, r.descripcion);
  END LOOP;

  IF v_cuerpo = '' THEN
    RAISE EXCEPTION 'Esos productos no son de esta empresa.';
  END IF;

  v_pet := 'Prepara la promoción de:' || E'\n' || v_cuerpo
    || COALESCE(E'\nEnfoque pedido: ' || NULLIF(btrim(p_enfoque), '') || E'\n', '')
    || format(E'\nFormato principal: %s.', p_formato)
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.';

  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant   => v_tenant,
    p_titulo   => 'Promoción ' || left(v_titulo, 120),
    p_peticion => v_pet,
    p_tipo     => 'promocion',
    p_solicitado_por => auth.uid());

  v_trabajo := (v_abierto ->> 'trabajo_id')::uuid;

  -- El encargo va derecho al creativo. Si ya existía y murió, revive.
  v_encargo := hermes.equipo_encargar_a(v_trabajo, 'comercial_creativo');

  RETURN json_build_object('ok', true, 'trabajo_id', v_trabajo,
                           'trabajo', v_abierto, 'encargo', v_encargo);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_encargar_promocion(uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_encargar_promocion(uuid[],text,text) TO authenticated;

-- ------------------------------------------------------------
-- 3. EL TEXTO LO ESCRIBE EL DUEÑO
-- ------------------------------------------------------------
-- Hasta ahora solo podía aprobar o rechazar el copy del creativo. Es su
-- negocio y su voz: cambiar una palabra no debería costar una ronda entera
-- con el agente.
--
-- Se guarda aparte de `equipo_decidir` a propósito. Añadirle un argumento a
-- esa función crearía una segunda versión conviviendo con la primera —es
-- exactamente el "is not unique" que reventó al pulsar Autorizar esta
-- mañana— así que aquí no se toca ninguna firma existente.
CREATE OR REPLACE FUNCTION public.equipo_aprobacion_editar(
  p_aprobacion_id uuid,
  p_copy          jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_a      record;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  IF jsonb_typeof(p_copy) <> 'object' THEN
    RAISE EXCEPTION 'El texto editado tiene que venir como objeto por red.';
  END IF;

  SELECT * INTO v_a FROM public.equipo_aprobaciones
  WHERE id = p_aprobacion_id AND tenant_id = v_tenant;

  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'Esa aprobación no existe en esta empresa.';
  END IF;
  IF v_a.estado <> 'pending' THEN
    RAISE EXCEPTION 'Eso ya está decidido: no se puede reescribir.';
  END IF;

  -- Queda marcado quién escribió el texto final. No es burocracia: el
  -- módulo de aprendizaje mide qué copy funciona, y mezclar el del agente
  -- con el del dueño le haría sacar conclusiones sobre un autor que no es.
  UPDATE public.equipo_aprobaciones
     SET contenido = jsonb_set(
           jsonb_set(COALESCE(contenido, '{}'::jsonb), '{copy}', p_copy, true),
           '{copy_editado_por_el_dueno}', 'true'::jsonb, true)
   WHERE id = p_aprobacion_id;

  RETURN json_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_aprobacion_editar(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_aprobacion_editar(uuid,jsonb) TO authenticated;

SELECT public.registrar_migracion('la_lista_de_la_manana.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'rpcs', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('equipo_candidatos_promocion','equipo_encargar_promocion','equipo_aprobacion_editar')),
 'sin_duplicados', (SELECT bool_and(c = 1) FROM (
   SELECT count(*) AS c FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('equipo_candidatos_promocion','equipo_encargar_promocion','equipo_aprobacion_editar')
   GROUP BY p.proname) q),
 'el_cerebro_responde', (SELECT count(*) FROM public.get_marketing_candidates(
   '00000000-0000-0000-0000-000000000001'::uuid, false, 5))
) AS r;
