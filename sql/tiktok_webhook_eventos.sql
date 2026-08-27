-- =====================================================================
-- Buzon crudo de los webhooks de TikTok
-- ---------------------------------------------------------------------
-- (2026-08-27) Para pedir acceso a la Business Messaging API de TikTok
-- hace falta una URL de callback viva: el portal la verifica antes de
-- aprobar nada. Esta tabla es donde cae lo que llegue por ahi.
--
-- >>> POR QUE CRUDO Y NO MAPEADO A sales_messages <<<
-- TikTok no publica el JSON exacto de cada evento, y sin acceso todavia
-- no lo hemos visto. Escribir hoy el mapeo seria adivinar la forma de un
-- payload desconocido, y un mapeo equivocado no revienta —que seria lo
-- bueno— sino que guarda mal y nadie se entera. Se guarda entero y el dia
-- que aprueben se mapea mirando eventos reales.
--
-- >>> EL INDICE UNICO NO ES ADORNO <<<
-- TikTok entrega "al menos una vez" y lo dice en su documentacion: el
-- mismo evento puede llegar repetido, y reintenta hasta 72 horas si no
-- recibe un 200. Sin la clave unica, un cliente que escribio una vez
-- apareceria cinco veces en la bandeja.
--
-- Nadie lee esta tabla desde el navegador: entra por service_role desde la
-- Edge Function. RLS puesto y sin politicas = cerrada para el anon key.
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_webhook_eventos (
  id          bigserial PRIMARY KEY,
  event_id    text,
  tipo        text,
  payload     jsonb NOT NULL,
  firma       text,
  procesado   boolean NOT NULL DEFAULT false,
  recibido_en timestamptz NOT NULL DEFAULT now()
);

-- Un evento repetido no se guarda dos veces. WHERE event_id IS NOT NULL
-- porque los eventos que lleguen sin identificador no se pueden comparar
-- entre si: es mejor guardarlos todos que perderlos.
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_webhook_eventos_event_id_uq
  ON public.tiktok_webhook_eventos (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tiktok_webhook_eventos_pendientes_idx
  ON public.tiktok_webhook_eventos (recibido_en DESC)
  WHERE NOT procesado;

ALTER TABLE public.tiktok_webhook_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tiktok_webhook_eventos FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('tiktok_webhook_eventos.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema='public' AND table_name='tiktok_webhook_eventos')
       THEN 'OK  el buzon existe' ELSE 'FALLO: no existe' END AS tabla,
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                     WHERE schemaname='public' AND indexname='tiktok_webhook_eventos_event_id_uq')
       THEN 'OK  no se duplican los reenvios' ELSE 'FALLO: sin indice unico' END AS duplicados,
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.tiktok_webhook_eventos'::regclass)
       THEN 'OK  cerrada al navegador' ELSE 'FALLO: sin RLS' END AS seguridad;
