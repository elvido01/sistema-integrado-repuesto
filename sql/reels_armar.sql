-- =====================================================================
-- ARMAR REELS — Parte 2 de "Estilo de tus reels"
-- ---------------------------------------------------------------------
-- (2026-10-04) Cada promoción que el dueño encarga en Equipo IA sale ahora
-- con un REEL además de las dos imágenes. El Comercial-Creativo (en la PC)
-- toma la receta de un reel modelo (sql/equipo_reels_modelo.sql), escribe
-- el guion con los datos REALES de la pieza, pide 3-4 tomas de estudio
-- hechas desde la foto real (creativo-escena, modo "toma"), graba la voz
-- (TTS) y lo monta con ffmpeg. El video se sube por creativo-escena (modo
-- "video") al bucket público ai-marketing, como el video de 8 s de antes.
--
-- Los formatos ROTAN: se usa el que hace más tiempo que no sale (o nunca),
-- y dentro de él un reel modelo al azar. Así no salen todos iguales.
--
-- El reel viaja en el mismo borrador que las imágenes (payload.reel), pasa
-- por la misma revisión de Hermes y se aprueba en el mismo Paso 2. Si el
-- reel falla, las imágenes llegan igual con el aviso.
-- =====================================================================

-- 1) Los permisos de un solo uso sirven también para una toma de reel y
--    para subir el video. Mismo mecanismo, misma caducidad.
ALTER TABLE hermes.equipo_permisos_escena DROP CONSTRAINT IF EXISTS equipo_permisos_escena_formato_check;
ALTER TABLE hermes.equipo_permisos_escena ADD CONSTRAINT equipo_permisos_escena_formato_check
  CHECK (formato = ANY (ARRAY['feed', 'historia', 'toma', 'video']));

CREATE OR REPLACE FUNCTION hermes.equipo_permiso_escena(p_mensaje_id uuid, p_claim_token uuid, p_formato text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_m     record;
  v_token text;
begin
  -- (04/10/2026) + 'toma' (una toma de reel) y 'video' (subir el reel).
  if p_formato not in ('feed', 'historia', 'toma', 'video') then
    raise exception 'Formato no admitido: %', p_formato;
  end if;

  select m.id, m.tenant_id, m.claim_token, m.to_agent into v_m
    from public.equipo_mensajes m where m.id = p_mensaje_id;
  if v_m.id is null then
    raise exception 'Ese mensaje no existe';
  end if;
  -- Solo quien tiene tomado el encargo. Un permiso suelto no se reparte.
  if v_m.claim_token is distinct from p_claim_token then
    return json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  end if;
  if v_m.to_agent <> 'comercial_creativo' then
    raise exception 'Solo el Comercial-Creativo pide escenas.';
  end if;

  -- Los vencidos no sirven para nada: se barren al pedir uno nuevo.
  delete from hermes.equipo_permisos_escena where expira_en < now() - interval '1 day';

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into hermes.equipo_permisos_escena (sha256, tenant_id, mensaje_id, formato)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_m.tenant_id, v_m.id, p_formato);

  return json_build_object(
    'ok', true,
    'token', v_token,
    'url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/creativo-escena');
end;
$function$;


-- 2) Los reels hechos: para rotar formatos y para ver cuál vende.
CREATE TABLE IF NOT EXISTS public.equipo_reels_hechos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  mensaje_id  uuid NOT NULL,
  trabajo_id  uuid,
  modelo_id   uuid REFERENCES public.equipo_reels_modelo(id) ON DELETE SET NULL,
  formato     text NOT NULL,
  producto_id uuid REFERENCES public.productos(id),
  video_url   text,
  guion       jsonb,
  duracion    numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipo_reels_hechos_tenant_idx ON public.equipo_reels_hechos (tenant_id, created_at DESC);

ALTER TABLE public.equipo_reels_hechos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_reels_hechos_leer ON public.equipo_reels_hechos;
CREATE POLICY equipo_reels_hechos_leer ON public.equipo_reels_hechos
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido());


-- 3) Para el worker: la receta que toca y los datos reales de la pieza.
--    NULL si la empresa no tiene reels modelo listos (entonces no hay reel).
CREATE OR REPLACE FUNCTION hermes.equipo_reel_para(p_mensaje_id uuid, p_claim_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m      record;
  v_w      record;
  v_prod   record;
  v_modelo record;
BEGIN
  SELECT m.id, m.tenant_id, m.claim_token, m.trabajo_id INTO v_m
    FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_m.trabajo_id;

  -- La pieza, por su código en el pedido (igual que la revisión de Hermes).
  SELECT p.id, p.codigo, p.descripcion, p.precio,
         ma.nombre AS marca,
         NULLIF(public.get_nombres_modelos(p.modelos_ids), '') AS modelos
    INTO v_prod
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_m.tenant_id
     AND v_w.peticion LIKE '%' || p.codigo || '%'
   ORDER BY length(p.codigo) DESC
   LIMIT 1;
  IF v_prod.id IS NULL THEN RETURN NULL; END IF;

  -- El formato que hace más tiempo que no sale; dentro, un modelo al azar.
  SELECT r.* INTO v_modelo
    FROM public.equipo_reels_modelo r
    LEFT JOIN LATERAL (
      SELECT max(h.created_at) AS ultimo FROM public.equipo_reels_hechos h
       WHERE h.tenant_id = r.tenant_id AND h.formato = r.formato) u ON true
   WHERE r.tenant_id = v_m.tenant_id AND r.estado = 'listo' AND r.receta IS NOT NULL
   ORDER BY u.ultimo NULLS FIRST, random()
   LIMIT 1;
  IF v_modelo.id IS NULL THEN RETURN NULL; END IF;

  RETURN json_build_object(
    'modelo_id', v_modelo.id, 'formato', v_modelo.formato, 'receta', v_modelo.receta,
    'nota_dueno', v_modelo.nota_dueno,
    'producto', json_build_object('id', v_prod.id, 'codigo', v_prod.codigo,
      'descripcion', v_prod.descripcion, 'precio', v_prod.precio,
      'marca', v_prod.marca, 'modelos', v_prod.modelos));
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_hecho(
  p_mensaje_id uuid, p_claim_token uuid, p_modelo_id uuid, p_formato text,
  p_producto_id uuid, p_video_url text, p_guion jsonb, p_duracion numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m  record;
  v_id uuid;
BEGIN
  SELECT m.id, m.tenant_id, m.claim_token, m.trabajo_id INTO v_m
    FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado');
  END IF;
  IF p_video_url IS NOT NULL AND p_video_url NOT LIKE 'https://zdvxowpuklbypweyqqki.supabase.co/storage/%' THEN
    RAISE EXCEPTION 'El video tiene que estar en el almacenamiento de MotoFlow.';
  END IF;
  INSERT INTO public.equipo_reels_hechos
    (tenant_id, mensaje_id, trabajo_id, modelo_id, formato, producto_id, video_url, guion, duracion)
  VALUES (v_m.tenant_id, v_m.id, v_m.trabajo_id, p_modelo_id, COALESCE(p_formato, 'otro'),
          p_producto_id, p_video_url, p_guion, p_duracion)
  RETURNING id INTO v_id;
  RETURN json_build_object('ok', true, 'id', v_id);
END $function$;

REVOKE ALL ON FUNCTION hermes.equipo_reel_para(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_hecho(uuid, uuid, uuid, text, uuid, text, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_para(uuid, uuid) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_hecho(uuid, uuid, uuid, text, uuid, text, jsonb, numeric) TO hermes_readonly;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('reels_armar.sql');
