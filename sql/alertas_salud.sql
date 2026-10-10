-- =====================================================================
-- ALERTAS DE SALUD: servicios sin saldo/credenciales, certificados y
-- secuencias e-CF (plan de comercialización, paso 4)
-- =====================================================================
-- (10/10/2026) OpenAI se quedó sin saldo y nadie se enteró en más de un día:
-- el clasificador del CRM y el Creativo fallaban cada 10 minutos en silencio.
-- Con clientes de e-CF pasa igual con un certificado vencido o una secuencia
-- agotada: el día que pasa, la empresa no puede facturar.
--
--   alertas_avisar(...)            → notificación al superadmin (campana) y,
--                                    si es urgente, mensaje en el chat de
--                                    Hermes de Morla. No repite el mismo aviso
--                                    dentro de la ventana (p_cada_horas).
--   alertas_servicios_externos()   → cada hora mira las respuestas de las
--                                    últimas 70 min: OpenAI/Anthropic/Gemini
--                                    sin saldo, token de Meta vencido.
--   Certificados y secuencias: los revisa emitir-fiscal (acción dgii_salud,
--   que abre el .p12 para leer su vencimiento) una vez al día y llama a
--   alertas_avisar. Esa tarea va en sql/dgii_cron_revisar_pendientes.sql
--   (local, lleva la clave).
-- Deshacer: SELECT cron.unschedule('alertas-servicios');
-- =====================================================================

CREATE OR REPLACE FUNCTION public.alertas_avisar(
  p_tipo text, p_tenant uuid, p_titulo text, p_mensaje text,
  p_urgente boolean DEFAULT false, p_cada_horas integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n int := 0;
  r record;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE is_superadmin LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notificaciones n
       WHERE n.user_id = r.id AND n.tipo = p_tipo AND n.titulo = p_titulo
         AND n.created_at > now() - make_interval(hours => p_cada_horas)
    ) THEN
      INSERT INTO notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
      VALUES (p_tenant, r.id, p_tipo, left(p_titulo, 200), left(p_mensaje, 1000));
      v_n := v_n + 1;
    END IF;
  END LOOP;
  -- Urgente y nuevo: también al chat de Hermes (Morla es donde lo lee el dueño).
  IF p_urgente AND v_n > 0 THEN
    PERFORM hermes_decir('00000000-0000-0000-0000-000000000001'::uuid,
                         '⚠️ ' || p_titulo || E'\n' || p_mensaje, NULL, 'centinela');
    -- 'centinela': hermes_chat_surface_chk solo acepta esos orígenes.
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.alertas_avisar(text, uuid, text, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_avisar(text, uuid, text, text, boolean, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.alertas_servicios_externos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  v_desde timestamptz := now() - interval '70 minutes';  -- la tarea corre cada hora
  v_res   jsonb := '{}'::jsonb;
  -- Texto de las respuestas y errores recientes, en un solo lugar.
  v_hay_openai boolean; v_hay_anthropic boolean; v_hay_gemini boolean; v_hay_meta boolean;
BEGIN
  WITH t AS (
    SELECT content AS x FROM net._http_response WHERE created > v_desde
    UNION ALL
    SELECT error_message FROM ai_agent_runs WHERE created_at > v_desde AND error_message IS NOT NULL
  )
  SELECT bool_or(x ILIKE '%insufficient_quota%' OR x ILIKE '%credit_balance_exhausted%' OR x ILIKE '%no credits remaining%'),
         bool_or(x ILIKE '%credit balance is too low%'),
         bool_or(x ILIKE '%RESOURCE_EXHAUSTED%'),
         bool_or(x ILIKE '%OAuthException%' AND (x ILIKE '%"code":190%' OR x ILIKE '%validating access token%'))
    INTO v_hay_openai, v_hay_anthropic, v_hay_gemini, v_hay_meta
    FROM t;

  IF coalesce(v_hay_openai, false) THEN
    PERFORM alertas_avisar('alerta_servicio', NULL,
      'OpenAI se quedó SIN SALDO',
      'El Creativo, el clasificador del CRM, Jarvis y el chat de IA están fallando. Recarga en platform.openai.com → Settings → Billing → Add credits.',
      true, 12);
    v_res := v_res || '{"openai": true}';
  END IF;
  IF coalesce(v_hay_anthropic, false) THEN
    PERFORM alertas_avisar('alerta_servicio', NULL,
      'Anthropic (Claude) se quedó SIN SALDO',
      'Recarga en console.anthropic.com → Billing.', true, 12);
    v_res := v_res || '{"anthropic": true}';
  END IF;
  IF coalesce(v_hay_gemini, false) THEN
    PERFORM alertas_avisar('alerta_servicio', NULL,
      'Gemini (Google) llegó a su límite de uso',
      'El OCR de compras y lo que use Gemini puede fallar. Revisa la facturación del proyecto en Google Cloud.', false, 24);
    v_res := v_res || '{"gemini": true}';
  END IF;
  IF coalesce(v_hay_meta, false) THEN
    PERFORM alertas_avisar('alerta_servicio', NULL,
      'Venció el acceso a Facebook/Instagram',
      'Las publicaciones y mensajes de Meta están fallando. Renueva el token: npm run meta:token.', true, 12);
    v_res := v_res || '{"meta": true}';
  END IF;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.alertas_servicios_externos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_servicios_externos() TO service_role;

SELECT cron.unschedule('alertas-servicios')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertas-servicios');
SELECT cron.schedule('alertas-servicios', '7 * * * *', $$SELECT public.alertas_servicios_externos()$$);

-- Sin prueba en seco a propósito: al correrlo el 10/10 detectó los errores de
-- OpenAI de ANTES de la recarga (seguían dentro de los 70 minutos). La
-- primera vuelta real es a la hora y 7.

SELECT public.registrar_migracion('alertas_salud.sql');
