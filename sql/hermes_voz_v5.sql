-- =====================================================================
-- Canal de Hermes v5 — la voz viaja como audio, no como texto
-- ---------------------------------------------------------------------
-- (2026-08-13) "conversación de voz completa entre MotoFlow y Hermes".
--
-- >>> LO QUE HABÍA, Y POR QUÉ NO ERA VOZ <<<
-- MotoFlow ya tenía micrófono, pero el audio NUNCA salía del navegador:
-- SpeechRecognition (Web Speech API) transcribía ahí mismo y lo que se
-- mandaba a hermes_escribir era TEXTO. Hermes recibía texto y creía que
-- alguien lo había escrito.
--
-- Eso tiene tres consecuencias que no se arreglan con más prompt:
--   · la transcripción la hacía el navegador, no el STT de Hermes;
--   · Safari y los navegadores sin Web Speech se quedaban sin voz;
--   · no queda el audio: si transcribió mal, no hay a qué volver.
--
-- Esto agrega el transporte que faltaba. El audio se sube a un bucket
-- privado, el mensaje entra a la MISMA conversación con message_type
-- 'voice', y Hermes lo descarga con un permiso de un solo uso.
--
-- >>> V5 ES ADITIVO. V4 NO SE TOCA. <<<
-- hermes.chat_tomar(integer) queda EXACTAMENTE como estaba: un worker v4
-- que no sepa de voz sigue funcionando y no ve las columnas nuevas. El que
-- quiera voz llama a hermes.chat_tomar_v5(). Las dos conviven.
--
-- No se cambia el tipo de retorno de ninguna función existente, que es lo
-- que rompería a un consumidor en marcha (42P13 y, peor, un gateway que
-- deja de arrancar sin decir por qué).
--
-- >>> LO QUE NO CAMBIA, PASE LO QUE PASE <<<
--   · conversation_key: la voz entra en 'agent:main:morla:tenant:…', la
--     misma que WebUI, Telegram y el MotoFlow escrito. La voz es una
--     MODALIDAD, no una conversación aparte.
--   · context_epoch: el audio no corta contexto ni lo reinicia.
--   · El fencing de v4: claim_token en toda operación, lease renovable.
--
-- >>> POR QUÉ EL AUDIO NO SE DESCARGA CON UNA URL GUARDADA <<<
-- Postgres no puede firmar URLs de Supabase Storage —las firma el servicio
-- de almacenamiento, no la base—. Y guardar una URL firmada en la fila del
-- mensaje sería guardar una credencial con fecha: cualquiera que lea la
-- tabla se lleva el audio.
--
-- Lo que se guarda es un permiso: al reclamar el mensaje, chat_tomar_v5()
-- entrega un token de un solo uso y vida corta. De la fila solo se guarda
-- su sha256 — con la tabla en la mano no se puede descargar nada. El token
-- se canjea contra la Edge Function hermes-media, que es la única que
-- tiene la llave del bucket.
--
-- Reversible: sql/hermes_voz_v5_revertir.sql
-- Pruebas:    sql/hermes_voz_v5_pruebas.sql
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. QUE NO SE CORRA SOBRE UN CANAL VIEJO
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('hermes.chat_tomar(integer)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='hermes_chat'
                      AND column_name='claim_token') THEN
    RAISE EXCEPTION 'Falta sql/hermes_canal_v4.sql — la voz se monta encima del fencing de v4.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. EL MENSAJE PUEDE SER DE VOZ
-- ------------------------------------------------------------
-- Nullable y con valor por defecto: las 20.000 filas que ya hay quedan
-- como 'text' sin reescribirlas, y un cliente viejo que no manda estas
-- columnas sigue insertando texto igual que ayer.
ALTER TABLE public.hermes_chat
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_id     uuid;

