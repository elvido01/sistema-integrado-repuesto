-- =====================================================================
-- CRM: "cliente caliente esperando" (12/11/2026)
-- ---------------------------------------------------------------------
-- Punto 2 de la propuesta del video del "ARM": el que está listo para
-- comprar no puede esperar. Si un cliente CALIENTE lleva 15 minutos o más
-- con la última palabra, llega un aviso por Telegram (mismo bot y misma
-- vuelta de 5 min que omni-avisos-ventana).
--
-- Caliente = cualquiera de:
--   · el clasificador le da 70+ de intención de compra (lead_score)
--   · dijo que lo necesita HOY (clasificacion->>'cuando' = 'hoy')
--   · ya tiene precio o está listo (etapa cotizado / listo_para_comprar)
-- Y además: no es spam/perdido/ganado, esperando entre 15 min y 12 h,
-- de 8 am a 8 pm (hora RD), empresa con el clasificador encendido.
--
-- Un aviso por "espera" (conversación + hora del último mensaje del
-- cliente): si vuelve a escribir después de que le contesten, es otra.
-- No repite lo que ya avisó un caso del CRM en las últimas 2 horas.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_calientes_avisos (
  conversation_id uuid NOT NULL,
  user_msg_at     timestamptz NOT NULL,
  tenant_id       uuid NOT NULL,
  avisado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_msg_at)
);
ALTER TABLE public.crm_calientes_avisos ENABLE ROW LEVEL SECURITY;  -- solo funciones SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.crm_calientes_tomar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_hora int := extract(hour FROM now() AT TIME ZONE 'America/Santo_Domingo');
  v_out jsonb;
BEGIN
  IF v_hora < 8 OR v_hora >= 20 THEN RETURN '[]'::jsonb; END IF;

  WITH cand AS (
    SELECT c.*
      FROM public.sales_conversations c
      JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id AND ce.feat_clasificador_crm
     WHERE c.last_user_message_at > COALESCE(c.last_agent_message_at, '-infinity')
       AND c.last_user_message_at <  now() - interval '15 minutes'
       AND c.last_user_message_at >  now() - interval '12 hours'
       AND c.etapa IS DISTINCT FROM 'spam' AND c.etapa IS DISTINCT FROM 'perdido' AND c.etapa IS DISTINCT FROM 'ganado'
       -- Clasificada con el último mensaje (o ya lleva media hora: se avisa igual).
       AND (c.clasificado_at >= c.last_user_message_at OR c.last_user_message_at < now() - interval '30 minutes')
       AND (COALESCE(c.lead_score, 0) >= 70
            OR c.clasificacion->>'cuando' = 'hoy'
            OR c.etapa IN ('cotizado', 'listo_para_comprar'))
       AND NOT EXISTS (SELECT 1 FROM public.crm_casos k
                        WHERE k.conversation_id = c.id AND k.estado = 'abierto'
                          AND k.avisado_at > now() - interval '2 hours')
  ), nuevos AS (
    INSERT INTO public.crm_calientes_avisos (conversation_id, user_msg_at, tenant_id)
    SELECT id, last_user_message_at, tenant_id FROM cand
    ON CONFLICT DO NOTHING
    RETURNING conversation_id, user_msg_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'conversation_id', c.id, 'user_msg_at', n.user_msg_at,
           'cliente', COALESCE(NULLIF(btrim(c.customer_name), ''), 'Un cliente'),
           'plataforma', c.platform,
           'minutos', round(extract(epoch FROM now() - c.last_user_message_at) / 60),
           'puntaje', c.lead_score, 'etapa', c.etapa,
           'producto', c.clasificacion->>'producto', 'moto', c.clasificacion->>'moto',
           'cuando', c.clasificacion->>'cuando', 'presupuesto', c.clasificacion->>'presupuesto',
           'presupuesto_detalle', c.clasificacion->>'presupuesto_detalle',
           'resumen', c.clasificacion->>'resumen', 'siguiente_paso', c.clasificacion->>'siguiente_paso',
           'ultimo', left(c.last_message_preview, 140)) ORDER BY c.lead_score DESC NULLS LAST), '[]'::jsonb)
    INTO v_out
    FROM nuevos n JOIN public.sales_conversations c ON c.id = n.conversation_id;
  RETURN v_out;
END $f$;
REVOKE ALL ON FUNCTION public.crm_calientes_tomar() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_calientes_soltar(p_conversation_id uuid, p_user_msg_at timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  DELETE FROM public.crm_calientes_avisos WHERE conversation_id = p_conversation_id AND user_msg_at = p_user_msg_at;
$f$;
REVOKE ALL ON FUNCTION public.crm_calientes_soltar(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Prueba: cuántos clientes calientes están esperando ahora (solo cuenta; el
-- aviso lo manda omni-avisos-ventana en su próxima vuelta).
SELECT count(*) AS conversaciones_en_espera_caliente
  FROM public.sales_conversations c
  JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id AND ce.feat_clasificador_crm
 WHERE c.last_user_message_at > COALESCE(c.last_agent_message_at, '-infinity')
   AND c.last_user_message_at > now() - interval '12 hours'
   AND (COALESCE(c.lead_score, 0) >= 70 OR c.clasificacion->>'cuando' = 'hoy' OR c.etapa IN ('cotizado', 'listo_para_comprar'));

SELECT registrar_migracion('crm_cliente_caliente_esperando.sql');
