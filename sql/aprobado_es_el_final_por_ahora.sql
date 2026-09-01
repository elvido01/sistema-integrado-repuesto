-- ============================================================
-- >>> NO CORRAS ESTE ARCHIVO. HISTÓRICO. (aviso del 01/09/2026) <<<
-- ============================================================
-- La `equipo_cerrar_al_aprobar` viva en producción es más nueva que la de
-- aquí abajo. La de este archivo escribe el encargo de ARTE FINAL a mano; la
-- viva llama a `hermes.equipo_brief_arte()`, que además le manda al creativo
-- las REGLAS DE LA CASA y las REFERENCIAS que subió el dueño.
--
-- Correrlo no rompe nada visible: las promociones siguen saliendo, solo que
-- dejan de respetar las reglas y las referencias, en silencio.
--
-- Si hay que restaurarlo:  sql/rescatar_al_firmar_el_concepto.sql
-- ============================================================

-- ============================================================
-- APROBADO ES EL FINAL (POR AHORA)
-- ============================================================
-- Al firmar el borrador, `equipo_decidir` hace dos cosas: destraba el mensaje
-- del borrador (status vuelve a 'pending', approval_status 'approved') y pone
-- el trabajo en 'processing'. La idea del diseño es que a partir de ahí el
-- ORQUESTADOR recoja el borrador aprobado y lo publique.
--
-- Ese orquestador no existe — es el tercer sitio hoy donde aparece el mismo
-- agujero. Así que el trabajo se quedaba en 'processing' para siempre y el
-- dueño veía "en curso" algo que ya había firmado y que nadie iba a mover.
--
-- >>> Y PUBLICAR NO SE ACTIVA AQUÍ. <<<
-- Salir a redes no está construido, y aunque lo estuviera, encenderlo de
-- refilón dentro de un arreglo sería exactamente la clase de cosa que este
-- sistema está hecho para no hacer. El pie de la pantalla lo dice: "la
-- publicación automática está deshabilitada".
--
-- Entonces aprobado es, por ahora, el final: el trabajo se cierra con el
-- borrador aprobado guardado como resultado, y el chat lo dice sin adornos —
-- aprobado y listo para publicar, todavía sin publicar.
--
-- Cuando la publicación exista, este cierre se cambia por el envío.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_cerrar_al_aprobar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w   record;
  v_txt text;
BEGIN
  IF NEW.estado <> 'approved' OR COALESCE(OLD.estado, '') = 'approved' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN RETURN NULL; END IF;

  -- El borrador aprobado queda como resultado del trabajo: quien mire el
  -- historial dentro de un mes tiene que ver QUÉ se aprobó, no solo que se
  -- aprobó algo.
  UPDATE public.equipo_trabajos
     SET estado = 'completed',
         terminado_en = now(),
         resultado = COALESCE(NEW.contenido, resultado)
   WHERE id = v_w.id
     AND estado NOT IN ('cancelled', 'failed');

  -- El mensaje del borrador ya cumplió: lo destrabó la firma, pero no hay
  -- quien lo recoja. Dejarlo 'pending' es dejar basura en la cola de un
  -- agente que no existe.
  UPDATE public.equipo_mensajes
     SET status = 'completed'
   WHERE id = NEW.mensaje_id AND status = 'pending';

  v_txt := '✅ **Aprobado** — ' || COALESCE(v_w.titulo, 'el trabajo')
        || E'\nQueda guardado y listo para publicar.'
        || E'\n\nOjo: la publicación a redes NO es automática. Nada ha salido todavía.';

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, context_epoch,
     estado, respondido, respondido_en, message_type)
  VALUES
    (v_w.tenant_id, 'hermes', v_txt, v_w.conversation_key,
     COALESCE(v_w.context_epoch, 1), 'respondido', true, now(), 'text');

  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_equipo_cerrar_al_aprobar ON public.equipo_aprobaciones;
CREATE TRIGGER trg_equipo_cerrar_al_aprobar
  AFTER UPDATE OF estado ON public.equipo_aprobaciones
  FOR EACH ROW EXECUTE FUNCTION public.equipo_cerrar_al_aprobar();

-- ------------------------------------------------------------
-- EL DE ESTA NOCHE, QUE SE APROBÓ ANTES DEL CIERRE
-- ------------------------------------------------------------
DO $rescate$
DECLARE a record;
BEGIN
  FOR a IN
    SELECT ap.* FROM public.equipo_aprobaciones ap
    JOIN public.equipo_trabajos w ON w.id = ap.trabajo_id
    WHERE ap.estado = 'approved' AND w.estado NOT IN ('completed','cancelled','failed')
  LOOP
    UPDATE public.equipo_trabajos
       SET estado = 'completed', terminado_en = now(),
           resultado = COALESCE(a.contenido, resultado)
     WHERE id = a.trabajo_id;
    UPDATE public.equipo_mensajes SET status = 'completed'
     WHERE id = a.mensaje_id AND status = 'pending';
  END LOOP;
END $rescate$;

SELECT public.registrar_migracion('aprobado_es_el_final_por_ahora.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'trabajo', (SELECT json_build_object('titulo', left(w.titulo,40), 'estado', w.estado,
     'terminado', w.terminado_en, 'guarda_el_borrador', w.resultado ? 'copy')
   FROM public.equipo_trabajos w
   WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
   ORDER BY w.creado_en DESC LIMIT 1),
 'cola_sucia', (SELECT count(*) FROM public.equipo_mensajes m
   WHERE m.to_agent = 'hermes' AND m.status = 'pending'),
 'aprobaciones_pendientes', (SELECT count(*) FROM public.equipo_aprobaciones WHERE estado='pending')
) AS r;
