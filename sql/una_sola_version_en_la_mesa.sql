-- ============================================================
-- UNA SOLA VERSIÓN EN LA MESA
-- ============================================================
-- Al pedirle al Comercial-Creativo una segunda ronda con la foto, entregó un
-- borrador nuevo — y en "Esperando tu aprobación" quedaron los dos: el de
-- antes sin foto y el de ahora con ella.
--
-- Dos versiones del mismo trabajo esperando firma es una trampa: se aprueba
-- la que esté más a mano, y puede ser la vieja. Cuando llega una revisión, la
-- anterior deja de estar en juego.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_borrador_a_la_mesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w    record;
  v_prev uuid;
  v_num  smallint;
BEGIN
  IF NEW.message_type <> 'draft_result' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.id INTO v_prev FROM public.equipo_aprobaciones a WHERE a.mensaje_id = NEW.id;
  IF v_prev IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- La versión anterior del MISMO trabajo sale de la mesa. No se borra: queda
  -- como 'expired' para que se vea que existió y qué decía.
  SELECT count(*) + 1 INTO v_num FROM public.equipo_aprobaciones a
  WHERE a.trabajo_id = v_w.id;

  UPDATE public.equipo_aprobaciones
     SET estado = 'expired'
   WHERE trabajo_id = v_w.id AND estado = 'pending';

  INSERT INTO public.equipo_aprobaciones
    (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
     datos_usados, impacto, riesgo, contenido, estado, revision_num, expira_en)
  VALUES
    (v_w.tenant_id, v_w.id, NEW.id, NEW.from_agent,
     'Publicar ' || COALESCE(NULLIF(btrim(v_w.titulo), ''), 'la promoción'),
     COALESCE(NEW.summary, 'Borrador entregado por el ' || NEW.from_agent),
     jsonb_build_object('peticion', v_w.peticion, 'tipo', v_w.tipo),
     'Sale a redes con tu nombre y con el precio del catálogo.',
     CASE WHEN v_w.tipo = 'promocion' THEN 'medio' ELSE 'bajo' END,
     NEW.payload, 'pending', v_num,
     now() + interval '7 days');

  UPDATE public.equipo_trabajos
     SET estado = 'waiting_approval'
   WHERE id = v_w.id AND estado NOT IN ('completed', 'cancelled', 'failed');

  UPDATE public.equipo_mensajes
     SET status = 'completed'
   WHERE id = NEW.id AND status = 'pending';

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'aprobacion_nueva', 'trabajo_id', v_w.id,
    'tenant_id', v_w.tenant_id)::text);

  RETURN NULL;
END $fn$;

-- El caso de esta noche: dejar solo la versión con foto.
UPDATE public.equipo_aprobaciones a
   SET estado = 'expired'
 WHERE a.estado = 'pending'
   AND EXISTS (SELECT 1 FROM public.equipo_aprobaciones b
               WHERE b.trabajo_id = a.trabajo_id AND b.estado = 'pending'
                 AND b.creado_en > a.creado_en);

SELECT public.registrar_migracion('una_sola_version_en_la_mesa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'en_la_mesa', (SELECT json_agg(json_build_object(
     'accion', left(a.accion, 45), 'por', a.preparado_por,
     'revision', a.revision_num, 'tiene_foto', a.contenido::text LIKE '%product-images%',
     'trabajo', w.estado) ORDER BY a.creado_en DESC)
   FROM public.equipo_aprobaciones a
   JOIN public.equipo_trabajos w ON w.id = a.trabajo_id
   WHERE a.estado = 'pending'),
 'descartadas', (SELECT count(*) FROM public.equipo_aprobaciones WHERE estado = 'expired')
) AS r;
