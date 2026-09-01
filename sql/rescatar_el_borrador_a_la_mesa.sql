-- ============================================================
-- RESCATE: LO QUE DE VERDAD PASA CUANDO LLEGA UN BORRADOR
-- ============================================================
-- Esto no cambia nada. Es una COPIA VERBATIM de lo que hay vivo en
-- producción, traída al repo porque no estaba en ninguna parte.
--
-- El 01/09, auditando las 54 funciones del circuito de Equipo IA contra
-- `sql/`, aparecieron dos huecos:
--
--   · `public.equipo_avisar_del_borrador` no existía en NINGÚN archivo. Se
--     aplicó desde el editor de Supabase y no quedó copia.
--   · `public.equipo_borrador_a_la_mesa` sí está en
--     `sql/el_borrador_llega_a_tu_mesa.sql`, pero esa versión es la PRIMERA:
--     no tiene la revisión de Hermes, ni los reparos, ni el aviso al chat,
--     ni la distinción entre "Aprobar el concepto" y "Publicar".
--
-- Lo segundo es una trampa peor que lo primero. Un archivo que existe y está
-- viejo se corre con confianza: alguien abre `el_borrador_llega_a_tu_mesa.sql`
-- para "reinstalar el disparador" y, sin enterarse, deja el circuito sin
-- supervisor — los borradores volverían a llegar a la mesa sin que nadie
-- compruebe el precio contra el catálogo. Un hueco vacío al menos se ve.
--
-- >>> NO SE CORRE `el_borrador_llega_a_tu_mesa.sql`. SE CORRE ESTE. <<<
--
-- Aplicarlo es un no-op: el cuerpo es idéntico al que ya está en la base
-- (sacado con pg_get_functiondef, no transcrito a mano). Lo que cambia es que
-- a partir de hoy existe de dónde restaurarlo.
--
-- Idempotente. Mismos argumentos que las versiones vivas, así que REPLACE
-- reemplaza de verdad y no crea sobrecargas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_avisar_del_borrador(p_tenant uuid, p_conv text, p_epoca integer, p_titulo text, p_payload jsonb, p_rev integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txt text; v_par record; v_av text; v_foto text; v_img uuid;
BEGIN
  v_txt := CASE WHEN public.equipo_es_arte(p_payload)
                THEN '🎨 **Arte listo** — ' ELSE '**Borrador listo** — ' END
        || COALESCE(p_titulo, 'trabajo')
        || CASE WHEN p_rev > 1 THEN ' (revisión ' || p_rev || ')' ELSE '' END;

  IF COALESCE(p_payload ->> 'resumen', '') <> '' THEN
    v_txt := v_txt || E'\n' || (p_payload ->> 'resumen');
  END IF;

  FOR v_par IN SELECT key, value FROM jsonb_each_text(COALESCE(p_payload -> 'copy','{}'::jsonb)) LOOP
    v_txt := v_txt || E'\n\n**' || initcap(v_par.key) || ':** ' || v_par.value;
  END LOOP;

  SELECT string_agg('· ' || a, E'\n') INTO v_av
  FROM jsonb_array_elements_text(COALESCE(p_payload -> 'advertencias','[]'::jsonb)) a;
  IF v_av IS NOT NULL THEN
    v_txt := v_txt || E'\n\n⚠️ Míralo antes de aprobar:' || E'\n' || v_av;
  END IF;

  -- La pieza montada gana a la foto suelta del producto.
  BEGIN
    v_img := NULLIF(btrim(COALESCE(p_payload ->> 'arte_imagen_id','')), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_img := NULL;
  END;

  IF v_img IS NULL THEN
    v_foto := substring(p_payload::text from 'https?://[^"\s]+[.](?:png|jpe?g|webp)');
    IF v_foto IS NOT NULL THEN v_txt := v_txt || E'\n\n' || v_foto; END IF;
  END IF;

  v_txt := v_txt || E'\n\nNo se ha publicado nada. Apruébalo aquí mismo o en Equipo IA.';

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, context_epoch,
     estado, respondido, respondido_en, message_type, imagen_id)
  VALUES
    (p_tenant, 'hermes', v_txt, p_conv, COALESCE(p_epoca,1),
     'respondido', true, now(), CASE WHEN v_img IS NULL THEN 'text' ELSE 'mixed' END, v_img);
END $function$;


CREATE OR REPLACE FUNCTION public.equipo_borrador_a_la_mesa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_w record; v_prev uuid; v_num smallint;
  v_reparos text[]; v_vueltas int;
BEGIN
  IF NEW.message_type <> 'draft_result' THEN RETURN NULL; END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN RETURN NULL; END IF;

  SELECT a.id INTO v_prev FROM public.equipo_aprobaciones a WHERE a.mensaje_id = NEW.id;
  IF v_prev IS NOT NULL THEN RETURN NULL; END IF;

  UPDATE public.equipo_mensajes SET status = 'completed'
   WHERE id = NEW.id AND status = 'pending';

  -- ── LA REVISIÓN ────────────────────────────────────────────────
  -- Solo se devuelve lo que se puede comprobar. Y solo dos veces: a la
  -- tercera pasa igual con los reparos escritos encima, porque un bucle
  -- entre dos agentes no lo para nadie desde fuera.
  v_reparos := public.equipo_revisar_arte(v_w.id, NEW.payload);
  SELECT count(*) INTO v_vueltas FROM public.equipo_mensajes m
  WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo'
    AND m.payload ->> 'texto' LIKE '%REPAROS DE HERMES%';

  IF array_length(v_reparos, 1) > 0 AND v_vueltas < 2 THEN
    PERFORM hermes.equipo_encargar_a(v_w.id, 'comercial_creativo',
      (SELECT count(*) + 1 FROM public.equipo_mensajes m
       WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo'),
      'REPAROS DE HERMES. Esto no ha llegado al dueño todavía; corrígelo y vuelve a entregar:'
      || E'\n· ' || array_to_string(v_reparos, E'\n· '));

    UPDATE public.equipo_trabajos SET estado = 'processing'
     WHERE id = v_w.id AND estado NOT IN ('cancelled','failed');

    INSERT INTO public.hermes_chat
      (tenant_id, rol, texto, conversation_key, context_epoch,
       estado, respondido, respondido_en, message_type)
    VALUES (v_w.tenant_id, 'hermes',
      '🔍 Revisé el borrador de **' || COALESCE(v_w.titulo,'la promoción')
      || '** y se lo devolví al Comercial-Creativo. No te lo enseño así:'
      || E'\n· ' || array_to_string(v_reparos, E'\n· ')
      || E'\n\nTe aviso cuando esté corregido.',
      v_w.conversation_key, COALESCE(v_w.context_epoch,1),
      'respondido', true, now(), 'text');
    RETURN NULL;
  END IF;

  -- ── PASA: a la mesa ────────────────────────────────────────────
  SELECT count(*) + 1 INTO v_num FROM public.equipo_aprobaciones a WHERE a.trabajo_id = v_w.id;

  UPDATE public.equipo_aprobaciones SET estado = 'expired'
   WHERE trabajo_id = v_w.id AND estado = 'pending';

  INSERT INTO public.equipo_aprobaciones
    (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
     datos_usados, impacto, riesgo, contenido, estado, revision_num, expira_en)
  VALUES
    (v_w.tenant_id, v_w.id, NEW.id, NEW.from_agent,
     CASE WHEN public.equipo_es_arte(NEW.payload)
          THEN 'Publicar ' ELSE 'Aprobar el concepto de ' END
     || COALESCE(NULLIF(btrim(v_w.titulo), ''), 'la promoción'),
     COALESCE(NEW.summary, 'Borrador entregado por el ' || NEW.from_agent)
     || CASE WHEN array_length(v_reparos,1) > 0
             THEN ' · Hermes dejó reparos: ' || array_to_string(v_reparos, ' | ') ELSE '' END,
     jsonb_build_object('peticion', v_w.peticion, 'tipo', v_w.tipo,
                        'reparos', to_jsonb(v_reparos)),
     CASE WHEN public.equipo_es_arte(NEW.payload)
          THEN 'Sale a redes con tu nombre y con el precio del catálogo.'
          ELSE 'Aprobar el concepto no publica: manda a montar el arte.' END,
     CASE WHEN v_w.tipo = 'promocion' THEN 'medio' ELSE 'bajo' END,
     NEW.payload, 'pending', v_num, now() + interval '7 days');

  UPDATE public.equipo_trabajos SET estado = 'waiting_approval'
   WHERE id = v_w.id AND estado NOT IN ('completed','cancelled','failed');

  PERFORM public.equipo_avisar_del_borrador(v_w.tenant_id, v_w.conversation_key,
    v_w.context_epoch, v_w.titulo, NEW.payload, v_num);

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo','aprobacion_nueva','trabajo_id',v_w.id,'tenant_id',v_w.tenant_id)::text);

  RETURN NULL;
END $function$;


DROP TRIGGER IF EXISTS trg_equipo_borrador_a_la_mesa ON public.equipo_mensajes;
CREATE TRIGGER trg_equipo_borrador_a_la_mesa AFTER INSERT ON public.equipo_mensajes FOR EACH ROW EXECUTE FUNCTION equipo_borrador_a_la_mesa();
SELECT public.registrar_migracion('rescatar_el_borrador_a_la_mesa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que las funciones existan no prueba nada: la vieja también existe. Lo que
-- se comprueba es que la que está viva es la que REVISA — el marcador es el
-- texto de los reparos, que la primera versión no tiene.
SELECT json_build_object(
 'avisar_existe', to_regprocedure(
   'public.equipo_avisar_del_borrador(uuid,text,integer,text,jsonb,integer)') IS NOT NULL,
 'a_la_mesa_existe', to_regprocedure('public.equipo_borrador_a_la_mesa()') IS NOT NULL,
 'a_la_mesa_revisa', (SELECT p.prosrc LIKE '%REPAROS DE HERMES%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_borrador_a_la_mesa'),
 'a_la_mesa_avisa', (SELECT p.prosrc LIKE '%equipo_avisar_del_borrador%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_borrador_a_la_mesa'),
 'distingue_concepto_de_arte', (SELECT p.prosrc LIKE '%Aprobar el concepto de %' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_borrador_a_la_mesa'),
 'disparador_puesto', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE NOT t.tgisinternal AND c.relname='equipo_mensajes'
     AND t.tgname='trg_equipo_borrador_a_la_mesa')
) AS r;
