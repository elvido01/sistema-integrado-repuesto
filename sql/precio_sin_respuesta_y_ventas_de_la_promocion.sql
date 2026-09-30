-- =====================================================================
-- Le diste precio y no volvio  +  ¿vendio la promocion?
-- ---------------------------------------------------------------------
-- (2026-09-30) Revision del CRM con datos de produccion (Repuestos Morla):
--
--   * Seguimientos creados a mano ....... 1 en total (julio)
--   * Cotizaciones enganchadas a un chat  1 en total (mayo)
--   * Facturas de septiembre ............ 402, todas "tienda"
--
-- Las herramientas estaban; lo que faltaba era tiempo en el mostrador para
-- usarlas. El precio se da ESCRIBIENDOLO en el chat ("3,650", "a 545"), no
-- con el boton de cotizar, y nadie para a crear un seguimiento.
--
-- Se probo tambien atribuir la venta por el TELEFONO del cliente: de 905
-- facturas en 60 dias solo 39 tienen cliente con telefono y NINGUNA cruza
-- con un chat (el mostrador factura a generico). Por eso no esta aqui.
--
-- Esto hace dos cosas que no le piden un clic a nadie:
--
-- 1) SEGUIMIENTO AUTOMATICO. Cada hora se buscan conversaciones donde le
--    dimos precio y el cliente no volvio a escribir en 18 horas. Se crea un
--    seguimiento (creado_por='auto', estado 'precio_enviado') que aparece en
--    "Seguimientos de hoy" de la extension y de la web, con los mismos
--    botones: Compro / No quiso / Mover.
--    Si el cliente vuelve a escribir y nadie habia tocado el seguimiento,
--    se borra solo: ya no hay a quien perseguir, la conversacion esta viva.
--
-- 2) VENTAS DE LA PROMOCION. Para cada promocion publicada: unidades del
--    producto vendidas desde que salio (primeros 7 dias) contra lo normal en
--    ese mismo tiempo (promedio diario de los 30 dias anteriores). Incluye
--    lo vendido en la tienda: no dice QUIEN vino por la promocion, dice si
--    el producto se movio mas de lo que se mueve solo.
--
-- Solo empresas con config_empresa.feat_seguimiento_auto (Morla).
-- Idempotente. No toca dinero.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_seguimiento_auto boolean NOT NULL DEFAULT false;

UPDATE public.config_empresa
   SET feat_seguimiento_auto = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 1) Que cuenta como "le di precio"
-- ------------------------------------------------------------
-- Probado contra los mensajes reales de Morla. Entra:
--   "3,650"  "a 545"  "al rededor de los 1500"  "RD$2,054.07"
--   "Hola, esta es tu cotizacion: ..." (el texto de la extension)
-- NO entra "Sera platina 125 ?": un numero de tres cifras suelto dentro
-- de una frase es casi siempre un modelo de moto, no un precio.
CREATE OR REPLACE FUNCTION public.crm_texto_es_precio(p_texto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_texto, '') ~* (
       'rd\$|\$\s*\d|cotizaci'
    || '|(^|[^0-9])\d{1,3},\d{3}([^0-9]|$)'
    || '|(^|\s)(a|en|por|los|son|vale|cuesta|precio|sale)\s+\d{3,6}([^0-9]|$)'
    || '|^\s*\d{3,6}([.,]\d+)?\s*$'
  );
$$;

-- ------------------------------------------------------------
-- 2) La ronda: crea los que faltan y quita los que ya no hacen falta
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_seguimientos_automaticos()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
                      AND m.created_at > s.creado_en)
    RETURNING 1)
  SELECT count(*) INTO v_quitados FROM q;

  -- b) Precio dado hace 18 h a 7 dias, y el cliente callado desde entonces.
  FOR r IN
    WITH precio AS (
      SELECT DISTINCT ON (m.conversation_id)
             m.conversation_id, m.tenant_id, m.message_text, m.created_at
        FROM public.sales_messages m
        JOIN public.config_empresa ce
          ON ce.tenant_id = m.tenant_id AND ce.feat_seguimiento_auto
       WHERE m.sender_type <> 'user'
         AND COALESCE(m.status, '') <> 'failed'   -- lo que no salio no es precio dado
         AND m.created_at > now() - interval '7 days'
         AND m.created_at < now() - interval '18 hours'
         AND public.crm_texto_es_precio(m.message_text)
       ORDER BY m.conversation_id, m.created_at DESC
    )
    SELECT p.*, c.platform, c.customer_name, c.customer_phone, c.cliente_id,
           (SELECT left(regexp_replace(u.message_text, '\s+', ' ', 'g'), 120)
              FROM public.sales_messages u
             WHERE u.conversation_id = p.conversation_id
               AND u.sender_type = 'user' AND u.created_at < p.created_at
               AND COALESCE(btrim(u.message_text), '') <> ''
             ORDER BY u.created_at DESC LIMIT 1) AS pregunta
      FROM precio p
      JOIN public.sales_conversations c ON c.id = p.conversation_id
     WHERE NOT EXISTS (SELECT 1 FROM public.sales_messages u
                        WHERE u.conversation_id = p.conversation_id
                          AND u.sender_type = 'user'
                          AND u.created_at > p.created_at)
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
END $$;

