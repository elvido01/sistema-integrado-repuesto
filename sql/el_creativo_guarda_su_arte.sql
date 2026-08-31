-- ============================================================
-- EL CREATIVO GUARDA SU ARTE
-- ============================================================
-- Decisión del dueño: el Comercial-Creativo monta su propia pieza. No la
-- monta Hermes, no la monta una persona. Él.
--
-- Le faltaba con qué dibujar (ya lo tiene: scripts/arteCreativo.mjs) y dónde
-- dejarlo. Esto es el dónde: la misma tabla que ya guarda las imágenes de
-- Hermes, `public.hermes_imagenes`, con los bytes dentro de la base.
--
-- No se abre un bucket ni se le da llave de Storage. Es la misma razón de
-- siempre: entra como rol de base, sin sesión, y las políticas de Storage
-- exigen una. Repartir una llave de escritura para guardar un PNG ocasional
-- sale mucho más caro que guardar el PNG donde ya sabe escribir.
--
-- Y de paso se cierra el agujero que dejó pasar un brief como si fuera arte:
-- una pieza solo cuenta como terminada si trae un ARCHIVO.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA IMAGEN PUEDE SER SUYA
-- ------------------------------------------------------------
ALTER TABLE public.hermes_imagenes DROP CONSTRAINT IF EXISTS hermes_imagenes_origen_check;
ALTER TABLE public.hermes_imagenes ADD CONSTRAINT hermes_imagenes_origen_check
  CHECK (origen IN ('hermes', 'usuario', 'comercial_creativo'));

-- ------------------------------------------------------------
-- 2. GUARDAR LA PIEZA
-- ------------------------------------------------------------
-- Con el claim_token por delante: si el turno ya es de otro worker, no
-- escribe. Mismo contrato que el resto de la cola.
CREATE OR REPLACE FUNCTION hermes.equipo_guardar_arte(
  p_mensaje_id  uuid,
  p_claim_token uuid,
  p_imagen_b64  text,
  p_mime_type   text DEFAULT 'image/png',
  p_nombre      text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_m     record;
  v_max   int := 6291456;   -- 6 MB. Una pieza 1080x1920 pesa medio mega.
  v_bytes bytea;
  v_size  bigint;
  v_sha   text;
  v_img   uuid;
BEGIN
  IF p_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'Tipo de imagen no admitido: %', p_mime_type;
  END IF;

  SELECT m.id, m.tenant_id, m.claim_token INTO v_m
  FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;

  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'Ese mensaje no existe';
  END IF;
  IF v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  BEGIN
    v_bytes := decode(p_imagen_b64, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La imagen no viene en base64 válido';
  END;

  v_size := octet_length(v_bytes);
  IF v_size = 0 THEN RAISE EXCEPTION 'La imagen viene vacía'; END IF;
  IF v_size > v_max THEN
    RAISE EXCEPTION 'La imagen pesa % bytes; el máximo es %', v_size, v_max;
  END IF;

  v_sha := encode(sha256(v_bytes), 'hex');

  -- Montar dos veces la misma pieza no crea dos filas.
  SELECT i.imagen_id INTO v_img FROM public.hermes_imagenes i
  WHERE i.tenant_id = v_m.tenant_id AND i.sha256 = v_sha AND i.deleted_at IS NULL;

  IF v_img IS NULL THEN
    INSERT INTO public.hermes_imagenes
      (tenant_id, origen, mime_type, nombre, size_bytes, bytes, sha256)
    VALUES (v_m.tenant_id, 'comercial_creativo', p_mime_type,
            left(COALESCE(p_nombre, 'arte.png'), 120), v_size, v_bytes, v_sha)
    RETURNING imagen_id INTO v_img;
  END IF;

  RETURN json_build_object('ok', true, 'imagen_id', v_img, 'size_bytes', v_size);
END $fn$;

REVOKE ALL ON FUNCTION hermes.equipo_guardar_arte(uuid,uuid,text,text,text) FROM PUBLIC;
DO $g$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['hermes_readonly','equipo_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION hermes.equipo_guardar_arte(uuid,uuid,text,text,text) TO %I', r);
    END IF;
  END LOOP;
END $g$;

-- ------------------------------------------------------------
-- 3. UN BRIEF NO ES UN ARTE
-- ------------------------------------------------------------
-- Lo que dejó pasar la pieza de esta noche: bastaba con que el creativo
-- escribiera estado="arte". Ahora hace falta el archivo.
CREATE OR REPLACE FUNCTION public.equipo_es_arte(p jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT COALESCE(p ->> 'estado','') IN ('arte','final','arte_final')
     AND (
       COALESCE(NULLIF(btrim(COALESCE(p ->> 'arte_imagen_id','')), ''), '') <> ''
       OR COALESCE(NULLIF(btrim(COALESCE(p ->> 'arte_url','')), ''), '') <> ''
     );
$fn$;

SELECT public.registrar_migracion('el_creativo_guarda_su_arte.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'puede_ser_suya', (SELECT pg_get_constraintdef(c.oid) LIKE '%comercial_creativo%'
   FROM pg_constraint c WHERE c.conname = 'hermes_imagenes_origen_check'),
 'guardar_existe', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_guardar_arte'),
 'brief_ya_no_cuela', NOT public.equipo_es_arte('{"estado":"arte","copy":{}}'::jsonb),
 'con_archivo_si', public.equipo_es_arte('{"estado":"arte","arte_imagen_id":"abc"}'::jsonb)
) AS r;
