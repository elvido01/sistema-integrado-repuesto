-- ============================================================
-- PEDIR CAMBIOS DEVUELVE EL TRABAJO AL CREATIVO
-- ============================================================
-- Lo que pasó anoche: el Comercial-Creativo montó la pieza (feed e historia,
-- 22:58), llegó a la mesa, y a las 23:00 se pulsó RECHAZAR. El trabajo quedó
-- 'cancelled' y con él se fue todo: el concepto ya aprobado, el copy, las dos
-- piezas. Para cambiarle el título hay que empezar de cero.
--
-- Eso no es culpa de quien pulsó. Es que de los tres botones solo uno decía
-- algo claro. "Cambios" existía pero no hacía nada útil: clonaba la misma
-- aprobación y la devolvía a la mesa, con el mismo contenido, sin que nadie
-- trabajara en medio. Un bucle sin trabajo dentro. Así que el botón honesto
-- para "esto no me gusta" era Rechazar, y Rechazar mata.
--
-- Aquí se cierra: pedir cambios ENCARGA OTRA RONDA al creativo, con lo que el
-- dueño escribió como instrucción. Rechazar sigue existiendo y sigue matando
-- el trabajo, que para eso está.
--
-- Y de paso, las reglas universales. La pantalla dice "9 reglas" y promete que
-- el creativo las lee, pero el encargo solo recogía las de tipo 'arte': las 4
-- de tipo '*' nunca salían de la base. Prometer una regla que no viaja es peor
-- que no tenerla.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LAS REGLAS UNIVERSALES TAMBIEN VIAJAN
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_brief_arte(p_tenant uuid, p_peticion text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_foto text; v_logo text; v_tel text; v_nom text; v_reglas text;
BEGIN
  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p_peticion LIKE '%' || p.codigo || '%'
  ORDER BY length(p.codigo) DESC LIMIT 1;

  SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
  FROM public.config_empresa e WHERE e.tenant_id = p_tenant;

  -- Mismo criterio que usa la pantalla del dueño (equipo_criterios_ver): las
  -- de arte y las universales. Si él las ve en la lista, tienen que llegarle
  -- al creativo.
  SELECT string_agg('· ' || c.texto, E'\n' ORDER BY c.tipo, c.orden) INTO v_reglas
  FROM public.equipo_criterios c
  WHERE c.tenant_id = p_tenant AND c.activo AND c.tipo IN ('arte', '*');

  RETURN 'CONCEPTO APROBADO por el dueño. Ahora monta el ARTE FINAL.'
    || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
    || COALESCE(E'\n· Foto real del producto: ' || v_foto, E'\n· Foto: no hay en el catálogo, dilo')
    || COALESCE(E'\n· Logo oficial: ' || v_logo, '')
    || COALESCE(E'\n· Empresa: ' || v_nom, '')
    || COALESCE(E'\n· Teléfono: ' || v_tel, '')
    || COALESCE(E'\n\nCÓMO DEBE VERSE LA PIEZA (reglas de la casa):' || E'\n' || v_reglas, '')
    || E'\n\nDecide el título que se lee, el subtítulo y los colores, y devuélvelos en "arte".'
    || ' El montador la dibuja con la foto y el logo.'
    || E'\n\nY entrega, para CADA red, un ejemplo de TÍTULO y otro de DESCRIPCIÓN.'
    || E'\n\nNo se publica nada: esto vuelve a pasar por aprobación.';
END $fn$;

-- ------------------------------------------------------------
-- 2. PEDIR CAMBIOS = OTRA RONDA, NO OTRA COPIA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_decidir(
  p_aprobacion_id uuid, p_decision text, p_comentario text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_a       record;
  v_w       record;
  v_email   text;
  v_nota    text;
  v_ronda   int;
  v_encargo json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Solo el dueño puede aprobar o rechazar.';
  END IF;
  IF p_decision NOT IN ('approved','rejected','changes_requested') THEN
    RAISE EXCEPTION 'Decisión inválida: %', p_decision;
  END IF;

  SELECT * INTO v_a FROM public.equipo_aprobaciones
  WHERE id = p_aprobacion_id AND tenant_id = v_tenant;

  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'Esa aprobación no existe en esta empresa.';
  END IF;
  -- Decidir dos veces no cambia la primera decisión.
  IF v_a.estado <> 'pending' THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'estado', v_a.estado);
  END IF;

  v_email := COALESCE(NULLIF(auth.jwt() ->> 'email', ''),
                      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()));

  UPDATE public.equipo_aprobaciones
  SET estado = p_decision, decidido_por = auth.uid(), decidido_email = v_email,
      decidido_en = now(), comentario = NULLIF(btrim(COALESCE(p_comentario, '')), '')
  WHERE id = p_aprobacion_id;

  -- El mensaje que esperaba: aprobado se destraba, lo demás se cierra. Pedir
  -- cambios también lo cierra: el trabajo sigue por el encargo NUEVO, no
  -- reanimando el viejo.
  IF v_a.mensaje_id IS NOT NULL THEN
    UPDATE public.equipo_mensajes
    SET approval_status = p_decision,
        status = CASE WHEN p_decision = 'approved' THEN 'pending' ELSE 'cancelled' END
    WHERE id = v_a.mensaje_id;
  END IF;

  IF p_decision = 'changes_requested' THEN
    SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_a.trabajo_id;

    IF v_w.id IS NULL THEN
      RETURN json_build_object('ok', true, 'estado', p_decision, 'sin_trabajo', true);
    END IF;

    -- La ronda la marca cuántas veces se le ha encargado ya, no un contador
    -- aparte que se puede desincronizar.
    SELECT count(*) + 1 INTO v_ronda FROM public.equipo_mensajes m
    WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo';

    -- Si lo que se devuelve es una PIEZA MONTADA, el encargo lleva otra vez
    -- los materiales y las reglas de la casa: sin eso el creativo remonta de
    -- memoria y vuelve a fallar en lo mismo.
    IF public.equipo_es_arte(v_a.contenido) THEN
      v_nota := hermes.equipo_brief_arte(v_w.tenant_id, v_w.peticion);
    ELSE
      v_nota := 'El dueño revisó el borrador y pide cambios antes de seguir.';
    END IF;

    v_nota := v_nota || E'\n\n=== LO QUE PIDE EL DUEÑO, POR ENCIMA DE TODO LO ANTERIOR ==='
           || E'\n' || COALESCE(NULLIF(btrim(COALESCE(p_comentario, '')), ''),
                'No dio detalle: revisa la pieza y mejórala según las reglas de la casa.')
           || E'\n\nEsto es la ronda ' || v_ronda || '. No empieces de cero: corrige lo señalado.';

    v_encargo := hermes.equipo_encargar_a(v_w.id, 'comercial_creativo', v_ronda, v_nota);

    UPDATE public.equipo_trabajos
    SET estado = 'processing', terminado_en = NULL WHERE id = v_w.id;

    PERFORM pg_notify('equipo_ia', json_build_object(
      'tipo', 'decision', 'trabajo_id', v_a.trabajo_id, 'decision', p_decision)::text);

    RETURN json_build_object('ok', true, 'duplicado', false, 'estado', p_decision,
                             'ronda', v_ronda, 'encargo', v_encargo);

  ELSIF p_decision = 'rejected' THEN
    UPDATE public.equipo_trabajos
    SET estado = 'cancelled', terminado_en = now() WHERE id = v_a.trabajo_id;
  ELSE
    UPDATE public.equipo_trabajos
    SET estado = 'processing' WHERE id = v_a.trabajo_id AND estado = 'waiting_approval';
  END IF;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'decision', 'trabajo_id', v_a.trabajo_id, 'decision', p_decision)::text);

  RETURN json_build_object('ok', true, 'duplicado', false, 'estado', p_decision);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_decidir(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_decidir(uuid,text,text) TO authenticated;

SELECT public.registrar_migracion('pedir_cambios_no_mata_el_trabajo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'reglas_que_viajan', (
   SELECT count(*) FROM regexp_matches(
     hermes.equipo_brief_arte('00000000-0000-0000-0000-000000000001',
       (SELECT w.peticion FROM public.equipo_trabajos w
        WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
        ORDER BY w.creado_en DESC LIMIT 1)), '^· ', 'gn')),
 'reglas_en_pantalla', (SELECT count(*) FROM public.equipo_criterios
   WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND activo
     AND tipo IN ('arte','*')),
 'cambios_encarga', (SELECT pg_get_functiondef(p.oid) LIKE '%equipo_encargar_a%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_decidir'),
 'ya_no_clona', (SELECT pg_get_functiondef(p.oid) NOT LIKE '%revision_de, revision_num%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_decidir')
) AS r;
