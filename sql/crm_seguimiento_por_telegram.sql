-- =====================================================================
-- CRM: el seguimiento de "precio sin respuesta" llega por Telegram
-- (12/11/2026)
-- ---------------------------------------------------------------------
-- El paso más flojo del embudo de Morla es CERRAR después del precio
-- (15 compras de 43 con precio en 30 días). El sistema ya crea solo un
-- seguimiento cuando se dio precio y el cliente calló 18 h
-- (crm_seguimientos_automaticos, cada hora), pero quedaba en una pantalla
-- que nadie abre. Ahora cada seguimiento nuevo sale por Telegram con el
-- mensaje listo para copiar y pegarle al cliente (mismo bot y misma vuelta
-- de 5 min que omni-avisos-ventana).
--
-- · crm_seguimiento_avisos: cuáles ya se avisaron. Tabla aparte A
--   PROPÓSITO: el seguimiento automático "que nadie tocó" se reconoce por
--   actualizado_en = creado_en, y un UPDATE en crm_seguimiento lo rompería.
-- · crm_seguimientos_tomar_avisos(): los automáticos en 'precio_enviado'
--   creados en las últimas 24 h y sin avisar; de 8 am a 8 pm (hora RD).
-- · crm_seguimientos_soltar_aviso(): si Telegram falla, sale en la próxima.
-- Los seguimientos viejos (más de 24 h) no se avisan.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_seguimiento_avisos (
  seguimiento_id uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  avisado_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_seguimiento_avisos ENABLE ROW LEVEL SECURITY;  -- solo funciones SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.crm_seguimientos_tomar_avisos()
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

  WITH nuevos AS (
    INSERT INTO public.crm_seguimiento_avisos (seguimiento_id, tenant_id)
    SELECT s.id, s.tenant_id
      FROM public.crm_seguimiento s
     WHERE s.creado_por = 'auto' AND s.estado = 'precio_enviado'
       AND s.creado_en > now() - interval '24 hours'
    ON CONFLICT DO NOTHING
    RETURNING seguimiento_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'cliente', COALESCE(NULLIF(btrim(c.customer_name), ''), s.cliente_nombre, 'Un cliente'),
           'plataforma', COALESCE(c.platform, s.canal_origen),
           'cuando', left(s.notas, 11),                                  -- "DD/MM HH:MI"
           'precio', left(substring(s.notas FROM '«(.*)»'), 160),
           'pregunta', s.producto_consultado,
           'producto', c.clasificacion->>'producto',
           'moto', c.clasificacion->>'moto') ORDER BY s.creado_en), '[]'::jsonb)
    INTO v_out
    FROM (
      -- Todos quedan marcados, pero se avisa UNO por cliente y precio (el más
      -- nuevo): el espejo a veces duplica el chat (ids @lid distintos, mismo
      -- nombre) y salían dos avisos iguales.
      SELECT DISTINCT ON (COALESCE(lower(btrim(s.cliente_nombre)), s.id::text), COALESCE(substring(s.notas FROM '«(.*)»'), s.id::text)) s.*
        FROM nuevos n JOIN public.crm_seguimiento s ON s.id = n.seguimiento_id
       ORDER BY COALESCE(lower(btrim(s.cliente_nombre)), s.id::text), COALESCE(substring(s.notas FROM '«(.*)»'), s.id::text), s.creado_en DESC
    ) s
    LEFT JOIN public.sales_conversations c ON c.id = s.conversation_id;
  RETURN v_out;
END $f$;
REVOKE ALL ON FUNCTION public.crm_seguimientos_tomar_avisos() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_seguimientos_soltar_aviso(p_seguimiento_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  DELETE FROM public.crm_seguimiento_avisos WHERE seguimiento_id = p_seguimiento_id;
$f$;
REVOKE ALL ON FUNCTION public.crm_seguimientos_soltar_aviso(uuid) FROM PUBLIC, anon, authenticated;

-- Prueba: cuántos seguimientos automáticos abiertos hay (solo cuenta).
SELECT count(*) AS seguimientos_auto_abiertos,
       count(*) FILTER (WHERE creado_en > now() - interval '24 hours') AS de_las_ultimas_24h
  FROM public.crm_seguimiento WHERE creado_por = 'auto' AND estado = 'precio_enviado';

SELECT registrar_migracion('crm_seguimiento_por_telegram.sql');
