-- =====================================================================
-- CRM: CLASIFICADOR + EMBUDO QUE SE MUEVE SOLO
-- =====================================================================
-- (07/10/2026) Idea de los videos de Vocero (embudo automatico) y de
-- Hermes + clasificador rapido: un modelo barato lee cada conversacion con
-- mensajes nuevos y decide en que etapa del embudo va el cliente, que pide
-- y que tan cerca esta de comprar. Nadie mueve nada a mano.
--
-- Antes: la intencion salia de palabras clave del PRIMER mensaje (75% caia
-- en 'general'), el espejo (casi todo el trafico) ni la usaba, lead_score
-- estaba en 0 en las 712 conversaciones y se creaba un lead por mensaje
-- (352 'nuevo' en Morla).
--
--   nuevo → interesado → cotizado → listo_para_comprar → ganado
--                                   (perdido · spam a un lado)
--
-- El que trabaja es la Edge Function crm-clasificar (gpt-4o-mini), que el
-- cron llama cada 10 minutos de 7am a 9pm. Aqui vive lo que decide QUE se
-- clasifica y COMO se guarda, con las reglas del embudo.
-- Encendido por empresa: config_empresa.feat_clasificador_crm (Morla = si).
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_clasificador_crm boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_conversations
  ADD COLUMN IF NOT EXISTS etapa text NOT NULL DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS etapa_motivo text,
  ADD COLUMN IF NOT EXISTS etapa_cambiada_at timestamptz,
  ADD COLUMN IF NOT EXISTS etapa_manual_at timestamptz,
  ADD COLUMN IF NOT EXISTS clasificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS clasificacion jsonb;

