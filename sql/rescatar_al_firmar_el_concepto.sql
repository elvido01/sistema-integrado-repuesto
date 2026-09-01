-- ============================================================
-- RESCATE: LO QUE PASA CUANDO FIRMAS EL CONCEPTO
-- ============================================================
-- Segunda copia verbatim de producción, del mismo día y por el mismo motivo
-- que `rescatar_el_borrador_a_la_mesa.sql`. Esto no cambia nada: trae al repo
-- lo que ya está corriendo.
--
-- La auditoría del 01/09 comparó las 79 funciones vivas del circuito contra
-- `sql/` — no si EXISTEN, que era el error de la primera pasada, sino si el
-- cuerpo del repo es el cuerpo vivo. Salió esta:
--
--   `public.equipo_cerrar_al_aprobar` aparece en DOS archivos —
--   `aprobado_es_el_final_por_ahora.sql` y `dos_firmas_concepto_y_arte.sql`—
--   y ninguno de los dos es lo que corre.
--
-- La diferencia no se ve a simple vista, y ese es el problema. Las dos
-- versiones del repo escriben el encargo de ARTE FINAL a mano, con la foto,
-- el logo y el teléfono. La viva llama a `hermes.equipo_brief_arte()`, que
-- además lleva:
--
--   · las REGLAS DE LA CASA (`equipo_criterios` tipo 'arte'), que el dueño
--     edita desde la pantalla sin tocar SQL
--   · las REFERENCIAS que subió el dueño — la de FONDO se monta debajo de la
--     pieza, la de ESTILO es el listón que el creativo tiene que mirar
--
-- Correr cualquiera de esos dos archivos no rompe nada visible: el circuito
-- sigue funcionando, las promociones siguen saliendo. Simplemente dejan de
-- respetar las reglas y las referencias del dueño, en silencio, y la única
-- forma de enterarse es notar que las piezas "ya no se ven como antes".
--
-- >>> NO SE CORREN ESOS DOS. SE CORRE ESTE. <<<
--
-- Aplicarlo es un no-op (pg_get_functiondef, no transcrito a mano).
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_cerrar_al_aprobar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_w record; v_txt text; v_ronda int;
BEGIN
  IF NEW.estado <> 'approved' OR COALESCE(OLD.estado,'') = 'approved' THEN RETURN NULL; END IF;
  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.equipo_mensajes SET status = 'completed'
   WHERE id = NEW.mensaje_id AND status = 'pending';

  IF NOT public.equipo_es_arte(NEW.contenido) AND v_w.tipo = 'promocion' THEN
    SELECT count(*) + 1 INTO v_ronda FROM public.equipo_mensajes m
    WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo';

    PERFORM hermes.equipo_encargar_a(v_w.id, 'comercial_creativo', v_ronda,
      hermes.equipo_brief_arte(v_w.tenant_id, v_w.peticion));

    UPDATE public.equipo_trabajos SET estado = 'processing'
     WHERE id = v_w.id AND estado NOT IN ('cancelled','failed');

    v_txt := '✅ **Concepto aprobado** — ' || COALESCE(v_w.titulo,'el trabajo')
      || E'\nSe lo devolví al Comercial-Creativo para que monte el arte con la foto real, el logo y las reglas de la casa.'
      || E'\n\nLo reviso yo antes de enseñártelo. Todavía no se publica nada.';
  ELSE
    UPDATE public.equipo_trabajos
       SET estado = 'completed', terminado_en = now(), resultado = COALESCE(NEW.contenido, resultado)
     WHERE id = v_w.id AND estado NOT IN ('cancelled','failed');
    v_txt := '✅ **Arte aprobado** — ' || COALESCE(v_w.titulo,'el trabajo')
      || E'\nLa pieza queda guardada y lista para publicar.'
      || E'\n\nOjo: la publicación a redes todavía NO es automática. Nada ha salido.';
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, context_epoch,
     estado, respondido, respondido_en, message_type)
  VALUES (v_w.tenant_id, 'hermes', v_txt, v_w.conversation_key,
    COALESCE(v_w.context_epoch,1), 'respondido', true, now(), 'text');

  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_equipo_cerrar_al_aprobar ON public.equipo_aprobaciones;
CREATE TRIGGER trg_equipo_cerrar_al_aprobar AFTER UPDATE OF estado ON public.equipo_aprobaciones FOR EACH ROW EXECUTE FUNCTION equipo_cerrar_al_aprobar();

SELECT public.registrar_migracion('rescatar_al_firmar_el_concepto.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que exista no prueba nada: las dos versiones viejas también existen. Lo que
-- se comprueba es que la viva es la que pide el brief COMPLETO — con las
-- reglas de la casa y las referencias del dueño dentro.
SELECT json_build_object(
 'existe', to_regprocedure('public.equipo_cerrar_al_aprobar()') IS NOT NULL,
 'pide_el_brief_completo', (SELECT p.prosrc LIKE '%equipo_brief_arte%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_cerrar_al_aprobar'),
 'no_escribe_el_brief_a_mano', (SELECT p.prosrc NOT LIKE '%Materiales (úsalos tal cual%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_cerrar_al_aprobar'),
 'el_brief_lleva_las_reglas', (SELECT p.prosrc LIKE '%reglas de la casa%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_brief_arte'),
 'el_brief_lleva_las_referencias', (SELECT p.prosrc LIKE '%equipo_referencias%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_brief_arte'),
 'disparador_puesto', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE NOT t.tgisinternal AND c.relname='equipo_aprobaciones'
     AND t.tgname='trg_equipo_cerrar_al_aprobar')
) AS r;
