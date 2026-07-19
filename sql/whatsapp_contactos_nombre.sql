-- =====================================================================
-- DIRECTORIO DE CONTACTOS: PROPAGAR EL NOMBRE VISIBLE DE WHATSAPP
-- ---------------------------------------------------------------------
-- Defecto verificado: el contacto se creaba por teléfono pero name podía
-- quedar vacío aunque la conversación tuviera nombre visible (el upsert
-- solo miraba el título del payload y el backfill tomaba la conversación
-- más reciente, que puede venir sin nombre real).
--
-- Este script:
--  1) crm_whatsapp_contacts.name_source ('whatsapp'|'manual'): procedencia
--     del nombre. Un trigger marca 'manual' cualquier cambio de nombre que
--     NO venga del espejo (la web edita sin señal); el espejo se identifica
--     con set_config('motoflow.name_writer','whatsapp') en su transacción.
--     REGLA: un nombre 'manual' NUNCA se sobrescribe desde WhatsApp.
--  2) omni_mirror_whatsapp v2.1: al crear/actualizar el contacto propaga
--     el nombre real (del título del chat o, si no, del customer_name ya
--     guardado en la conversación). El teléfono sigue siendo el ÚNICO
--     identificador; el nombre es solo presentación. Nunca cruza tenants
--     (todo va filtrado por tenant_id).
--  3) Sincronización: contactos existentes con name vacío/dígitos toman el
--     nombre visible real más reciente de SUS conversaciones (mismo tenant
--     y mismo teléfono normalizado). Reporta cuántos completó.
--
-- ⚠ Supersede el bloque de contactos de omni_mirror_telefono_contactos.sql:
--   si algún día re-corres aquel archivo, re-corre ESTE después.
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Procedencia del nombre + trigger detector de correcciones manuales
-- ------------------------------------------------------------
ALTER TABLE public.crm_whatsapp_contacts
  ADD COLUMN IF NOT EXISTS name_source TEXT
  CHECK (name_source IN ('whatsapp', 'manual'));

CREATE OR REPLACE FUNCTION public.crm_wa_contacts_name_source_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.name IS NOT NULL AND btrim(NEW.name) <> '' AND NEW.name_source IS NULL THEN
      NEW.name_source := CASE WHEN current_setting('motoflow.name_writer', true) = 'whatsapp'
                              THEN 'whatsapp' ELSE 'manual' END;
    END IF;
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name_source := CASE WHEN current_setting('motoflow.name_writer', true) = 'whatsapp'
                            THEN 'whatsapp' ELSE 'manual' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_wa_contacts_name_source ON public.crm_whatsapp_contacts;
CREATE TRIGGER trg_crm_wa_contacts_name_source
  BEFORE INSERT OR UPDATE ON public.crm_whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_wa_contacts_name_source_fn();

