-- ============================================================
-- LA IMAGEN SE ENGANCHA SOLA
-- ============================================================
-- Complemento de hermes_manda_la_imagen.sql, que ya creó la tabla y la
-- función que responde con foto.
--
-- El problema que resuelve: el gateway manda la imagen y el texto por dos
-- caminos distintos. `send_image_file` recibe el archivo; `send()` manda la
-- respuesta escrita. Si la imagen usara chat_responder_imagen() —que
-- contesta— el mismo turno acabaría con DOS respuestas.
--
-- La voz esquiva eso registrando el audio suelto y colgándolo en el envío
-- final. Pero para imitarlo habría que tocar send(), que es donde vive el
-- fencing por claim_token. Mover eso para colgar una foto es cambiar el
-- cerrojo para colgar un cuadro.
--
-- Aquí el enganche lo hace la base:
--
--   · si la respuesta YA existe cuando llega la imagen → se cuelga al vuelo
--   · si la imagen llega primero → queda esperando, y un trigger la cuelga
--     cuando la respuesta entra
--
-- Así el adaptador solo aprende UN método nuevo y no se toca nada del camino
-- que hoy funciona.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A QUÉ PREGUNTA ESTÁ ESPERANDO
-- ------------------------------------------------------------
-- Mientras no tenga respuesta, la imagen recuerda de qué pregunta salió.
-- `mensaje_id` sigue siendo la respuesta (como en hermes_media); esto es la
-- sala de espera.
ALTER TABLE public.hermes_imagenes
  ADD COLUMN IF NOT EXISTS espera_de bigint REFERENCES public.hermes_chat(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hermes_imagenes_espera
  ON public.hermes_imagenes (espera_de) WHERE mensaje_id IS NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. HERMES REGISTRA LA IMAGEN
-- ------------------------------------------------------------
-- No contesta: solo deja la foto. El claim_token es la prueba de que ese
-- turno es suyo, igual que en chat_media_registrar.
CREATE OR REPLACE FUNCTION hermes.chat_imagen_registrar(
  p_mensaje_id  bigint,
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
  v_max    int  := 4194304;
  v_c      record;
  v_bytes  bytea;
  v_size   bigint;
  v_sha    text;
  v_img    uuid;
  v_rid    bigint;
BEGIN
  IF p_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'Tipo de imagen no admitido: %', p_mime_type;
  END IF;

  SELECT c.id, c.claim_token INTO v_c
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'El mensaje % no existe en este tenant', p_mensaje_id;
  END IF;
  -- Mismo contrato que el resto: si el turno ya es de otro, se abandona sin
  -- escribir nada. Un 'abandonar' no es un error que reintentar.
  IF v_c.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
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

  SELECT i.imagen_id INTO v_img
  FROM public.hermes_imagenes i
  WHERE i.tenant_id = v_tenant AND i.sha256 = v_sha AND i.deleted_at IS NULL;

  IF v_img IS NULL THEN
    INSERT INTO public.hermes_imagenes
      (tenant_id, origen, mime_type, nombre, size_bytes, bytes, sha256, espera_de)
    VALUES (v_tenant, 'hermes', p_mime_type, p_nombre, v_size, v_bytes, v_sha, p_mensaje_id)
    RETURNING imagen_id INTO v_img;
  ELSE
    UPDATE public.hermes_imagenes
       SET espera_de = COALESCE(espera_de, p_mensaje_id)
     WHERE imagen_id = v_img AND mensaje_id IS NULL;
  END IF;

  -- ¿Y si la respuesta ya entró? Entonces no hay que esperar a nadie.
  SELECT r.id INTO v_rid
  FROM public.hermes_chat r
  WHERE r.tenant_id = v_tenant AND r.rol = 'hermes' AND r.responde_a = p_mensaje_id
    AND r.imagen_id IS NULL
  ORDER BY r.id DESC LIMIT 1;

  IF v_rid IS NOT NULL THEN
    UPDATE public.hermes_chat
       SET imagen_id = v_img, message_type = 'mixed'
     WHERE id = v_rid AND tenant_id = v_tenant;
    UPDATE public.hermes_imagenes
       SET mensaje_id = v_rid, espera_de = NULL
     WHERE imagen_id = v_img;
  END IF;

  RETURN json_build_object(
    'ok', true, 'imagen_id', v_img, 'size_bytes', v_size,
    'colgada_de', v_rid, 'esperando', (v_rid IS NULL));
END $fn$;

REVOKE ALL ON FUNCTION hermes.chat_imagen_registrar(bigint,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_imagen_registrar(bigint,uuid,text,text,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 3. Y SI LA IMAGEN LLEGÓ PRIMERO, LA RESPUESTA LA RECOGE
-- ------------------------------------------------------------
-- El trigger no inventa nada: solo mira si había una foto esperando esa
-- misma pregunta. Por eso no hay que tocar chat_responder().
--
-- Va DESPUÉS del insert, no antes. En BEFORE la respuesta todavía no existe
-- en la tabla, y apuntar la imagen a ella rompe la clave foránea. Lo cazó el
-- simulacro de abajo; en BEFORE parecía más elegante y no funcionaba.
CREATE OR REPLACE FUNCTION public.hermes_colgar_imagen_pendiente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_img uuid;
BEGIN
  IF NEW.rol <> 'hermes' OR NEW.responde_a IS NULL OR NEW.imagen_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT i.imagen_id INTO v_img
  FROM public.hermes_imagenes i
  WHERE i.tenant_id = NEW.tenant_id AND i.espera_de = NEW.responde_a
    AND i.mensaje_id IS NULL AND i.deleted_at IS NULL
  ORDER BY i.creado_en DESC LIMIT 1;

  IF v_img IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.hermes_chat
     SET imagen_id = v_img, message_type = 'mixed'
   WHERE id = NEW.id;

  UPDATE public.hermes_imagenes
     SET mensaje_id = NEW.id, espera_de = NULL
   WHERE imagen_id = v_img;

  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_hermes_colgar_imagen ON public.hermes_chat;
CREATE TRIGGER trg_hermes_colgar_imagen
  AFTER INSERT ON public.hermes_chat
  FOR EACH ROW EXECUTE FUNCTION public.hermes_colgar_imagen_pendiente();

SELECT public.registrar_migracion('la_imagen_se_engancha_sola.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Se prueba el caso difícil, el que rompe si el diseño está mal: la imagen
-- llega ANTES que la respuesta. Corre de verdad contra producción y revienta
-- al final para no dejar rastro.
DO $p$
DECLARE
  v_ten  uuid := '00000000-0000-0000-0000-000000000001';
  v_msg  bigint;
  v_tok  uuid := gen_random_uuid();
  -- Un PNG de 1x1 real, para que el tipo y el tamaño no sean de mentira.
  v_b64  text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  r1     json;
  v_rid  bigint;
  v_col  uuid;
  v_mal  json;
BEGIN
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, claim_token, estado, conversation_key)
  VALUES (v_ten, 'usuario', 'PRUEBA imagen', v_tok, 'procesando',
          'agent:main:morla:tenant:' || v_ten)
  RETURNING id INTO v_msg;

  -- 1) La foto llega primero: no hay respuesta a la que colgarse.
  r1 := hermes.chat_imagen_registrar(v_msg, v_tok, v_b64, 'image/png', 'prueba.png');

  -- 2) Entra la respuesta. El trigger tiene que recogerla sola.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, responde_a, conversation_key)
  VALUES (v_ten, 'hermes', 'Aqui va', v_msg, 'agent:main:morla:tenant:' || v_ten)
  RETURNING id INTO v_rid;

  SELECT c.imagen_id INTO v_col FROM public.hermes_chat c WHERE c.id = v_rid;

  -- 3) Un claim ajeno no puede escribir en el turno de otro.
  v_mal := hermes.chat_imagen_registrar(v_msg, gen_random_uuid(), v_b64, 'image/png', 'x.png');

  RAISE EXCEPTION 'PRUEBA: registro=[esperando=%] | la respuesta la recogio=[%] | es la misma=[%] | claim_ajeno=[%]',
    (r1 ->> 'esperando'),
    COALESCE(left(v_col::text, 8), 'NO LA COGIO'),
    (v_col::text = (r1 ->> 'imagen_id')),
    COALESCE(v_mal ->> 'motivo', 'LE DEJO ENTRAR');
END $p$;
