-- =====================================================================
-- Lo que contestaste y no salio
-- ---------------------------------------------------------------------
-- (2026-08-27) El dueno aviso de que los mensajes de TikTok dejan de
-- aparecer. Buscando eso aparecio algo peor.
--
-- Hoy a las 06:49 p.m. se contesto por el panel a un cliente que pregunto
-- por el ciguenal de una TVS Stryker 125. El mensaje se ve en el hilo,
-- verde, con su hora, igual que cualquier otro. Nunca salio:
--
--   status = 'failed'   dispatch_error = 'canal_no_meta'
--
-- El despachador (meta-send-queued) solo sabe hablar con Meta. Un mensaje
-- de TikTok entra ahi y muere. Y no muere callado a medias: muere DEJANDO
-- LA CONVERSACION MARCADA COMO RESPONDIDA.
--
--   last_user_message_at   22/08 15:46
--   last_agent_message_at  27/08 18:49   <- el que no salio
--
-- Con eso la conversacion se cae del filtro "Sin responder". El cliente
-- espera, el vendedor cree que contesto, y el sistema esta convencido de
-- que ese hilo ya se atendio. Nadie vuelve a mirarlo nunca.
--
-- >>> CUANTOS <<<
-- 23 respuestas en 60 dias que nadie recibio:
--
--   tiktok     14   canal_no_meta      (el despachador no sabe de TikTok)
--   instagram   7   meta_400           (Meta las rechazo)
--   instagram   2   nunca_se_despacho  (se quedaron en cola)
--
-- El panel SI ensena un aviso al fallar, pero es una linea arriba del todo
-- que se borra sola en el siguiente refresco. Lo que queda guardado --el
-- globo verde en el hilo-- no dice nada. Un aviso que dura diez segundos
-- contra un registro que miente para siempre.
--
-- Esto no arregla el envio: arreglar el envio de TikTok es la integracion
-- oficial y eso lleva su tiempo. Esto hace que no se pierda ni uno
-- mientras tanto.
--
-- Idempotente. Requiere centinelas_del_flujo.sql.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.centinela_respuesta_no_salio(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH ultima_agente AS (
    -- La ULTIMA respuesta de cada conversacion. Si esa fallo, el cliente
    -- se quedo sin contestar por mucho que antes se le hablara bien.
    SELECT DISTINCT ON (m.conversation_id)
           m.conversation_id, m.platform, m.status, m.created_at,
           m.message_text, m.raw_data ->> 'dispatch_error' AS motivo
    FROM public.sales_messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.sender_type = 'agent'
      AND m.created_at >= now() - interval '60 days'
    ORDER BY m.conversation_id, m.created_at DESC
  )
  SELECT
    u.conversation_id::text,
    format('%s: le contestaste a un cliente y el mensaje no salio', upper(u.platform)),
    format('%s -- el %s se le respondio "%s" y NO salio (%s). %s La conversacion figura como respondida, asi que se cayo del filtro "Sin responder": si no se entra a %s a mano, ese cliente no recibe nada.',
           upper(u.platform),
           to_char(u.created_at AT TIME ZONE 'America/Santo_Domingo', 'DD/MM'),
           left(regexp_replace(COALESCE(u.message_text, ''), '[\n\r]+', ' ', 'g'), 45),
           CASE u.motivo
             WHEN 'canal_no_meta'     THEN 'el despachador solo habla con Meta y TikTok no pasa por ahi'
             WHEN 'meta_400'          THEN 'Meta lo rechazo, casi siempre por la ventana de 24 horas vencida'
             WHEN 'nunca_se_despacho' THEN 'se quedo en cola y nadie lo mando'
             ELSE COALESCE(u.motivo, 'sin motivo anotado')
           END,
           CASE WHEN c.last_user_message_at IS NOT NULL
                THEN format('El cliente escribio el %s y sigue esperando.',
                            to_char(c.last_user_message_at AT TIME ZONE 'America/Santo_Domingo', 'DD/MM'))
                ELSE '' END,
           u.platform),
    NULL::numeric,
    jsonb_build_object('canal', u.platform, 'motivo', u.motivo,
                       'cliente', c.customer_external_id,
                       'conversacion', u.conversation_id,
                       'cuando', u.created_at)
  FROM ultima_agente u
  JOIN public.sales_conversations c ON c.id = u.conversation_id
  WHERE u.status = 'failed'
  ORDER BY u.created_at DESC;
$fn$;

INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('respuesta_no_salio', 'Contestaste y el mensaje no salio',
   'fuga', 'rojo', 'centinela_respuesta_no_salio',
   'La ultima respuesta de la conversacion fallo al enviarse, pero dejo el hilo marcado como respondido. El cliente espera y el filtro "Sin responder" ya no lo ensena.', 12)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

-- ---------------------------------------------------------------------
-- Y el canal mudo, que se dejo enganar por nuestro propio mensaje
-- ---------------------------------------------------------------------
-- El centinela de canales callados contaba TODOS los mensajes de la tabla.
-- Hoy a las 06:49 p.m. se guardo esa respuesta de TikTok que no salio, y
-- con eso el centinela dio TikTok por vivo: "recibio algo hoy".
--
-- No recibio nada. Lo escribimos nosotros, y ademas se quedo sin enviar.
--
-- Un canal esta vivo cuando ENTRA algo. Lo que sale no prueba nada del
-- puente: en TikTok e Instagram el puente solo captura lo que llega.
--
-- Se ve en los numeros: el 24/08 este centinela llego a decir "TIKTOK
-- lleva 5 dias sin recibir un mensaje", vivio siete minutos y se murio
-- solo cuando alguien abrio TikTok. Nunca se aviso (avisado_en NULL): el
-- resumen sale a las 8:30 a.m. y para entonces el hallazgo ya no existia.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.centinela_canal_mudo(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH dias AS (
    SELECT m.platform,
           (COALESCE(m.enviado_en, m.created_at) AT TIME ZONE 'America/Santo_Domingo')::date AS d
    FROM public.sales_messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.sender_type = 'user'   -- solo lo que ENTRA
      AND COALESCE(m.enviado_en, m.created_at) >= now() - interval '120 days'
    GROUP BY 1, 2
  ),
  huecos AS (
    SELECT platform, d - lag(d) OVER (PARTITION BY platform ORDER BY d) AS h
    FROM dias
  ),
  ritmo AS (
    SELECT platform,
           count(*) FILTER (WHERE h IS NOT NULL) AS n_huecos,
           COALESCE(max(h), 0)                   AS hueco_mayor
    FROM huecos GROUP BY platform
  ),
  vol AS (
    SELECT m.platform,
           count(*) AS total,
           max(COALESCE(m.enviado_en, m.created_at)) AS ultimo
    FROM public.sales_messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.sender_type = 'user'
    GROUP BY 1
  ),
  juicio AS (
    SELECT v.platform, v.total, v.ultimo,
           (CURRENT_DATE - (v.ultimo AT TIME ZONE 'America/Santo_Domingo')::date) AS callado,
           CASE
             WHEN r.n_huecos >= 5 THEN GREATEST(r.hueco_mayor + 1, 3)
             ELSE 3
           END AS umbral,
           r.hueco_mayor, r.n_huecos
    FROM vol v
    LEFT JOIN ritmo r ON r.platform = v.platform
    WHERE v.total >= 20
  )
  SELECT
    j.platform,
    format('%s lleva %s dias sin recibir un mensaje', upper(j.platform), j.callado),
    format('%s no recibe nada de un cliente desde el %s (%s dias). %s %s',
           upper(j.platform),
           to_char(j.ultimo AT TIME ZONE 'America/Santo_Domingo', 'DD/MM'),
           j.callado,
           CASE WHEN j.n_huecos >= 5
                THEN format('Lo normal en este canal es que no pase de %s dias.', j.hueco_mayor)
                ELSE 'Este canal no tiene todavia historial suficiente para saber su ritmo.' END,
           CASE
             WHEN j.platform IN ('tiktok', 'instagram')
               THEN format('Este puente solo funciona con %s.com abierto en el navegador: si la pestana esta cerrada, no entra nada.',
                           j.platform)
             WHEN j.platform = 'whatsapp'
               THEN 'Revisa que WhatsApp Web tenga la sesion iniciada y el panel abierto.'
             ELSE ''
           END),
    NULL::numeric,
    jsonb_build_object('canal', j.platform, 'dias_callado', j.callado,
                       'umbral_dias', j.umbral, 'hueco_normal', j.hueco_mayor,
                       'ultimo_mensaje', j.ultimo, 'mensajes_totales', j.total)
  FROM juicio j
  WHERE j.callado > j.umbral
  ORDER BY j.callado DESC;
$fn$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('lo_que_contestaste_no_salio.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Los clientes que se quedaron esperando, y el canal que de verdad esta mudo.
SELECT 'sin contestar' AS que,
       (h).datos ->> 'canal'   AS canal,
       (h).datos ->> 'motivo'  AS motivo,
       (h).datos ->> 'cliente' AS cliente,
       to_char(((h).datos ->> 'cuando')::timestamptz AT TIME ZONE 'America/Santo_Domingo', 'DD/MM HH24:MI') AS cuando
FROM (SELECT public.centinela_respuesta_no_salio('00000000-0000-0000-0000-000000000001'::uuid) h) t
UNION ALL
SELECT 'canal mudo', (h).huella, (h).titulo, NULL, NULL
FROM (SELECT public.centinela_canal_mudo('00000000-0000-0000-0000-000000000001'::uuid) h) t2
ORDER BY 1, 5 DESC NULLS FIRST;
