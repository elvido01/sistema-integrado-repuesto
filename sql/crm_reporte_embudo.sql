-- =====================================================================
-- CRM: "Dónde se te caen las ventas" (12/11/2026)
-- ---------------------------------------------------------------------
-- Idea del video del "ARM": a fin de mes el sistema te dice en qué paso
-- del embudo se pierden los clientes. Los datos ya existían (mensajes,
-- etapas del clasificador y su historial); faltaba juntarlos.
--
-- · crm_reporte_embudo(tenant, desde, hasta): los números de un período.
--     llegaron      clientes que escribieron en el período (sin spam)
--     contestadas   a los que la tienda les respondió después
--     sin_contestar los que tienen la última palabra (escribieron en las últimas 48 h)
--     preguntaron   llegaron a "interesado" o más (pidieron una pieza)
--     cotizados     llegaron a "cotizado" o más (se les dio precio)
--     listos        llegaron a "listo para comprar" o más
--     ganados       llegaron a "ganado"
--     perdidos / no_lo_tenemos (+ las piezas que más pidieron y no había)
--     respuesta: mediana de minutos hasta la primera respuesta y cuántas en
--       ≤15 min (sin TikTok: el espejo no trae la hora real); aparte IG/Messenger
--     calificados: los que dijeron para CUÁNDO lo necesitan (nuevo en el
--       clasificador: campos cuando / presupuesto)
--     paso_flojo: el paso con peor conversión (con 3+ clientes de base)
-- · crm_reporte_embudo_mio(dias): lo mismo para la pantalla del Embudo
--   (empresa activa del usuario).
-- · crm_reporte_tomar(): lo llama omni-avisos-ventana cada 5 min; los
--   lunes desde las 8 am entrega el de la semana pasada y el día 1 el del
--   mes pasado, una sola vez por empresa (crm_reporte_envios). Solo
--   empresas con el clasificador encendido (feat_clasificador_crm).
-- · crm_reporte_soltar(): si Telegram falla, se suelta y sale en la
--   próxima vuelta.
-- Idempotente.
-- =====================================================================

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
               AND COALESCE(a.enviado_en, a.created_at) >= c.primer_msg) AS primera_resp,
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
           count(*) FILTER (WHERE alcanzo >= 1 OR etapa = 'perdido')       AS preguntaron,
           count(*) FILTER (WHERE alcanzo >= 2)                            AS cotizados,
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

-- Para la pantalla del Embudo: la empresa activa del usuario.
CREATE OR REPLACE FUNCTION public.crm_reporte_embudo_mio(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT CASE WHEN public.get_user_tenant() IS NULL THEN NULL ELSE
    public.crm_reporte_embudo(public.get_user_tenant(),
                              now() - make_interval(days => LEAST(GREATEST(COALESCE(p_dias, 30), 1), 90)),
                              now())
  END
$f$;
REVOKE ALL ON FUNCTION public.crm_reporte_embudo_mio(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_reporte_embudo_mio(integer) TO authenticated;

-- Qué reportes ya se mandaron (uno por empresa y período).
CREATE TABLE IF NOT EXISTS public.crm_reporte_envios (
  tenant_id  uuid NOT NULL,
  periodo    text NOT NULL CHECK (periodo IN ('semana', 'mes')),
  desde      date NOT NULL,
  enviado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, periodo, desde)
);
ALTER TABLE public.crm_reporte_envios ENABLE ROW LEVEL SECURITY;  -- solo funciones SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.crm_reporte_tomar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_local timestamp := now() AT TIME ZONE 'America/Santo_Domingo';
  v_hoy   date := v_local::date;
  v_out   jsonb := '[]'::jsonb;
  t record; p record;
  v_desde date; v_hasta date; v_ant date;
BEGIN
  IF extract(hour FROM v_local) < 8 OR extract(hour FROM v_local) >= 22 THEN RETURN v_out; END IF;

  FOR p IN
    SELECT 'semana'::text AS periodo, (v_hoy - 7) AS desde, v_hoy AS hasta, (v_hoy - 14) AS ant
     WHERE extract(isodow FROM v_hoy) = 1
    UNION ALL
    SELECT 'mes', (date_trunc('month', v_hoy) - interval '1 month')::date, date_trunc('month', v_hoy)::date,
           (date_trunc('month', v_hoy) - interval '2 months')::date
     WHERE extract(day FROM v_hoy) = 1
  LOOP
    FOR t IN
      SELECT ce.tenant_id, ce.nombre FROM public.config_empresa ce WHERE ce.feat_clasificador_crm
    LOOP
      INSERT INTO public.crm_reporte_envios (tenant_id, periodo, desde)
      VALUES (t.tenant_id, p.periodo, p.desde)
      ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN CONTINUE; END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'tenant_id', t.tenant_id, 'empresa', t.nombre, 'periodo', p.periodo, 'desde', p.desde,
        'actual', public.crm_reporte_embudo(t.tenant_id,
                    (p.desde::timestamp AT TIME ZONE 'America/Santo_Domingo'),
                    (p.hasta::timestamp AT TIME ZONE 'America/Santo_Domingo')),
        'anterior', public.crm_reporte_embudo(t.tenant_id,
                    (p.ant::timestamp AT TIME ZONE 'America/Santo_Domingo'),
                    (p.desde::timestamp AT TIME ZONE 'America/Santo_Domingo'))));
    END LOOP;
  END LOOP;
  RETURN v_out;
END $f$;
REVOKE ALL ON FUNCTION public.crm_reporte_tomar() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_reporte_soltar(p_tenant uuid, p_periodo text, p_desde date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  DELETE FROM public.crm_reporte_envios WHERE tenant_id = p_tenant AND periodo = p_periodo AND desde = p_desde;
$f$;
REVOKE ALL ON FUNCTION public.crm_reporte_soltar(uuid, text, date) FROM PUBLIC, anon, authenticated;

-- Prueba: los últimos 7 días de cada empresa con el clasificador.
SELECT ce.nombre, public.crm_reporte_embudo(ce.tenant_id, now() - interval '7 days', now()) AS ultimos_7_dias
  FROM public.config_empresa ce WHERE ce.feat_clasificador_crm;

SELECT registrar_migracion('crm_reporte_embudo.sql');
