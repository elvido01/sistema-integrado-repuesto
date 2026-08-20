-- =====================================================================
-- El boton de Sugerir tambien en WhatsApp
-- ---------------------------------------------------------------------
-- (2026-08-20) "Sugerir" salio ayer solo en la bandeja Omni, que es la de
-- TikTok, Instagram y Facebook. En WhatsApp no aparece — y WhatsApp es
-- donde se contesta casi todo.
--
-- El motivo es que WhatsApp no usa esa bandeja: se contesta en la caja de
-- WhatsApp Web, y la extension solo pega texto ahi. Para llevar el boton
-- faltaban dos cosas, que son las dos que estan aqui.
--
-- Idempotente. No toca dinero.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) DE UN TELEFONO A SU CONVERSACION
-- ------------------------------------------------------------
-- En WhatsApp Web lo unico que se sabe del chat abierto es el numero.
-- `hermes-sugerir` necesita el id de la conversacion espejada.
--
-- Se normaliza con crm_whatsapp_phone_key, la misma regla que usa el resto
-- del CRM, y se limita a WhatsApp: en las otras redes el telefono llego
-- prestado del cliente y emparejar por el cruzaria canales.
CREATE OR REPLACE FUNCTION public.sales_conversacion_de_whatsapp(p_telefono text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_tel    text;
  v_id     uuid;
BEGIN
  IF v_tenant IS NULL OR COALESCE(btrim(p_telefono), '') = '' THEN RETURN NULL; END IF;

  v_tel := public.crm_whatsapp_phone_key(p_telefono);
  IF COALESCE(v_tel, '') = '' THEN RETURN NULL; END IF;

  SELECT sc.id INTO v_id
  FROM public.sales_conversations sc
  WHERE sc.tenant_id = v_tenant
    AND sc.platform = 'whatsapp'
    AND public.crm_whatsapp_phone_key(sc.customer_phone) = v_tel
  ORDER BY sc.last_message_at DESC NULLS LAST
  LIMIT 1;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_conversacion_de_whatsapp(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_conversacion_de_whatsapp(text) TO authenticated;

-- ------------------------------------------------------------
-- 2) SABER QUE PASO CON LA SUGERENCIA, SIN VER EL ENVIO
-- ------------------------------------------------------------
-- En la bandeja Omni el envio pasa por la extension, que compara lo enviado
-- con lo sugerido y marca 'usada' o 'editada'. En WhatsApp NO: el mensaje
-- se manda desde WhatsApp Web y la extension no se entera.
--
-- Sin esto, en el canal principal el bucle de aprendizaje quedaria abierto:
-- Hermes propondria y nadie sabria nunca si acerto.
--
-- La respuesta llega igual por el espejo unos segundos despues. Cuando
-- entra, se compara con lo que se habia sugerido y se cierra sola.
CREATE OR REPLACE FUNCTION public._ia_cerrar_sugerencia_con_la_respuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id    uuid;
  v_bot   text;
BEGIN
  IF NEW.sender_type <> 'agent' OR COALESCE(btrim(NEW.message_text), '') = '' THEN
    RETURN NEW;
  END IF;

  -- La sugerencia viva de esta conversacion: ya redactada y sin resolver.
  -- Si la extension ya la marco (camino Omni), outcome no es NULL y aqui no
  -- se toca: lo que decidio quien estaba mirando manda sobre esta deduccion.
  SELECT t.id, t.bot_reply INTO v_id, v_bot
  FROM public.sales_ai_training_logs t
  WHERE t.conversation_id = NEW.conversation_id
    AND t.bot_reply IS NOT NULL
    AND t.outcome IS NULL
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.sales_ai_training_logs
     SET outcome = CASE
                     WHEN btrim(NEW.message_text) = btrim(v_bot) THEN 'usada'
                     ELSE 'editada'
                   END
   WHERE id = v_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ia_cerrar_sugerencia ON public.sales_messages;
CREATE TRIGGER trg_ia_cerrar_sugerencia
  AFTER INSERT ON public.sales_messages
  FOR EACH ROW EXECUTE FUNCTION public._ia_cerrar_sugerencia_con_la_respuesta();

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('sugerir_tambien_en_whatsapp.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='sales_conversacion_de_whatsapp')
       THEN 'OK  del telefono a la conversacion' ELSE '*** FALLO ***' END AS fn,
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ia_cerrar_sugerencia')
       THEN 'OK  la respuesta cierra la sugerencia sola' ELSE '*** FALLO ***' END AS trigger,
  (SELECT count(*) FROM public.sales_conversations
    WHERE platform='whatsapp' AND COALESCE(btrim(customer_phone),'') <> '')      AS whatsapp_localizables;
