-- =====================================================================
-- OMNI: LOS CHATS DE WHATSAPP SIN LEER ENTRAN AL CRM SIN ABRIRLOS
-- =====================================================================
-- (14/10/2026) El espejo solo copia el chat ABIERTO. Un cliente que escribe
-- y nadie abre su chat nunca aparecía en el CRM. Y abrirlo para que entre lo
-- marca como leído en el teléfono.
--
-- Ahora la sonda de la extensión (jid-probe.js, solo lectura) lee la lista
-- interna de WhatsApp Web cada 30 s: chats de PERSONAS (no grupos ni
-- difusiones) con mensajes sin leer cuyo último mensaje es del cliente. La
-- extensión los manda aquí y cada uno queda en sales_conversations como
-- "esperando respuesta" (last_user_message_at) con su último mensaje de
-- vista previa. NO se inventan mensajes: los reales los copia el espejo al
-- abrir el chat, con la misma clave (whatsapp:<teléfono> o whatsapp:name:).
-- Los chats marcados "No copiar" (omni_chats_excluidos) se saltan.
--
-- omni_registrar_sin_leer(p_chats jsonb)
--   p_chats: [{external_conversation_id, name_key, phone, nombre, cantidad, preview, t}]
-- =====================================================================

CREATE OR REPLACE FUNCTION public.omni_registrar_sin_leer(p_chats jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  c        record;
  v_ts     timestamptz;
  v_n      int := 0;
  v_excl   int := 0;
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF jsonb_typeof(p_chats) <> 'array' THEN RETURN jsonb_build_object('ok', false); END IF;

  FOR c IN
    SELECT nullif(trim(x.external_conversation_id), '') ext, nullif(trim(x.name_key), '') nk,
           nullif(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), '') phone,
           left(nullif(trim(x.nombre), ''), 120) nombre, x.cantidad, left(x.preview, 180) preview, x.t
      FROM jsonb_to_recordset(p_chats) AS x(external_conversation_id text, name_key text, phone text,
                                            nombre text, cantidad int, preview text, t bigint)
     LIMIT 50
  LOOP
    CONTINUE WHEN c.ext IS NULL OR c.ext !~ '^whatsapp:';
    IF EXISTS (SELECT 1 FROM public.omni_chats_excluidos e
                WHERE e.tenant_id = v_tenant
                  AND e.clave IN (c.ext, c.nk, CASE WHEN c.phone IS NOT NULL THEN 'whatsapp:' || c.phone END)) THEN
      v_excl := v_excl + 1;
      CONTINUE;
    END IF;

    -- Hora del último mensaje según WhatsApp; nunca en el futuro.
    v_ts := least(coalesce(to_timestamp(c.t), now()), now());

    INSERT INTO public.sales_conversations AS s (
      tenant_id, platform, external_conversation_id, customer_name, customer_phone,
      status, bot_enabled, last_message_at, last_user_message_at, last_message_preview, metadata
    ) VALUES (
      v_tenant, 'whatsapp', c.ext, coalesce(c.nombre, c.phone, c.ext), c.phone,
      'nuevo', false, v_ts, v_ts, c.preview,
      jsonb_build_object('source', 'motoflow_omni_sin_leer', 'sin_leer', c.cantidad)
    )
    ON CONFLICT (tenant_id, platform, external_conversation_id) DO UPDATE SET
      customer_name        = coalesce(s.customer_name, EXCLUDED.customer_name),
      customer_phone       = coalesce(s.customer_phone, EXCLUDED.customer_phone),
      last_message_at      = greatest(s.last_message_at, EXCLUDED.last_message_at),
      last_user_message_at = greatest(s.last_user_message_at, EXCLUDED.last_user_message_at),
      last_message_preview = CASE WHEN EXCLUDED.last_message_at >= coalesce(s.last_message_at, '-infinity')
                                  THEN coalesce(EXCLUDED.last_message_preview, s.last_message_preview)
                                  ELSE s.last_message_preview END,
      metadata             = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object('sin_leer', c.cantidad),
      updated_at           = now();
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'registrados', v_n, 'excluidos', v_excl);
END
$fn$;

REVOKE ALL ON FUNCTION public.omni_registrar_sin_leer(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_registrar_sin_leer(jsonb) TO authenticated;

SELECT public.registrar_migracion('omni_chats_sin_leer.sql');
