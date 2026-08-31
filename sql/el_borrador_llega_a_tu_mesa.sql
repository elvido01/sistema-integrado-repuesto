-- ============================================================
-- EL BORRADOR LLEGA A TU MESA
-- ============================================================
-- Último tramo del circuito, la misma noche del 30/08/2026.
--
-- El Comercial-Creativo tomó el encargo TRES SEGUNDOS después de recibirlo y
-- devolvió un borrador de verdad: copy para WhatsApp, Facebook e Instagram,
-- el razonamiento comercial, los requisitos visuales, y dos advertencias que
-- nadie le pidió ("falta foto real del producto", "no puedo confirmar si ya
-- se promocionó en 14 días").
--
-- Y ese borrador se quedó parado, como mensaje `draft_result` dirigido a
-- `hermes`. Mismo agujero que con el encargo: el ORQUESTADOR que lo
-- convertiría en una aprobación no existe — en equipo_workers solo están
-- jarvis y comercial_creativo.
--
-- Aquí tampoco hay nada que decidir: un borrador terminado va a la mesa del
-- dueño. Punto. Así que el puente se hace con un trigger, en el momento en
-- que el borrador entra.
--
-- >>> LO QUE ESTO NO HACE: aprobar nada. <<<
-- Deja la aprobación en 'pending' y el trabajo en 'waiting_approval'. Sin la
-- firma del dueño no se publica, que es la regla de siempre.
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
BEGIN
  IF NEW.message_type <> 'draft_result' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Un borrador, una aprobación. Si el creativo reintenta la misma ronda no
  -- se llena la mesa de copias del mismo trabajo.
  SELECT a.id INTO v_prev FROM public.equipo_aprobaciones a
  WHERE a.mensaje_id = NEW.id;
  IF v_prev IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.equipo_aprobaciones
    (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
     datos_usados, impacto, riesgo, contenido, estado, expira_en)
  VALUES
    (v_w.tenant_id, v_w.id, NEW.id, NEW.from_agent,
     'Publicar ' || COALESCE(NULLIF(btrim(v_w.titulo), ''), 'la promoción'),
     COALESCE(NEW.summary, 'Borrador entregado por el ' || NEW.from_agent),
     jsonb_build_object('peticion', v_w.peticion, 'tipo', v_w.tipo),
     'Sale a redes con tu nombre y con el precio del catálogo.',
     -- Una promoción es de riesgo medio: se ve en público y lleva precio.
     CASE WHEN v_w.tipo = 'promocion' THEN 'medio' ELSE 'bajo' END,
     NEW.payload,
     'pending',
     now() + interval '7 days');

  -- El trabajo deja de estar "en curso": está esperando una firma.
  UPDATE public.equipo_trabajos
     SET estado = 'waiting_approval'
   WHERE id = v_w.id AND estado NOT IN ('completed', 'cancelled', 'failed');

  -- Y el mensaje se da por atendido: su destino era llegar a la mesa.
  UPDATE public.equipo_mensajes
     SET status = 'completed'
   WHERE id = NEW.id AND status = 'pending';

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'aprobacion_nueva', 'trabajo_id', v_w.id,
    'tenant_id', v_w.tenant_id)::text);

  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_equipo_borrador_a_la_mesa ON public.equipo_mensajes;
CREATE TRIGGER trg_equipo_borrador_a_la_mesa
  AFTER INSERT ON public.equipo_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.equipo_borrador_a_la_mesa();

-- ------------------------------------------------------------
-- EL BORRADOR DE ESTA NOCHE, QUE LLEGÓ ANTES QUE EL PUENTE
-- ------------------------------------------------------------
DO $rescate$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT e.* FROM public.equipo_mensajes e
    WHERE e.message_type = 'draft_result'
      AND NOT EXISTS (SELECT 1 FROM public.equipo_aprobaciones a WHERE a.mensaje_id = e.id)
    ORDER BY e.created_at
  LOOP
    -- Se reinserta el efecto a mano llamando a la misma lógica: se simula
    -- el disparo del trigger sobre ese mensaje.
    PERFORM public.equipo_rescatar_borrador(m.id);
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  NULL;  -- la función auxiliar se crea justo debajo; en la primera pasada no existe
END $rescate$;

-- Auxiliar para rescatar borradores que llegaron antes del trigger.
CREATE OR REPLACE FUNCTION public.equipo_rescatar_borrador(p_mensaje_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_m  record;
  v_w  record;
  v_id uuid;
BEGIN
  SELECT * INTO v_m FROM public.equipo_mensajes WHERE id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.message_type <> 'draft_result' THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_es_borrador');
  END IF;

  IF EXISTS (SELECT 1 FROM public.equipo_aprobaciones a WHERE a.mensaje_id = v_m.id) THEN
    RETURN json_build_object('ok', true, 'duplicado', true);
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_m.trabajo_id;

  INSERT INTO public.equipo_aprobaciones
    (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
     datos_usados, impacto, riesgo, contenido, estado, expira_en)
  VALUES
    (v_w.tenant_id, v_w.id, v_m.id, v_m.from_agent,
     'Publicar ' || COALESCE(NULLIF(btrim(v_w.titulo), ''), 'la promoción'),
     COALESCE(v_m.summary, 'Borrador entregado por el ' || v_m.from_agent),
     jsonb_build_object('peticion', v_w.peticion, 'tipo', v_w.tipo),
     'Sale a redes con tu nombre y con el precio del catálogo.',
     CASE WHEN v_w.tipo = 'promocion' THEN 'medio' ELSE 'bajo' END,
     v_m.payload, 'pending', now() + interval '7 days')
  RETURNING id INTO v_id;

  UPDATE public.equipo_trabajos SET estado = 'waiting_approval'
   WHERE id = v_w.id AND estado NOT IN ('completed', 'cancelled', 'failed');
  UPDATE public.equipo_mensajes SET status = 'completed'
   WHERE id = v_m.id AND status = 'pending';

  RETURN json_build_object('ok', true, 'aprobacion_id', v_id);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_rescatar_borrador(uuid) FROM PUBLIC, anon, authenticated;

-- Ahora sí, con la auxiliar ya creada.
DO $rescate2$
DECLARE m record; BEGIN
  FOR m IN SELECT e.id FROM public.equipo_mensajes e
           WHERE e.message_type = 'draft_result'
             AND NOT EXISTS (SELECT 1 FROM public.equipo_aprobaciones a WHERE a.mensaje_id = e.id)
           ORDER BY e.created_at
  LOOP
    PERFORM public.equipo_rescatar_borrador(m.id);
  END LOOP;
END $rescate2$;

SELECT public.registrar_migracion('el_borrador_llega_a_tu_mesa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'aprobaciones_pendientes', (SELECT count(*) FROM public.equipo_aprobaciones WHERE estado='pending'),
 'la_de_hoy', (SELECT json_build_object(
     'accion', a.accion, 'por', a.preparado_por, 'riesgo', a.riesgo,
     'estado', a.estado, 'motivo', left(a.motivo, 70))
   FROM public.equipo_aprobaciones a ORDER BY a.creado_en DESC LIMIT 1),
 'estado_trabajo', (SELECT w.estado FROM public.equipo_trabajos w
   WHERE w.tenant_id='00000000-0000-0000-0000-000000000001'
   ORDER BY w.creado_en DESC LIMIT 1)
) AS r;