REVOKE EXECUTE ON FUNCTION public.crm_seguimientos_automaticos() FROM PUBLIC, anon, authenticated;

-- Cada hora a los :15, de 7 a. m. a 9 p. m. de Santo Domingo (11-01 UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'crm-seguimientos-automaticos';
SELECT cron.schedule('crm-seguimientos-automaticos', '15 0,1,11-23 * * *',
                     'SELECT public.crm_seguimientos_automaticos()');

-- ------------------------------------------------------------
-- 3) ¿Vendio la promocion?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promo_ventas_de_promociones(p_bundle_ids uuid[])
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL OR p_bundle_ids IS NULL THEN RETURN '[]'::json; END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
             'bundle_id', x.bid,
             'desde', x.desde,
             'dias', round(extract(epoch FROM x.dur) / 86400.0, 1),
             'vendidas', x.despues,
             'monto', x.monto,
             'normal', round(x.antes30 / 30.0 * extract(epoch FROM x.dur) / 86400.0, 1)))
    FROM (
      SELECT b.bid, b.desde, b.dur,
             COALESCE((SELECT sum(d.cantidad) FROM public.facturas_detalle d
                        JOIN public.facturas f ON f.id = d.factura_id
                       WHERE f.tenant_id = v_tenant AND d.producto_id = b.pid
                         AND f.estado <> 'ANULADA'
                         AND f.created_at >= b.desde AND f.created_at < b.desde + b.dur), 0) AS despues,
             COALESCE((SELECT sum(d.importe) FROM public.facturas_detalle d
                        JOIN public.facturas f ON f.id = d.factura_id
                       WHERE f.tenant_id = v_tenant AND d.producto_id = b.pid
                         AND f.estado <> 'ANULADA'
                         AND f.created_at >= b.desde AND f.created_at < b.desde + b.dur), 0) AS monto,
             COALESCE((SELECT sum(d.cantidad) FROM public.facturas_detalle d
                        JOIN public.facturas f ON f.id = d.factura_id
                       WHERE f.tenant_id = v_tenant AND d.producto_id = b.pid
                         AND f.estado <> 'ANULADA'
                         AND f.created_at >= b.desde - interval '30 days' AND f.created_at < b.desde), 0) AS antes30
        FROM (
          SELECT j.publication_bundle_id AS bid,
                 (array_agg(j.producto_id) FILTER (WHERE j.producto_id IS NOT NULL))[1] AS pid,
                 min(t.published_at) AS desde,
                 least(now(), min(t.published_at) + interval '7 days') - min(t.published_at) AS dur
            FROM public.hermes_publication_jobs j
            JOIN public.hermes_publication_targets t
              ON t.job_id = j.id AND t.status = 'published' AND t.published_at IS NOT NULL
           WHERE j.tenant_id = v_tenant
             AND j.publication_bundle_id = ANY (p_bundle_ids)
           GROUP BY j.publication_bundle_id
        ) b
       WHERE b.pid IS NOT NULL
    ) x
  ), '[]'::json);
END $$;

REVOKE EXECUTE ON FUNCTION public.promo_ventas_de_promociones(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.promo_ventas_de_promociones(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('precio_sin_respuesta_y_ventas_de_la_promocion.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM cron.job WHERE jobname = 'crm-seguimientos-automaticos') AS cron,
  public.crm_texto_es_precio('3,650')                        AS "3,650",
  public.crm_texto_es_precio('solo la tengo en juego a 545') AS "a 545",
  public.crm_texto_es_precio('Será platina 125 ?')           AS "platina 125 (debe ser false)",
  (SELECT count(*) FROM public.config_empresa WHERE feat_seguimiento_auto) AS empresas;
