-- =====================================================================
-- REVERSA del canal de voz v5
-- ---------------------------------------------------------------------
-- >>> ESTO NO ES LA MIGRACIÓN. ESTO LA DESHACE. <<<
--
-- Ya pasó dos veces con v4: se corre la reversa creyendo que es la
-- migración, las pruebas fallan enteras y hay que rehacerlo todo. Por eso
-- el freno de mano de abajo: hay que borrar una línea a mano para que
-- esto haga algo.
--
-- >>> QUÉ SE PIERDE <<<
-- Los audios. Las filas de hermes_media y los archivos del bucket. El
-- TEXTO de la conversación NO se pierde: vive en hermes_chat y ahí se
-- queda —incluidas las transcripciones que Hermes ya escribió—.
--
-- Lo que quedará en el historial son mensajes con el texto pero sin la
-- grabación. Es la degradación correcta: se pierde el original de audio,
-- no la conversación.
--
-- v4 no se toca en ningún caso.
-- =====================================================================

BEGIN;

DO $$ BEGIN
  RAISE EXCEPTION 'FRENO DE MANO: esto es la REVERSA de v5, no la migración. Si de verdad quieres deshacer la voz, borra este bloque DO y vuelve a correrlo. La migración es sql/hermes_voz_v5.sql.';
END $$;

-- ── Las funciones ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.hermes_voz_limpiar(integer);
DROP FUNCTION IF EXISTS public.hermes_media_registrar_tts(bigint,uuid,text,text,bigint,integer,text,text,jsonb);
DROP FUNCTION IF EXISTS public.hermes_media_canjear(text);
DROP FUNCTION IF EXISTS hermes.voz_limpiar(integer);
DROP FUNCTION IF EXISTS hermes.chat_capacidades();
DROP FUNCTION IF EXISTS public.hermes_voz_interrumpir(uuid);
DROP FUNCTION IF EXISTS hermes.chat_transcripcion(bigint,uuid,text,text);
DROP FUNCTION IF EXISTS hermes.chat_responder_voz(bigint,text,jsonb,uuid,uuid,text);
DROP FUNCTION IF EXISTS hermes.chat_media_registrar(bigint,uuid,text,text,bigint,integer,text,text,jsonb);
DROP FUNCTION IF EXISTS hermes.media_canjear(text);
DROP FUNCTION IF EXISTS hermes.chat_tomar_v5(integer);
DROP FUNCTION IF EXISTS public.hermes_voz_descartar(uuid);
DROP FUNCTION IF EXISTS public.hermes_escribir_voz(uuid,jsonb,text,text);
DROP FUNCTION IF EXISTS public.hermes_voz_registrar(text,text,bigint,integer,text,text,jsonb);
DROP FUNCTION IF EXISTS hermes.voz_limites();

-- ── Las políticas del bucket ────────────────────────────────────────
DROP POLICY IF EXISTS "hermes_voz_select" ON storage.objects;
DROP POLICY IF EXISTS "hermes_voz_insert" ON storage.objects;
DROP POLICY IF EXISTS "hermes_voz_delete" ON storage.objects;

-- El bucket y sus archivos NO se borran aquí. Borrar audios de una
-- conversación real desde un script de reversa es irreversible de verdad;
-- si hay que hacerlo, se hace a mano y mirando:
--
--   DELETE FROM storage.objects WHERE bucket_id = 'hermes-voz';
--   DELETE FROM storage.buckets WHERE id = 'hermes-voz';

-- ── Las tablas ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.hermes_media_tokens;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.hermes_media;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP TABLE IF EXISTS public.hermes_media;

-- ── Las columnas del mensaje ────────────────────────────────────────
ALTER TABLE public.hermes_chat DROP CONSTRAINT IF EXISTS hermes_chat_message_type_chk;
DROP INDEX IF EXISTS public.idx_hermes_chat_media;
ALTER TABLE public.hermes_chat
  DROP COLUMN IF EXISTS media_id,
  DROP COLUMN IF EXISTS message_type;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Comprobación de que v4 sigue en pie:
SELECT to_regprocedure('hermes.chat_tomar(integer)')                    IS NOT NULL AS v4_tomar,
       to_regprocedure('hermes.chat_responder(bigint,text,jsonb,uuid)') IS NOT NULL AS v4_responder,
       to_regprocedure('hermes.chat_tomar_v5(integer)')                 IS NULL     AS v5_fuera;
