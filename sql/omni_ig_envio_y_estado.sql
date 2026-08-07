-- =====================================================================
-- Instagram: responder desde el CRM + saber si el espejo está vivo
-- ---------------------------------------------------------------------
-- (2026-08-07) Continuación de omni_mirror_instagram.sql. Aquel trajo los
-- mensajes al Sales Hub; este deja contestarlos y deja ver si el espejo
-- está funcionando o se rompió en silencio.
--
-- >>> CÓMO SALE UN MENSAJE <<<
-- El OmniInbox ya guarda las respuestas del vendedor como
-- sales_messages con sender_type='agent' y status='queued'. Aquí:
--
--   omni_ig_pendientes(thread)  → lo que está en cola para ESE chat
--   omni_ig_marcar(id, ok, err) → cerrarlo como 'sent' o 'failed'
--
-- La extensión los escribe en el cuadro de Instagram del chat que el
-- vendedor YA tiene abierto. No navega, no abre conversaciones, no busca
-- gente: si el chat no está abierto, el mensaje se queda en cola. Es una
-- decisión de diseño, no una limitación — un programa que se pasea solo
-- por Instagram se comporta como un robot y se le trata como tal.
--
-- >>> POR QUÉ HACE FALTA VER EL ESTADO <<<
-- El espejo de WhatsApp enseñó la lección: cuando se rompe, no avisa. Se
-- queda callado y todo el mundo cree que simplemente no han escrito. Por
-- eso get_omni_ig_estado() distingue "nadie ha escrito" de "hace tres días
-- que no entra nada y algo está roto".
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LO QUE ESTÁ EN COLA PARA UN CHAT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.omni_ig_pendientes(p_thread text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL OR NULLIF(btrim(p_thread), '') IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.created_at), '[]'::json) INTO v_out
  FROM (
    SELECT m.id, m.message_text, m.created_at
    FROM public.sales_messages m
    JOIN public.sales_conversations c ON c.id = m.conversation_id
    WHERE m.tenant_id = v_tenant
      AND m.platform = 'instagram'
      AND m.sender_type = 'agent'
      AND m.status = 'queued'
      AND COALESCE(m.message_text, '') <> ''
      AND c.metadata ->> 'thread_id' = p_thread
    -- De a poco: el que manda diez mensajes de un tirón se delata solo.
    LIMIT 3
  ) x;

  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.omni_ig_pendientes(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_ig_pendientes(text) TO authenticated;

-- ------------------------------------------------------------
-- 2) CERRAR EL MENSAJE
-- ------------------------------------------------------------
-- Se guarda el motivo cuando falla. La lección del bot de Instagram: un
-- "failed" sin explicación obliga a salir a averiguar qué pasó.
CREATE OR REPLACE FUNCTION public.omni_ig_marcar(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  UPDATE public.sales_messages
  SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
      raw_data = COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
        'via', 'espejo_extension',
        'enviado_en', now(),
        'error', CASE WHEN p_ok THEN NULL ELSE p_error END)
  WHERE id = p_id AND tenant_id = v_tenant AND platform = 'instagram';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', v_n > 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.omni_ig_marcar(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_ig_marcar(uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------
-- 3) ¿ESTÁ VIVO EL ESPEJO?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_omni_ig_estado()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_convs   int;
  v_msgs    int;
  v_ultimo  timestamptz;
  v_horas   numeric;
  v_cola    int;
  v_fallos  int;
  v_estado  text;
BEGIN
  IF v_tenant IS NULL THEN RETURN json_build_object('estado', 'sin_sesion'); END IF;

  SELECT COUNT(DISTINCT c.id), COUNT(m.id), MAX(m.created_at)
    INTO v_convs, v_msgs, v_ultimo
  FROM public.sales_conversations c
  LEFT JOIN public.sales_messages m ON m.conversation_id = c.id
  WHERE c.tenant_id = v_tenant AND c.platform = 'instagram';

  SELECT COUNT(*) FILTER (WHERE status = 'queued'),
         COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_cola, v_fallos
  FROM public.sales_messages
  WHERE tenant_id = v_tenant AND platform = 'instagram' AND sender_type = 'agent';

  v_horas := CASE WHEN v_ultimo IS NULL THEN NULL
                  ELSE round(EXTRACT(EPOCH FROM (now() - v_ultimo)) / 3600.0, 1) END;

  v_estado := CASE
    -- Nunca entró nada: o no han escrito, o el espejo jamás corrió. No se
    -- puede distinguir todavía, y decir "roto" sería mentir.
    WHEN v_msgs = 0        THEN 'sin_datos'
    WHEN v_horas <= 24     THEN 'ok'
    WHEN v_horas <= 72     THEN 'tranquilo'
    ELSE                        'revisar'
  END;

  RETURN json_build_object(
    'estado', v_estado,
    'conversaciones', v_convs,
    'mensajes', v_msgs,
    'ultimo', v_ultimo,
    'horas_sin_captura', v_horas,
    'en_cola', v_cola,
    'fallidos', v_fallos
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_omni_ig_estado() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_omni_ig_estado() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('omni_ig_envio_y_estado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT public.get_omni_ig_estado();
-- 'sin_datos'  → todavía no ha entrado ningún DM (o el espejo no ha corrido)
-- 'ok'         → entró algo en las últimas 24 h
-- 'tranquilo'  → 1 a 3 días sin nada: normal en cuentas de poco movimiento
-- 'revisar'    → más de 3 días: puede ser el espejo, no la falta de clientes