-- ------------------------------------------------------------
-- 2) omni_mirror_whatsapp v2.1 (solo cambia el bloque de contactos)
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
  v_name_real text;
  v_prev_name text;
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

  v_grupo := (v_jid ~* '@g\.us$') OR (v_ext_in ~* '@g\.us');

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

  -- Directorio de contactos (solo individuales con teléfono verificado).
  -- El nombre real sale del título del chat o, si el título es un número,
  -- del customer_name que la conversación ya tenga guardado.
  IF v_phone IS NOT NULL THEN
    v_tel_key := public.crm_whatsapp_phone_key(v_phone);

    v_name_real := CASE WHEN v_name IS NOT NULL AND v_name !~ '^\+?[0-9\s()\-]+$' THEN v_name END;
    IF v_name_real IS NULL THEN
      SELECT customer_name INTO v_prev_name
      FROM public.sales_conversations
      WHERE tenant_id = v_tenant AND platform = 'whatsapp'
        AND external_conversation_id = v_ext
      LIMIT 1;
      IF v_prev_name IS NOT NULL AND v_prev_name !~ '^\+?[0-9\s()\-]+$' THEN
        v_name_real := v_prev_name;
      END IF;
    END IF;

    -- señal para el trigger de procedencia: este cambio viene de WhatsApp
    PERFORM set_config('motoflow.name_writer', 'whatsapp', true);

    SELECT id INTO v_contact FROM public.crm_whatsapp_contacts
     WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(phone) = v_tel_key
     LIMIT 1;
    SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid END INTO v_cliente
    FROM public.clientes
    WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(telefono) = v_tel_key;

    IF v_contact IS NULL THEN
      INSERT INTO public.crm_whatsapp_contacts (tenant_id, cliente_id, phone, wa_id, name, name_source, source)
      VALUES (v_tenant, v_cliente, v_phone, v_jid, v_name_real,
              CASE WHEN v_name_real IS NOT NULL THEN 'whatsapp' END, 'omni_mirror')
      RETURNING id INTO v_contact;
    ELSE
      -- 'manual' es intocable; whatsapp→whatsapp sí se refresca; vacío/dígitos se completa
      UPDATE public.crm_whatsapp_contacts SET
        name = CASE WHEN v_name_real IS NOT NULL
                     AND COALESCE(name_source, '') <> 'manual'
                     AND (name IS NULL OR btrim(name) = '' OR name ~ '^\+?[0-9\s()\-]+$'
                          OR COALESCE(name_source, 'whatsapp') = 'whatsapp')
                    THEN v_name_real ELSE name END,
        wa_id      = COALESCE(wa_id, v_jid),
        cliente_id = COALESCE(cliente_id, v_cliente),
        updated_at = now()
      WHERE id = v_contact;
    END IF;

    SELECT COALESCE(NULLIF(c.name, ''), v_name, v_phone) INTO v_display
    FROM public.crm_whatsapp_contacts c WHERE c.id = v_contact;
  ELSE
    v_display := COALESCE(v_name, v_ext_in);
  END IF;

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
    'contact_id', v_contact,
    'apta_crm', (v_phone IS NOT NULL AND NOT v_grupo));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_whatsapp(jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Sincronización: completar nombres vacíos/dígitos desde el nombre
--    visible real más reciente de sus conversaciones (mismo tenant+tel)
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  PERFORM set_config('motoflow.name_writer', 'whatsapp', true);
  FOR r IN
    SELECT c.id AS contact_id, best.nombre
    FROM public.crm_whatsapp_contacts c
    JOIN LATERAL (
      SELECT sc.customer_name AS nombre
      FROM public.sales_conversations sc
      WHERE sc.tenant_id = c.tenant_id
        AND sc.platform = 'whatsapp'
        AND sc.customer_phone IS NOT NULL
        AND public.crm_whatsapp_phone_key(sc.customer_phone) = public.crm_whatsapp_phone_key(c.phone)
        AND sc.customer_name IS NOT NULL
        AND btrim(sc.customer_name) <> ''
        AND sc.customer_name !~ '^\+?[0-9\s()\-]+$'
      ORDER BY sc.last_message_at DESC NULLS LAST
      LIMIT 1
    ) best ON true
    WHERE (c.name IS NULL OR btrim(c.name) = '' OR c.name ~ '^\+?[0-9\s()\-]+$')
      AND COALESCE(c.name_source, '') <> 'manual'
  LOOP
    UPDATE public.crm_whatsapp_contacts
       SET name = r.nombre, name_source = 'whatsapp'
     WHERE id = r.contact_id;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Nombres completados desde conversaciones: %', v_n;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('whatsapp_contactos_nombre.sql');
  END IF;
END $$;

-- Resumen: contactos con nombre vs sin nombre
SELECT
  count(*)                                                          AS contactos,
  count(*) FILTER (WHERE name IS NOT NULL AND btrim(name) <> '')    AS con_nombre,
  count(*) FILTER (WHERE name IS NULL OR btrim(name) = '')          AS sin_nombre,
  count(*) FILTER (WHERE name_source = 'manual')                    AS nombres_manuales
FROM public.crm_whatsapp_contacts;
