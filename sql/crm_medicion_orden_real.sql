-- =====================================================================
-- CRM: arreglar la base de las mediciones (12/11/2026)
-- ---------------------------------------------------------------------
-- Al revisar los chats reales de Morla salieron tres fallas de medición:
-- 1. ORDEN. El clasificador y el seguimiento automático ordenaban los
--    mensajes por la hora en que el espejo los COPIÓ (created_at), no por
--    la hora real (enviado_en): en 93 de 133 conversaciones el chat se
--    leía revuelto. Ahora: hora real, y en empate la de copia.
--    · crm_clasificar_pendientes  · crm_seguimientos_automaticos
-- 2. SALUDO AUTOMÁTICO. "Gracias por comunicarte con…", "En este momento
--    no podemos responder…" y el aviso de TikTok "Se aceptó la solicitud…"
--    contaban como que la tienda contestó. _crm_msg_automatico los saca de
--    "contestados" y del tiempo de respuesta.
-- 3. PRECIO DADO. "Con precio" dependía de que la etapa llegara a
--    'cotizado'; si el cliente preguntaba otra pieza después, se perdía.
--    Ahora cuenta el campo nuevo del clasificador (tienda_dio_precio) y,
--    en lo clasificado antes, si la tienda escribió un precio
--    (crm_texto_es_precio).
-- Lo que sigue sin verse: los AUDIOS (38 % de lo que escribe el cliente).
-- Las funciones son las de producción de hoy con solo esos cambios.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._crm_msg_automatico(p_texto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT COALESCE(p_texto, '') ~* '^\s*(gracias por comunicarte con|gracias por tu mensaje\. en este momento|se aceptó la solicitud de envío de mensajes)'
$f$;

-- 1a. La cola del clasificador: los últimos 12 mensajes por su hora real.
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
                 'cuando', to_char(COALESCE(m.enviado_en, m.created_at) AT TIME ZONE 'America/Santo_Domingo', 'DD/MM HH24:MI'),
                 'texto', left(COALESCE(NULLIF(m.message_text, ''), '[' || COALESCE(m.message_type, 'adjunto') || ']'), 500))
               ORDER BY COALESCE(m.enviado_en, m.created_at), m.created_at)
        FROM (SELECT * FROM public.sales_messages m
               WHERE m.conversation_id = c.id AND m.sender_type IN ('user', 'agent', 'assistant')
               ORDER BY COALESCE(m.enviado_en, m.created_at) DESC, m.created_at DESC LIMIT 12) m)
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

-- 1b. El seguimiento de "precio sin respuesta", por la hora real.
CREATE OR REPLACE FUNCTION public.crm_seguimientos_automaticos()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- (12/11/2026) Todo por la HORA REAL del mensaje (enviado_en) y no por la hora
-- en que el espejo lo copio (created_at): en 93 de 133 conversaciones el orden
-- por copia salia revuelto. Empate (WhatsApp da la hora al minuto): la copia.
DECLARE
  v_hoy     date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_creados int := 0;
  v_quitados int := 0;
  r record;
