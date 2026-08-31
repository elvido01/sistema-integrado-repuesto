-- ============================================================
-- QUE LA FOTO LLEGUE AL CHAT
-- ============================================================
-- Hermes hizo la promoción de la careta el 29/08 a las 22:39. La pantalla
-- nunca la vio. En el log quedó el motivo:
--
--   [MotoFlow] send_image_file fallback: native image send unavailable
--   [MotoFlow] Failed to send image: claim_abandoned
--
-- No es que fallara la subida: es que NO HAY por dónde. El carril de medios
-- existe (así viajan las notas de voz) pero está hecho solo para audio:
--
--   · el bucket `hermes-voz` rechaza imágenes por allowed_mime_types
--   · hermes_media.media_kind solo admite 'voice' y 'audio'
--   · y el hueco de verdad: las políticas de storage exigen sesión
--     authenticated, y Hermes entra como ROL de base, sin JWT. El audio de
--     Hermes lo sube una Edge Function; el plugin no sube nada.
--
-- Por eso la imagen NO va al Storage: va aquí, en la base. Él ya sabe hablar
-- con Postgres — es lo único que sabe hacer — así que no hace falta darle
-- credenciales de subida, ni un bucket, ni una función intermedia. Un borrador
-- ocasional de 2 MB en una fila es barato; una llave de escritura repartida,
-- no.
--
-- Idempotente: se puede correr dos veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DONDE VIVE LA IMAGEN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hermes_imagenes (
  imagen_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  -- Se llena al colgarla de la respuesta. Nace suelta porque primero se
  -- registra y después se contesta, igual que el audio.
  mensaje_id  bigint REFERENCES public.hermes_chat(id) ON DELETE SET NULL,
  origen      text NOT NULL DEFAULT 'hermes' CHECK (origen IN ('hermes', 'usuario')),
  mime_type   text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  nombre      text,
  size_bytes  bigint NOT NULL CHECK (size_bytes > 0),
  bytes       bytea NOT NULL,
  -- Idempotencia: si el gateway reintenta el mismo turno, la misma imagen no
  -- se guarda dos veces.
  sha256      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hermes_imagenes_sha
  ON public.hermes_imagenes (tenant_id, sha256) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hermes_imagenes_msg
  ON public.hermes_imagenes (mensaje_id) WHERE deleted_at IS NULL;

ALTER TABLE public.hermes_imagenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_imagenes_propia ON public.hermes_imagenes;
-- get_user_tenant() y no profiles.tenant_id: la empresa es la ACTIVA. Con
-- profiles, quien cambia de empresa deja de ver sus propias imágenes y RLS
-- no avisa, devuelve cero filas.
CREATE POLICY hermes_imagenes_propia ON public.hermes_imagenes
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant() AND deleted_at IS NULL);

