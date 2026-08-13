-- =====================================================================
-- Canal móvil de Hermes — v5.1
-- ---------------------------------------------------------------------
-- (2026-08-13) "un canal nativo de conversación con Hermes en la app".
--
-- >>> POR QUÉ NO HAY UN TRANSPORTE 'motoflow-mobile' <<<
-- Porque no hace falta y costaría un adaptador entero. La cola ya separa
-- bien: `origin_platform` dice por dónde entró y `origin_chat_id` a dónde
-- se contesta. Lo único que faltaba era saber QUÉ interfaz de MotoFlow lo
-- mandó, y eso es un campo, no una plataforma.
--
--   origin_platform = 'motoflow'   el transporte (no cambia)
--   source_surface  = 'mobile'     la interfaz concreta
--   client_platform = android|ios
--
-- Un segundo adaptador obligaría a Hermes a mantener dos rutas de entrega
-- para la misma empresa, la misma conversación y el mismo destino.
--
-- >>> EL CAMBIO DE TIPO DE chat_tomar_v5, Y POR QUÉ AHORA <<<
-- Cambiar el retorno de una función en marcha es lo que rompe gateways.
-- v5 se aplicó HOY y su lado Hermes todavía no existe: es exactamente la
-- ventana en la que cambiarlo es gratis. En una semana ya no lo sería.
-- v4 sigue intacto, como siempre.
--
-- >>> DOS BUCKETS, NO UNO <<<
-- El audio tiene una regla que no quiero relajar: 2 minutos y 8 MB. Un PDF
-- de una factura pesa más y no dura nada. Meterlos en el mismo bucket
-- obligaría a subir el tope del audio hasta el del documento, y entonces
-- una nota de voz de 20 MB pasaría el control.
--
--   hermes-voz     audio        8 MB
--   hermes-medios  imagen/doc   25 MB
--
-- Requiere sql/hermes_voz_v5.sql.
-- Reversible: sql/hermes_movil_v5_1_revertir.sql
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('hermes.chat_tomar_v5(integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta sql/hermes_voz_v5.sql — el canal móvil se monta encima de v5.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. DE DÓNDE VIENE EL MENSAJE
-- ------------------------------------------------------------
ALTER TABLE public.hermes_chat
  -- Qué interfaz lo mandó. NULL = las de antes (la web), que no lo decían.
  ADD COLUMN IF NOT EXISTS source_surface    text,
  ADD COLUMN IF NOT EXISTS client_platform   text,
  ADD COLUMN IF NOT EXISTS device_id         text,
  ADD COLUMN IF NOT EXISTS app_version       text,
  -- La idempotencia del móvil. El teléfono lo genera ANTES de mandar y lo
  -- repite en cada reintento: es lo que hace que una red mala no meta el
  -- mismo mensaje tres veces.
  ADD COLUMN IF NOT EXISTS client_message_id text;

DO $$ BEGIN
  ALTER TABLE public.hermes_chat
    ADD CONSTRAINT hermes_chat_surface_chk
    CHECK (source_surface IS NULL OR source_surface IN ('web','mobile','whatsapp','telegram','api'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- La clave de la idempotencia. Parcial porque los mensajes de la web no
-- traen client_message_id y no tienen por qué.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_chat_cliente
  ON public.hermes_chat (tenant_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. EL MEDIO PUEDE SER IMAGEN O DOCUMENTO
-- ------------------------------------------------------------
ALTER TABLE public.hermes_media
  ADD COLUMN IF NOT EXISTS bucket            text NOT NULL DEFAULT 'hermes-voz',
  ADD COLUMN IF NOT EXISTS width             integer,
  ADD COLUMN IF NOT EXISTS height            integer,
  -- El nombre que puso el usuario y el que se enseña. Se guardan los dos:
  -- el original para que se reconozca el archivo, y el saneado para
  -- pintarlo sin que una barra o unos puntos hagan de las suyas.
  ADD COLUMN IF NOT EXISTS original_name     text,
  ADD COLUMN IF NOT EXISTS safe_display_name text;

ALTER TABLE public.hermes_media DROP CONSTRAINT IF EXISTS hermes_media_media_kind_check;
ALTER TABLE public.hermes_media
  ADD CONSTRAINT hermes_media_media_kind_check
  CHECK (media_kind IN ('voice', 'audio', 'image', 'document'));

-- ------------------------------------------------------------
-- 3. EL BUCKET DE IMÁGENES Y DOCUMENTOS
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hermes-medios', 'hermes-medios', false,
  26214400,   -- 25 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword', 'text/plain', 'text/csv']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Nada de ejecutables. La lista de arriba es blanca a propósito: lo que no
-- está, no entra. Un .apk o un .exe en el chat del dueño no tiene ningún
-- uso legítimo y sí varios ilegítimos.

DROP POLICY IF EXISTS "hermes_medios_select" ON storage.objects;
CREATE POLICY "hermes_medios_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hermes-medios'
       AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

DROP POLICY IF EXISTS "hermes_medios_insert" ON storage.objects;
CREATE POLICY "hermes_medios_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hermes-medios'
            AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

DROP POLICY IF EXISTS "hermes_medios_delete" ON storage.objects;
CREATE POLICY "hermes_medios_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hermes-medios'
       AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

CREATE OR REPLACE FUNCTION hermes.medios_limites()
RETURNS json LANGUAGE sql IMMUTABLE AS $$
  SELECT json_build_object(
    'imagen', json_build_object(
      'max_bytes', 12582912,
      'mimes', json_build_array('image/jpeg','image/png','image/webp','image/heic','image/heif'),
      'max_lado', 4096),
    'documento', json_build_object(
      'max_bytes', 26214400,
      'mimes', json_build_array('application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword','text/plain','text/csv')),
    'max_por_mensaje', 6);
$$;
GRANT EXECUTE ON FUNCTION hermes.medios_limites() TO authenticated, hermes_readonly;

-- ------------------------------------------------------------
-- 4. REGISTRAR UNA IMAGEN O UN DOCUMENTO
-- ------------------------------------------------------------
-- Hermana de hermes_voz_registrar, con las mismas comprobaciones y contra
-- storage.objects, no contra lo que diga el teléfono.
CREATE OR REPLACE FUNCTION public.hermes_medio_registrar(
  p_storage_path text,
  p_media_kind   text,
  p_mime_type    text,
  p_size_bytes   bigint,
  p_sha256       text,
  p_original_name text DEFAULT NULL,
  p_width        integer DEFAULT NULL,
  p_height       integer DEFAULT NULL,
  p_metricas     jsonb DEFAULT '{}'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_lim    json := hermes.medios_limites();
  v_grupo  json;
  v_obj    record;
  v_conv   text;
  v_epoca  integer;
  v_id     uuid;
  v_mime   text := lower(btrim(COALESCE(p_mime_type,'')));
  v_sha    text := lower(btrim(COALESCE(p_sha256,'')));
  v_nombre text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF p_media_kind NOT IN ('image','document') THEN
    RAISE EXCEPTION 'Tipo de medio no válido aquí: % (el audio va por hermes_voz_registrar)', p_media_kind;
  END IF;
  IF split_part(COALESCE(p_storage_path,''), '/', 1) <> v_tenant::text THEN
    RAISE EXCEPTION 'Esa ruta no es de esta empresa.';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'El sha256 no tiene la forma esperada.';
  END IF;

  v_grupo := v_lim -> (CASE WHEN p_media_kind = 'image' THEN 'imagen' ELSE 'documento' END);

  IF NOT (v_mime = ANY (SELECT json_array_elements_text(v_grupo -> 'mimes'))) THEN
    RAISE EXCEPTION 'Ese tipo de archivo no se admite: %', v_mime;
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'El archivo llegó vacío.';
  END IF;
  IF p_size_bytes > (v_grupo ->> 'max_bytes')::bigint THEN
    RAISE EXCEPTION 'El archivo pesa demasiado (máximo % MB).',
      round((v_grupo ->> 'max_bytes')::numeric / 1048576, 0);
  END IF;

  SELECT o.id,
         COALESCE((o.metadata ->> 'size')::bigint, 0)   AS size,
         lower(COALESCE(o.metadata ->> 'mimetype','')) AS mime
    INTO v_obj
  FROM storage.objects o
  WHERE o.bucket_id = 'hermes-medios' AND o.name = p_storage_path;

  IF v_obj.id IS NULL THEN RAISE EXCEPTION 'Ese archivo no está subido todavía.'; END IF;
  IF v_obj.size <> p_size_bytes THEN
    RAISE EXCEPTION 'El tamaño declarado no coincide con el archivo subido.';
  END IF;

  -- El nombre que se enseña se sanea aquí y no en el teléfono: el que
  -- pinta no puede ser el que decide qué es seguro pintar. Se quitan
  -- barras, puntos seguidos y todo lo que no sea texto llano.
  v_nombre := regexp_replace(COALESCE(NULLIF(btrim(p_original_name),''), 'archivo'),
                             '[^a-zA-Z0-9 ._-]', '_', 'g');
  v_nombre := regexp_replace(v_nombre, '\.{2,}', '.', 'g');
  v_nombre := left(v_nombre, 80);

  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT k.context_epoch INTO v_epoca FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;
  v_epoca := COALESCE(v_epoca, 1);

  SELECT m.media_id INTO v_id FROM public.hermes_media m
  WHERE m.tenant_id = v_tenant AND m.sha256 = v_sha
    AND m.mensaje_id IS NULL AND m.deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    RETURN json_build_object('media_id', v_id, 'duplicado', true);
  END IF;

  INSERT INTO public.hermes_media
    (tenant_id, conversation_key, context_epoch, origen, media_kind, bucket,
     mime_type, size_bytes, storage_path, sha256, estado,
     transcription_status, width, height, original_name, safe_display_name,
     metricas, created_by)
  VALUES
    (v_tenant, v_conv, v_epoca, 'usuario', p_media_kind, 'hermes-medios',
     v_mime, p_size_bytes, p_storage_path, v_sha, 'subido',
     'no_aplica', p_width, p_height, left(COALESCE(p_original_name,''), 200), v_nombre,
     COALESCE(p_metricas,'{}'::jsonb), auth.uid())
  RETURNING media_id INTO v_id;

  RETURN json_build_object('media_id', v_id, 'duplicado', false,
                           'safe_display_name', v_nombre);
END $$;

-- ------------------------------------------------------------
-- 5. MANDAR UN MENSAJE DESDE EL MÓVIL
-- ------------------------------------------------------------
-- Una sola puerta para texto, imagen, voz, documento y mezcla. Idempotente
-- por client_message_id: reintentar con el mismo devuelve el mismo id y NO
-- crea otro mensaje.
CREATE OR REPLACE FUNCTION public.hermes_movil_escribir(
  p_client_message_id text,
  p_texto          text DEFAULT NULL,
  p_media_ids      uuid[] DEFAULT NULL,
  p_pantalla       jsonb DEFAULT NULL,
  p_device_id      text DEFAULT NULL,
  p_app_version    text DEFAULT NULL,
  p_client_platform text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_texto  text := NULLIF(btrim(COALESCE(p_texto,'')), '');
  v_cmid   text := NULLIF(btrim(COALESCE(p_client_message_id,'')), '');
  v_conv   text;
  v_epoca  integer;
  v_id     bigint;
  v_prim   uuid;
  v_tipo   text;
  v_n      int := 0;
  v_kinds  text[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF v_cmid IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador del cliente: sin él no hay idempotencia.';
  END IF;
  IF v_texto IS NULL AND (p_media_ids IS NULL OR array_length(p_media_ids,1) IS NULL) THEN
    RAISE EXCEPTION 'Mensaje vacío.';
  END IF;

  -- Lo primero, antes de tocar nada: ¿ya llegó este mensaje? Es el caso
  -- normal cuando la red se cae después de insertar y antes de contestar.
  SELECT c.id INTO v_id FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.client_message_id = v_cmid;
  IF v_id IS NOT NULL THEN
    SELECT c.conversation_key, c.context_epoch, c.message_type
      INTO v_conv, v_epoca, v_tipo
    FROM public.hermes_chat c WHERE c.id = v_id;
    RETURN json_build_object('id', v_id, 'enviado', true, 'duplicado', true,
                             'message_type', v_tipo,
                             'conversation_key', v_conv, 'context_epoch', v_epoca);
  END IF;

  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT k.context_epoch INTO v_epoca FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;
  IF v_epoca IS NULL THEN
    INSERT INTO public.hermes_conversaciones (tenant_id, conversation_key)
    VALUES (v_tenant, v_conv) ON CONFLICT DO NOTHING;
    v_epoca := 1;
  END IF;

  -- Los medios tienen que ser suyos, de esta empresa y sin mandar.
  IF p_media_ids IS NOT NULL AND array_length(p_media_ids,1) IS NOT NULL THEN
    SELECT count(*)::int, array_agg(DISTINCT m.media_kind), min(m.media_id::text)::uuid
      INTO v_n, v_kinds, v_prim
    FROM public.hermes_media m
    WHERE m.media_id = ANY(p_media_ids) AND m.tenant_id = v_tenant
      AND m.deleted_at IS NULL AND m.mensaje_id IS NULL AND m.origen = 'usuario';

    IF v_n <> array_length(p_media_ids, 1) THEN
      RAISE EXCEPTION 'Alguno de los archivos no existe, ya se mandó o no es de esta empresa.';
    END IF;
    IF v_n > (hermes.medios_limites() ->> 'max_por_mensaje')::int THEN
      RAISE EXCEPTION 'Demasiados archivos en un mensaje (máximo %).',
        (hermes.medios_limites() ->> 'max_por_mensaje')::int;
    END IF;
    -- El primero en el orden que mandó el cliente, no el menor uuid.
    v_prim := p_media_ids[1];
  END IF;

  v_tipo := CASE
    WHEN v_n = 0 THEN 'text'
    WHEN v_texto IS NOT NULL THEN 'mixed'
    WHEN v_kinds = ARRAY['voice'] THEN 'voice'
    WHEN v_kinds = ARRAY['image'] THEN 'image'
    WHEN v_kinds = ARRAY['document'] THEN 'document'
    ELSE 'mixed' END;

  INSERT INTO public.hermes_chat
    (tenant_id, user_id, rol, texto, pantalla, conversation_key,
     origin_platform, origin_chat_id, estado, context_epoch,
     message_type, media_id, source_surface, client_platform,
     device_id, app_version, client_message_id)
  VALUES
    (v_tenant, auth.uid(), 'usuario',
     COALESCE(v_texto, CASE v_tipo
       WHEN 'voice' THEN '(nota de voz)'
       WHEN 'image' THEN '(imagen)'
       WHEN 'document' THEN '(documento)'
       ELSE '(adjunto)' END),
     p_pantalla, v_conv,
     -- El transporte SIGUE siendo motoflow. Lo que cambia es la interfaz.
     'motoflow', COALESCE(p_device_id, auth.uid()::text),
     'pendiente', v_epoca,
     v_tipo, v_prim, 'mobile',
     lower(NULLIF(btrim(COALESCE(p_client_platform,'')),'')),
     NULLIF(btrim(COALESCE(p_device_id,'')),''),
     NULLIF(btrim(COALESCE(p_app_version,'')),''), v_cmid)
  RETURNING id INTO v_id;

  UPDATE public.hermes_chat SET origin_message_id = v_id::text WHERE id = v_id;

  IF v_n > 0 THEN
    UPDATE public.hermes_media SET mensaje_id = v_id, estado = 'enviado'
    WHERE media_id = ANY(p_media_ids);
  END IF;

  PERFORM pg_notify('hermes_chat', json_build_object(
    'id', v_id, 'tenant_id', v_tenant, 'conversation_key', v_conv,
    'context_epoch', v_epoca, 'origin_platform', 'motoflow',
    'source_surface', 'mobile', 'message_type', v_tipo,
    'medios', v_n)::text);

  RETURN json_build_object('id', v_id, 'enviado', true, 'duplicado', false,
                           'message_type', v_tipo, 'medios', v_n,
                           'conversation_key', v_conv, 'context_epoch', v_epoca);
END $$;

-- ------------------------------------------------------------
-- 6. LOS DISPOSITIVOS
-- ------------------------------------------------------------
-- El token de push NO es identidad. Aquí es un dato del dispositivo de un
-- usuario ya autenticado; quien manda es user_id + tenant_id.
CREATE TABLE IF NOT EXISTS public.hermes_dispositivos (
  device_id    text NOT NULL,
  tenant_id    uuid NOT NULL,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_token   text,
  plataforma   text CHECK (plataforma IN ('android','ios','web')),
  app_version  text,
  modelo       text,
  autorizado   boolean NOT NULL DEFAULT true,
  ultima_actividad timestamptz NOT NULL DEFAULT now(),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  revocado_en  timestamptz,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_hermes_disp_push
  ON public.hermes_dispositivos (tenant_id, autorizado)
  WHERE push_token IS NOT NULL AND revocado_en IS NULL;

ALTER TABLE public.hermes_dispositivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_disp_propio ON public.hermes_dispositivos;
CREATE POLICY hermes_disp_propio ON public.hermes_dispositivos
  FOR SELECT USING (tenant_id = public.get_user_tenant() AND user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hermes_dispositivos FROM anon, authenticated;
GRANT SELECT ON public.hermes_dispositivos TO authenticated;

CREATE OR REPLACE FUNCTION public.hermes_dispositivo_registrar(
  p_device_id   text,
  p_push_token  text DEFAULT NULL,
  p_plataforma  text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_modelo      text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_dev text := NULLIF(btrim(COALESCE(p_device_id,'')),'');
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'Falta el identificador del dispositivo.'; END IF;

  -- Un mismo token en otro dispositivo o de otro usuario se suelta del
  -- anterior. Los tokens de push se reasignan cuando alguien reinstala, y
  -- dejar el viejo colgado manda avisos de una empresa a otra persona.
  IF p_push_token IS NOT NULL THEN
    UPDATE public.hermes_dispositivos
    SET push_token = NULL
    WHERE push_token = p_push_token AND (device_id <> v_dev OR user_id <> auth.uid());
  END IF;

  INSERT INTO public.hermes_dispositivos
    (device_id, tenant_id, user_id, push_token, plataforma, app_version, modelo)
  VALUES (v_dev, v_tenant, auth.uid(), NULLIF(btrim(COALESCE(p_push_token,'')),''),
          lower(NULLIF(btrim(COALESCE(p_plataforma,'')),'')),
          NULLIF(btrim(COALESCE(p_app_version,'')),''),
          left(COALESCE(p_modelo,''), 80))
  ON CONFLICT (tenant_id, device_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        push_token = COALESCE(EXCLUDED.push_token, public.hermes_dispositivos.push_token),
        plataforma = COALESCE(EXCLUDED.plataforma, public.hermes_dispositivos.plataforma),
        app_version = COALESCE(EXCLUDED.app_version, public.hermes_dispositivos.app_version),
        modelo = COALESCE(NULLIF(EXCLUDED.modelo,''), public.hermes_dispositivos.modelo),
        autorizado = true, revocado_en = NULL, ultima_actividad = now();

  RETURN json_build_object('ok', true, 'device_id', v_dev);
END $$;

-- Cerrar sesión suelta el token. Sin esto, el teléfono de alguien que ya
-- no trabaja aquí sigue recibiendo lo que pasa en la empresa.
CREATE OR REPLACE FUNCTION public.hermes_dispositivo_revocar(p_device_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  UPDATE public.hermes_dispositivos
  SET push_token = NULL, autorizado = false, revocado_en = now()
  WHERE tenant_id = v_tenant AND device_id = btrim(p_device_id) AND user_id = auth.uid();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', v_n > 0);
END $$;

-- ------------------------------------------------------------
-- 7. LA COLA, CON LA SUPERFICIE Y TODOS LOS MEDIOS
-- ------------------------------------------------------------
-- >>> AQUÍ SE CAMBIA EL TIPO DE RETORNO DE chat_tomar_v5 <<<
-- Se puede porque v5 se aplicó hoy y su consumidor todavía no existe. v4
-- ni se toca: hermes.chat_tomar(integer) sigue exactamente igual.
DROP FUNCTION IF EXISTS hermes.chat_tomar_v5(integer);

CREATE OR REPLACE FUNCTION hermes.chat_tomar_v5(p_limite integer DEFAULT 1)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  origin_platform text, origin_chat_id text, origin_message_id text,
  claim_token uuid, lease_until timestamptz, context_epoch integer,
  message_type text, media_id uuid, media_kind text, mime_type text,
  codec text, size_bytes bigint, duration_ms integer, sha256 text,
  storage_path text, media_token text, media_token_expira timestamptz,
  -- v5.1:
  source_surface text, client_platform text, device_id text,
  app_version text, client_message_id text,
  -- TODOS los medios del mensaje, no solo el primero: un mensaje móvil
  -- puede llevar varias fotos con un solo pie de texto.
  medios jsonb
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
    SET estado = 'procesando', procesando_en = now(),
        recibido_en = COALESCE(c.recibido_en, now()),
        intentos = c.intentos + 1,
        claim_token = gen_random_uuid(),
        lease_until = now() + hermes.chat_lease()
    FROM elegidos e
    WHERE c.id = e.id
    RETURNING c.*
  ),
  -- Un permiso POR CADA medio del mensaje. Con seis fotos hacen falta
  -- seis: el token va atado al media_id, no al mensaje.
  medios_todos AS (
    SELECT t.id AS msg, m.*
    FROM tomados t
    JOIN public.hermes_media m ON m.mensaje_id = t.id AND m.deleted_at IS NULL
  ),
  tokens AS (
    INSERT INTO public.hermes_media_tokens AS mt
      (token_sha256, media_id, mensaje_id, tenant_id, expira_en)
    SELECT encode(sha256(convert_to(t.claim_token::text || ':' || mm.media_id::text, 'UTF8')), 'hex'),
           mm.media_id, t.id, t.tenant_id, now() + make_interval(secs => v_ttl)
    FROM tomados t
    JOIN medios_todos mm ON mm.msg = t.id
    ON CONFLICT (token_sha256) DO UPDATE
      SET expira_en = EXCLUDED.expira_en, usos = 0, usado_en = NULL
    RETURNING mt.media_id, mt.expira_en
  )
  SELECT t.id, t.texto, t.pantalla, t.creado_en, t.user_id,
         COALESCE(p.full_name, p.email, '(sin nombre)'), p.email, t.rol,
         t.conversation_key, t.estado, t.intentos,
         t.origin_platform, t.origin_chat_id, t.origin_message_id,
         t.claim_token, t.lease_until, t.context_epoch,
         t.message_type, t.media_id, m.media_kind, m.mime_type, m.codec,
         m.size_bytes, m.duration_ms, m.sha256, m.storage_path,
         CASE WHEN t.media_id IS NOT NULL
              THEN t.claim_token::text || ':' || t.media_id::text END,
         tk.expira_en,
         t.source_surface, t.client_platform, t.device_id,
         t.app_version, t.client_message_id,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'media_id', mm.media_id, 'media_kind', mm.media_kind,
                    'mime_type', mm.mime_type, 'codec', mm.codec,
                    'size_bytes', mm.size_bytes, 'duration_ms', mm.duration_ms,
                    'width', mm.width, 'height', mm.height,
                    'sha256', mm.sha256, 'storage_path', mm.storage_path,
                    'bucket', mm.bucket,
                    'nombre', mm.safe_display_name,
                    -- Un permiso por medio, derivado del mismo claim.
                    'media_token', t.claim_token::text || ':' || mm.media_id::text)
                  ORDER BY mm.created_at)
           FROM medios_todos mm WHERE mm.msg = t.id), '[]'::jsonb)
  FROM tomados t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.hermes_media m ON m.media_id = t.media_id
  LEFT JOIN tokens tk ON tk.media_id = t.media_id
  ORDER BY t.id;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_tomar_v5(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_tomar_v5(integer) TO hermes_readonly;

-- El canje tiene que saber de qué bucket sacar el archivo.
CREATE OR REPLACE FUNCTION hermes.media_canjear(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hash text := encode(sha256(convert_to(COALESCE(p_token,''), 'UTF8')), 'hex');
  v_t record; v_m record;
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

  UPDATE public.hermes_media_tokens SET usos = usos + 1, usado_en = now()
  WHERE token_sha256 = v_hash;

  SELECT * INTO v_m FROM public.hermes_media WHERE media_id = v_t.media_id;
  IF v_m.media_id IS NULL OR v_m.deleted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'audio_no_disponible');
  END IF;

  RETURN json_build_object(
    'ok', true, 'bucket', v_m.bucket,
    'storage_path', v_m.storage_path, 'mime_type', v_m.mime_type,
    'media_kind', v_m.media_kind, 'nombre', v_m.safe_display_name,
    'size_bytes', v_m.size_bytes, 'sha256', v_m.sha256,
    'duration_ms', v_m.duration_ms, 'media_id', v_m.media_id);
END $$;

REVOKE ALL ON FUNCTION hermes.media_canjear(text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 8. LO QUE LEE EL MÓVIL
-- ------------------------------------------------------------
-- Una llamada y ya: mensajes, medios y aprobaciones pendientes. En un
-- teléfono con datos móviles, tres viajes de red son tres oportunidades
-- de que se caiga a la mitad.
--
-- NO devuelve claim_token, ni lease, ni rutas de storage: el teléfono no
-- tiene nada que hacer con eso.
CREATE OR REPLACE FUNCTION public.hermes_movil_historial(
  p_desde_id bigint DEFAULT NULL,
  p_limite   integer DEFAULT 40)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_conv   text;
  v_epoca  integer;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT COALESCE(k.context_epoch, 1) INTO v_epoca
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;
  v_epoca := COALESCE(v_epoca, 1);

  SELECT json_build_object(
    'conversation_key', v_conv,
    'context_epoch', v_epoca,
    'mensajes', (
      SELECT COALESCE(json_agg(x ORDER BY x.id), '[]'::json) FROM (
        SELECT c.id, c.rol, c.texto, c.message_type, c.creado_en,
               c.estado, c.context_epoch, c.client_message_id,
               c.source_surface, c.ultimo_error AS error_message,
               (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'media_id', m.media_id, 'kind', m.media_kind,
                          'mime_type', m.mime_type, 'duration_ms', m.duration_ms,
                          'width', m.width, 'height', m.height,
                          'size_bytes', m.size_bytes, 'bucket', m.bucket,
                          'storage_path', m.storage_path,
                          'nombre', m.safe_display_name,
                          'transcript', m.transcript,
                          'transcription_status', m.transcription_status,
                          'tts_status', m.tts_status) ORDER BY m.created_at), '[]'::jsonb)
                FROM public.hermes_media m
                WHERE m.mensaje_id = c.id AND m.deleted_at IS NULL) AS medios
        FROM public.hermes_chat c
        WHERE c.tenant_id = v_tenant
          AND c.conversation_key = v_conv
          AND c.context_epoch = v_epoca
          AND (p_desde_id IS NULL OR c.id > p_desde_id)
        ORDER BY c.id DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 40), 100))
      ) x
    ),
    'hermes_conectado', (
      SELECT COALESCE(max(pr.ultimo) > now() - interval '3 minutes', false)
      FROM public.hermes_presencia pr WHERE pr.tenant_id = v_tenant)
  ) INTO v_out;

  RETURN v_out;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_movil_v5_1.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT hermes.chat_capacidades() AS capacidades;