BEGIN
  -- a) El cliente volvio a escribir: el seguimiento automatico que nadie
  --    toco sobra. Si alguien lo movio o le puso nota (actualizado_en
  --    cambio), es trabajo de una persona y se respeta.
  WITH q AS (
    DELETE FROM public.crm_seguimiento s
     WHERE s.creado_por = 'auto'
       AND s.estado = 'precio_enviado'
       AND s.actualizado_en = s.creado_en
       AND s.conversation_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.sales_messages m
                    WHERE m.conversation_id = s.conversation_id
                      AND m.sender_type = 'user'
                      AND COALESCE(m.enviado_en, m.created_at) > s.creado_en)
    RETURNING 1)
  SELECT count(*) INTO v_quitados FROM q;

  -- b) Precio dado hace 18 h a 7 dias, y el cliente callado desde entonces.
  FOR r IN
    WITH precio AS (
      SELECT DISTINCT ON (m.conversation_id)
             m.conversation_id, m.tenant_id, m.message_text,
             COALESCE(m.enviado_en, m.created_at) AS created_at, m.created_at AS copiado_at
        FROM public.sales_messages m
        JOIN public.config_empresa ce
          ON ce.tenant_id = m.tenant_id AND ce.feat_seguimiento_auto
       WHERE m.sender_type <> 'user'
         AND COALESCE(m.status, '') <> 'failed'   -- lo que no salio no es precio dado
         AND COALESCE(m.enviado_en, m.created_at) > now() - interval '7 days'
         AND COALESCE(m.enviado_en, m.created_at) < now() - interval '18 hours'
         AND public.crm_texto_es_precio(m.message_text)
       ORDER BY m.conversation_id, COALESCE(m.enviado_en, m.created_at) DESC, m.created_at DESC
    )
    SELECT p.*, c.platform, c.customer_name, c.customer_phone, c.cliente_id,
           (SELECT left(regexp_replace(u.message_text, '\s+', ' ', 'g'), 120)
              FROM public.sales_messages u
             WHERE u.conversation_id = p.conversation_id
               AND u.sender_type = 'user' AND (COALESCE(u.enviado_en, u.created_at), u.created_at) < (p.created_at, p.copiado_at)
               AND COALESCE(btrim(u.message_text), '') <> ''
             ORDER BY COALESCE(u.enviado_en, u.created_at) DESC, u.created_at DESC LIMIT 1) AS pregunta
      FROM precio p
      JOIN public.sales_conversations c ON c.id = p.conversation_id
     WHERE NOT EXISTS (SELECT 1 FROM public.sales_messages u
                        WHERE u.conversation_id = p.conversation_id
                          AND u.sender_type = 'user'
                          AND (COALESCE(u.enviado_en, u.created_at), u.created_at) > (p.created_at, p.copiado_at))
       -- Uno por precio: si ya hay uno abierto de esa conversacion, o uno
       -- (abierto o cerrado) creado despues de ese precio, no se repite. Asi
       -- un "No quiso" no resucita en la ronda siguiente.
       AND NOT EXISTS (SELECT 1 FROM public.crm_seguimiento s
                        WHERE s.tenant_id = p.tenant_id
                          AND s.conversation_id = p.conversation_id
                          AND (s.estado NOT IN ('comprado', 'perdido')
                               OR s.creado_en > p.created_at))
       -- Y si esa persona ya tiene un seguimiento abierto por otro lado (a
       -- mano, por Hermes), no se le pone un segundo.
       AND NOT EXISTS (SELECT 1 FROM public.crm_seguimiento s
                        WHERE s.tenant_id = p.tenant_id
                          AND c.customer_phone IS NOT NULL
                          AND s.telefono = c.customer_phone
                          AND s.estado NOT IN ('comprado', 'perdido'))
  LOOP
    INSERT INTO public.crm_seguimiento (
      tenant_id, conversation_id, cliente_id, cliente_nombre, telefono,
      canal_origen, producto_consultado, estado, prioridad,
      proxima_accion, fecha_seguimiento, notas, creado_por
    ) VALUES (
      r.tenant_id, r.conversation_id, r.cliente_id,
      COALESCE(NULLIF(btrim(r.customer_name), ''), r.customer_phone, 'Cliente'),
      r.customer_phone,
      CASE WHEN r.platform IN ('whatsapp','instagram','facebook','tiktok')
           THEN r.platform ELSE 'otro' END,
      r.pregunta,
      'precio_enviado', 'media',
      'Le diste precio y no volvió a escribir. Pregúntale si todavía lo necesita.',
      v_hoy,
      to_char(r.created_at AT TIME ZONE 'America/Santo_Domingo', 'DD/MM HH24:MI')
        || ' precio que le diste: «' || left(regexp_replace(r.message_text, '\s+', ' ', 'g'), 160) || '»',
      'auto'
    )
    ON CONFLICT DO NOTHING;
    IF FOUND THEN v_creados := v_creados + 1; END IF;

    UPDATE public.sales_conversations
       SET status = 'seguimiento', updated_at = now()
     WHERE id = r.conversation_id AND status IN ('nuevo', 'en_atencion');
  END LOOP;

  RETURN json_build_object('creados', v_creados, 'quitados', v_quitados);
