-- =====================================================================
-- EL REEL SE ARMA CON EL GUION QUE APRUEBA EL DUEÑO
-- ---------------------------------------------------------------------
-- (2026-10-04) Pedido del dueño tras ver el primer reel del Motul 5100: "voy
-- a tener que ver el guion del video antes de realizarlos porque hay
-- errores" (dijo "compatible con modelos 5,100": 5100 es el nombre del
-- aceite) "y así no gastar créditos de más".
--
-- Ahora, con las dos imágenes, el Creativo escribe SOLO el guion
-- (payload.reel_guion: centavos de texto). En el Paso 2 el dueño lo lee y lo
-- corrige, y al pulsar "Hacer el reel" nace un PEDIDO aquí. El worker de la
-- PC lo toma con la cola vacía, genera tomas y voz con ESE guion y sube el
-- video. Solo entonces se gasta en imágenes (unos US$0.21) y voz.
--
-- Los permisos de toma/video salen del pedido (mismo mecanismo de un solo
-- uso que las escenas, hermes.equipo_permisos_escena).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_reels_pedidos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  trabajo_id  uuid NOT NULL,
  mensaje_id  uuid NOT NULL,      -- el borrador del Creativo que trajo el guion
  guion       jsonb NOT NULL,     -- tal como lo dejó el dueño
  para        jsonb NOT NULL,     -- formato, modelo, receta y la pieza
  foto_url    text NOT NULL,
  logo_url    text,
  telefono    text,
  empresa     text,
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente', 'armando', 'listo', 'error')),
  video_url   text,
  duracion    numeric,
  avisos      jsonb,
  error       text,
  intentos    integer NOT NULL DEFAULT 0,
  tomado_at   timestamptz,
  listo_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS equipo_reels_pedidos_trabajo_idx ON public.equipo_reels_pedidos (trabajo_id, created_at DESC);

ALTER TABLE public.equipo_reels_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_reels_pedidos_leer ON public.equipo_reels_pedidos;
CREATE POLICY equipo_reels_pedidos_leer ON public.equipo_reels_pedidos
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido());


