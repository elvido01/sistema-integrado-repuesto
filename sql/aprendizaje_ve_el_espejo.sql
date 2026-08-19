-- =====================================================================
-- El aprendizaje deja de estar ciego: ahora ve lo que entra por el espejo
-- ---------------------------------------------------------------------
-- (2026-08-19) `sales_ai_training_logs` es donde se juntan la pregunta del
-- cliente y lo que el vendedor contesto de verdad. Ese par es TODO el
-- material con el que Hermes aprende a vender.
--
-- La ultima fila era del 9 de agosto. Diez dias sin recoger nada, mientras
-- se contestaban cientos de mensajes.
--
-- >>> POR QUE <<<
-- Las filas las creaban los WEBHOOKS (meta-messages-webhook y
-- sales_sync_whatsapp_message). Pero los mensajes ya casi no llegan por
-- ahi: llegan por el ESPEJO de la extension, que inserta en sales_messages
-- y no toca la tabla de entrenamiento. Contado el 19/08:
--
--     agosto   tiktok    espejo    656 mensajes de cliente
--     agosto   whatsapp  espejo    339
--     julio    whatsapp  espejo    635
--     agosto   instagram webhook     6   <-- lo unico que se recogia
--
-- O sea que se estaba aprendiendo del 0.6% del trafico. Y el trigger que
-- captura la respuesta del vendedor solo hace UPDATE de una fila que ya
-- exista: sin fila, cada contestacion que se daba por TikTok o WhatsApp se
-- tiraba a la basura.
--
-- >>> QUE SE HACE <<<
-- La fila la crea un TRIGGER sobre sales_messages, no cada webhook por su
-- cuenta. Asi cualquier canal que entre mañana queda recogido sin que nadie
-- se acuerde de añadirlo.
--
-- Solo dispara para los mensajes del espejo (raw_data.source = 'mirror').
-- Los del webhook siguen creando su fila como hasta ahora — con su
-- detected_intent, que aqui no se puede calcular — y asi no se duplica
-- ninguno ni hay que redesplegar el webhook de Instagram, que esta vivo.
--
-- Idempotente. No toca dinero ni borra nada.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) QUE NO SE PUEDAN DUPLICAR
-- ------------------------------------------------------------
-- Sin esto, un reintento del espejo o una carrera entre trigger y webhook
-- mete el mismo mensaje dos veces y el par cuenta doble al entrenar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_ai_training_logs_mensaje
  ON public.sales_ai_training_logs (tenant_id, message_id)
  WHERE message_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) LA PREGUNTA DEL CLIENTE SE RECOGE SOLA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ia_captura_pregunta_espejo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Solo preguntas de clientes que llegan por el espejo. Lo que trae un
  -- webhook ya crea su fila (y con intencion detectada, que aqui no hay).
  IF NEW.sender_type <> 'user'
     OR COALESCE(NEW.raw_data ->> 'source', '') <> 'mirror' THEN
    RETURN NEW;
  END IF;

  -- Los mismos dos filtros que usa la captura de la respuesta, para que la
  -- basura no entre por un lado si se limpia por el otro: adjuntos sin
  -- contenido, el saludo del bot, los "ok" sueltos; y los contactos que el
  -- dueño excluyo a mano.
  IF NOT public._ia_sirve_de_ejemplo(NEW.message_text)
     OR public._ia_conversacion_excluida(NEW.conversation_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_ai_training_logs (
    tenant_id, conversation_id, message_id, platform, customer_message, metadata, created_at
  ) VALUES (
    NEW.tenant_id, NEW.conversation_id, NEW.id, NEW.platform, NEW.message_text,
    jsonb_build_object('source', 'trigger_espejo'),
    COALESCE(NEW.enviado_en, NEW.created_at, now())
  )
  ON CONFLICT (tenant_id, message_id) WHERE message_id IS NOT NULL DO NOTHING;

  RETURN NEW;
-- Recoger material para entrenar NUNCA puede tumbar la entrada de un
-- mensaje: si esto falla, el mensaje entra igual y se pierde el ejemplo.
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ia_captura_pregunta ON public.sales_messages;
CREATE TRIGGER trg_ia_captura_pregunta
  AFTER INSERT ON public.sales_messages
  FOR EACH ROW EXECUTE FUNCTION public._ia_captura_pregunta_espejo();

-- ------------------------------------------------------------
-- 3) LO QUE YA PASO: SE RECUPERA
-- ------------------------------------------------------------
-- Hay meses de conversaciones ya espejadas con sus respuestas dentro. Sin
-- esto, Hermes arrancaria con 206 ejemplos de WhatsApp y CERO de TikTok,
-- que es justo donde esta el volumen.
--
-- La respuesta de cada pregunta son los mensajes del vendedor que van
-- DESPUES de ella y ANTES de la siguiente pregunta — la misma regla que usa
-- el trigger de captura, escrita de otra forma porque aqui se mira en bloque.
WITH preguntas AS (
  SELECT m.id, m.tenant_id, m.conversation_id, m.platform, m.message_text,
         COALESCE(m.enviado_en, m.created_at) AS cuando,
         LEAD(COALESCE(m.enviado_en, m.created_at))
           OVER (PARTITION BY m.conversation_id ORDER BY COALESCE(m.enviado_en, m.created_at)) AS siguiente
  FROM public.sales_messages m
  WHERE m.sender_type = 'user'
    AND COALESCE(m.raw_data ->> 'source', '') = 'mirror'
    AND public._ia_sirve_de_ejemplo(m.message_text)
    AND NOT public._ia_conversacion_excluida(m.conversation_id)
)
INSERT INTO public.sales_ai_training_logs (
  tenant_id, conversation_id, message_id, platform, customer_message, human_reply, metadata, created_at
)
SELECT p.tenant_id, p.conversation_id, p.id, p.platform, p.message_text,
       r.respuesta,
       jsonb_build_object('source', 'backfill_espejo', 'recuperado_en', now()),
       p.cuando
FROM preguntas p
LEFT JOIN LATERAL (
  SELECT string_agg(a.message_text, E'\n' ORDER BY COALESCE(a.enviado_en, a.created_at)) AS respuesta
  FROM public.sales_messages a
  WHERE a.conversation_id = p.conversation_id
    AND a.sender_type = 'agent'
    AND COALESCE(a.enviado_en, a.created_at) > p.cuando
    AND (p.siguiente IS NULL OR COALESCE(a.enviado_en, a.created_at) < p.siguiente)
    AND public._ia_sirve_de_ejemplo(a.message_text)
) r ON true
ON CONFLICT (tenant_id, message_id) WHERE message_id IS NOT NULL DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('aprendizaje_ve_el_espejo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT platform,
       count(*)                                        AS ejemplos,
       count(*) FILTER (WHERE human_reply IS NOT NULL) AS con_respuesta_del_vendedor,
       count(*) FILTER (WHERE bot_reply   IS NOT NULL) AS con_sugerencia_de_hermes
FROM public.sales_ai_training_logs
GROUP BY platform
ORDER BY 2 DESC;