END $function$;

-- 2 y 3. El reporte: sin saludos automáticos y con "la tienda dio precio".
CREATE OR REPLACE FUNCTION public.crm_reporte_embudo(p_tenant uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  WITH c AS (
    SELECT c.id, c.platform, c.etapa, c.etapa_motivo, c.clasificacion, c.last_user_message_at, c.last_agent_message_at,
           (SELECT min(COALESCE(m.enviado_en, m.created_at)) FROM public.sales_messages m
             WHERE m.conversation_id = c.id AND m.sender_type = 'user'
               AND COALESCE(m.enviado_en, m.created_at) >= p_desde
               AND COALESCE(m.enviado_en, m.created_at) <  p_hasta) AS primer_msg
      FROM public.sales_conversations c
     WHERE c.tenant_id = p_tenant
       AND c.etapa IS DISTINCT FROM 'spam'
       AND c.last_user_message_at >= p_desde
  ), d AS (
    SELECT c.*,
           (SELECT min(COALESCE(a.enviado_en, a.created_at)) FROM public.sales_messages a
             WHERE a.conversation_id = c.id AND a.sender_type IN ('agent', 'assistant')
               AND a.status IS DISTINCT FROM 'failed'
               AND NOT public._crm_msg_automatico(a.message_text)   -- el saludo automático no es contestar
               AND COALESCE(a.enviado_en, a.created_at) >= c.primer_msg) AS primera_resp,
           -- ¿La tienda le dio precio? Lo dice el clasificador (tienda_dio_precio,
           -- desde 12/11); en las conversaciones clasificadas antes, se mira si
           -- algún mensaje de la tienda trae un precio escrito.
           CASE WHEN c.clasificacion ? 'tienda_dio_precio'
                THEN COALESCE((c.clasificacion->>'tienda_dio_precio')::boolean, false)
                ELSE EXISTS (SELECT 1 FROM public.sales_messages a
                              WHERE a.conversation_id = c.id AND a.sender_type IN ('agent', 'assistant')
                                AND a.status IS DISTINCT FROM 'failed'
                                AND NOT public._crm_msg_automatico(a.message_text)
                                AND public.crm_texto_es_precio(a.message_text)) END AS dio_precio,
           GREATEST(COALESCE(public._crm_etapa_orden(c.etapa), 0),
                    COALESCE((SELECT max(public._crm_etapa_orden(h.etapa_despues))
                                FROM public.crm_etapa_historial h
                               WHERE h.conversation_id = c.id AND h.created_at < p_hasta), 0)) AS alcanzo
      FROM c
     WHERE c.primer_msg IS NOT NULL
  ), n AS (
    SELECT count(*)                                                        AS llegaron,
           count(*) FILTER (WHERE primera_resp IS NOT NULL)                AS contestadas,
           -- Esperando de verdad: el cliente tiene la última palabra y fue en
           -- las últimas 48 h (los viejos suelen ser un "ok, gracias").
           count(*) FILTER (WHERE last_user_message_at > COALESCE(last_agent_message_at, '-infinity')
                              AND last_user_message_at > now() - interval '48 hours') AS sin_contestar,
           count(*) FILTER (WHERE alcanzo >= 1 OR etapa = 'perdido' OR dio_precio) AS preguntaron,
           count(*) FILTER (WHERE alcanzo >= 2 OR dio_precio)              AS cotizados,
           count(*) FILTER (WHERE alcanzo >= 3)                            AS listos,
           count(*) FILTER (WHERE alcanzo >= 4)                            AS ganados,
           count(*) FILTER (WHERE etapa = 'perdido')                       AS perdidos,
           count(*) FILTER (WHERE etapa = 'perdido' AND etapa_motivo ILIKE 'no lo tenemos%') AS no_lo_tenemos,
           count(*) FILTER (WHERE clasificacion->>'cuando' IN ('hoy', 'esta_semana', 'sin_prisa')) AS dijeron_cuando,
           count(*) FILTER (WHERE clasificacion->>'cuando' = 'hoy')       AS para_hoy,
           -- TikTok no entra en el tiempo de respuesta: el espejo le pone la
           -- hora en que copia el mensaje, no la real.
           percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM primera_resp - primer_msg) / 60)
             FILTER (WHERE primera_resp IS NOT NULL AND platform <> 'tiktok') AS mediana_min,
           count(*) FILTER (WHERE primera_resp IS NOT NULL AND platform <> 'tiktok') AS medidas_resp,
           count(*) FILTER (WHERE primera_resp IS NOT NULL AND platform <> 'tiktok'
                              AND primera_resp - primer_msg <= interval '15 minutes') AS en_15min,
           -- Instagram/Messenger por separado: ahí es donde más se tarda.
           percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM primera_resp - primer_msg) / 60)
             FILTER (WHERE primera_resp IS NOT NULL AND platform IN ('instagram', 'facebook')) AS mediana_min_ig
      FROM d
  ), pasos AS (
    SELECT * FROM (VALUES
      ('contestar', 'Contestarles',              (SELECT contestadas FROM n), (SELECT llegaron FROM n)),
      ('precio',    'Darles precio',             (SELECT cotizados FROM n),   (SELECT preguntaron FROM n)),
      ('cierre',    'Cerrar después del precio', (SELECT ganados FROM n),     (SELECT cotizados FROM n))
    ) v(paso, nombre, pasaron, base)
  ), flojo AS (
    SELECT paso, nombre, pasaron, base, round(100.0 * pasaron / base) AS pct
      FROM pasos WHERE base >= 3
     ORDER BY pasaron::numeric / base, base DESC
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'llegaron', n.llegaron, 'contestadas', n.contestadas, 'sin_contestar', n.sin_contestar,
    'preguntaron', n.preguntaron, 'cotizados', n.cotizados, 'listos', n.listos, 'ganados', n.ganados,
    'perdidos', n.perdidos, 'no_lo_tenemos', n.no_lo_tenemos,
    'dijeron_cuando', n.dijeron_cuando, 'para_hoy', n.para_hoy,
    'mediana_min', round(n.mediana_min::numeric), 'medidas_resp', n.medidas_resp, 'en_15min', n.en_15min,
    'mediana_min_ig', round(n.mediana_min_ig::numeric),
    'piezas_no_tenemos', COALESCE((
       SELECT jsonb_agg(x.pieza ORDER BY x.veces DESC, x.pieza)
         FROM (SELECT btrim(regexp_replace(etapa_motivo, '^no lo tenemos:\s*', '', 'i')) AS pieza, count(*) AS veces
                 FROM d WHERE etapa = 'perdido' AND etapa_motivo ILIKE 'no lo tenemos%'
                GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5) x), '[]'::jsonb),
    'paso_flojo', (SELECT to_jsonb(flojo) FROM flojo)
  )
  FROM n
$f$;
REVOKE ALL ON FUNCTION public.crm_reporte_embudo(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;


-- Prueba: los últimos 30 días de cada empresa con el clasificador.
SELECT ce.nombre, public.crm_reporte_embudo(ce.tenant_id, now() - interval '30 days', now()) AS ultimos_30_dias
  FROM public.config_empresa ce WHERE ce.feat_clasificador_crm;

SELECT registrar_migracion('crm_medicion_orden_real.sql');