-- ── El dueño: "Hacer el reel" con su guion ──────────────────────────
CREATE OR REPLACE FUNCTION public.equipo_reel_pedir(p_trabajo_id uuid, p_guion jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_ap  record;
  v_base jsonb;
  v_id  uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  IF jsonb_typeof(p_guion -> 'tomas') <> 'array' OR jsonb_array_length(p_guion -> 'tomas') < 2 THEN
    RAISE EXCEPTION 'El guion necesita al menos 2 tomas.';
  END IF;

  -- El borrador más reciente de ese trabajo que trae guion de reel.
  SELECT a.mensaje_id, a.contenido INTO v_ap
    FROM public.equipo_aprobaciones a
   WHERE a.trabajo_id = p_trabajo_id AND a.tenant_id = v_tenant
     AND a.contenido ? 'reel_guion'
   ORDER BY a.revision_num DESC, a.creado_en DESC NULLS LAST
   LIMIT 1;
  IF v_ap.mensaje_id IS NULL THEN RAISE EXCEPTION 'Ese encargo no trae guion de reel.'; END IF;
  v_base := v_ap.contenido -> 'reel_guion';

  IF EXISTS (SELECT 1 FROM public.equipo_reels_pedidos
              WHERE trabajo_id = p_trabajo_id AND estado IN ('pendiente', 'armando')) THEN
    RAISE EXCEPTION 'Ese reel ya se está haciendo. Espera a que termine.';
  END IF;

  INSERT INTO public.equipo_reels_pedidos
    (tenant_id, trabajo_id, mensaje_id, guion, para, foto_url, logo_url, telefono, empresa)
  VALUES (v_tenant, p_trabajo_id, v_ap.mensaje_id, p_guion, v_base -> 'para',
          v_base ->> 'foto_url', v_base ->> 'logo_url', v_base ->> 'telefono', v_base ->> 'empresa')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;
REVOKE ALL ON FUNCTION public.equipo_reel_pedir(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_reel_pedir(uuid, jsonb) TO authenticated;


-- ── El worker (hermes_readonly) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION hermes.equipo_reel_pedido_tomar()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.equipo_reels_pedidos;
BEGIN
  UPDATE public.equipo_reels_pedidos
     SET estado = 'error', error = COALESCE(error, 'No se pudo armar en 3 intentos.')
   WHERE estado = 'armando' AND tomado_at < now() - interval '15 minutes' AND intentos >= 3;

  SELECT * INTO v FROM public.equipo_reels_pedidos
   WHERE estado = 'pendiente'
      OR (estado = 'armando' AND tomado_at < now() - interval '15 minutes')
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.equipo_reels_pedidos
     SET estado = 'armando', tomado_at = now(), intentos = intentos + 1, error = NULL
   WHERE id = v.id;
  RETURN json_build_object('id', v.id, 'guion', v.guion, 'para', v.para, 'foto_url', v.foto_url,
    'logo_url', v.logo_url, 'telefono', v.telefono, 'empresa', v.empresa, 'intento', v.intentos + 1);
END $function$;

-- Un permiso de un solo uso para una toma o para subir el video, atado a
-- un pedido que el worker tiene tomado.
CREATE OR REPLACE FUNCTION hermes.equipo_reel_pedido_permiso(p_id uuid, p_formato text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v record;
  v_token text;
BEGIN
  IF p_formato NOT IN ('toma', 'video') THEN RAISE EXCEPTION 'Formato no admitido: %', p_formato; END IF;
  SELECT * INTO v FROM public.equipo_reels_pedidos WHERE id = p_id AND estado = 'armando';
  IF v.id IS NULL THEN RETURN json_build_object('ok', false, 'motivo', 'el pedido no está en armado'); END IF;

  delete from hermes.equipo_permisos_escena where expira_en < now() - interval '1 day';
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO hermes.equipo_permisos_escena (sha256, tenant_id, mensaje_id, formato)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v.tenant_id, v.mensaje_id, p_formato);
  RETURN json_build_object('ok', true, 'token', v_token,
    'url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/creativo-escena');
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_pedido_listo(p_id uuid, p_video_url text, p_duracion numeric, p_avisos jsonb, p_guion jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  IF p_video_url NOT LIKE 'https://zdvxowpuklbypweyqqki.supabase.co/storage/%' THEN
    RAISE EXCEPTION 'El video tiene que estar en el almacenamiento de MotoFlow.';
  END IF;
  UPDATE public.equipo_reels_pedidos
     SET estado = 'listo', video_url = p_video_url, duracion = p_duracion, avisos = p_avisos,
         listo_at = now(), error = NULL
   WHERE id = p_id AND estado = 'armando'
  RETURNING * INTO v;
  IF v.id IS NULL THEN RETURN json_build_object('ok', false); END IF;

  -- Para rotar formatos y para medir: el mismo registro que antes.
  INSERT INTO public.equipo_reels_hechos
    (tenant_id, mensaje_id, trabajo_id, modelo_id, formato, producto_id, video_url, guion, duracion)
  VALUES (v.tenant_id, v.mensaje_id, v.trabajo_id,
          NULLIF(v.para ->> 'modelo_id', '')::uuid, COALESCE(v.para ->> 'formato', 'otro'),
          NULLIF(v.para -> 'producto' ->> 'id', '')::uuid, p_video_url, p_guion, p_duracion);
  RETURN json_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_pedido_error(p_id uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.equipo_reels_pedidos
     SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
         error = left(COALESCE(p_motivo, 'sin detalle'), 500)
   WHERE id = p_id AND estado = 'armando';
  RETURN json_build_object('ok', FOUND);
END $function$;

REVOKE ALL ON FUNCTION hermes.equipo_reel_pedido_tomar() FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_pedido_permiso(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_pedido_listo(uuid, text, numeric, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_reel_pedido_error(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_pedido_tomar() TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_pedido_permiso(uuid, text) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_pedido_listo(uuid, text, numeric, jsonb, jsonb) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_reel_pedido_error(uuid, text) TO hermes_readonly;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('reels_con_guion_aprobado.sql');
