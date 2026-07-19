-- =====================================================================
-- OMNI MIRROR v2 — teléfono real, directorio de contactos y cotizaciones
-- ---------------------------------------------------------------------
-- PROBLEMA: la extensión solo sacaba el teléfono del TÍTULO del chat, que
-- en contactos guardados es el nombre → conversaciones con
-- customer_phone = NULL y external_conversation_id = whatsapp:name:<slug>.
-- Hermes las ve sin teléfono y no puede crear fichas CRM.
--
-- Este script (junto con la extensión v2, que ahora lee el JID interno del
-- chat con un probe en world MAIN):
--   1) _omni_asignar_telefono_conversacion(): asigna el teléfono a una
--      conversación, re-clava external_conversation_id = whatsapp:<tel>,
--      reescribe los ids de sus mensajes y FUSIONA con la conversación
--      por-teléfono si ya existía (dedup por external_message_id).
--   2) omni_mirror_whatsapp() v2: resuelve el teléfono en orden
--      payload.phone → payload.jid → external_conversation_id → data-ids
--      legacy de los mensajes; migra la conversación por-nombre del MISMO
--      chat (name_key determinístico, NUNCA por parecido de nombres);
--      nunca borra un teléfono ya guardado; marca grupos/sin-número como
--      no aptos para CRM individual (metadata.apta_crm=false); upsert del
--      directorio crm_whatsapp_contacts idempotente por teléfono
--      normalizado (el nombre manual NUNCA se pisa con dígitos) y enlaza
--      cliente_id SOLO con coincidencia única por teléfono.
--   3) BACKFILL histórico: completa teléfono únicamente donde es
--      verificable en los datos ya guardados (ext id o data-ids legacy);
--      lo demás queda marcado apta_crm=false con el motivo. NO se infiere
--      nada por nombre. Reporta contadores.
--   4) Espejo public de la vista de cotizaciones (solo service_role).
--      La vista para Hermes (hermes.hermes_whatsapp_cotizaciones) vive en
--      sql/hermes_readonly_vistas.sql → RE-CORRERLO DESPUÉS de este.
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Helper: asignar teléfono a una conversación (migra/fusiona)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._omni_asignar_telefono_conversacion(
  p_conv_id uuid,
  p_phone   text
)
RETURNS uuid   -- id de la conversación superviviente
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_old   record;
  v_ext   text;
  v_dest  uuid;
  v_msg   record;
  v_oldp  text;
  v_newp  text;
BEGIN
  SELECT * INTO v_old FROM public.sales_conversations WHERE id = p_conv_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_ext  := 'whatsapp:' || p_phone;
  v_oldp := v_old.external_conversation_id || ':';
  v_newp := v_ext || ':';

  IF v_old.external_conversation_id = v_ext THEN
    UPDATE public.sales_conversations
       SET customer_phone = COALESCE(customer_phone, p_phone)
     WHERE id = p_conv_id;
    RETURN p_conv_id;
  END IF;

  SELECT id INTO v_dest
  FROM public.sales_conversations
  WHERE tenant_id = v_old.tenant_id AND platform = 'whatsapp'
    AND external_conversation_id = v_ext AND id <> p_conv_id
  FOR UPDATE;

  IF v_dest IS NULL THEN
    -- Solo renombrar la conversación al esquema por-teléfono
    UPDATE public.sales_conversations
       SET external_conversation_id = v_ext,
           customer_phone = p_phone,
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('apta_crm', true,
                                            'id_anterior', v_old.external_conversation_id)
     WHERE id = p_conv_id;
    v_dest := p_conv_id;
  ELSE
    -- Ya existía por teléfono: fusionar (los mensajes se mueven; el dedup
    -- por external_message_id se resuelve al reescribir el prefijo abajo)
    UPDATE public.sales_messages SET conversation_id = v_dest WHERE conversation_id = p_conv_id;
    UPDATE public.sales_conversations d SET
      last_message_at       = GREATEST(d.last_message_at, v_old.last_message_at),
      last_user_message_at  = GREATEST(d.last_user_message_at, v_old.last_user_message_at),
      last_agent_message_at = GREATEST(d.last_agent_message_at, v_old.last_agent_message_at),
      customer_name         = COALESCE(NULLIF(d.customer_name, ''), v_old.customer_name),
      cotizacion_id         = COALESCE(d.cotizacion_id, v_old.cotizacion_id),
      metadata = COALESCE(d.metadata, '{}'::jsonb)
                 || jsonb_build_object('fusionada_desde', v_old.external_conversation_id)
    WHERE d.id = v_dest;
    DELETE FROM public.sales_conversations WHERE id = p_conv_id;
  END IF;

  -- Reescribir los ids de mensaje 'whatsapp:name:<slug>:HEX' → 'whatsapp:<tel>:HEX'
  -- para que el próximo espejo del mismo chat NO duplique mensajes.
  FOR v_msg IN
    SELECT id, external_message_id FROM public.sales_messages
    WHERE conversation_id = v_dest AND external_message_id LIKE v_oldp || '%'
  LOOP
    BEGIN
      UPDATE public.sales_messages
         SET external_message_id = v_newp || substr(v_msg.external_message_id, length(v_oldp) + 1)
       WHERE id = v_msg.id;
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.sales_messages WHERE id = v_msg.id;  -- ya estaba bajo el id nuevo
    END;
  END LOOP;

  RETURN v_dest;
