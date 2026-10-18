-- =====================================================================
-- Avisos al teléfono: cliente esperando por privado (18/10/2026)
-- ---------------------------------------------------------------------
-- Punto 2 del plan de la ventana de 24 h (el 1 es sql/omni_ventana_24h.sql).
-- Instagram y Messenger solo dejan contestar un privado dentro de las 24 h
-- del último mensaje directo del cliente; en 30 días 10 de 13 se cerraron
-- sin respuesta. Hermes le escribe al dueño por Telegram:
--
--   'espera_1h'  el cliente lleva 1 h esperando (quedan ~23 h)
--   'quedan_4h'  quedan 4 h o menos para que se cierre
--
-- Uno de cada tipo por cada mensaje del cliente (si vuelve a escribir, el
-- reloj empieza de nuevo y puede volver a avisar). Solo de 7:00 a 22:00 hora
-- de RD: de noche no se despierta a nadie; lo que siga pendiente sale a las 7.
-- Si el cliente solo esperaba "1 h" y ya entró en las últimas 4 h, sale solo
-- el aviso de 'quedan_4h'.
--
-- Cuenta como contestado cualquier respuesta nuestra que SALIÓ o está en
-- cola después del mensaje del cliente (una fallida no cuenta).
--
-- omni_avisos_ventana_tomar() aparta los avisos que tocan y los devuelve;
-- la función omni-avisos-ventana los manda y, si Telegram falla, los suelta
-- (omni_avisos_ventana_soltar) para el próximo intento. pg_cron cada 5 min.
-- Empresas: las que tienen cuentas en Zernio (hoy, Repuestos Morla).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.omni_avisos_ventana (
  conversation_id uuid NOT NULL REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('espera_1h', 'quedan_4h')),
  dm_at           timestamptz NOT NULL,
  enviado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tipo, dm_at)
);
ALTER TABLE public.omni_avisos_ventana ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omni_avisos_ventana FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.omni_avisos_ventana_tomar()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_hora int := extract(hour FROM now() AT TIME ZONE 'America/Santo_Domingo');
  v_out jsonb := '[]'::jsonb;
  r record;
  v_tipo text;
BEGIN
  IF v_hora < 7 OR v_hora >= 22 THEN RETURN v_out; END IF;

  FOR r IN
    WITH esperan AS (
      SELECT c.id, c.platform, c.customer_name, c.tenant_id,
             (SELECT max(m.created_at) FROM public.sales_messages m
               WHERE m.conversation_id = c.id AND m.sender_type = 'user'
                 AND COALESCE(m.message_type, 'text') <> 'comment') AS dm_at
        FROM public.sales_conversations c
       WHERE c.platform IN ('instagram', 'facebook')
         AND c.tenant_id IN (SELECT DISTINCT tenant_id FROM public.zernio_cuentas WHERE activo)
         AND c.last_message_at > now() - interval '26 hours'
    )
    SELECT e.*,
           (SELECT left(m.message_text, 120) FROM public.sales_messages m
             WHERE m.conversation_id = e.id AND m.sender_type = 'user'
               AND COALESCE(m.message_type, 'text') <> 'comment'
             ORDER BY m.created_at DESC LIMIT 1) AS texto
      FROM esperan e
     WHERE e.dm_at > now() - interval '24 hours'
       AND e.dm_at <= now() - interval '1 hour'
       AND NOT EXISTS (SELECT 1 FROM public.sales_messages a
                        WHERE a.conversation_id = e.id AND a.sender_type = 'agent'
                          AND a.status IN ('sent', 'queued') AND a.created_at > e.dm_at)
  LOOP
    v_tipo := CASE WHEN r.dm_at <= now() - interval '20 hours' THEN 'quedan_4h' ELSE 'espera_1h' END;
    -- Aparta el aviso; si ya estaba, no se repite.
    INSERT INTO public.omni_avisos_ventana (conversation_id, tipo, dm_at)
    VALUES (r.id, v_tipo, r.dm_at)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      -- El de 1 h ya no tiene sentido si se pasó directo al de 4 h.
      IF v_tipo = 'quedan_4h' THEN
        INSERT INTO public.omni_avisos_ventana (conversation_id, tipo, dm_at)
        VALUES (r.id, 'espera_1h', r.dm_at) ON CONFLICT DO NOTHING;
      END IF;
      v_out := v_out || jsonb_build_object(
        'conversation_id', r.id, 'tipo', v_tipo, 'dm_at', r.dm_at,
        'plataforma', r.platform, 'cliente', COALESCE(NULLIF(btrim(r.customer_name), ''), 'Un cliente'),
        'texto', COALESCE(r.texto, ''),
        'minutos_quedan', greatest(0, floor(extract(epoch FROM (r.dm_at + interval '24 hours' - now())) / 60))::int,
        'minutos_espera', floor(extract(epoch FROM (now() - r.dm_at)) / 60)::int);
    END IF;
  END LOOP;
  RETURN v_out;
END $$;

-- Si Telegram no lo recibió, se suelta para que el próximo intento lo mande.
CREATE OR REPLACE FUNCTION public.omni_avisos_ventana_soltar(p_conversation_id uuid, p_tipo text, p_dm_at timestamptz)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
  DELETE FROM public.omni_avisos_ventana
   WHERE conversation_id = p_conversation_id AND tipo = p_tipo AND dm_at = p_dm_at
     AND enviado_at > now() - interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.omni_avisos_ventana_tomar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.omni_avisos_ventana_soltar(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_avisos_ventana_tomar() TO service_role;
GRANT EXECUTE ON FUNCTION public.omni_avisos_ventana_soltar(uuid, text, timestamptz) TO service_role;

-- Lo que pg_cron llama (como crm_clasificador_llamar: la llave anon solo
-- abre la puerta; la función trabaja con la de servicio).
CREATE OR REPLACE FUNCTION public.omni_avisos_ventana_llamar()
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT net.http_post(
    url     := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/omni-avisos-ventana',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000)
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('omni-avisos-ventana') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'omni-avisos-ventana');
  PERFORM cron.schedule('omni-avisos-ventana', '*/5 * * * *', 'SELECT public.omni_avisos_ventana_llamar()');
END $$;

SELECT public.registrar_migracion('omni_avisos_ventana.sql');

-- Verificación
SELECT (SELECT schedule FROM cron.job WHERE jobname = 'omni-avisos-ventana') AS cada,
       to_regclass('public.omni_avisos_ventana') IS NOT NULL AS tabla;
