-- =====================================================================
-- Piezas de la semana (01/11/2026)
-- ---------------------------------------------------------------------
-- Idea del dueño, a partir del video de Repuestos Morla
-- (youtu.be/CgnYbFVq1wk): un video horizontal de 2–4 minutos que repasa
-- las piezas publicadas en la semana, una por una, con su precio en la voz
-- y en pantalla, para YouTube y Facebook el sábado o el domingo.
--
-- Decisiones del dueño (01/11):
--   · el precio SÍ va en la voz (solo en este formato; los reels diarios
--     siguen sin precio hablado) y en pantalla, el de catálogo;
--   · solo horizontal;
--   · se arma con lo ya publicado (foto de la pieza), sin grabar nada;
--   · lo aprueba él antes de que salga.
--
-- El circuito:
--   1. El viernes a la hora puesta (o con "Armar ahora") la base junta las
--      piezas publicadas en los últimos 7 días → fila 'pendiente'.
--   2. El worker del Creativo en la PC la toma (hermes.equipo_semanal_tomar),
--      escribe la voz, arma el video (scripts/armarSemanal.mjs), lo sube con
--      un permiso de creativo-escena y la marca 'listo'. Avisa por Hermes.
--   3. El dueño la ve en Equipo IA → Piezas de la semana: quita piezas o
--      corrige lo que dice la voz y pide rehacer, o aprueba. Al aprobar, la
--      pantalla crea la promoción (promo_crear → Facebook video + YouTube) y
--      la programa; aquí solo se anota (equipo_semanal_aprobado).
--
-- Encendido solo para Repuestos Morla (fila en equipo_semanal_config).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_semanal_config (
  tenant_id     uuid PRIMARY KEY,
  activo        boolean NOT NULL DEFAULT true,
  dia_armar     int  NOT NULL DEFAULT 5 CHECK (dia_armar BETWEEN 0 AND 6),     -- 5 = viernes
  hora_armar    time NOT NULL DEFAULT '19:00',
  dia_publicar  int  NOT NULL DEFAULT 6 CHECK (dia_publicar BETWEEN 0 AND 6),  -- 6 = sábado
  hora_publicar time NOT NULL DEFAULT '10:00',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipo_semanal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  desde        date NOT NULL,
  hasta        date NOT NULL,
  piezas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'armando', 'listo', 'error', 'aprobado', 'descartado')),
  video_url    text,
  duracion     numeric,
  guion        jsonb,
  avisos       jsonb,
  error        text,
  intentos     int NOT NULL DEFAULT 0,
  tomado_at    timestamptz,
  listo_at     timestamptz,
  aprobado_at  timestamptz,
  aprobado_por uuid,
  bundle_id    uuid,
  logo_url     text,
  telefono     text,
  empresa      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  UNIQUE (tenant_id, hasta)
);

ALTER TABLE public.equipo_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_semanal_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_semanal_ver ON public.equipo_semanal;
CREATE POLICY equipo_semanal_ver ON public.equipo_semanal
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS equipo_semanal_config_ver ON public.equipo_semanal_config;
CREATE POLICY equipo_semanal_config_ver ON public.equipo_semanal_config
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
-- Escribir, solo por las funciones de abajo.
REVOKE ALL ON public.equipo_semanal, public.equipo_semanal_config FROM anon, authenticated;
GRANT SELECT ON public.equipo_semanal, public.equipo_semanal_config TO authenticated;