-- ------------------------------------------------------------
-- 2. LA COLUMNA QUE LA CUELGA DEL MENSAJE
-- ------------------------------------------------------------
ALTER TABLE public.hermes_chat
  ADD COLUMN IF NOT EXISTS imagen_id uuid REFERENCES public.hermes_imagenes(imagen_id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3. HERMES CONTESTA CON IMAGEN
-- ------------------------------------------------------------
-- >>> EL TEXTO SIGUE SIENDO LA RESPUESTA. <<<
-- Por eso delega en chat_responder() —el mismo fencing por claim_token, sin
-- tocarlo— y solo después le cuelga la imagen a la fila que creó. Si la
-- imagen no se puede guardar, la respuesta llega igual: quedarse sin foto es
-- un inconveniente, quedarse sin respuesta es una avería.
CREATE OR REPLACE FUNCTION hermes.chat_responder_imagen(
  p_mensaje_id  bigint,
  p_texto       text,
  p_acciones    jsonb,
  p_claim_token uuid,
  p_imagen_b64  text,
  p_mime_type   text,
  p_nombre      text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_max    int  := 4194304;   -- 4 MB. El borrador de la careta pesa 2 MB.
  v_bytes  bytea;
  v_size   bigint;
  v_sha    text;
  v_img    uuid;
  v_res    json;
  v_rid    bigint;
BEGIN
  IF p_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'Tipo de imagen no admitido: %. Solo png, jpeg o webp.', p_mime_type;
  END IF;

  BEGIN
    v_bytes := decode(p_imagen_b64, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La imagen no viene en base64 válido';
  END;

  v_size := octet_length(v_bytes);
  IF v_size = 0 THEN
    RAISE EXCEPTION 'La imagen viene vacía';
  END IF;
  IF v_size > v_max THEN
    RAISE EXCEPTION 'La imagen pesa % bytes; el máximo es %', v_size, v_max;
  END IF;

  v_sha := encode(sha256(v_bytes), 'hex');

  -- Reintentar el mismo turno no crea otra fila.
  SELECT i.imagen_id INTO v_img
  FROM public.hermes_imagenes i
  WHERE i.tenant_id = v_tenant AND i.sha256 = v_sha AND i.deleted_at IS NULL;

  IF v_img IS NULL THEN
    INSERT INTO public.hermes_imagenes
      (tenant_id, origen, mime_type, nombre, size_bytes, bytes, sha256)
    VALUES (v_tenant, 'hermes', p_mime_type, p_nombre, v_size, v_bytes, v_sha)
    RETURNING imagen_id INTO v_img;
  END IF;

  v_res := hermes.chat_responder(p_mensaje_id, p_texto, p_acciones, p_claim_token);

  -- Si el turno ya no era suyo, o si ya estaba contestado, no se cuelga nada:
  -- la respuesta buena ya tiene lo que tenga.
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE
     OR COALESCE((v_res ->> 'duplicado')::boolean, false) THEN
    RETURN (v_res::jsonb || jsonb_build_object('imagen_id', v_img))::json;
  END IF;

  v_rid := (v_res ->> 'respuesta_id')::bigint;

  IF v_rid IS NOT NULL THEN
    UPDATE public.hermes_chat
       SET imagen_id = v_img, message_type = 'mixed'
     WHERE id = v_rid AND tenant_id = v_tenant;

    UPDATE public.hermes_imagenes
       SET mensaje_id = v_rid
     WHERE imagen_id = v_img;
  END IF;

  RETURN (v_res::jsonb || jsonb_build_object(
    'imagen_id', v_img, 'size_bytes', v_size, 'duplicada', (v_size IS NOT NULL AND v_img IS NOT NULL)))::json;
END $fn$;

REVOKE ALL ON FUNCTION hermes.chat_responder_imagen(bigint,text,jsonb,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_responder_imagen(bigint,text,jsonb,uuid,text,text,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 4. LA PANTALLA LA PIDE
-- ------------------------------------------------------------
-- Devuelve la imagen en base64 para pintarla como data: URI. No hay bucket
-- que firmar ni URL que caduque; y la empresa la pone el servidor, no el
-- cliente.
CREATE OR REPLACE FUNCTION public.hermes_imagen_ver(p_imagen_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_i      record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;

  SELECT * INTO v_i FROM public.hermes_imagenes
  WHERE imagen_id = p_imagen_id AND tenant_id = v_tenant AND deleted_at IS NULL;

  IF v_i.imagen_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_disponible');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'mime_type', v_i.mime_type,
    'nombre', v_i.nombre,
    'size_bytes', v_i.size_bytes,
    'b64', encode(v_i.bytes, 'base64'));
END $fn$;

REVOKE ALL ON FUNCTION public.hermes_imagen_ver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_imagen_ver(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5. QUE HERMES SEPA QUE PUEDE
-- ------------------------------------------------------------
-- chat_capacidades() es lo que lee el gateway al arrancar. Si la herramienta
-- no está declarada ahí, Hermes no la usa aunque exista.
DO $cap$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'hermes' AND p.proname = 'chat_capacidades';

  IF v_src IS NULL THEN
    RAISE NOTICE 'chat_capacidades() no existe todavía; se declara cuando exista.';
  ELSIF v_src LIKE '%chat_responder_imagen%' THEN
    RAISE NOTICE 'chat_capacidades() ya declara la imagen.';
  ELSE
    RAISE NOTICE 'RECORDATORIO: añadir chat_responder_imagen a hermes.chat_capacidades().';
  END IF;
END $cap$;

SELECT public.registrar_migracion('hermes_manda_la_imagen.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'tabla', (SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name='hermes_imagenes'),
 'columna_chat', (SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='hermes_chat' AND column_name='imagen_id'),
 'hermes_puede_responder_imagen', has_function_privilege('hermes_readonly',
   'hermes.chat_responder_imagen(bigint,text,jsonb,uuid,text,text,text)', 'EXECUTE'),
 'hermes_NO_puede_ver', has_function_privilege('hermes_readonly',
   'public.hermes_imagen_ver(uuid)', 'EXECUTE'),
 'pantalla_puede_ver', has_function_privilege('authenticated',
   'public.hermes_imagen_ver(uuid)', 'EXECUTE')
) AS r;
