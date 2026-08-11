-- =====================================================================
-- Un comentario no es un mensaje de texto
-- ---------------------------------------------------------------------
-- (2026-08-11) Primera prueba real de la entrada de comentarios. Llegaron
-- dos y el del cliente rebotó:
--
--   "Precio de la colita?"  — l_sandersarias
--   ✗ violates check constraint "sales_messages_message_type_check"
--
-- La tabla se creó con siete tipos —text, audio, image, video, document,
-- sticker, unknown— pensados para mensajes privados. Nadie había traído un
-- comentario público todavía.
--
-- >>> POR QUÉ NO SE GUARDA COMO 'text' <<<
-- Porque no se responde igual. Un privado lo lee una persona; un comentario
-- lo lee todo el que pase por esa publicación, tiene siete días de plazo y
-- admite UN solo mensaje privado de vuelta. Quien atiende necesita saber cuál
-- de los dos está mirando antes de escribir, y el agente necesita tratarlos
-- distinto. Guardarlos como 'text' sería perder justo el dato que importa.
--
-- 'unknown' tampoco sirve: es el cajón de lo que no se supo interpretar, y
-- esto se interpreta perfectamente.
--
-- >>> Y SE RECUPERA LO QUE REBOTÓ <<<
-- El comentario del cliente no se perdió: el webhook guarda el evento crudo
-- antes de intentar procesarlo, así que está entero en meta_webhook_events.
-- Meta no lo va a reenviar —ya recibió su 200— pero se puede reprocesar desde
-- ahí. Es exactamente para esto que se guarda el crudo primero.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.sales_messages
  DROP CONSTRAINT IF EXISTS sales_messages_message_type_check;

ALTER TABLE public.sales_messages
  ADD CONSTRAINT sales_messages_message_type_check
  CHECK (message_type IN (
    'text', 'audio', 'image', 'video', 'document', 'sticker', 'unknown',
    -- Público, en una publicación. Los de abajo aún no se reciben, pero
    -- entran por el mismo webhook y con la misma forma: dejarlos declarados
    -- ahorra que el primero que llegue rebote como rebotó este.
    'comment',
    'mention',        -- alguien etiqueta a la tienda
    'live_comment'    -- comentario durante una transmisión
  ));

-- ------------------------------------------------------------
-- RECUPERAR LOS COMENTARIOS QUE REBOTARON
-- ------------------------------------------------------------
-- Se reconstruyen desde el evento crudo, con las mismas reglas que aplica el
-- webhook: se saltan los propios, los vacíos, y la conversación es la misma
-- que la de los mensajes privados de esa persona.
DO $$
DECLARE
  e         record;
  v_conv    uuid;
  v_from    text;
  v_texto   text;
  v_comid   text;
  v_cuenta  record;
  v_n       int := 0;
BEGIN
  FOR e IN
    SELECT * FROM public.meta_webhook_events
    WHERE event_type = 'comment' AND status = 'error'
    ORDER BY received_at
  LOOP
    v_from  := e.payload -> 'from' ->> 'id';
    v_texto := btrim(COALESCE(e.payload ->> 'text', ''));
    v_comid := e.payload ->> 'id';

    CONTINUE WHEN v_from IS NULL OR v_from = e.entry_id OR v_texto = '';

    SELECT tenant_id, id AS channel_id, external_account_id
    INTO v_cuenta
    FROM public.sales_channels
    WHERE external_account_id = e.entry_id
    LIMIT 1;

    CONTINUE WHEN v_cuenta.tenant_id IS NULL;

    INSERT INTO public.sales_conversations (
      tenant_id, channel_id, platform, external_conversation_id,
      customer_name, customer_external_id, status, bot_enabled,
      last_message_preview, metadata
    ) VALUES (
      v_cuenta.tenant_id, v_cuenta.channel_id, e.platform,
      e.platform || ':' || v_cuenta.external_account_id || ':' || v_from,
      COALESCE(e.payload -> 'from' ->> 'username', v_from), v_from,
      'nuevo', false, left('💬 ' || v_texto, 180),
      jsonb_build_object('source', 'recuperado_de_evento_crudo')
    )
    ON CONFLICT (tenant_id, platform, external_conversation_id)
    DO UPDATE SET last_message_preview = EXCLUDED.last_message_preview
    RETURNING id INTO v_conv;

    INSERT INTO public.sales_messages (
      tenant_id, conversation_id, platform, sender_type, message_type,
      message_text, external_message_id, status, raw_data, created_at
    ) VALUES (
      v_cuenta.tenant_id, v_conv, e.platform, 'user', 'comment',
      v_texto, v_comid, 'received', e.payload, e.received_at
    )
    ON CONFLICT (tenant_id, platform, external_message_id) DO NOTHING;

    UPDATE public.meta_webhook_events
    SET status = 'processed', error_message = 'reprocesado tras ampliar el CHECK'
    WHERE id = e.id;

    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'Comentarios recuperados: %', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('social_comentarios_tipo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Debe aparecer "Precio de la colita?" de l_sandersarias:
SELECT m.created_at, c.customer_name, m.message_type, m.message_text
FROM public.sales_messages m
JOIN public.sales_conversations c ON c.id = m.conversation_id
WHERE m.message_type = 'comment'
ORDER BY m.created_at DESC LIMIT 10;

-- Y que no quede ningún comentario en error:
SELECT status, COUNT(*) FROM public.meta_webhook_events
WHERE event_type = 'comment' GROUP BY status;