DO $$ BEGIN
  ALTER TABLE public.sales_conversations ADD CONSTRAINT sales_conversations_etapa_chk
    CHECK (etapa IN ('nuevo','interesado','cotizado','listo_para_comprar','ganado','perdido','spam'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS sales_conversations_etapa_idx
  ON public.sales_conversations (tenant_id, etapa, last_user_message_at DESC);

-- Historial: cada vez que la etapa cambia (robot o persona) y lo que costó.
CREATE TABLE IF NOT EXISTS public.crm_etapa_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  etapa_antes text,
  etapa_despues text NOT NULL,
  motivo text,
  por text NOT NULL DEFAULT 'clasificador',   -- 'clasificador' | 'persona'
  clasificacion jsonb,
  tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_etapa_historial_conv_idx ON public.crm_etapa_historial (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_etapa_historial_tenant_idx ON public.crm_etapa_historial (tenant_id, created_at DESC);

ALTER TABLE public.crm_etapa_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_etapa_historial_tenant ON public.crm_etapa_historial;
CREATE POLICY crm_etapa_historial_tenant ON public.crm_etapa_historial
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

-- Orden del embudo (perdido/spam no tienen orden: son salidas laterales).
CREATE OR REPLACE FUNCTION public._crm_etapa_orden(p text)
 RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'nuevo' THEN 0 WHEN 'interesado' THEN 1 WHEN 'cotizado' THEN 2
                WHEN 'listo_para_comprar' THEN 3 WHEN 'ganado' THEN 4 ELSE NULL END
$$;

-- ── La cola: conversaciones con mensajes del cliente que nadie ha leído ──
-- Se espera 2 minutos desde el último mensaje (que termine de escribir) y
-- solo se miran los últimos 7 días. Devuelve los últimos 12 mensajes.
CREATE OR REPLACE FUNCTION public.crm_clasificar_pendientes(p_limite integer DEFAULT 25, p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'last_user_message_at'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'tenant_id', c.tenant_id, 'platform', c.platform,
      'cliente', c.customer_name, 'etapa', c.etapa,
      'last_user_message_at', c.last_user_message_at,
      'mensajes', (
        SELECT jsonb_agg(jsonb_build_object(
                 'de', CASE WHEN m.sender_type = 'user' THEN 'cliente' ELSE 'tienda' END,
                 'cuando', to_char(m.created_at AT TIME ZONE 'America/Santo_Domingo', 'DD/MM HH24:MI'),
                 'texto', left(COALESCE(NULLIF(m.message_text, ''), '[' || COALESCE(m.message_type, 'adjunto') || ']'), 500))
               ORDER BY m.created_at)
        FROM (SELECT * FROM public.sales_messages m
               WHERE m.conversation_id = c.id AND m.sender_type IN ('user', 'agent', 'assistant')
               ORDER BY m.created_at DESC LIMIT 12) m)
    ) x
    FROM public.sales_conversations c
    JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id AND ce.feat_clasificador_crm
    WHERE c.last_user_message_at > now() - make_interval(days => p_dias)
      AND c.last_user_message_at < now() - interval '2 minutes'
      AND (c.clasificado_at IS NULL OR c.clasificado_at < c.last_user_message_at)
    ORDER BY c.last_user_message_at DESC
    LIMIT p_limite
  ) q
$function$;
REVOKE ALL ON FUNCTION public.crm_clasificar_pendientes(integer, integer) FROM PUBLIC, anon, authenticated;

-- ── Guardar lo que decidió el clasificador, con las reglas del embudo ──
-- * Avanza hacia adelante libremente; no retrocede (un 'gracias' después de
--   cotizar no lo devuelve a 'interesado').
-- * perdido / spam se aceptan siempre que no esté ganado.
-- * Si estaba perdido/spam/ganado y el cliente vuelve con interés nuevo,
--   empieza otra vuelta (se acepta lo que diga el clasificador).
-- * Si una persona movió la etapa en las últimas 48 h, se respeta.
-- * Avisa (campanita a dueño/admin) cuando alguien llega a listo_para_comprar
--   o cuando entra un reclamo.
CREATE OR REPLACE FUNCTION public.crm_guardar_clasificacion(
  p_conversation_id uuid, p_resultado jsonb, p_hasta timestamptz, p_tokens integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.sales_conversations;
  v_nueva text := p_resultado->>'etapa';
  v_final text;
  v_score integer := LEAST(100, GREATEST(0, COALESCE((p_resultado->>'intencion_compra')::numeric, 0)::integer));
  v_cat text := COALESCE(p_resultado->>'categoria', 'otro');
  v_avisar text;
  v_nombre text;
BEGIN
  SELECT * INTO c FROM public.sales_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no existe'); END IF;

  IF v_nueva IS NULL OR v_nueva NOT IN ('nuevo','interesado','cotizado','listo_para_comprar','ganado','perdido','spam') THEN
    v_nueva := c.etapa;
  END IF;
  -- Si la categoría es spam, la etapa también (el modelo a veces deja 'nuevo').
  IF v_cat = 'spam' THEN v_nueva := 'spam'; END IF;

  v_final := c.etapa;
  IF c.etapa_manual_at IS NOT NULL AND c.etapa_manual_at > now() - interval '48 hours' THEN
    v_final := c.etapa;                                   -- la persona manda
  ELSIF c.etapa IN ('perdido', 'spam', 'ganado') THEN
    IF v_nueva <> c.etapa AND (c.etapa <> 'ganado' OR v_nueva NOT IN ('perdido', 'spam')) THEN
      v_final := v_nueva;                                 -- vuelve: otra vuelta
    END IF;
  ELSIF v_nueva IN ('perdido', 'spam') THEN
    v_final := v_nueva;
  ELSIF public._crm_etapa_orden(v_nueva) > public._crm_etapa_orden(c.etapa) THEN
    v_final := v_nueva;                                   -- solo hacia adelante
  END IF;

  UPDATE public.sales_conversations
     SET clasificacion = p_resultado || jsonb_build_object('hasta', p_hasta),
         clasificado_at = GREATEST(COALESCE(p_hasta, now()), COALESCE(clasificado_at, '-infinity')),
         lead_score = v_score,
         intent = CASE v_cat WHEN 'precio' THEN 'precio_cotizacion' WHEN 'envio' THEN 'envio_ubicacion'
                             WHEN 'reclamo' THEN 'garantia' ELSE v_cat END,
         etapa = v_final,
         etapa_motivo = CASE WHEN v_final <> c.etapa THEN p_resultado->>'motivo_etapa' ELSE etapa_motivo END,
         etapa_cambiada_at = CASE WHEN v_final <> c.etapa THEN now() ELSE etapa_cambiada_at END
   WHERE id = c.id;

  IF v_final <> c.etapa THEN
    INSERT INTO public.crm_etapa_historial (tenant_id, conversation_id, etapa_antes, etapa_despues, motivo, por, clasificacion, tokens)
    VALUES (c.tenant_id, c.id, c.etapa, v_final, p_resultado->>'motivo_etapa', 'clasificador', p_resultado, p_tokens);
  END IF;

  v_nombre := COALESCE(NULLIF(c.customer_name, ''), 'Un cliente') || ' (' || c.platform || ')';
  IF v_final = 'listo_para_comprar' AND c.etapa <> 'listo_para_comprar' THEN
    v_avisar := format('🛒 %s quiere comprar: %s', v_nombre,
                       COALESCE(p_resultado->>'producto', p_resultado->>'resumen', ''));
  ELSIF v_cat = 'reclamo' AND COALESCE(c.clasificacion->>'categoria', '') <> 'reclamo' THEN
    v_avisar := format('⚠️ Reclamo de %s: %s', v_nombre, COALESCE(p_resultado->>'resumen', ''));
  END IF;

  IF v_avisar IS NOT NULL THEN
    INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
    SELECT c.tenant_id, p.id, 'crm_embudo', left(v_avisar, 120),
           COALESCE(p_resultado->>'siguiente_paso', '')
      FROM public.profiles p
     WHERE p.tenant_id = c.tenant_id AND p.role IN ('owner', 'admin');
  END IF;

  RETURN jsonb_build_object('ok', true, 'antes', c.etapa, 'despues', v_final, 'aviso', v_avisar IS NOT NULL);
END $function$;
REVOKE ALL ON FUNCTION public.crm_guardar_clasificacion(uuid, jsonb, timestamptz, integer) FROM PUBLIC, anon, authenticated;

-- ── Una persona mueve la etapa a mano (desde el embudo) ──
CREATE OR REPLACE FUNCTION public.crm_mover_etapa(p_conversation_id uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.sales_conversations;
BEGIN
  IF p_etapa NOT IN ('nuevo','interesado','cotizado','listo_para_comprar','ganado','perdido','spam') THEN
    RAISE EXCEPTION 'Etapa no válida: %', p_etapa;
  END IF;
  SELECT * INTO c FROM public.sales_conversations
   WHERE id = p_conversation_id AND tenant_id = public.get_user_tenant() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
  UPDATE public.sales_conversations
     SET etapa = p_etapa, etapa_manual_at = now(), etapa_cambiada_at = now(),
         etapa_motivo = 'Movida a mano'
   WHERE id = c.id;
  IF p_etapa <> c.etapa THEN
    INSERT INTO public.crm_etapa_historial (tenant_id, conversation_id, etapa_antes, etapa_despues, motivo, por)
    VALUES (c.tenant_id, c.id, c.etapa, p_etapa, 'Movida a mano', 'persona');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;
REVOKE ALL ON FUNCTION public.crm_mover_etapa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_mover_etapa(uuid, text) TO authenticated;

-- ── Cada 10 minutos, 7am–9pm hora DO (11–01 UTC) ──
-- Misma forma que el publicador: net.http_post con la anon key, copiada de
-- equipo_nube_llamar para no escribirla en el repositorio. Llamarla de más
-- no hace daño: solo clasifica lo que está pendiente.
DO $cron$
DECLARE v_key text;
BEGIN
  v_key := substring(pg_get_functiondef('public.equipo_nube_llamar'::regproc)
                     from 'Bearer (eyJ[A-Za-z0-9_.-]+)');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'No encontré la anon key en equipo_nube_llamar.';
  END IF;
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.crm_clasificador_llamar()
    RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $b$
      SELECT net.http_post(
        url     := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/crm-clasificar',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L),
        body    := '{}'::jsonb,
        timeout_milliseconds := 5000)
    $b$;
  $f$, v_key);
END
$cron$;
REVOKE ALL ON FUNCTION public.crm_clasificador_llamar() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'crm-clasificador';
SELECT cron.schedule('crm-clasificador', '*/10 0,1,11-23 * * *', 'SELECT public.crm_clasificador_llamar()');

-- Morla primero (las demás empresas se encienden cuando el dueño lo pida).
UPDATE public.config_empresa SET feat_clasificador_crm = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('crm_clasificador_embudo.sql');
