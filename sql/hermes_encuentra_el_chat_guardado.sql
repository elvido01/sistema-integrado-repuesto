-- =====================================================================
-- Hermes tiene que encontrar el chat aunque el contacto este guardado
-- ---------------------------------------------------------------------
-- (2026-08-20) Se probo el boton Sugerir en un chat de WhatsApp y no paso
-- nada. El chat se llamaba "Enrique Ismael Tvs 100 Santo DOMINGO".
--
-- El boton buscaba la conversacion POR TELEFONO, y en un contacto guardado
-- no hay telefono a la vista: el titulo es un nombre. Los unicos digitos de
-- ese titulo son "100", que no es un numero de nadie. Sin telefono, el
-- boton se paraba con "Abre el chat del cliente" — con el chat abierto
-- delante.
--
-- El espejo nunca tuvo ese problema porque no identifica por telefono sino
-- por `external_conversation_id`, que vale `whatsapp:<numero>` cuando hay
-- numero y `whatsapp:name:<slug>` cuando no. Esa es la llave buena, y es la
-- que se usa aqui.
--
-- El telefono se queda de respaldo: sirve cuando quien pregunta lo tiene
-- pero no sabe como se llamo la conversacion al espejarse.
--
-- Idempotente. No toca dinero.
-- =====================================================================

-- Cambia la firma (antes solo recibia el telefono), asi que se tira la
-- vieja: dejar las dos crea una llamada ambigua con un solo argumento.
DROP FUNCTION IF EXISTS public.sales_conversacion_de_whatsapp(text);

CREATE OR REPLACE FUNCTION public.sales_conversacion_de_whatsapp(
  p_telefono    text DEFAULT NULL,
  p_external_id text DEFAULT NULL
) RETURNS uuid
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
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- 1) La llave del espejo. Es exacta: no depende de que el titulo del chat
  --    tenga numero ni de como se escriba el nombre hoy.
  IF COALESCE(btrim(p_external_id), '') <> '' THEN
    SELECT sc.id INTO v_id
    FROM public.sales_conversations sc
    WHERE sc.tenant_id = v_tenant
      AND sc.platform = 'whatsapp'
      AND sc.external_conversation_id = btrim(p_external_id)
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- 2) Respaldo por telefono, normalizado igual que el resto del CRM.
  --    Solo WhatsApp: en las otras redes el numero llego prestado del
  --    cliente y emparejar por el cruzaria canales.
  IF COALESCE(btrim(p_telefono), '') <> '' THEN
    v_tel := public.crm_whatsapp_phone_key(p_telefono);
    IF COALESCE(v_tel, '') <> '' THEN
      SELECT sc.id INTO v_id
      FROM public.sales_conversations sc
      WHERE sc.tenant_id = v_tenant
        AND sc.platform = 'whatsapp'
        AND public.crm_whatsapp_phone_key(sc.customer_phone) = v_tel
      ORDER BY sc.last_message_at DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  -- 3) Ultimo respaldo: por nombre del chat. Cubre el caso inverso — que el
  --    espejo guardara la conversacion como `whatsapp:<numero>` porque en
  --    ese momento tenia el JID a mano, y ahora se pregunte solo con el
  --    nombre porque el JID ya no esta fresco. Las dos llaves no cruzarian y
  --    el chat volveria a parecer inexistente teniendolo delante.
  IF v_id IS NULL AND p_external_id LIKE 'whatsapp:name:%' THEN
    SELECT sc.id INTO v_id
    FROM public.sales_conversations sc
    WHERE sc.tenant_id = v_tenant
      AND sc.platform = 'whatsapp'
      AND sc.external_conversation_id LIKE 'whatsapp:%'
      AND 'whatsapp:name:' || regexp_replace(
            lower(public._sin_tildes(COALESCE(sc.customer_name, ''))),
            '[^a-z0-9]+', '-', 'g') = btrim(p_external_id)
    ORDER BY sc.last_message_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_conversacion_de_whatsapp(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_conversacion_de_whatsapp(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_encuentra_el_chat_guardado.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Cuantas conversaciones de WhatsApp se identifican por nombre (contacto
-- guardado) y no por numero: son EXACTAMENTE las que el boton no encontraba.
SELECT
  count(*) FILTER (WHERE external_conversation_id LIKE 'whatsapp:name:%') AS por_nombre_antes_invisibles,
  count(*) FILTER (WHERE external_conversation_id LIKE 'whatsapp:1%'
                      OR external_conversation_id ~ '^whatsapp:[0-9]')    AS por_numero,
  count(*)                                                                AS total_whatsapp
FROM public.sales_conversations
WHERE platform = 'whatsapp';
