-- =====================================================================
-- Monitoreo del espejo de WhatsApp — latido + estado
-- ---------------------------------------------------------------------
-- El espejo (omni_mirror_whatsapp) es silencioso a propósito. El riesgo
-- real es que se rompa SIN que nadie se entere (como pasó el 31-may: se
-- cayó y estuvo 6 semanas muerto). Esto convierte el silencio en señal:
--
--   * omni_mirror_heartbeat(): la extensión manda un "latido" en CADA
--     corrida (aunque no lea nada), con diagnóstico: ¿hay chat abierto?,
--     ¿cuántas filas vio?, ¿cuántos mensajes leyó?
--   * get_omni_mirror_status(): calcula el estado del tenant:
--       - inactivo    → no llegan latidos (extensión apagada / sin sesión)
--       - dom_roto    → llegan latidos y abriste chats, pero NO lee mensajes
--                       (firma de que WhatsApp cambió su estructura)
--       - sin_captura → hace rato que no entra un mensaje nuevo
--       - ok          → capturando al día
-- Idempotente. Re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.omni_mirror_health (
  tenant_id        uuid NOT NULL,
  user_id          uuid NOT NULL,
  last_ping_at     timestamptz,
  last_chatopen_at timestamptz,   -- última vez que había un chat abierto
  last_parsed_at   timestamptz,   -- última vez que leyó >0 mensajes
  last_rows_found  int DEFAULT 0,
  last_parsed      int DEFAULT 0,
  last_probe       jsonb,          -- sonda de la estructura real de WhatsApp Web
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- por si la tabla ya existía sin la columna de sonda
ALTER TABLE public.omni_mirror_health ADD COLUMN IF NOT EXISTS last_probe jsonb;

ALTER TABLE public.omni_mirror_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_mirror_health_select ON public.omni_mirror_health;
CREATE POLICY omni_mirror_health_select ON public.omni_mirror_health
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- ── Latido: la extensión lo manda en cada corrida del espejo ──────────
-- (se elimina la firma vieja de 3 args para no dejar overloads ambiguos)
DROP FUNCTION IF EXISTS public.omni_mirror_heartbeat(boolean,int,int);
CREATE OR REPLACE FUNCTION public.omni_mirror_heartbeat(
  p_chat_open boolean DEFAULT false,
  p_rows_found int DEFAULT 0,
  p_parsed int DEFAULT 0,
  p_probe jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_user   uuid := auth.uid();
BEGIN
  IF v_tenant IS NULL OR v_user IS NULL THEN RETURN; END IF;

  INSERT INTO public.omni_mirror_health AS h (
    tenant_id, user_id, last_ping_at, last_chatopen_at, last_parsed_at,
    last_rows_found, last_parsed, last_probe, updated_at
  ) VALUES (
    v_tenant, v_user, now(),
    CASE WHEN p_chat_open THEN now() END,
    CASE WHEN p_parsed > 0 THEN now() END,
    p_rows_found, p_parsed, p_probe, now()
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    last_ping_at     = now(),
    last_chatopen_at = CASE WHEN p_chat_open THEN now() ELSE h.last_chatopen_at END,
    last_parsed_at   = CASE WHEN p_parsed > 0 THEN now() ELSE h.last_parsed_at END,
    last_rows_found  = p_rows_found,
    last_parsed      = p_parsed,
    last_probe       = COALESCE(p_probe, h.last_probe),
    updated_at       = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.omni_mirror_heartbeat(boolean,int,int,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.omni_mirror_heartbeat(boolean,int,int,jsonb) TO authenticated, service_role;

-- ── Estado del espejo del tenant (para chip en la extensión y web) ────
CREATE OR REPLACE FUNCTION public.get_omni_mirror_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant       uuid := public.get_user_tenant();
  v_ping         timestamptz;
  v_chatopen     timestamptz;
  v_parsed       timestamptz;
  v_last_msg     timestamptz;
  v_estado       text;
  v_now          timestamptz := now();
BEGIN
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('estado','desconocido'); END IF;

  SELECT max(last_ping_at), max(last_chatopen_at), max(last_parsed_at)
    INTO v_ping, v_chatopen, v_parsed
  FROM public.omni_mirror_health WHERE tenant_id = v_tenant;

  SELECT max(created_at) INTO v_last_msg
  FROM public.sales_messages
  WHERE tenant_id = v_tenant AND platform = 'whatsapp'
    AND raw_data->>'source' = 'mirror';

  v_estado := CASE
    -- sin latidos recientes → la extensión no está corriendo
    WHEN v_ping IS NULL OR v_now - v_ping > interval '10 minutes' THEN 'inactivo'
    -- latidos frescos + abriste chats, pero no lee mensajes → estructura cambió
    WHEN v_chatopen IS NOT NULL AND v_now - v_chatopen < interval '15 minutes'
         AND (v_parsed IS NULL OR v_now - v_parsed > interval '15 minutes') THEN 'dom_roto'
    -- corriendo pero hace horas que no entra un mensaje nuevo
    WHEN v_last_msg IS NULL OR v_now - v_last_msg > interval '12 hours' THEN 'sin_captura'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'estado',            v_estado,
    'last_ping_at',      v_ping,
    'last_chatopen_at',  v_chatopen,
    'last_parsed_at',    v_parsed,
    'last_message_at',   v_last_msg,
    'minutos_sin_leer',  CASE WHEN v_parsed IS NOT NULL THEN round(extract(epoch FROM (v_now - v_parsed))/60)::int END,
    'horas_sin_captura', CASE WHEN v_last_msg IS NOT NULL THEN round(extract(epoch FROM (v_now - v_last_msg))/3600, 1) END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_omni_mirror_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_omni_mirror_status() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('omni_mirror_health.sql');
  END IF;
END $$;

SELECT 'omni_mirror_health + heartbeat + status listos (monitoreo del espejo)' AS status;
