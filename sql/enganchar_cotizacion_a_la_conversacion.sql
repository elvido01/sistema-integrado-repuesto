-- =====================================================================
-- La cotizacion se engancha a la conversacion aunque se cotice desde el chat
-- ---------------------------------------------------------------------
-- (2026-08-20) Ayer se decidio que el canal de una venta sale de la
-- cotizacion: cotizacion -> sales_conversations.cotizacion_id -> platform.
-- Al medirlo hoy, el enlace no existia casi nunca:
--
--     27 cotizaciones en 60 dias  ->  0 enganchadas
--
-- El motivo esta en la extension: solo enganchaba cuando la cotizacion se
-- empezaba desde la BANDEJA Omni (`omniQuoteConversation`). Cotizando desde
-- un chat de WhatsApp Web — el camino normal, el que se usa todo el dia — la
-- cotizacion nacia suelta. La conversacion SI existe (el espejo mete 339
-- mensajes de WhatsApp al mes), simplemente nadie la buscaba.
--
-- >>> POR QUE UN RPC Y NO ARREGLARLO SOLO EN LA EXTENSION <<<
-- Porque emparejar por telefono no es comparar dos textos: hay que
-- normalizar el numero igual que lo normaliza el resto del CRM. Esa regla ya
-- vive en `crm_whatsapp_phone_key` y tiene que seguir viviendo en un solo
-- sitio. Ademas asi lo puede usar cualquier otro camino que cree
-- cotizaciones — el agente, por ejemplo — sin repetir la logica.
--
-- Idempotente. No toca dinero.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sales_enganchar_cotizacion(
  p_cotizacion_id   uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_telefono        text DEFAULT NULL,
  p_platform        text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_conv   uuid;
  v_tel    text;
  v_como   text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  IF p_cotizacion_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Falta la cotizacion');
  END IF;

  -- La cotizacion tiene que ser de esta empresa. Sin esto se podria colgar
  -- una cotizacion ajena de una conversacion propia.
  IF NOT EXISTS (SELECT 1 FROM public.cotizaciones
                  WHERE id = p_cotizacion_id AND tenant_id = v_tenant) THEN
    RETURN json_build_object('ok', false, 'motivo', 'La cotizacion no es de esta empresa');
  END IF;

  -- 1) Si quien llama ya sabe cual es la conversacion, esa manda.
  IF p_conversation_id IS NOT NULL THEN
    SELECT id INTO v_conv FROM public.sales_conversations
    WHERE id = p_conversation_id AND tenant_id = v_tenant;
    v_como := 'id';
  END IF;

  -- 2) Si no, por telefono. Es el caso de cotizar desde un chat de WhatsApp
  --    Web: hay numero pero nadie sabe el id de la conversacion espejada.
  IF v_conv IS NULL AND COALESCE(btrim(p_telefono), '') <> '' THEN
    v_tel := public.crm_whatsapp_phone_key(p_telefono);
    IF COALESCE(v_tel, '') <> '' THEN
      SELECT sc.id INTO v_conv
      FROM public.sales_conversations sc
      WHERE sc.tenant_id = v_tenant
        AND public.crm_whatsapp_phone_key(sc.customer_phone) = v_tel
        AND (p_platform IS NULL OR sc.platform = p_platform)
      -- La mas reciente: si el mismo numero escribio por dos canales, la
      -- venta viene de la conversacion viva, no de la de hace meses.
      ORDER BY sc.last_message_at DESC NULLS LAST
      LIMIT 1;
      v_como := 'telefono';
    END IF;
  END IF;

  IF v_conv IS NULL THEN
    -- No es un error: un cliente del mostrador no tiene conversacion, y esa
    -- venta es de la tienda con todas las de la ley.
    RETURN json_build_object('ok', false, 'motivo', 'Sin conversacion que enganchar');
  END IF;

  UPDATE public.sales_conversations
     SET cotizacion_id = p_cotizacion_id,
         updated_at    = now()
   WHERE id = v_conv AND tenant_id = v_tenant;

  RETURN json_build_object('ok', true, 'conversacion', v_conv, 'como', v_como);
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_enganchar_cotizacion(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_enganchar_cotizacion(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('enganchar_cotizacion_a_la_conversacion.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='sales_enganchar_cotizacion')
       THEN 'OK  se puede enganchar por telefono' ELSE '*** FALLO ***' END AS fn,
  (SELECT count(*) FROM public.sales_conversations WHERE cotizacion_id IS NOT NULL) AS enganchadas_hoy,
  (SELECT count(*) FROM public.sales_conversations
    WHERE platform='whatsapp' AND COALESCE(btrim(customer_phone),'') <> '')        AS whatsapp_con_telefono;
