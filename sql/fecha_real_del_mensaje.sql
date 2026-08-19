-- =====================================================================
-- La conversación se ordena por CUÁNDO SE ESCRIBIÓ, no por cuándo se copió
-- ---------------------------------------------------------------------
-- (2026-08-19) Salió probando el espejo de TikTok, pero el fallo no es de
-- TikTok: estaba en el disparador que comparten los tres canales.
--
-- >>> LO QUE PASABA <<<
-- sales_touch_conversation usaba NEW.created_at, que es el momento en que
-- la fila ENTRÓ A LA BASE. Para un mensaje que llega por webhook eso está
-- bien, porque llega uno a uno. Para un espejo NO: la extensión copia el
-- hilo entero de un golpe, así que los diez mensajes quedan con la misma
-- marca de tiempo, al microsegundo.
--
-- Y de ahí salen dos cosas mal:
--
--   1. La barra deja de avisar. El contador de la extensión compara
--      last_user_message_at contra last_agent_message_at para saber si el
--      cliente está esperando respuesta. Si las dos son iguales, un hilo
--      donde el cliente escribió de último se ve como ya contestado. Es
--      exactamente el fallo del "9" de Instagram que el dueño reportó el
--      17/08, reapareciendo por otra puerta.
--
--   2. Subir a leer mensajes viejos reescribía la vista previa. Al espejar
--      historia antigua, el último mensaje del hilo pasaba a ser el más
--      viejo, y la lista de conversaciones se llenaba de textos de hace
--      meses.
--
-- >>> LO QUE HACE AHORA <<<
-- Usa la fecha que trae el mensaje (raw_data->>'ts', que es lo que pone el
-- espejo) y cae en created_at cuando no hay ninguna. Y las fechas del hilo
-- solo AVANZAN: leer historia vieja ya no mueve nada hacia atrás.
--
-- >>> POR QUE NO ROMPE LO QUE YA HAY <<<
-- Se comprobó antes de escribirlo: de los 2.447 mensajes que hay en
-- producción, CERO tienen raw_data->>'ts'. WhatsApp guarda {"channel":...}
-- y el webhook de Instagram guarda el objeto de Meta. O sea que para todo
-- lo existente el camino es el de siempre, created_at, byte por byte igual.
-- Y si algún día llega un ts que no es una fecha, se ignora en vez de
-- reventar el guardado del mensaje.
--
-- Idempotente / re-ejecutable. No toca dinero.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sales_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_cuando timestamptz;
BEGIN
  -- La fecha que trae el mensaje. Si no es una fecha, se ignora: perder el
  -- orden es un fastidio, perder el mensaje es un cliente sin contestar.
  BEGIN
    v_cuando := NULLIF(btrim(NEW.raw_data ->> 'ts'), '')::timestamptz;
  EXCEPTION WHEN others THEN
    v_cuando := NULL;
  END;
  -- Nunca del futuro: un reloj mal puesto en la PC del vendedor dejaría el
  -- hilo clavado arriba de la lista para siempre.
  v_cuando := LEAST(COALESCE(v_cuando, NEW.created_at), now());

  UPDATE public.sales_conversations
  SET last_message_at = GREATEST(COALESCE(last_message_at, v_cuando), v_cuando),
      last_user_message_at = CASE WHEN NEW.sender_type = 'user'
             THEN GREATEST(COALESCE(last_user_message_at, v_cuando), v_cuando)
             ELSE last_user_message_at END,
      last_agent_message_at = CASE WHEN NEW.sender_type IN ('assistant', 'agent')
             THEN GREATEST(COALESCE(last_agent_message_at, v_cuando), v_cuando)
             ELSE last_agent_message_at END,
      -- La vista previa es la del mensaje más nuevo, no la del último que
      -- se copió.
      last_message_preview = CASE WHEN v_cuando >= COALESCE(last_message_at, v_cuando)
             THEN LEFT(COALESCE(NEW.message_text, NEW.message_type), 180)
             ELSE last_message_preview END,
      intent = COALESCE(intent, CASE WHEN NEW.sender_type = 'user'
             THEN public.sales_detect_basic_intent(NEW.message_text) ELSE intent END),
      -- Solo desde 'nuevo': si alguien la marco 'seguimiento' o 'cotizando' a
      -- mano, contestar no le pisa la decision.
      status = CASE
                 WHEN NEW.sender_type IN ('assistant', 'agent') AND status = 'nuevo'
                 THEN 'en_atencion'
                 ELSE status
               END,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

SELECT public.registrar_migracion('fecha_real_del_mensaje.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN position('raw_data' in (
         SELECT pg_get_functiondef(p.oid) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='sales_touch_conversation')) > 0
       THEN 'OK  usa la fecha del mensaje' ELSE '*** FALLO ***' END AS fecha,
  CASE WHEN position('GREATEST' in (
         SELECT pg_get_functiondef(p.oid) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='sales_touch_conversation')) > 0
       THEN 'OK  las fechas solo avanzan' ELSE '*** FALLO ***' END AS sin_retroceso,
  -- Que ningun mensaje de los que ya estan use el camino nuevo.
  (SELECT count(*) FROM public.sales_messages WHERE raw_data ? 'ts') AS mensajes_afectados_hoy;
