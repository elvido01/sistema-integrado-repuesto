-- ============================================================
-- HERMES TE TRAE EL RESULTADO
-- ============================================================
-- Regla del dueño: "Hermes solo tiene que delegar, supervisar, y entregarme
-- el resultado final."
--
-- Lo de delegar ya quedó: encarga, avisa que quedó propuesto, y el
-- Comercial-Creativo lo trabaja. Pero cuando el creativo TERMINA, el borrador
-- se queda en Equipo IA y el chat no dice nada. El dueño tiene que ir a
-- buscarlo, que es justo lo contrario de "me lo entrega".
--
-- Aquí el borrador vuelve al chat en cuanto llega, con el copy de cada canal,
-- lo que el creativo no pudo verificar, y la foto. El módulo Equipo IA pasa a
-- ser lo que debe ser: donde se mira el detalle si se quiere, no donde hay que
-- enterarse.
--
-- >>> NO APRUEBA NADA. <<< El mensaje dice dónde está el botón. La firma
-- sigue siendo del dueño.
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
  v_txt  text;
  v_par  record;
  v_av   text;
  v_foto text;
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

  SELECT count(*) + 1 INTO v_num FROM public.equipo_aprobaciones a
  WHERE a.trabajo_id = v_w.id;

  -- La versión anterior sale de la mesa: dos borradores del mismo trabajo
  -- esperando firma es una trampa, se aprueba el que esté más a mano.
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

  -- ── Y SE LO LLEVA AL CHAT ────────────────────────────────────────
  -- Se arma a mano y no con un volcado del jsonb: el dueño lo lee en el
  -- teléfono, y una llave abierta ahí no es información, es ruido.
  v_txt := '**Borrador listo** — ' || COALESCE(v_w.titulo, 'trabajo')
        || CASE WHEN v_num > 1 THEN ' (revisión ' || v_num || ')' ELSE '' END;

  IF COALESCE(NEW.payload ->> 'resumen', '') <> '' THEN
    v_txt := v_txt || E'\n' || (NEW.payload ->> 'resumen');
  END IF;

  FOR v_par IN
    SELECT key, value FROM jsonb_each_text(COALESCE(NEW.payload -> 'copy', '{}'::jsonb))
  LOOP
    v_txt := v_txt || E'\n\n**' || initcap(v_par.key) || ':** ' || v_par.value;
  END LOOP;

  SELECT string_agg('· ' || a, E'\n') INTO v_av
  FROM jsonb_array_elements_text(COALESCE(NEW.payload -> 'advertencias', '[]'::jsonb)) a;

  IF v_av IS NOT NULL THEN
    v_txt := v_txt || E'\n\n⚠️ Míralo antes de aprobar:' || E'\n' || v_av;
  END IF;

  -- La foto viaja como URL suelta dentro de la prosa del creativo ("usar tal
  -- cual la foto entregada: https://..."). Se pesca de ahí para que el chat
  -- pueda pintarla, en vez de exigirle que la ponga en un campo con nombre.
  v_foto := substring(NEW.payload::text from 'https?://[^"\s]+[.](?:png|jpe?g|webp)');
  IF v_foto IS NOT NULL THEN
    v_txt := v_txt || E'\n\n' || v_foto;
  END IF;

  v_txt := v_txt || E'\n\nNo se ha publicado nada. Apruébalo en Equipo IA → Esperando tu aprobación.';

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, context_epoch,
     estado, respondido, respondido_en, message_type)
  VALUES
    (v_w.tenant_id, 'hermes', v_txt, v_w.conversation_key,
     COALESCE(v_w.context_epoch, 1), 'respondido', true, now(), 'text');

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'aprobacion_nueva', 'trabajo_id', v_w.id,
    'tenant_id', v_w.tenant_id)::text);

  RETURN NULL;
END $fn$;

SELECT public.registrar_migracion('hermes_te_trae_el_resultado.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Se dispara de verdad contra producción con un borrador de mentira y se
-- deshace: lo que se comprueba es que el aviso llega al chat y que la
-- aprobación NO queda aprobada sola.
DO $p$
DECLARE
  v_ten uuid := '00000000-0000-0000-0000-000000000001';
  v_w   uuid;
  v_m   uuid;
  v_chat text;
  v_est  text;
BEGIN
  INSERT INTO public.equipo_trabajos (tenant_id, conversation_key, context_epoch,
    titulo, peticion, tipo, estado)
  VALUES (v_ten, 'agent:main:morla:tenant:' || v_ten, 1,
    'PRUEBA borrador', 'peticion de prueba', 'promocion', 'processing')
  RETURNING id INTO v_w;

  INSERT INTO public.equipo_mensajes (tenant_id, trabajo_id, conversation_key,
    context_epoch, correlation_id, profundidad, from_agent, to_agent,
    message_type, status, summary, payload, idempotency_key)
  VALUES (v_ten, v_w, 'agent:main:morla:tenant:' || v_ten, 1, v_w, 1,
    'comercial_creativo', 'hermes', 'draft_result', 'pending',
    'resumen de prueba',
    '{"resumen":"Resumen de prueba","copy":{"whatsapp":"Texto WA"},"requerimientos_visuales":["usar esta: https://x.co/a_1.png"],"advertencias":["Falta la foto"]}'::jsonb,
    'prueba:' || v_w::text)
  RETURNING id INTO v_m;

  SELECT left(c.texto, 130) INTO v_chat FROM public.hermes_chat c
  WHERE c.tenant_id = v_ten AND c.rol = 'hermes'
  ORDER BY c.id DESC LIMIT 1;

  SELECT a.estado INTO v_est FROM public.equipo_aprobaciones a WHERE a.trabajo_id = v_w;

  RAISE EXCEPTION 'PRUEBA: aprobacion=[%] (debe ser pending) | al chat llego=[%]',
    COALESCE(v_est, 'NO SE CREO'), COALESCE(replace(v_chat, chr(10), ' / '), 'NADA');
END $p$;