END;
$$;

REVOKE ALL ON FUNCTION public._omni_asignar_telefono_conversacion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._omni_asignar_telefono_conversacion(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 2) omni_mirror_whatsapp v2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.omni_mirror_whatsapp(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_ext_in   text := NULLIF(trim(p_payload->>'external_conversation_id'), '');
  v_jid      text := NULLIF(trim(p_payload->>'jid'), '');
  v_name     text := NULLIF(trim(p_payload->>'name'), '');
  v_name_key text := NULLIF(trim(p_payload->>'name_key'), '');
  v_phone    text := NULLIF(regexp_replace(COALESCE(p_payload->>'phone',''), '\D', '', 'g'), '');
  v_grupo    boolean := false;
  v_ext      text;
  v_conv_id  uuid;
  v_prev_id  uuid;
  v_migrada  boolean := false;
  v_display  text;
  v_contact  uuid;
  v_cliente  uuid;
  v_tel_key  text;
  v_msg      jsonb;
  v_sender   text;
  v_ts       timestamptz;
  v_rowc     int;
  v_inserted int := 0;
  v_last_ts        timestamptz := NULL;
  v_last_preview   text := NULL;
  v_last_user_ts   timestamptz := NULL;
  v_last_agent_ts  timestamptz := NULL;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_ext_in IS NULL THEN RAISE EXCEPTION 'external_conversation_id requerido'; END IF;

  -- Grupos: sin destinatario individual válido → no aptos para CRM.
  v_grupo := (v_jid ~* '@g\.us$') OR (v_ext_in ~* '@g\.us');

  -- Resolución del teléfono (nunca inventado, solo de fuentes verificables):
  IF NOT v_grupo THEN
    IF v_phone IS NULL OR length(v_phone) < 7 THEN
      v_phone := (regexp_match(COALESCE(v_jid, ''), '^(\d{7,15})@(?:c\.us|s\.whatsapp\.net)$'))[1];
    END IF;
    IF v_phone IS NULL THEN
      v_phone := (regexp_match(v_ext_in, '^whatsapp:(\d{7,15})$'))[1];
    END IF;
    IF v_phone IS NULL THEN
      SELECT (regexp_match(m->>'external_message_id', '(?:true|false)_(\d{7,15})@c\.us'))[1]
        INTO v_phone
      FROM jsonb_array_elements(COALESCE(p_payload->'messages', '[]'::jsonb)) m
      WHERE m->>'external_message_id' ~ '(?:true|false)_\d{7,15}@c\.us'
      LIMIT 1;
    END IF;
  ELSE
    v_phone := NULL;
  END IF;

  v_ext := CASE WHEN v_phone IS NOT NULL THEN 'whatsapp:' || v_phone ELSE v_ext_in END;

  -- Migración del MISMO chat que antes entró por nombre: el name_key es el
  -- slug determinístico del título que la propia extensión usaba como id
  -- (no es un match difuso de personas). Solo si esa conversación vieja
  -- sigue sin teléfono.
  IF v_phone IS NOT NULL THEN
    IF v_name_key IS NULL AND v_name IS NOT NULL THEN
      v_name_key := 'whatsapp:name:' ||
        COALESCE(NULLIF(left(regexp_replace(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'),
                                            '^-+|-+$', '', 'g'), 40), ''), 'chat');
    END IF;
    IF v_name_key IS NOT NULL AND v_name_key <> v_ext THEN
      SELECT id INTO v_prev_id
      FROM public.sales_conversations
      WHERE tenant_id = v_tenant AND platform = 'whatsapp'
        AND external_conversation_id = v_name_key
        AND customer_phone IS NULL;
      IF v_prev_id IS NOT NULL THEN
        PERFORM public._omni_asignar_telefono_conversacion(v_prev_id, v_phone);
        v_migrada := true;
      END IF;
    END IF;
  END IF;

  -- Directorio de contactos (solo individuales con teléfono verificado)
  IF v_phone IS NOT NULL THEN
    v_tel_key := public.crm_whatsapp_phone_key(v_phone);
    SELECT id INTO v_contact FROM public.crm_whatsapp_contacts
     WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(phone) = v_tel_key
     LIMIT 1;
    -- cliente canónico SOLO con coincidencia única por teléfono normalizado
    SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid END INTO v_cliente
    FROM public.clientes
    WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(telefono) = v_tel_key;

    IF v_contact IS NULL THEN
      INSERT INTO public.crm_whatsapp_contacts (tenant_id, cliente_id, phone, wa_id, name, source)
      VALUES (v_tenant, v_cliente, v_phone, v_jid,
              CASE WHEN v_name IS NOT NULL AND v_name !~ '^\+?[0-9\s()\-]+$' THEN v_name END,
              'omni_mirror')
      RETURNING id INTO v_contact;
    ELSE
      -- El nombre solo se pisa si el actual está vacío o es un número
      -- disfrazado (las correcciones manuales nunca lo son → se preservan).
      UPDATE public.crm_whatsapp_contacts SET
        name = CASE WHEN (name IS NULL OR btrim(name) = '' OR name ~ '^\+?[0-9\s()\-]+$')
                     AND v_name IS NOT NULL AND v_name !~ '^\+?[0-9\s()\-]+$'
                    THEN v_name ELSE name END,
        wa_id      = COALESCE(wa_id, v_jid),
        cliente_id = COALESCE(cliente_id, v_cliente),
        updated_at = now()
      WHERE id = v_contact;
    END IF;

    -- Nombre mostrado: la corrección del directorio manda si es un nombre real
    SELECT COALESCE(NULLIF(c.name, ''), v_name, v_phone) INTO v_display
    FROM public.crm_whatsapp_contacts c WHERE c.id = v_contact;
  ELSE
    v_display := COALESCE(v_name, v_ext_in);
  END IF;

  -- Upsert de la conversación. El teléfono y el nombre NUNCA se degradan:
  -- una pasada sin número no borra el número ya guardado.
  INSERT INTO public.sales_conversations (
    tenant_id, platform, external_conversation_id, customer_name, customer_phone,
    customer_external_id, status, bot_enabled, metadata
  ) VALUES (
    v_tenant, 'whatsapp', v_ext, COALESCE(v_display, v_phone, v_ext), v_phone,
    v_jid, 'nuevo', false,
    jsonb_build_object('source', 'motoflow_omni_extension_mirror',
                       'wa_name', v_name,
                       'grupo', v_grupo,
                       'apta_crm', (v_phone IS NOT NULL AND NOT v_grupo))
  )
  ON CONFLICT (tenant_id, platform, external_conversation_id)
  DO UPDATE SET
    customer_name        = COALESCE(NULLIF(EXCLUDED.customer_name, ''), sales_conversations.customer_name),
    customer_phone       = COALESCE(sales_conversations.customer_phone, EXCLUDED.customer_phone),
    customer_external_id = COALESCE(sales_conversations.customer_external_id, EXCLUDED.customer_external_id),
    metadata             = COALESCE(sales_conversations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at           = now()
  RETURNING id INTO v_conv_id;

  -- Mensajes (idéntico a v1: dedup por external_message_id)
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
    ON CONFLICT (tenant_id, platform, external_message_id) DO UPDATE SET
      sender_type  = EXCLUDED.sender_type,
      status       = EXCLUDED.status,
      message_type = EXCLUDED.message_type,
      message_text = CASE WHEN COALESCE(EXCLUDED.message_text,'') <> ''
                          THEN EXCLUDED.message_text ELSE sales_messages.message_text END;

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
    'inserted', v_inserted, 'telefono', v_phone, 'migrada', v_migrada,
    'apta_crm', (v_phone IS NOT NULL AND NOT v_grupo));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) BACKFILL histórico (solo con número verificable; sin inferencias)
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_phone text;
  v_corregidas int := 0;
  v_no_corregibles int := 0;
