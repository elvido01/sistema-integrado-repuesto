-- =====================================================================
-- Que Hermes aprenda de lo que de verdad contestan los vendedores
-- ---------------------------------------------------------------------
-- (2026-08-07) "quiero ir respondiéndole a los clientes manualmente para que
-- Hermes pueda ir aprendiendo y en un futuro sea él quien hable con los
-- clientes."
--
-- >>> LO QUE FALTABA <<<
-- sales_ai_training_logs tiene 615 filas y la columna human_reply está VACÍA
-- en todas. Se venía guardando la pregunta del cliente y el intent, pero
-- nunca la respuesta. Y una pregunta sin respuesta no enseña nada: es
-- exactamente la mitad que no sirve.
--
-- Mientras tanto hay 424 respuestas de vendedores de carne y hueso guardadas
-- en sales_messages, sin usar. Meses de "no, de esa no tengo", "esa te sirve
-- para la AX100 también", "pásate mañana que llega". Eso es el material.
--
-- >>> LO QUE HACE ESTE ARCHIVO <<<
--   1. Un disparador que, cada vez que un vendedor responde, pega esa
--      respuesta en la pregunta que la provocó. De aquí en adelante, cada
--      conversación real deja su par pregunta→respuesta.
--   2. Rellena hacia atrás las 615 que ya estaban.
--   3. Apaga el saludo automático del bot en Meta.
--
-- >>> QUÉ ES "LA RESPUESTA" <<<
-- Todo lo que el vendedor escribió entre esa pregunta y la siguiente
-- pregunta del cliente, unido. Si contestó en tres mensajes seguidos, los
-- tres son una sola respuesta — que es como habla la gente.
--
-- >>> POR QUÉ SE APAGA EL BOT <<<
-- No por el permiso de Instagram. Por decisión: mientras Hermes aprende, al
-- cliente le contesta una persona. Un "Gracias por escribirnos" automático
-- delante de cada conversación ensucia justo los datos que se quieren
-- recoger, y encima le avisa al cliente que no hay nadie del otro lado.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) CAPTURAR LA RESPUESTA, DE AQUÍ EN ADELANTE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ia_captura_respuesta_humana()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Solo respuestas de personas. El bot no se enseña a sí mismo: si se
  -- guardara su propio saludo como ejemplo, Hermes aprendería a saludar y
  -- nada más.
  IF NEW.sender_type <> 'agent' OR COALESCE(btrim(NEW.message_text), '') = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.sales_ai_training_logs t
  SET human_reply = btrim(COALESCE(t.human_reply || E'\n', '') || NEW.message_text),
      metadata    = COALESCE(t.metadata, '{}'::jsonb)
                    || jsonb_build_object('respondido_en', now(), 'via', 'trigger')
  WHERE t.id = (
    -- La pregunta que provocó esta respuesta: la última del cliente en esta
    -- misma conversación antes de este mensaje.
    SELECT t2.id
    FROM public.sales_ai_training_logs t2
    JOIN public.sales_messages cm ON cm.id = t2.message_id
    WHERE t2.conversation_id = NEW.conversation_id
      AND cm.created_at < NEW.created_at
    ORDER BY cm.created_at DESC
    LIMIT 1
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Guardar el mensaje del vendedor SIEMPRE gana. Que falle el aprendizaje
  -- es un problema; que se pierda una respuesta a un cliente, otro.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ia_captura_respuesta ON public.sales_messages;
CREATE TRIGGER trg_ia_captura_respuesta
AFTER INSERT ON public.sales_messages
FOR EACH ROW EXECUTE FUNCTION public._ia_captura_respuesta_humana();

-- ------------------------------------------------------------
-- 2) RELLENAR LO QUE YA ESTABA
-- ------------------------------------------------------------
-- Primero, las preguntas de clientes que ni siquiera tenían fila de
-- entrenamiento (el espejo de WhatsApp guardó el mensaje pero no el log).
INSERT INTO public.sales_ai_training_logs (
  tenant_id, conversation_id, message_id, platform, customer_message, metadata
)
SELECT m.tenant_id, m.conversation_id, m.id, m.platform,
       left(COALESCE(m.message_text, ''), 2000),
       jsonb_build_object('origen', 'backfill_historico')
FROM public.sales_messages m
WHERE m.sender_type = 'user'
  AND COALESCE(btrim(m.message_text), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.sales_ai_training_logs t WHERE t.message_id = m.id
  );

-- Y ahora la respuesta de cada una.
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.sales_ai_training_logs t
  SET human_reply = r.respuesta,
      customer_message = COALESCE(t.customer_message, r.pregunta),
      metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('via', 'backfill')
  FROM (
    SELECT t2.id,
           left(COALESCE(cm.message_text, ''), 2000) AS pregunta,
           (
             SELECT string_agg(a.message_text, E'\n' ORDER BY a.created_at)
             FROM public.sales_messages a
             WHERE a.conversation_id = t2.conversation_id
               AND a.sender_type = 'agent'
               AND COALESCE(btrim(a.message_text), '') <> ''
               AND a.created_at > cm.created_at
               -- se corta en la siguiente pregunta del cliente: lo de después
               -- ya contesta a otra cosa
               AND a.created_at < COALESCE((
                     SELECT MIN(u.created_at)
                     FROM public.sales_messages u
                     WHERE u.conversation_id = t2.conversation_id
                       AND u.sender_type = 'user'
                       AND u.created_at > cm.created_at
                   ), 'infinity'::timestamptz)
           ) AS respuesta
    FROM public.sales_ai_training_logs t2
    JOIN public.sales_messages cm ON cm.id = t2.message_id
    WHERE t2.human_reply IS NULL
  ) r
  WHERE t.id = r.id
    AND COALESCE(btrim(r.respuesta), '') <> '';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Pares pregunta→respuesta recuperados del histórico: %', v_n;
END $$;

-- ------------------------------------------------------------
-- 3) APAGAR EL SALUDO AUTOMÁTICO
-- ------------------------------------------------------------
UPDATE public.sales_channels
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('auto_reply', false)
WHERE platform IN ('instagram', 'facebook');

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('ia_aprende_de_las_respuestas_humanas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) CUÁNTO MATERIAL DE ENTRENAMIENTO HAY YA
SELECT platform,
       COUNT(*)                                    AS preguntas,
       COUNT(*) FILTER (WHERE human_reply IS NOT NULL) AS con_respuesta,
       round(100.0 * COUNT(*) FILTER (WHERE human_reply IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct
FROM public.sales_ai_training_logs
GROUP BY platform
ORDER BY preguntas DESC;
-- Antes: 615 preguntas, 0 respuestas. Ahora deberían salir cientos de pares.

-- 2) MIRAR UNOS CUANTOS PARES, QUE ES LO QUE VA A LEER HERMES
SELECT detected_intent,
       left(customer_message, 70) AS pregunta,
       left(human_reply, 90)      AS respondio_el_vendedor
FROM public.sales_ai_training_logs
WHERE human_reply IS NOT NULL
ORDER BY created_at DESC
LIMIT 15;

-- 3) EL BOT, CALLADO
SELECT platform, account_name, metadata ->> 'auto_reply' AS auto_reply
FROM public.sales_channels
WHERE platform IN ('instagram', 'facebook');
-- esperado: false en los dos.