-- Encendido para Repuestos Morla.
INSERT INTO public.equipo_semanal_config (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- ── Las piezas publicadas entre dos fechas (hora de Santo Domingo) ──────
-- Una por producto, en el orden en que salieron. La foto es la misma con la
-- que se hizo su reel (la del encargo) o, si no, la del catálogo. Sin foto o
-- sin precio no entra: el video las enseña y dice cuánto cuestan.
-- Hasta 15: más de eso ya no se ve entero.
CREATE OR REPLACE FUNCTION public._equipo_semanal_piezas(p_tenant uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pub AS (
    SELECT j.producto_id,
           min(COALESCE(j.completed_at, j.created_at)) AS primera
      FROM public.hermes_publication_jobs j
     WHERE j.tenant_id = p_tenant
       AND j.producto_id IS NOT NULL
       AND j.status IN ('published', 'partially_published')
       AND (COALESCE(j.completed_at, j.created_at) AT TIME ZONE 'America/Santo_Domingo')::date
           BETWEEN p_desde AND p_hasta
     GROUP BY j.producto_id
  ), filas AS (
    SELECT pub.primera, p.id, p.codigo, p.descripcion, p.precio,
           COALESCE(rp.foto_url, p.imagen_url) AS foto_url
      FROM pub
      JOIN public.productos p ON p.id = pub.producto_id AND p.tenant_id = p_tenant
      LEFT JOIN LATERAL (
        SELECT r.foto_url FROM public.equipo_reels_pedidos r
         WHERE r.tenant_id = p_tenant AND r.para -> 'producto' ->> 'id' = p.id::text
         ORDER BY r.created_at DESC
         LIMIT 1
      ) rp ON true
     WHERE COALESCE(p.precio, 0) > 0
       AND COALESCE(rp.foto_url, p.imagen_url) IS NOT NULL
     ORDER BY pub.primera
     LIMIT 15
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'producto_id', id, 'codigo', codigo, 'descripcion', descripcion,
           'precio', precio, 'foto_url', foto_url, 'incluir', true, 'voz', NULL)
         ORDER BY primera), '[]'::jsonb)
    FROM filas;
$function$;
REVOKE ALL ON FUNCTION public._equipo_semanal_piezas(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ── Crear (o refrescar) el video de una semana ─────────────────────────
-- Con menos de 3 piezas no vale la pena: queda 'descartado' con el motivo,
-- y así el chequeo de cada 5 minutos no lo vuelve a intentar.
CREATE OR REPLACE FUNCTION public._equipo_semanal_crear(p_tenant uuid, p_hasta date, p_usuario uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_desde  date := p_hasta - 6;
  v_piezas jsonb := public._equipo_semanal_piezas(p_tenant, p_hasta - 6, p_hasta);
  v_n      int := jsonb_array_length(v_piezas);
  v_emp    record;
  v_id     uuid;
BEGIN
  SELECT nombre, telefono, logo_url INTO v_emp FROM public.config_empresa WHERE tenant_id = p_tenant;

  INSERT INTO public.equipo_semanal AS s (tenant_id, desde, hasta, piezas, estado, error, logo_url, telefono, empresa, created_by)
  VALUES (p_tenant, v_desde, p_hasta, v_piezas,
          CASE WHEN v_n >= 3 THEN 'pendiente' ELSE 'descartado' END,
          CASE WHEN v_n >= 3 THEN NULL ELSE format('Solo %s pieza(s) publicada(s) en la semana; hacen falta 3.', v_n) END,
          v_emp.logo_url, v_emp.telefono, v_emp.nombre, p_usuario)
  ON CONFLICT (tenant_id, hasta) DO UPDATE
     SET piezas = EXCLUDED.piezas, estado = EXCLUDED.estado, error = EXCLUDED.error,
         video_url = NULL, duracion = NULL, guion = NULL, avisos = NULL, intentos = 0,
         tomado_at = NULL, listo_at = NULL,
         logo_url = EXCLUDED.logo_url, telefono = EXCLUDED.telefono, empresa = EXCLUDED.empresa
   -- Lo aprobado no se pisa; lo que se está armando, tampoco.
   WHERE s.estado NOT IN ('aprobado', 'armando')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.equipo_semanal WHERE tenant_id = p_tenant AND hasta = p_hasta;
  END IF;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public._equipo_semanal_crear(uuid, date, uuid) FROM PUBLIC, anon, authenticated;

-- ── El chequeo del worker (cada 5 minutos) ─────────────────────────────
-- ¿A alguna empresa encendida le toca hoy? Le toca el día y después de la
-- hora puestos, si no tiene ya uno de esta semana (incluido uno hecho a
-- mano con "Armar ahora" en los dos días anteriores).
CREATE OR REPLACE FUNCTION hermes.equipo_semanal_todos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_hoy   date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_ahora time := (now() AT TIME ZONE 'America/Santo_Domingo')::time;
  v_hechos jsonb := '[]'::jsonb;
BEGIN
  FOR c IN SELECT * FROM public.equipo_semanal_config WHERE activo LOOP
    IF extract(dow FROM v_hoy)::int <> c.dia_armar OR v_ahora < c.hora_armar THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.equipo_semanal s
                WHERE s.tenant_id = c.tenant_id AND s.hasta >= v_hoy - 2) THEN CONTINUE; END IF;
    v_hechos := v_hechos || jsonb_build_object('tenant', c.tenant_id,
      'id', public._equipo_semanal_crear(c.tenant_id, v_hoy, NULL));
  END LOOP;
  RETURN v_hechos;
END $function$;

-- ── La cola del worker ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hermes.equipo_semanal_tomar()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.equipo_semanal;
BEGIN
  UPDATE public.equipo_semanal
     SET estado = 'error', error = COALESCE(error, 'No se pudo armar en 3 intentos.')
   WHERE estado = 'armando' AND tomado_at < now() - interval '20 minutes' AND intentos >= 3;

  SELECT * INTO v FROM public.equipo_semanal
   WHERE estado = 'pendiente'
      OR (estado = 'armando' AND tomado_at < now() - interval '20 minutes')
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.equipo_semanal
     SET estado = 'armando', tomado_at = now(), intentos = intentos + 1, error = NULL
   WHERE id = v.id;
  RETURN json_build_object('id', v.id, 'desde', v.desde, 'hasta', v.hasta,
    'piezas', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(v.piezas) x
                WHERE COALESCE((x ->> 'incluir')::boolean, true)),
    'logo_url', v.logo_url, 'telefono', v.telefono, 'empresa', v.empresa, 'intento', v.intentos + 1);
