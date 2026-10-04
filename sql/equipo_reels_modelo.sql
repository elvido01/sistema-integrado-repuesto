-- =====================================================================
-- ESTILO DE TUS REELS — los reels modelo y su receta
-- ---------------------------------------------------------------------
-- (2026-10-04) Pedido del dueño: "quiero realizar algo similar a lo que el
-- sistema hace con las imagenes en Estilo de tus piezas, para que los reel
-- tengan diferentes formatos". Mandó 8 reels de Pedro Racing / Vini y en
-- ellos hay 6 formatos (comercial de estudio, en las manos, pregunta que
-- enseña, colores y variantes, empaque y detalle, vitrina giratoria).
--
-- El dueño pega el ENLACE de un reel (Instagram, TikTok, YouTube). El
-- Comercial-Creativo, en la PC (hermes\equipo), lo baja con yt-dlp, saca
-- tomas con ffmpeg, transcribe la voz y escribe su RECETA: formato, tomas,
-- guion, texto en pantalla, música, duración. La receta se guarda aquí; la
-- Parte 2 (armar reels) la lee para variar el formato.
--
-- Se copia la RECETA, no el contenido: ni su producto, ni su marca, ni sus
-- textos. Eso lo repite el prompt del estudio y lo repetirá el de armar.
--
-- No se sube video en esta parte: solo enlaces. El worker no tiene forma
-- de leer el bucket privado y un enlace público basta para estudiar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_reels_modelo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  url           text NOT NULL CHECK (url ~* '^https://'),
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'estudiando', 'listo', 'error')),
  formato       text,          -- comercial_estudio, en_las_manos, pregunta_que_ensena...
  titulo        text,          -- una línea: de qué va el reel
  duracion      numeric,
  miniatura     text,          -- data:image/jpeg;base64 pequeña (240 px)
  receta        jsonb,
  nota_dueno    text,          -- lo que el dueño corrige o añade a mano
  error         text,
  intentos      integer NOT NULL DEFAULT 0,
  tomado_at     timestamptz,
  estudiado_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, url)
);

ALTER TABLE public.equipo_reels_modelo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_reels_modelo_dueno ON public.equipo_reels_modelo;
CREATE POLICY equipo_reels_modelo_dueno ON public.equipo_reels_modelo
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido())
  WITH CHECK (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido());


-- ── LO QUE USA EL WORKER (rol hermes_readonly) ──────────────────────
-- Toma el más viejo por estudiar. Uno que se quedó "estudiando" más de 20
-- minutos (la PC se apagó a mitad) vuelve a la cola; a los 3 intentos se
-- da por fallido y se dice por qué.
CREATE OR REPLACE FUNCTION hermes.equipo_reel_tomar()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.equipo_reels_modelo;
BEGIN
  UPDATE public.equipo_reels_modelo
     SET estado = 'error', error = COALESCE(error, 'No se pudo estudiar en 3 intentos.')
   WHERE estado = 'estudiando' AND tomado_at < now() - interval '20 minutes' AND intentos >= 3;

  SELECT * INTO v_r FROM public.equipo_reels_modelo
   WHERE estado = 'pendiente'
      OR (estado = 'estudiando' AND tomado_at < now() - interval '20 minutes')
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.equipo_reels_modelo
     SET estado = 'estudiando', tomado_at = now(), intentos = intentos + 1, error = NULL
   WHERE id = v_r.id;

  RETURN json_build_object('id', v_r.id, 'url', v_r.url, 'nota_dueno', v_r.nota_dueno,
                           'intento', v_r.intentos + 1);
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_guardar(
  p_id uuid, p_receta jsonb, p_formato text, p_titulo text,
  p_duracion numeric, p_miniatura text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_miniatura IS NOT NULL AND (p_miniatura !~ '^data:image/jpeg;base64,' OR length(p_miniatura) > 200000) THEN
    p_miniatura := NULL;   -- una miniatura rara no tumba la receta
  END IF;
  UPDATE public.equipo_reels_modelo
     SET estado = 'listo', receta = p_receta,
         formato = left(NULLIF(btrim(COALESCE(p_formato, '')), ''), 60),
         titulo = left(NULLIF(btrim(COALESCE(p_titulo, '')), ''), 200),
         duracion = p_duracion, miniatura = COALESCE(p_miniatura, miniatura),
         estudiado_at = now(), error = NULL
   WHERE id = p_id AND estado = 'estudiando';
  RETURN json_build_object('ok', FOUND);
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_error(p_id uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.equipo_reels_modelo
     SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
         error = left(COALESCE(p_motivo, 'sin detalle'), 500)
   WHERE id = p_id AND estado = 'estudiando';
  RETURN json_build_object('ok', FOUND);
END $function$;

REVOKE ALL ON FUNCTION hermes.equipo_reel_tomar() FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_guardar(uuid, jsonb, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_error(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_tomar() TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_guardar(uuid, jsonb, text, text, numeric, text) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_error(uuid, text) TO hermes_readonly;


-- Los 7 que mandó el dueño el 04/10 (más el primero, el del kit Xpress).
INSERT INTO public.equipo_reels_modelo (tenant_id, url, created_by)
SELECT '00000000-0000-0000-0000-000000000001', u, NULL
FROM unnest(ARRAY[
  'https://www.instagram.com/reel/DcuWgKISD-6/',
  'https://www.instagram.com/reel/Da9KNu6ykso/',
  'https://www.instagram.com/reel/DaqWihlyert/',
  'https://www.instagram.com/reel/DXqIE-PDMjP/',
  'https://www.instagram.com/reel/DRVwtYADKSd/',
  'https://www.instagram.com/reel/DQNWJclkvrn/',
  'https://www.instagram.com/reel/DQCDA2DjtMU/',
  'https://www.instagram.com/reel/DPe_HakjkOj/'
]) AS u
ON CONFLICT (tenant_id, url) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('equipo_reels_modelo.sql');