DO $$ BEGIN
  ALTER TABLE public.hermes_chat
    ADD CONSTRAINT hermes_chat_message_type_chk
    CHECK (message_type IN ('text', 'voice', 'audio', 'mixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_hermes_chat_media ON public.hermes_chat (media_id)
  WHERE media_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. EL AUDIO
-- ------------------------------------------------------------
-- El archivo vive en el bucket; aquí vive lo que se sabe de él. Nunca los
-- bytes: PostgreSQL no es un disco, y un base64 de dos minutos de opus en
-- una fila que se lee en cada consulta del chat es un peso muerto.
CREATE TABLE IF NOT EXISTS public.hermes_media (
  media_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  -- A qué conversación pertenece. Se copia y no se deduce del mensaje:
  -- el audio se registra ANTES de existir el mensaje (se sube, se escucha,
  -- y recién entonces se manda o se borra).
  conversation_key text NOT NULL,
  context_epoch    integer NOT NULL DEFAULT 1,
  mensaje_id       bigint REFERENCES public.hermes_chat(id) ON DELETE SET NULL,
  -- 'usuario' = lo grabó la persona · 'hermes' = TTS de la respuesta
  origen           text NOT NULL DEFAULT 'usuario' CHECK (origen IN ('usuario', 'hermes')),
  media_kind       text NOT NULL DEFAULT 'voice' CHECK (media_kind IN ('voice', 'audio')),
  mime_type        text NOT NULL,
  codec            text,
  size_bytes       bigint NOT NULL CHECK (size_bytes > 0),
  duration_ms      integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  storage_path     text NOT NULL,
  -- Integridad e idempotencia. Si la red se corta a medias y el navegador
  -- reintenta, el mismo audio no se registra dos veces.
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  estado           text NOT NULL DEFAULT 'subido'
                   CHECK (estado IN ('subido', 'enviado', 'descartado', 'error')),
  -- Lo que devolvió el STT de Hermes. Se guarda para poder volver: si
  -- entendió mal, el audio y su transcripción están los dos.
  transcript       text,
  transcription_status text NOT NULL DEFAULT 'pendiente'
                   CHECK (transcription_status IN ('pendiente','en_curso','ok','vacia','error','no_aplica')),
  tts_status       text NOT NULL DEFAULT 'no_aplica'
                   CHECK (tts_status IN ('no_aplica','pendiente','en_curso','ok','error')),
  -- El usuario habló encima de la respuesta. La respuesta NO se borra: se
  -- marca. Borrarla dejaría un hueco en la conversación.
  interrupted      boolean NOT NULL DEFAULT false,
  -- Tiempos del turno. Sin contenido: ni audio, ni transcripción, ni
  -- tokens. Sirve para saber DÓNDE se va el tiempo, no qué se dijo.
  metricas         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hermes_media_conv
  ON public.hermes_media (tenant_id, conversation_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hermes_media_mensaje
  ON public.hermes_media (mensaje_id) WHERE mensaje_id IS NOT NULL;

-- La idempotencia, acotada a lo que todavía no se mandó. Dos grabaciones
-- idénticas en momentos distintos SÍ son dos mensajes —alguien puede
-- repetir la misma frase—; lo que no puede pasar dos veces es que un
-- reintento de subida cree dos filas del mismo archivo sin enviar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_media_sha_libre
  ON public.hermes_media (tenant_id, sha256)
  WHERE mensaje_id IS NULL AND deleted_at IS NULL;

ALTER TABLE public.hermes_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_media_propio ON public.hermes_media;
CREATE POLICY hermes_media_propio ON public.hermes_media
  FOR SELECT USING (tenant_id = public.get_user_tenant() AND deleted_at IS NULL);

-- Escribir NO se concede: todo pasa por las funciones SECURITY DEFINER,
-- que son las que validan tamaño, duración, MIME y dueño.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hermes_media FROM anon, authenticated;
GRANT SELECT ON public.hermes_media TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hermes_media;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 3. EL PERMISO DE DESCARGA
-- ------------------------------------------------------------
-- Un solo uso, vida corta, y de él solo se guarda el hash. Con esta tabla
-- volcada en pantalla no se puede descargar ningún audio: el token en
-- claro se entrega UNA vez, al reclamar el mensaje, y no se vuelve a
-- poder leer.
CREATE TABLE IF NOT EXISTS public.hermes_media_tokens (
  token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  media_id     uuid NOT NULL REFERENCES public.hermes_media(media_id) ON DELETE CASCADE,
  mensaje_id   bigint,
  tenant_id    uuid NOT NULL,
  expira_en    timestamptz NOT NULL,
  usos         smallint NOT NULL DEFAULT 0,
  max_usos     smallint NOT NULL DEFAULT 3,
  usado_en     timestamptz,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hermes_media_tokens_exp
  ON public.hermes_media_tokens (expira_en);

ALTER TABLE public.hermes_media_tokens ENABLE ROW LEVEL SECURITY;
-- Sin una sola política: nadie con sesión de navegador tiene nada que
-- hacer aquí. Solo la Edge Function, con la llave de servicio.
REVOKE ALL ON public.hermes_media_tokens FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. EL BUCKET
-- ------------------------------------------------------------
-- Privado. La primera carpeta es el tenant y es lo que miran las políticas
-- de storage: sin eso, una ruta adivinada de otra empresa se descargaría.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hermes-voz', 'hermes-voz', false,
  8388608,        -- 8 MB. Dos minutos de opus pesan ~1,5 MB: sobra de largo.
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
        'audio/x-wav', 'audio/aac', 'audio/mp3']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "hermes_voz_select" ON storage.objects;
CREATE POLICY "hermes_voz_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hermes-voz'
       AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

DROP POLICY IF EXISTS "hermes_voz_insert" ON storage.objects;
CREATE POLICY "hermes_voz_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hermes-voz'
            AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

-- Sin UPDATE a propósito: un audio ya subido no se reescribe. Si hay que
-- cambiarlo, es otro audio con otro sha256.
DROP POLICY IF EXISTS "hermes_voz_delete" ON storage.objects;
CREATE POLICY "hermes_voz_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hermes-voz'
       AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

-- ------------------------------------------------------------
-- 5. LÍMITES, EN UN SOLO SITIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.voz_limites()
RETURNS json LANGUAGE sql IMMUTABLE AS $$
  SELECT json_build_object(
    'max_bytes', 8388608,
    'max_duracion_ms', 120000,
    'mimes', json_build_array('audio/webm','audio/ogg','audio/mp4','audio/mpeg',
                              'audio/wav','audio/x-wav','audio/aac','audio/mp3'),
    'token_ttl_segundos', 600,
    'retencion_dias', 90);
$$;

GRANT EXECUTE ON FUNCTION hermes.voz_limites() TO authenticated, hermes_readonly;

-- ------------------------------------------------------------
-- 6. REGISTRAR UN AUDIO RECIÉN SUBIDO
-- ------------------------------------------------------------
-- El navegador sube directo al bucket con su propia sesión (las políticas
-- de storage lo encierran en su carpeta) y después llama aquí. Esta
-- función es la que decide si ese archivo es aceptable.
--
-- Se comprueba contra storage.objects y no contra lo que dice el cliente:
-- un navegador puede mentir en el tamaño y en el MIME, el objeto subido no.
CREATE OR REPLACE FUNCTION public.hermes_voz_registrar(
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint,
  p_duration_ms  integer,
  p_sha256       text,
  p_codec        text DEFAULT NULL,
  p_metricas     jsonb DEFAULT '{}'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_lim     json := hermes.voz_limites();
  v_obj     record;
  v_conv    text;
  v_epoca   integer;
  v_id      uuid;
  v_mime    text := lower(btrim(COALESCE(p_mime_type, '')));
  v_sha     text := lower(btrim(COALESCE(p_sha256, '')));
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  -- La carpeta manda. Aunque las políticas de storage ya lo impiden, esto
  -- es lo que evita registrar en tu tenant un objeto de otro.
  IF split_part(COALESCE(p_storage_path, ''), '/', 1) <> v_tenant::text THEN
    RAISE EXCEPTION 'Esa ruta no es de esta empresa.';
  END IF;

  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'El sha256 no tiene la forma esperada.';
  END IF;

  IF NOT (v_mime = ANY (SELECT json_array_elements_text(v_lim -> 'mimes'))) THEN
    RAISE EXCEPTION 'Formato de audio no admitido: %', v_mime;
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'La grabación llegó vacía.';
  END IF;

  IF p_size_bytes > (v_lim ->> 'max_bytes')::bigint THEN
    RAISE EXCEPTION 'El audio pesa demasiado (máximo % MB).',
      round((v_lim ->> 'max_bytes')::numeric / 1048576, 1);
  END IF;

  IF p_duration_ms IS NOT NULL AND p_duration_ms > (v_lim ->> 'max_duracion_ms')::int THEN
    RAISE EXCEPTION 'La grabación es más larga que el máximo de % segundos.',
      (v_lim ->> 'max_duracion_ms')::int / 1000;
  END IF;

  -- El objeto tiene que existir DE VERDAD. Sin esto se podría registrar
  -- una ruta inventada y el mensaje entraría a la cola apuntando a nada.
  SELECT o.id,
         COALESCE((o.metadata ->> 'size')::bigint, 0)   AS size,
         lower(COALESCE(o.metadata ->> 'mimetype', '')) AS mime
    INTO v_obj
  FROM storage.objects o
  WHERE o.bucket_id = 'hermes-voz' AND o.name = p_storage_path;

  IF v_obj.id IS NULL THEN
    RAISE EXCEPTION 'Ese audio no está subido todavía.';
  END IF;

  IF v_obj.size > (v_lim ->> 'max_bytes')::bigint THEN
    RAISE EXCEPTION 'El archivo subido pesa más que el máximo permitido.';
  END IF;

  -- Lo declarado tiene que coincidir con lo subido. Un desfase aquí es un
  -- cliente mintiendo o un archivo cortado a medias.
  IF v_obj.size <> p_size_bytes THEN
    RAISE EXCEPTION 'El tamaño declarado no coincide con el archivo subido.';
  END IF;

  IF v_obj.mime <> '' AND split_part(v_obj.mime, ';', 1) <> split_part(v_mime, ';', 1) THEN
    RAISE EXCEPTION 'El tipo declarado no coincide con el del archivo subido.';
  END IF;

  -- La misma conversación de siempre. NO se inventa una para voz.
  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT k.context_epoch INTO v_epoca
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;
  v_epoca := COALESCE(v_epoca, 1);

  -- Idempotencia: el mismo archivo sin enviar ya registrado devuelve el
  -- mismo media_id en vez de crear otra fila.
  SELECT m.media_id INTO v_id
  FROM public.hermes_media m
  WHERE m.tenant_id = v_tenant AND m.sha256 = v_sha
    AND m.mensaje_id IS NULL AND m.deleted_at IS NULL;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('media_id', v_id, 'duplicado', true,
                             'storage_path', p_storage_path);
  END IF;

  INSERT INTO public.hermes_media
    (tenant_id, conversation_key, context_epoch, origen, media_kind,
     mime_type, codec, size_bytes, duration_ms, storage_path, sha256,
     estado, transcription_status, metricas, created_by)
  VALUES
    (v_tenant, v_conv, v_epoca, 'usuario', 'voice',
     v_mime, NULLIF(btrim(COALESCE(p_codec,'')),''), p_size_bytes, p_duration_ms,
     p_storage_path, v_sha,
     'subido', 'pendiente', COALESCE(p_metricas, '{}'::jsonb), auth.uid())
  RETURNING media_id INTO v_id;

  RETURN json_build_object('media_id', v_id, 'duplicado', false,
                           'storage_path', p_storage_path,
                           'conversation_key', v_conv, 'context_epoch', v_epoca);
END $$;

-- ------------------------------------------------------------
-- 7. MANDAR EL MENSAJE DE VOZ
-- ------------------------------------------------------------
-- Hermana de hermes_escribir(), con la misma conversación, la misma época
-- y el mismo NOTIFY. Lo único distinto es que el contenido es un archivo.
--
-- OJO CON EL TEXTO: p_texto es OPCIONAL y no es la transcripción. Es lo
-- que la persona haya escrito además de hablar. MotoFlow NO transcribe:
-- eso es trabajo del STT de Hermes, que es el que oye el audio de verdad.
CREATE OR REPLACE FUNCTION public.hermes_escribir_voz(
  p_media_id       uuid,
  p_pantalla       jsonb DEFAULT NULL,
  p_texto          text  DEFAULT NULL,
  p_origin_chat_id text  DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_m      record;
  v_id     bigint;
  v_texto  text := NULLIF(btrim(COALESCE(p_texto, '')), '');
  v_tipo   text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  SELECT * INTO v_m FROM public.hermes_media
  WHERE media_id = p_media_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_m.media_id IS NULL THEN
    RAISE EXCEPTION 'Ese audio no existe en esta empresa.';
  END IF;
  IF v_m.origen <> 'usuario' THEN
    RAISE EXCEPTION 'Ese audio es una respuesta, no una pregunta.';
  END IF;

  -- Mandar dos veces el mismo audio no crea dos mensajes. Pasa de verdad:
  -- dos pestañas abiertas, o un clic doble en "enviar".
  IF v_m.mensaje_id IS NOT NULL THEN
    RETURN json_build_object('id', v_m.mensaje_id, 'enviado', true, 'duplicado', true,
                             'conversation_key', v_m.conversation_key,
                             'context_epoch', v_m.context_epoch);
  END IF;

  v_tipo := CASE WHEN v_texto IS NULL THEN 'voice' ELSE 'mixed' END;

  INSERT INTO public.hermes_chat
    (tenant_id, user_id, rol, texto, pantalla, conversation_key,
     origin_platform, origin_chat_id, estado, context_epoch,
     message_type, media_id)
  VALUES
    (v_tenant, auth.uid(), 'usuario',
     -- `texto` es NOT NULL en la tabla desde el principio. Un marcador
     -- legible es mejor que una cadena vacía: si algo lo enseña sin saber
     -- de voz, se lee "(nota de voz)" y no un hueco.
     COALESCE(v_texto, '(nota de voz)'),
     v_pantalla, v_m.conversation_key,
     'motoflow', COALESCE(p_origin_chat_id, auth.uid()::text),
     'pendiente', v_m.context_epoch,
     v_tipo, p_media_id)
  RETURNING id INTO v_id;

  UPDATE public.hermes_chat SET origin_message_id = v_id::text WHERE id = v_id;
  UPDATE public.hermes_media
  SET mensaje_id = v_id, estado = 'enviado'
  WHERE media_id = p_media_id;

  -- El payload va corto a propósito: Postgres corta NOTIFY en 8000 bytes y
  -- la conexión se cae entera si se pasa. Aquí ni siquiera se manda la
  -- ruta del audio; el que reclama ya la recibe por chat_tomar_v5.
  PERFORM pg_notify('hermes_chat', json_build_object(
    'id', v_id, 'tenant_id', v_tenant, 'conversation_key', v_m.conversation_key,
    'context_epoch', v_m.context_epoch, 'origin_platform', 'motoflow',
    'message_type', v_tipo, 'duration_ms', v_m.duration_ms)::text);

  RETURN json_build_object('id', v_id, 'enviado', true, 'duplicado', false,
                           'message_type', v_tipo,
                           'conversation_key', v_m.conversation_key,
                           'context_epoch', v_m.context_epoch);
END $$;

-- ------------------------------------------------------------
-- 8. DESCARTAR UNA GRABACIÓN ANTES DE MANDARLA
-- ------------------------------------------------------------
-- Arrepentirse es parte del flujo: se graba, se escucha, y a veces se
-- borra. Borrado lógico, y el archivo lo barre la limpieza.
CREATE OR REPLACE FUNCTION public.hermes_voz_descartar(p_media_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  UPDATE public.hermes_media
  SET deleted_at = now(), estado = 'descartado'
  WHERE media_id = p_media_id AND tenant_id = v_tenant
    AND mensaje_id IS NULL          -- lo ya enviado no se borra: es la conversación
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN json_build_object('ok', v_n > 0, 'descartado', v_n);
END $$;

-- ------------------------------------------------------------
-- 9. LA COLA, CON VOZ  —  chat_tomar_v5
-- ------------------------------------------------------------
-- >>> chat_tomar(integer) DE V4 NO SE TOCA <<<
-- Esta es una función NUEVA, con otro nombre. Un worker v4 sigue tomando
-- de la misma cola y recibe el mensaje de voz con su texto marcador; si
-- no sabe de audio, contesta como puede. El que sepa, usa esta.
--
-- Reclama igual que v4: FOR UPDATE SKIP LOCKED, uno por conversación,
-- claim_token nuevo, lease. Y además entrega el permiso de descarga.
CREATE OR REPLACE FUNCTION hermes.chat_tomar_v5(p_limite integer DEFAULT 1)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  origin_platform text, origin_chat_id text, origin_message_id text,
  claim_token uuid, lease_until timestamptz, context_epoch integer,
  -- Lo nuevo de v5:
  message_type text, media_id uuid, media_kind text, mime_type text,
  codec text, size_bytes bigint, duration_ms integer, sha256 text,
  storage_path text, media_token text, media_token_expira timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_ttl    int  := (hermes.voz_limites() ->> 'token_ttl_segundos')::int;
BEGIN
  RETURN QUERY
  WITH candidatos AS (
    SELECT c.id,
           row_number() OVER (PARTITION BY c.conversation_key
                              ORDER BY c.creado_en, c.id) AS puesto
    FROM public.hermes_chat c
    WHERE c.tenant_id = v_tenant
      AND c.rol = 'usuario'
      AND c.intentos < 3
      AND (c.estado = 'pendiente'
           OR (c.estado = 'procesando'
               AND COALESCE(c.lease_until, c.procesando_en + hermes.chat_lease()) <= now()))
      AND NOT EXISTS (
        SELECT 1 FROM public.hermes_chat o
        WHERE o.tenant_id = c.tenant_id
          AND o.conversation_key = c.conversation_key
          AND o.rol = 'usuario'
          AND o.estado = 'procesando'
          AND COALESCE(o.lease_until, o.procesando_en + hermes.chat_lease()) > now())
  ),
  elegidos AS (
    SELECT k.id FROM candidatos k
    WHERE k.puesto = 1
    ORDER BY k.id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 1), 10))
    FOR UPDATE SKIP LOCKED
  ),
  tomados AS (
    UPDATE public.hermes_chat c
    SET estado = 'procesando',
        procesando_en = now(),
        recibido_en = COALESCE(c.recibido_en, now()),
        intentos = c.intentos + 1,
        claim_token = gen_random_uuid(),
        lease_until = now() + hermes.chat_lease()
    FROM elegidos e
    WHERE c.id = e.id
    RETURNING c.*
  ),
  -- El permiso de descarga se emite AQUÍ, dentro de la misma transacción
  -- que el claim: si el reclamo se pierde por SKIP LOCKED, tampoco se
  -- emite token, y no queda un permiso suelto para un audio que atiende
  -- otro worker.
  tokens AS (
    INSERT INTO public.hermes_media_tokens
      (token_sha256, media_id, mensaje_id, tenant_id, expira_en)
    -- sha256() y no digest(): el primero es de PostgreSQL y el segundo de
    -- pgcrypto, que en Supabase vive en el esquema `extensions` y con
    -- `SET search_path TO 'public'` no se resuelve. Esto fallaría en la
    -- primera llamada real, no al crear la función.
    SELECT encode(sha256(convert_to(t.claim_token::text || ':' || t.media_id::text, 'UTF8')), 'hex'),
           t.media_id, t.id, t.tenant_id, now() + make_interval(secs => v_ttl)
    FROM tomados t
    WHERE t.media_id IS NOT NULL
    ON CONFLICT (token_sha256) DO UPDATE
      SET expira_en = EXCLUDED.expira_en, usos = 0, usado_en = NULL
    RETURNING media_id, expira_en
  )
  SELECT t.id, t.texto, t.pantalla, t.creado_en, t.user_id,
         COALESCE(p.full_name, p.email, '(sin nombre)'), p.email, t.rol,
         t.conversation_key, t.estado, t.intentos,
         t.origin_platform, t.origin_chat_id, t.origin_message_id,
         t.claim_token, t.lease_until, t.context_epoch,
         t.message_type, t.media_id, m.media_kind, m.mime_type, m.codec,
         m.size_bytes, m.duration_ms, m.sha256, m.storage_path,
         -- El token EN CLARO, una sola vez. En la tabla queda su sha256:
         -- se deriva del claim_token, que solo tiene quien reclamó.
         CASE WHEN t.media_id IS NOT NULL
              THEN t.claim_token::text || ':' || t.media_id::text END,
         tk.expira_en
  FROM tomados t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.hermes_media m ON m.media_id = t.media_id
  LEFT JOIN tokens tk ON tk.media_id = t.media_id
  ORDER BY t.id;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_tomar_v5(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_tomar_v5(integer) TO hermes_readonly;

-- ------------------------------------------------------------
-- 10. CANJEAR EL PERMISO  (lo llama la Edge Function)
-- ------------------------------------------------------------
-- Devuelve la ruta, no el archivo: quien tiene la llave del bucket es la
-- Edge Function, y es ella la que firma una URL de segundos.
CREATE OR REPLACE FUNCTION hermes.media_canjear(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hash text := encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex');
  v_t    record;
  v_m    record;
BEGIN
  SELECT * INTO v_t FROM public.hermes_media_tokens WHERE token_sha256 = v_hash;

  IF v_t.token_sha256 IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_desconocido');
  END IF;
  IF v_t.expira_en <= now() THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_vencido');
  END IF;
  IF v_t.usos >= v_t.max_usos THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_agotado');
  END IF;

  UPDATE public.hermes_media_tokens
  SET usos = usos + 1, usado_en = now()
  WHERE token_sha256 = v_hash;

  SELECT * INTO v_m FROM public.hermes_media WHERE media_id = v_t.media_id;
  IF v_m.media_id IS NULL OR v_m.deleted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'audio_no_disponible');
  END IF;

  RETURN json_build_object(
    'ok', true, 'bucket', 'hermes-voz',
    'storage_path', v_m.storage_path, 'mime_type', v_m.mime_type,
    'size_bytes', v_m.size_bytes, 'sha256', v_m.sha256,
    'duration_ms', v_m.duration_ms, 'media_id', v_m.media_id);
END $$;

REVOKE ALL ON FUNCTION hermes.media_canjear(text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 11. EL AUDIO DE LA RESPUESTA  (TTS de Hermes)
-- ------------------------------------------------------------
-- Lo llama la Edge Function después de subir el archivo, con el
-- claim_token como prueba de que ese turno es suyo. No hace falta un
-- token aparte: el fencing de v4 ya dice quién manda en este mensaje.
CREATE OR REPLACE FUNCTION hermes.chat_media_registrar(
  p_mensaje_id   bigint,
  p_claim_token  uuid,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint,
  p_duration_ms  integer,
  p_sha256       text,
  p_codec        text DEFAULT NULL,
  p_metricas     jsonb DEFAULT '{}'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_c      record;
  v_id     uuid;
BEGIN
  SELECT c.id, c.estado, c.claim_token, c.conversation_key, c.context_epoch
    INTO v_c
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'El mensaje % no existe en este tenant', p_mensaje_id;
  END IF;
  IF v_c.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  -- Reintentar el TTS del mismo turno no crea otra fila.
  SELECT m.media_id INTO v_id
  FROM public.hermes_media m
  WHERE m.tenant_id = v_tenant AND m.sha256 = lower(p_sha256)
    AND m.origen = 'hermes' AND m.deleted_at IS NULL;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'media_id', v_id);
  END IF;

  INSERT INTO public.hermes_media
    (tenant_id, conversation_key, context_epoch, origen, media_kind,
     mime_type, codec, size_bytes, duration_ms, storage_path, sha256,
     estado, transcription_status, tts_status, metricas)
  VALUES
    (v_tenant, v_c.conversation_key, v_c.context_epoch, 'hermes', 'voice',
     lower(p_mime_type), p_codec, p_size_bytes, p_duration_ms,
     p_storage_path, lower(p_sha256),
     'subido', 'no_aplica', 'ok', COALESCE(p_metricas, '{}'::jsonb))
  RETURNING media_id INTO v_id;

  RETURN json_build_object('ok', true, 'duplicado', false, 'media_id', v_id);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_media_registrar(bigint,uuid,text,text,bigint,integer,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_media_registrar(bigint,uuid,text,text,bigint,integer,text,text,jsonb) TO hermes_readonly;

-- ------------------------------------------------------------
-- 12. RESPONDER CON TEXTO Y VOZ
-- ------------------------------------------------------------
-- >>> EL TEXTO ES LA RESPUESTA. EL AUDIO ES UNA FORMA DE OÍRLA. <<<
-- Por eso esto delega en chat_responder() con fencing —el mismo de v4, sin
-- tocarlo— y solo después le cuelga el audio a la fila que creó. Si el TTS
-- falló, se llama sin media_id y la respuesta llega igual: quedarse sin voz
-- es un inconveniente, quedarse sin respuesta es una avería.
CREATE OR REPLACE FUNCTION hermes.chat_responder_voz(
  p_mensaje_id  bigint,
  p_texto       text,
  p_acciones    jsonb,
  p_claim_token uuid,
  p_media_id    uuid DEFAULT NULL,
  p_tts_status  text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_res    json;
  v_rid    bigint;
BEGIN
  IF p_media_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hermes_media
                     WHERE media_id = p_media_id AND tenant_id = v_tenant
                       AND origen = 'hermes' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Ese audio de respuesta no existe. Regístralo antes con chat_media_registrar().';
  END IF;

  v_res := hermes.chat_responder(p_mensaje_id, p_texto, p_acciones, p_claim_token);

  -- Si no era suyo, o si ya estaba contestado, no se toca nada más. El
  -- duplicado NO vuelve a colgar el audio: la respuesta ya tiene el suyo.
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE
     OR COALESCE((v_res ->> 'duplicado')::boolean, false) THEN
    RETURN v_res;
  END IF;

  v_rid := (v_res ->> 'respuesta_id')::bigint;

  IF v_rid IS NOT NULL AND p_media_id IS NOT NULL THEN
    UPDATE public.hermes_chat
    SET media_id = p_media_id, message_type = 'mixed'
    WHERE id = v_rid AND tenant_id = v_tenant;

    UPDATE public.hermes_media
    SET mensaje_id = v_rid, estado = 'enviado',
        tts_status = COALESCE(p_tts_status, 'ok')
    WHERE media_id = p_media_id;
  END IF;

  RETURN (v_res::jsonb || jsonb_build_object(
    'media_id', p_media_id,
    'tts_status', COALESCE(p_tts_status, CASE WHEN p_media_id IS NULL THEN 'error' ELSE 'ok' END)))::json;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_responder_voz(bigint,text,jsonb,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_responder_voz(bigint,text,jsonb,uuid,uuid,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 13. LA TRANSCRIPCIÓN, DE VUELTA
-- ------------------------------------------------------------
-- Hermes la escribe cuando su STT termina. Sirve para dos cosas: que la
-- pantalla enseñe lo que se entendió, y que se pueda comprobar contra el
-- audio cuando entendió otra cosa.
CREATE OR REPLACE FUNCTION hermes.chat_transcripcion(
  p_mensaje_id  bigint,
  p_claim_token uuid,
  p_transcript  text,
  p_estado      text DEFAULT 'ok')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_c      record;
BEGIN
  IF p_estado NOT IN ('ok','vacia','error','en_curso') THEN
    RAISE EXCEPTION 'Estado de transcripción inválido: %', p_estado;
  END IF;

  SELECT c.claim_token, c.media_id INTO v_c
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  IF v_c.media_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'sin_audio');
  END IF;
  IF v_c.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  UPDATE public.hermes_media
  SET transcript = NULLIF(btrim(COALESCE(p_transcript, '')), ''),
      transcription_status = p_estado
  WHERE media_id = v_c.media_id;

  -- El texto del mensaje pasa a ser lo que se entendió. Así el historial
  -- se lee como una conversación y no como una lista de "(nota de voz)".
  IF p_estado = 'ok' AND NULLIF(btrim(COALESCE(p_transcript,'')), '') IS NOT NULL THEN
    UPDATE public.hermes_chat
    SET texto = p_transcript
    WHERE id = p_mensaje_id AND texto = '(nota de voz)';
  END IF;

  RETURN json_build_object('ok', true, 'media_id', v_c.media_id, 'estado', p_estado);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_transcripcion(bigint,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_transcripcion(bigint,uuid,text,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 14. INTERRUMPIR
-- ------------------------------------------------------------
-- El usuario habló encima. Se marca el audio, no se borra: la respuesta
-- se dio, simplemente no se escuchó entera.
CREATE OR REPLACE FUNCTION public.hermes_voz_interrumpir(p_media_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  UPDATE public.hermes_media SET interrupted = true
  WHERE media_id = p_media_id AND tenant_id = v_tenant AND origen = 'hermes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', v_n > 0);
END $$;

-- ------------------------------------------------------------
-- 15. QUÉ SABE HACER ESTE CANAL
-- ------------------------------------------------------------
-- Detección de capacidad, para que el gateway de Hermes no tenga que
-- adivinar por versión ni fallar para enterarse.
CREATE OR REPLACE FUNCTION hermes.chat_capacidades()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'contrato', 5,
    'contratos_soportados', json_build_array(3, 4, 5),
    'voz', to_regprocedure('hermes.chat_tomar_v5(integer)') IS NOT NULL,
    'fencing', true,
    'corte_de_contexto', to_regprocedure('hermes.chat_nuevo_contexto(text)') IS NOT NULL,
    'transcripcion_en_motoflow', false,
    'tts_en_motoflow', false,
    'endpoint_medios', 'hermes-media',
    'limites', hermes.voz_limites());
$$;

GRANT EXECUTE ON FUNCTION hermes.chat_capacidades() TO hermes_readonly, authenticated;

-- ------------------------------------------------------------
-- 16. RETENCIÓN Y HUÉRFANOS
-- ------------------------------------------------------------
-- Marca para borrar; el archivo lo barre la Edge Function, que es la que
-- puede tocar el bucket. Dos casos distintos:
--   · huérfanos: subidos y nunca enviados. A las 24 h no van a enviarse.
--   · retención: enviados, pero viejos. El texto se queda; el audio no.
CREATE OR REPLACE FUNCTION hermes.voz_limpiar(p_dias integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dias  int := COALESCE(p_dias, (hermes.voz_limites() ->> 'retencion_dias')::int);
  v_huerf int; v_viejos int; v_tok int;
BEGIN
  UPDATE public.hermes_media
  SET deleted_at = now(), estado = 'descartado'
  WHERE mensaje_id IS NULL AND deleted_at IS NULL
    AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_huerf = ROW_COUNT;

  UPDATE public.hermes_media
  SET deleted_at = now()
  WHERE deleted_at IS NULL
    AND created_at < now() - make_interval(days => v_dias);
  GET DIAGNOSTICS v_viejos = ROW_COUNT;

  DELETE FROM public.hermes_media_tokens WHERE expira_en < now() - interval '1 day';
  GET DIAGNOSTICS v_tok = ROW_COUNT;

  RETURN json_build_object('huerfanos', v_huerf, 'por_retencion', v_viejos,
                           'tokens_borrados', v_tok, 'dias', v_dias);
END $$;

REVOKE ALL ON FUNCTION hermes.voz_limpiar(integer) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 17. EL PUENTE PARA LA EDGE FUNCTION
-- ------------------------------------------------------------
-- PostgREST solo expone `public`. La Edge Function no puede llamar a
-- hermes.media_canjear() por mucho que tenga la llave de servicio: no está
-- publicada. Estas tres son la puerta, y están cerradas a todo el mundo
-- menos a service_role.
--
-- Se llaman igual que las de dentro pero con prefijo, para que al leer un
-- registro se sepa desde dónde entró la llamada.
CREATE OR REPLACE FUNCTION public.hermes_media_canjear(p_token text)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT hermes.media_canjear(p_token); $$;

CREATE OR REPLACE FUNCTION public.hermes_media_registrar_tts(
  p_mensaje_id bigint, p_claim_token uuid, p_storage_path text,
  p_mime_type text, p_size_bytes bigint, p_duration_ms integer,
  p_sha256 text, p_codec text DEFAULT NULL, p_metricas jsonb DEFAULT '{}'::jsonb)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT hermes.chat_media_registrar(p_mensaje_id, p_claim_token, p_storage_path,
                                         p_mime_type, p_size_bytes, p_duration_ms,
                                         p_sha256, p_codec, p_metricas); $$;

CREATE OR REPLACE FUNCTION public.hermes_voz_limpiar(p_dias integer DEFAULT NULL)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT hermes.voz_limpiar(p_dias); $$;

-- Ni anon ni authenticated. Solo la llave de servicio, que es la que usa
-- la Edge Function y no sale nunca del servidor.
REVOKE ALL ON FUNCTION public.hermes_media_canjear(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hermes_media_registrar_tts(bigint,uuid,text,text,bigint,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hermes_voz_limpiar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hermes_media_canjear(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hermes_media_registrar_tts(bigint,uuid,text,text,bigint,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.hermes_voz_limpiar(integer) TO service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_voz_v5.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación:
SELECT hermes.chat_capacidades() AS capacidades;
