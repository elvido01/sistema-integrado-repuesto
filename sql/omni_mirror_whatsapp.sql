-- =====================================================================
-- omni_mirror_whatsapp — espejo de WhatsApp Web → Sales Hub
-- ---------------------------------------------------------------------
-- La extensión (content script en web.whatsapp.com) lee la conversación
-- ABIERTA y la manda aquí para que quede en sales_conversations/
-- sales_messages. Así Hermes/el sistema "ve" tu WhatsApp real (incluidas
-- las conversaciones del teléfono, que se sincronizan a WhatsApp Web),
-- SIN depender de la API de Meta.
--
-- Seguridad: SECURITY DEFINER pero SIEMPRE escribe con get_user_tenant()
-- (nunca confía tenant del cliente). Dedup atómico:
--   * conversación por (tenant_id, platform, external_conversation_id)
--   * mensajes por (tenant_id, platform, external_message_id) = data-id de WA
-- Re-ejecutable / re-enviar el mismo chat NO duplica. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.omni_mirror_whatsapp(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_ext_conv   text := NULLIF(trim(p_payload->>'external_conversation_id'), '');
  v_phone      text := NULLIF(regexp_replace(COALESCE(p_payload->>'phone',''), '\D', '', 'g'), '');
  v_name       text := NULLIF(trim(p_payload->>'name'), '');
  v_conv_id    uuid;
  v_msg        jsonb;
  v_sender     text;
  v_ts         timestamptz;
  v_rowc       int;
  v_inserted   int := 0;
  v_last_ts        timestamptz := NULL;
  v_last_preview   text := NULL;
  v_last_user_ts   timestamptz := NULL;
  v_last_agent_ts  timestamptz := NULL;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_ext_conv IS NULL THEN RAISE EXCEPTION 'external_conversation_id requerido'; END IF;

  -- 1) Upsert de la conversación
  INSERT INTO public.sales_conversations (
    tenant_id, platform, external_conversation_id, customer_name, customer_phone,
    status, bot_enabled, metadata
  ) VALUES (
    v_tenant, 'whatsapp', v_ext_conv, COALESCE(v_name, v_phone, v_ext_conv), v_phone,
    'nuevo', false, jsonb_build_object('source', 'motoflow_omni_extension_mirror')
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id)
  DO UPDATE SET
    customer_name  = COALESCE(EXCLUDED.customer_name, sales_conversations.customer_name),
    customer_phone = COALESCE(EXCLUDED.customer_phone, sales_conversations.customer_phone),
    updated_at     = now()
  RETURNING id INTO v_conv_id;

  -- 2) Mensajes (dedup por external_message_id = data-id de WhatsApp)
  FOR v_msg IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'messages', '[]'::jsonb))
  LOOP
    CONTINUE WHEN NULLIF(trim(v_msg->>'external_message_id'), '') IS NULL;
    v_sender := CASE WHEN (v_msg->>'direction') = 'out' THEN 'agent' ELSE 'user' END;
    v_ts     := COALESCE(NULLIF(v_msg->>'ts','')::timestamptz, now());

    INSERT INTO public.sales_messages (
      tenant_id, conversation_id, platform, sender_type, message_type,
      message_text, media_url, external_message_id, status, raw_data, created_at
    ) VALUES (
      v_tenant, v_conv_id, 'whatsapp', v_sender,
      COALESCE(NULLIF(v_msg->>'message_type',''), 'text'),
      COALESCE(v_msg->>'text',''), NULLIF(v_msg->>'media_url',''),
      v_msg->>'external_message_id',
      CASE WHEN v_sender = 'agent' THEN 'sent' ELSE 'received' END,
      jsonb_build_object('source', 'mirror', 'pre', v_msg->>'pre'),
      v_ts
    )
    ON CONFLICT (tenant_id, platform, external_message_id) DO NOTHING;

    GET DIAGNOSTICS v_rowc = ROW_COUNT;
    IF v_rowc > 0 THEN v_inserted := v_inserted + 1; END IF;

    -- rastreo de "últimos" para el resumen de la conversación
    IF v_last_ts IS NULL OR v_ts >= v_last_ts THEN
      v_last_ts := v_ts;
      v_last_preview := left(COALESCE(NULLIF(v_msg->>'text',''),
        CASE WHEN COALESCE(v_msg->>'message_type','text') <> 'text'
             THEN '['||(v_msg->>'message_type')||']' ELSE '' END), 180);
    END IF;
    IF v_sender = 'user'  AND (v_last_user_ts  IS NULL OR v_ts >= v_last_user_ts)  THEN v_last_user_ts  := v_ts; END IF;
    IF v_sender = 'agent' AND (v_last_agent_ts IS NULL OR v_ts >= v_last_agent_ts) THEN v_last_agent_ts := v_ts; END IF;
  END LOOP;

  -- 3) Resumen de la conversación (GREATEST ignora NULLs)
  UPDATE public.sales_conversations SET
    last_message_at       = GREATEST(last_message_at, v_last_ts),
    last_user_message_at  = GREATEST(last_user_message_at, v_last_user_ts),
    last_agent_message_at = GREATEST(last_agent_message_at, v_last_agent_ts),
    last_message_preview  = COALESCE(v_last_preview, last_message_preview),
    updated_at            = now()
  WHERE id = v_conv_id;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id, 'inserted', v_inserted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('omni_mirror_whatsapp.sql');
  END IF;
END $$;

SELECT 'omni_mirror_whatsapp listo (espejo WhatsApp Web → Sales Hub)' AS status;