END $function$;

-- El permiso para subir el video (creativo-escena, modo 'video'). El id del
-- video semanal hace de "mensaje": solo sirve para el nombre del archivo.
CREATE OR REPLACE FUNCTION hermes.equipo_semanal_permiso(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v record;
  v_token text;
BEGIN
  SELECT * INTO v FROM public.equipo_semanal WHERE id = p_id AND estado = 'armando';
  IF v.id IS NULL THEN RETURN json_build_object('ok', false, 'motivo', 'el video no está en armado'); END IF;

  DELETE FROM hermes.equipo_permisos_escena WHERE expira_en < now() - interval '1 day';
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO hermes.equipo_permisos_escena (sha256, tenant_id, mensaje_id, formato)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v.tenant_id, v.id, 'video');
  RETURN json_build_object('ok', true, 'token', v_token,
    'url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/creativo-escena');
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_semanal_listo(p_id uuid, p_video_url text, p_duracion numeric, p_avisos jsonb, p_guion jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
  v_n int;
BEGIN
  IF p_video_url NOT LIKE 'https://zdvxowpuklbypweyqqki.supabase.co/storage/%' THEN
    RAISE EXCEPTION 'El video tiene que estar en el almacenamiento de MotoFlow.';
  END IF;
  UPDATE public.equipo_semanal
     SET estado = 'listo', video_url = p_video_url, duracion = p_duracion, avisos = p_avisos,
         guion = p_guion, listo_at = now(), error = NULL
   WHERE id = p_id AND estado = 'armando'
  RETURNING * INTO v;
  IF v.id IS NULL THEN RETURN json_build_object('ok', false); END IF;

  SELECT count(*) INTO v_n FROM jsonb_array_elements(v.piezas) x WHERE COALESCE((x ->> 'incluir')::boolean, true);
  -- El aviso no puede tumbar el video ya subido: si falla, se sigue.
  BEGIN
  PERFORM public.hermes_decir(v.tenant_id, format(
    E'🎬 **Piezas de la semana listo** — %s piezas, %s.\nEntra a Equipo IA → Piezas de la semana para verlo. Puedes quitar piezas o corregir lo que dice la voz, o aprobarlo para que salga el sábado.',
    v_n, CASE WHEN p_duracion >= 60 THEN format('%s min %s s', floor(p_duracion / 60), round(p_duracion) % 60)
              ELSE format('%s s', round(p_duracion)) END), NULL, 'publicacion_diaria');
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT v.tenant_id, pr.id, 'promo_lista', '🎬 Piezas de la semana: listo para revisar',
         'Equipo IA → Piezas de la semana. Apruébalo para que salga el sábado.'
    FROM public.profiles pr
   WHERE pr.tenant_id = v.tenant_id AND pr.role IN ('owner', 'admin');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'piezas de la semana: el aviso falló: %', SQLERRM;
  END;
  RETURN json_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_semanal_error(p_id uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.equipo_semanal
     SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
         error = left(COALESCE(p_motivo, 'sin detalle'), 500)
   WHERE id = p_id AND estado = 'armando';
  RETURN json_build_object('ok', FOUND);
END $function$;

REVOKE ALL ON FUNCTION hermes.equipo_semanal_todos() FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_semanal_tomar() FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_semanal_permiso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_semanal_listo(uuid, text, numeric, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_semanal_error(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_semanal_todos() TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_semanal_tomar() TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_semanal_permiso(uuid) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_semanal_listo(uuid, text, numeric, jsonb, jsonb) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_semanal_error(uuid, text) TO hermes_readonly;

-- ── Lo que usa la pantalla (administradores de la empresa activa) ──────
CREATE OR REPLACE FUNCTION public._equipo_semanal_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No hay empresa activa.'; END IF;
  IF NOT (public.es_usuario_admin() OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'Solo un administrador de la empresa puede manejar el video de la semana.';
  END IF;
  RETURN v_tenant;
END $function$;
REVOKE ALL ON FUNCTION public._equipo_semanal_admin() FROM PUBLIC, anon, authenticated;

-- "Armar ahora": el de los últimos 7 días, sin esperar al viernes.
CREATE OR REPLACE FUNCTION public.equipo_semanal_armar_ahora()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public._equipo_semanal_admin();
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_id uuid;
  v public.equipo_semanal;
BEGIN
  v_id := public._equipo_semanal_crear(v_tenant, v_hoy, auth.uid());
  SELECT * INTO v FROM public.equipo_semanal WHERE id = v_id;
  RETURN jsonb_build_object('id', v.id, 'estado', v.estado, 'error', v.error,
    'piezas', jsonb_array_length(v.piezas));
END $function$;

-- Rehacer con cambios: qué piezas van y qué dice la voz de cada una. Solo
-- se toman 'incluir' y 'voz' de lo que manda la pantalla, por producto: las
-- fotos y los precios siguen siendo los de la base.
CREATE OR REPLACE FUNCTION public.equipo_semanal_rehacer(p_id uuid, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public._equipo_semanal_admin();
  v public.equipo_semanal;
  v_piezas jsonb;
  v_n int;
BEGIN
  SELECT * INTO v FROM public.equipo_semanal WHERE id = p_id AND tenant_id = v_tenant FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Ese video no es de tu empresa activa.'; END IF;
  IF v.estado NOT IN ('listo', 'error', 'descartado') THEN
    RAISE EXCEPTION 'Ahora está «%»: solo se rehace uno listo, con error o descartado.', v.estado;
  END IF;

  SELECT COALESCE(jsonb_agg(
           x || jsonb_build_object(
             'incluir', COALESCE((c ->> 'incluir')::boolean, (x ->> 'incluir')::boolean, true),
             'voz', CASE WHEN c IS NULL THEN x -> 'voz'
                         ELSE to_jsonb(NULLIF(left(btrim(COALESCE(c ->> 'voz', '')), 300), '')) END)
           ORDER BY o), '[]'::jsonb)
    INTO v_piezas
    FROM jsonb_array_elements(v.piezas) WITH ORDINALITY AS t(x, o)
    LEFT JOIN LATERAL (
      SELECT e FROM jsonb_array_elements(COALESCE(p_cambios, '[]'::jsonb)) e
       WHERE e ->> 'producto_id' = x ->> 'producto_id' LIMIT 1
    ) cc(c) ON true;

  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_piezas) x WHERE COALESCE((x ->> 'incluir')::boolean, true);
  IF v_n < 2 THEN RAISE EXCEPTION 'Deja al menos 2 piezas en el video.'; END IF;

  UPDATE public.equipo_semanal
     SET piezas = v_piezas, estado = 'pendiente', intentos = 0, error = NULL,
         video_url = NULL, duracion = NULL, listo_at = NULL, tomado_at = NULL
   WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'piezas', v_n);
END $function$;

CREATE OR REPLACE FUNCTION public.equipo_semanal_descartar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public._equipo_semanal_admin();
BEGIN
  UPDATE public.equipo_semanal SET estado = 'descartado'
   WHERE id = p_id AND tenant_id = v_tenant AND estado IN ('listo', 'error', 'pendiente');
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo descartar: no es de tu empresa o ya está aprobado/armándose.'; END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- La pantalla ya creó y programó la promoción con el video; aquí se anota.
CREATE OR REPLACE FUNCTION public.equipo_semanal_aprobado(p_id uuid, p_bundle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public._equipo_semanal_admin();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hermes_publication_jobs
                  WHERE publication_bundle_id = p_bundle_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Esa promoción no es de tu empresa activa.';
  END IF;
  UPDATE public.equipo_semanal
     SET estado = 'aprobado', aprobado_at = now(), aprobado_por = auth.uid(), bundle_id = p_bundle_id
   WHERE id = p_id AND tenant_id = v_tenant AND estado = 'listo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese video ya no está listo para aprobar.'; END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.equipo_semanal_configurar(p_activo boolean, p_dia_armar int, p_hora_armar time,
                                                            p_dia_publicar int, p_hora_publicar time)
 RETURNS public.equipo_semanal_config
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public._equipo_semanal_admin();
  v public.equipo_semanal_config;
BEGIN
  INSERT INTO public.equipo_semanal_config AS c (tenant_id, activo, dia_armar, hora_armar, dia_publicar, hora_publicar)
  VALUES (v_tenant, COALESCE(p_activo, true), COALESCE(p_dia_armar, 5), COALESCE(p_hora_armar, '19:00'),
          COALESCE(p_dia_publicar, 6), COALESCE(p_hora_publicar, '10:00'))
  ON CONFLICT (tenant_id) DO UPDATE
     SET activo = COALESCE(p_activo, c.activo),
         dia_armar = COALESCE(p_dia_armar, c.dia_armar),
         hora_armar = COALESCE(p_hora_armar, c.hora_armar),
         dia_publicar = COALESCE(p_dia_publicar, c.dia_publicar),
         hora_publicar = COALESCE(p_hora_publicar, c.hora_publicar),
         updated_at = now()
  RETURNING * INTO v;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.equipo_semanal_armar_ahora() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_semanal_rehacer(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_semanal_descartar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_semanal_aprobado(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_semanal_configurar(boolean, int, time, int, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_semanal_armar_ahora() TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_semanal_rehacer(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_semanal_descartar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_semanal_aprobado(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_semanal_configurar(boolean, int, time, int, time) TO authenticated;

SELECT public.registrar_migracion('piezas_de_la_semana.sql');