BEGIN
  FOR r IN
    SELECT id, tenant_id, external_conversation_id
    FROM public.sales_conversations
    WHERE platform = 'whatsapp' AND customer_phone IS NULL
  LOOP
    -- a) el propio id ya trae el número
    v_phone := (regexp_match(r.external_conversation_id, '^whatsapp:(\d{7,15})$'))[1];
    -- b) data-ids legacy de sus mensajes ((true|false)_<tel>@c.us)
    IF v_phone IS NULL THEN
      SELECT (regexp_match(m.external_message_id, '(?:true|false)_(\d{7,15})@c\.us'))[1]
        INTO v_phone
      FROM public.sales_messages m
      WHERE m.conversation_id = r.id
        AND m.external_message_id ~ '(?:true|false)_\d{7,15}@c\.us'
      LIMIT 1;
    END IF;

    IF v_phone IS NOT NULL THEN
      PERFORM public._omni_asignar_telefono_conversacion(r.id, v_phone);
      v_corregidas := v_corregidas + 1;
    ELSE
      UPDATE public.sales_conversations
         SET metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('apta_crm', false,
                             'apta_crm_motivo', 'sin número verificable en los datos originales; se corregirá solo cuando la extensión v2 re-espeje el chat')
       WHERE id = r.id;
      v_no_corregibles := v_no_corregibles + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'BACKFILL WhatsApp: % conversaciones corregidas con número verificable; % sin número (marcadas apta_crm=false, se autocorrigen al re-espejar con la extensión v2)',
    v_corregidas, v_no_corregibles;
