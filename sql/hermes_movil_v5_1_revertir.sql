-- =====================================================================
-- REVERSA del canal móvil v5.1
-- ---------------------------------------------------------------------
-- >>> ESTO NO ES LA MIGRACIÓN. ESTO LA DESHACE. <<<
-- Ya pasó dos veces con v4. Por eso el freno de mano.
--
-- Se pierden las imágenes y los documentos. El TEXTO de la conversación
-- NO: vive en hermes_chat. chat_tomar_v5 vuelve a su forma de v5 y v4 no
-- se toca en ningún caso.
-- =====================================================================

BEGIN;

DO $$ BEGIN
  RAISE EXCEPTION 'FRENO DE MANO: esto es la REVERSA del canal movil, no la migracion. Si de verdad quieres deshacerlo, borra este bloque DO. La migracion es sql/hermes_movil_v5_1.sql.';
END $$;

DROP FUNCTION IF EXISTS public.hermes_movil_historial(bigint,integer);
DROP FUNCTION IF EXISTS public.hermes_movil_escribir(text,text,uuid[],jsonb,text,text,text);
DROP FUNCTION IF EXISTS public.hermes_medio_registrar(text,text,text,bigint,text,text,integer,integer,jsonb);
DROP FUNCTION IF EXISTS public.hermes_dispositivo_registrar(text,text,text,text,text);
DROP FUNCTION IF EXISTS public.hermes_dispositivo_revocar(text);
DROP FUNCTION IF EXISTS hermes.medios_limites();

DROP TABLE IF EXISTS public.hermes_dispositivos;

DROP POLICY IF EXISTS "hermes_medios_select" ON storage.objects;
DROP POLICY IF EXISTS "hermes_medios_insert" ON storage.objects;
DROP POLICY IF EXISTS "hermes_medios_delete" ON storage.objects;

-- El bucket y sus archivos NO se borran aquí: borrar fotos de una
-- conversación real desde un script es irreversible de verdad.
--   DELETE FROM storage.objects WHERE bucket_id = 'hermes-medios';
--   DELETE FROM storage.buckets WHERE id = 'hermes-medios';

DROP INDEX IF EXISTS public.idx_hermes_chat_cliente;
ALTER TABLE public.hermes_chat DROP CONSTRAINT IF EXISTS hermes_chat_surface_chk;
ALTER TABLE public.hermes_chat
  DROP COLUMN IF EXISTS client_message_id,
  DROP COLUMN IF EXISTS app_version,
  DROP COLUMN IF EXISTS device_id,
  DROP COLUMN IF EXISTS client_platform,
  DROP COLUMN IF EXISTS source_surface;

ALTER TABLE public.hermes_media
  DROP COLUMN IF EXISTS safe_display_name,
  DROP COLUMN IF EXISTS original_name,
  DROP COLUMN IF EXISTS height,
  DROP COLUMN IF EXISTS width,
  DROP COLUMN IF EXISTS bucket;

-- OJO: chat_tomar_v5 queda BORRADA. Para recuperar la forma de v5 hay que
-- volver a correr sql/hermes_voz_v5.sql, que la recrea.
DROP FUNCTION IF EXISTS hermes.chat_tomar_v5(integer);

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT to_regprocedure('hermes.chat_tomar(integer)') IS NOT NULL AS v4_intacto;
