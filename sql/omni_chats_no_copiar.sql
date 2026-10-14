-- =====================================================================
-- OMNI: CHATS DE WHATSAPP QUE NO SE COPIAN (personales)
-- =====================================================================
-- (14/10/2026) El número de WhatsApp de Repuestos Morla es también el
-- personal del dueño. El espejo copiaba todo chat abierto (p. ej. "Papi
-- Caminero 1"). Ahora el dueño marca "No copiar este chat" en la extensión:
--   · omni_chats_excluidos: la lista, por empresa. La clave es la misma que
--     usa el espejo (whatsapp:<teléfono> o whatsapp:name:<nombre>).
--   · omni_excluir_chat(claves, nombre, borrar): agrega el chat y, si se
--     pide, BORRA lo ya copiado (conversación + mensajes; lo demás cae en
--     cascada o se desvincula).
--   · omni_quitar_exclusion(clave): deshacer.
--   · omni_mirror_whatsapp: rechaza en el SERVIDOR los chats excluidos,
--     aunque una extensión vieja los mande. (Parte de la versión de prod.)
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.omni_chats_excluidos (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL DEFAULT public.get_user_tenant(),
  clave      text NOT NULL,
  nombre     text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, clave)
);
ALTER TABLE public.omni_chats_excluidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omni_chats_excluidos_tenant ON public.omni_chats_excluidos;
CREATE POLICY omni_chats_excluidos_tenant ON public.omni_chats_excluidos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
REVOKE ALL ON public.omni_chats_excluidos FROM anon;

CREATE OR REPLACE FUNCTION public.omni_excluir_chat(p_claves text[], p_nombre text, p_borrar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_claves text[];
  v_borradas int := 0;
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Sin sesión.'; END IF;
  SELECT array_agg(DISTINCT c) INTO v_claves
    FROM unnest(p_claves) c WHERE c ~ '^whatsapp:' AND length(c) BETWEEN 10 AND 120;
  IF v_claves IS NULL THEN RAISE EXCEPTION 'No se reconoció el chat.'; END IF;

  INSERT INTO public.omni_chats_excluidos (tenant_id, clave, nombre)
  SELECT v_tenant, c, left(p_nombre, 120) FROM unnest(v_claves) c
  ON CONFLICT (tenant_id, clave) DO NOTHING;

  IF p_borrar THEN
    DELETE FROM public.sales_conversations
     WHERE tenant_id = v_tenant AND platform = 'whatsapp' AND external_conversation_id = ANY (v_claves);
    GET DIAGNOSTICS v_borradas = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'claves', v_claves, 'conversaciones_borradas', v_borradas);
END
$fn$;

CREATE OR REPLACE FUNCTION public.omni_quitar_exclusion(p_clave text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  DELETE FROM public.omni_chats_excluidos WHERE tenant_id = public.get_user_tenant() AND clave = p_clave;
$fn$;

CREATE OR REPLACE FUNCTION public.omni_mirror_whatsapp(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_fotos      int := 0;
  v_last_ts        timestamptz := NULL;
  v_last_preview   text := NULL;
  v_last_user_ts   timestamptz := NULL;
  v_last_agent_ts  timestamptz := NULL;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_ext_conv IS NULL THEN RAISE EXCEPTION 'external_conversation_id requerido'; END IF;

  -- (14/10/2026) Chats que el dueño marcó "No copiar" (personales): no entran.
  IF EXISTS (SELECT 1 FROM public.omni_chats_excluidos x
              WHERE x.tenant_id = v_tenant
                AND x.clave IN (v_ext_conv, NULLIF(trim(p_payload->>'name_key'), ''),
                                CASE WHEN v_phone IS NOT NULL THEN 'whatsapp:' || v_phone END)) THEN
    RETURN jsonb_build_object('ok', true, 'excluido', true, 'insertados', 0);
  END IF;

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

  FOR v_msg IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'messages', '[]'::jsonb))
  LOOP
    CONTINUE WHEN NULLIF(trim(v_msg->>'external_message_id'), '') IS NULL;
    v_sender := CASE WHEN (v_msg->>'direction') = 'out' THEN 'agent' ELSE 'user' END;
    v_ts     := COALESCE(NULLIF(v_msg->>'ts','')::timestamptz, now());
    IF NULLIF(v_msg->>'media_url','') IS NOT NULL THEN v_fotos := v_fotos + 1; END IF;

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
    ON CONFLICT (tenant_id, platform, external_message_id) DO UPDATE SET
      sender_type  = EXCLUDED.sender_type,
      status       = EXCLUDED.status,
      message_type = EXCLUDED.message_type,
      message_text = CASE WHEN COALESCE(EXCLUDED.message_text,'') <> ''
                          THEN EXCLUDED.message_text ELSE sales_messages.message_text END,
      -- La foto puede llegar en una vuelta posterior (WhatsApp la descarga
      -- despues de pintar la fila). Nunca se BORRA una que ya estaba.
      media_url    = COALESCE(EXCLUDED.media_url, sales_messages.media_url);

    GET DIAGNOSTICS v_rowc = ROW_COUNT;
    IF v_rowc > 0 THEN v_inserted := v_inserted + 1; END IF;

    IF v_last_ts IS NULL OR v_ts >= v_last_ts THEN
      v_last_ts := v_ts;
      v_last_preview := left(COALESCE(NULLIF(v_msg->>'text',''),
        CASE WHEN COALESCE(v_msg->>'message_type','text') <> 'text'
             THEN '['||(v_msg->>'message_type')||']' ELSE '' END), 180);
    END IF;
    IF v_sender = 'user'  AND (v_last_user_ts  IS NULL OR v_ts >= v_last_user_ts)  THEN v_last_user_ts  := v_ts; END IF;
    IF v_sender = 'agent' AND (v_last_agent_ts IS NULL OR v_ts >= v_last_agent_ts) THEN v_last_agent_ts := v_ts; END IF;
  END LOOP;

  UPDATE public.sales_conversations SET
    last_message_at       = GREATEST(last_message_at, v_last_ts),
    last_user_message_at  = GREATEST(last_user_message_at, v_last_user_ts),
    last_agent_message_at = GREATEST(last_agent_message_at, v_last_agent_ts),
    last_message_preview  = COALESCE(v_last_preview, last_message_preview),
    updated_at            = now()
  WHERE id = v_conv_id;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id,
                            'mensajes', v_inserted, 'fotos', v_fotos);
END $function$;

REVOKE ALL ON FUNCTION public.omni_excluir_chat(text[], text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.omni_quitar_exclusion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_excluir_chat(text[], text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.omni_quitar_exclusion(text) TO authenticated;

COMMIT;

SELECT public.registrar_migracion('omni_chats_no_copiar.sql');