END $$;

-- ------------------------------------------------------------
-- 4) Espejo public de cotizaciones por conversación — SOLO service_role
--    (la vista de Hermes vive en hermes_readonly_vistas.sql)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hermes_whatsapp_cotizaciones_srv AS
SELECT
  sc.tenant_id,
  sc.id                  AS conversation_id,
  sc.customer_phone      AS telefono,
  sc.customer_name       AS cliente,
  c.id                   AS cotizacion_id,
  c.numero               AS cotizacion_numero,
  cd.producto_id,
  cd.codigo              AS codigo_producto,
  cd.descripcion         AS producto_descripcion,
  cd.cantidad,
  cd.precio_unitario,
  c.created_at           AS fecha
FROM public.sales_conversations sc
JOIN public.cotizaciones c        ON c.id = sc.cotizacion_id AND c.tenant_id = sc.tenant_id
JOIN public.cotizaciones_detalle cd ON cd.cotizacion_id = c.id AND cd.tenant_id = c.tenant_id
WHERE sc.platform = 'whatsapp';

REVOKE ALL ON public.hermes_whatsapp_cotizaciones_srv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hermes_whatsapp_cotizaciones_srv TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('omni_mirror_telefono_contactos.sql');
  END IF;
END $$;

-- Resumen post-backfill
SELECT
  count(*) FILTER (WHERE customer_phone IS NOT NULL)                    AS con_telefono,
  count(*) FILTER (WHERE customer_phone IS NULL)                        AS sin_telefono,
  count(*) FILTER (WHERE (metadata->>'apta_crm') = 'false')             AS marcadas_no_aptas
FROM public.sales_conversations
WHERE platform = 'whatsapp';
