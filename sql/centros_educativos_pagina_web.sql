-- =====================================================================
-- Página web del colegio (07/11/2026, plan EDUCA TOTAL)
-- ---------------------------------------------------------------------
-- Página pública del colegio: presentación, requisitos de inscripción,
-- contacto y TAREAS que suben los maestros y los estudiantes descargan
-- (sin cuenta: escogen curso y sección).
--
-- 1. edu_sitio: los textos de la página, una fila por colegio.
--    · slug: dirección dentro de MotoFlow (motoflow.com.do/sitio/<slug>).
--    · dominio: el dominio propio (nuestrasenora.com). Solo lo cambia el
--      super admin: hay que conectarlo antes en Cloudflare.
-- 2. edu_tareas: tarea por curso (y sección, '' = todas), con un archivo
--    y/o un enlace (los videos van como enlace de YouTube).
-- 3. Bucket PÚBLICO 'edu-tareas' (carpeta = empresa): 10 MB por archivo,
--    sin videos, tope de 10 GB por colegio.
-- 4. edu_sitio_publico / edu_sitio_tareas: lo que lee la página sin login.
--    Solo sale si el plan vigente es EDUCA TOTAL; el personal del colegio
--    (y el super admin) la ve siempre, como vista previa.
-- 5. get_tenant_por_dominio también reconoce el dominio del colegio (el
--    "Entrar al sistema" sale con su logo).
-- 6. Notas en la página: cada estudiante con su clave ve las notas de los
--    períodos que el colegio publicó (historial del año actual).
-- =====================================================================

-- ── 1. Textos de la página ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_sitio (
  tenant_id               uuid PRIMARY KEY DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug                    text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 60),
  dominio                 text UNIQUE,
  publicada               boolean NOT NULL DEFAULT true,
  lema                    text,
  presentacion            text,
  portada_path            text,          -- edu-tareas/<tenant>/sitio/<archivo>
  inscripciones_abiertas  boolean NOT NULL DEFAULT true,
  requisitos              text,          -- uno por línea
  inscripcion_nota        text,          -- fechas, horario de inscripción, costos…
  direccion               text,
  telefono                text,
  whatsapp                text,
  correo                  text,
  horario                 text,
  facebook                text,
  instagram               text,
  color                   text NOT NULL DEFAULT '#1d4ed8' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Tareas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  anio_id         uuid REFERENCES public.edu_anios(id),
  curso_id        uuid NOT NULL REFERENCES public.edu_cursos(id),
  seccion         text NOT NULL DEFAULT '',
  asignatura_id   uuid REFERENCES public.edu_asignaturas(id),
  titulo          text NOT NULL CHECK (btrim(titulo) <> ''),
  instrucciones   text,
  fecha_entrega   date,
  enlace          text CHECK (enlace IS NULL OR enlace ~* '^https?://'),
  archivo_path    text,
  archivo_nombre  text,
  archivo_bytes   bigint NOT NULL DEFAULT 0 CHECK (archivo_bytes BETWEEN 0 AND 10485760),
  maestro_nombre  text,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (archivo_path IS NOT NULL OR enlace IS NOT NULL OR btrim(COALESCE(instrucciones, '')) <> '')
);
CREATE INDEX IF NOT EXISTS edu_tareas_curso ON public.edu_tareas (tenant_id, anio_id, curso_id, created_at DESC);

-- ¿El colegio tiene la página? Plan vigente EDUCA TOTAL.
CREATE OR REPLACE FUNCTION private.edu_sitio_plan_ok(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE((
    SELECT upper(pl.nombre) = 'EDUCA TOTAL' AND s.estado IN ('trial', 'activo') AND s.fecha_fin > now()
      FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
     WHERE s.tenant_id = p_tenant
     ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC
     LIMIT 1), false);
$function$;
REVOKE ALL ON FUNCTION private.edu_sitio_plan_ok(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.edu_es_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false));
$function$;
REVOKE ALL ON FUNCTION private.edu_es_superadmin() FROM PUBLIC, anon, authenticated;

-- Dominio limpio: sin http://, sin www., sin ruta, en minúscula.
CREATE OR REPLACE FUNCTION private.edu_limpiar_dominio(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT NULLIF(regexp_replace(regexp_replace(regexp_replace(lower(btrim(COALESCE(p, ''))), '^https?://', ''), '^www\.', ''), '[/:?#].*$', ''), '');
$function$;
REVOKE ALL ON FUNCTION private.edu_limpiar_dominio(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.edu_sitio_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  NEW.dominio := private.edu_limpiar_dominio(NEW.dominio);
  IF NEW.dominio IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.dominio END)
     AND NOT private.edu_es_superadmin() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'El dominio propio lo conecta MotoFlow. Escríbanos para activarlo.';
  END IF;
  IF NEW.dominio IS NOT NULL AND NEW.dominio !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' THEN
    RAISE EXCEPTION 'Dominio no válido: %', NEW.dominio;
  END IF;
  IF NEW.dominio IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE dominio = NEW.dominio AND id <> NEW.tenant_id) THEN
    RAISE EXCEPTION 'Ese dominio ya lo usa otra empresa';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_sitio_antes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS edu_sitio_antes ON public.edu_sitio;
CREATE TRIGGER edu_sitio_antes BEFORE INSERT OR UPDATE ON public.edu_sitio
  FOR EACH ROW EXECUTE FUNCTION private.edu_sitio_antes();

-- Tarea: todo del mismo colegio, año actual, nombre del maestro, tope de 10 GB.
CREATE OR REPLACE FUNCTION private.edu_tareas_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.anio_id IS NULL THEN
      SELECT id INTO NEW.anio_id FROM public.edu_anios WHERE tenant_id = NEW.tenant_id AND actual ORDER BY anio_inicio DESC LIMIT 1;
    END IF;
    NEW.created_by := auth.uid();
    SELECT NULLIF(btrim(COALESCE(full_name, '')), '') INTO NEW.maestro_nombre FROM public.profiles WHERE id = auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.edu_cursos WHERE id = NEW.curso_id AND tenant_id = NEW.tenant_id)
     OR (NEW.asignatura_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.edu_asignaturas WHERE id = NEW.asignatura_id AND tenant_id = NEW.tenant_id))
     OR NEW.anio_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE id = NEW.anio_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'La tarea no corresponde a este colegio (o no hay año escolar actual)';
  END IF;
  IF NEW.archivo_path IS NOT NULL AND split_part(NEW.archivo_path, '/', 1) <> NEW.tenant_id::text THEN
    RAISE EXCEPTION 'El archivo no es de este colegio';
  END IF;
  NEW.seccion := upper(btrim(COALESCE(NEW.seccion, '')));
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_tareas_antes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS edu_tareas_antes ON public.edu_tareas;
CREATE TRIGGER edu_tareas_antes BEFORE INSERT OR UPDATE ON public.edu_tareas
  FOR EACH ROW EXECUTE FUNCTION private.edu_tareas_antes();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_sitio', 'edu_tareas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant())',
                   t || '_tenant', t);
  END LOOP;
  GRANT SELECT, INSERT, UPDATE ON public.edu_sitio TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.edu_tareas TO authenticated;
END $$;

-- ── 3. Archivos: bucket público, una carpeta por colegio ───────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('edu-tareas', 'edu-tareas', true, 10485760, ARRAY[
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Cupo: plan Educa Total (o super admin) y menos de 10 GB usados. Sin
-- parámetro: solo dice si la empresa del que llama puede subir.
CREATE OR REPLACE FUNCTION public.edu_tareas_puede_subir()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
  SELECT public.get_user_tenant() IS NOT NULL
     AND (private.edu_sitio_plan_ok(public.get_user_tenant()) OR private.edu_es_superadmin())
     AND COALESCE((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o
                    WHERE o.bucket_id = 'edu-tareas' AND o.name LIKE public.get_user_tenant()::text || '/%'), 0) < 10737418240;
$function$;
REVOKE ALL ON FUNCTION public.edu_tareas_puede_subir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_tareas_puede_subir() TO authenticated;

DROP POLICY IF EXISTS edu_tareas_ver ON storage.objects;
CREATE POLICY edu_tareas_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'edu-tareas' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);
DROP POLICY IF EXISTS edu_tareas_subir ON storage.objects;
CREATE POLICY edu_tareas_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'edu-tareas' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
              AND public.edu_tareas_puede_subir());
DROP POLICY IF EXISTS edu_tareas_borrar ON storage.objects;
CREATE POLICY edu_tareas_borrar ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'edu-tareas' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

-- Espacio usado (para la pantalla).
CREATE OR REPLACE FUNCTION public.edu_sitio_espacio()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
  SELECT json_build_object(
    'usado', COALESCE((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o
                        WHERE o.bucket_id = 'edu-tareas' AND o.name LIKE public.get_user_tenant()::text || '/%'), 0),
    'tope', 10737418240,
    'plan_ok', private.edu_sitio_plan_ok(public.get_user_tenant()));
$function$;
REVOKE ALL ON FUNCTION public.edu_sitio_espacio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_sitio_espacio() TO authenticated;

-- ── 4. Lo que lee la página pública ────────────────────────────────────
CREATE OR REPLACE FUNCTION private.edu_sitio_de(p_dominio text, p_slug text)
RETURNS public.edu_sitio
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT s.* FROM public.edu_sitio s
   WHERE (p_slug IS NOT NULL AND s.slug = lower(btrim(p_slug)))
      OR (p_slug IS NULL AND p_dominio IS NOT NULL AND s.dominio = private.edu_limpiar_dominio(p_dominio))
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION private.edu_sitio_de(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.edu_sitio_publico(p_dominio text DEFAULT NULL, p_slug text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  s public.edu_sitio; v_publico boolean; v_previa boolean;
  v_nombre text; v_logo text; v_anio uuid; v_cursos json;
BEGIN
  s := private.edu_sitio_de(p_dominio, p_slug);
  IF s.tenant_id IS NULL THEN RETURN NULL; END IF;
  v_publico := s.publicada AND private.edu_sitio_plan_ok(s.tenant_id);
  v_previa := auth.uid() IS NOT NULL AND (public.get_user_tenant() = s.tenant_id OR private.edu_es_superadmin());
  IF NOT v_publico AND NOT v_previa THEN
    RETURN json_build_object('disponible', false);
  END IF;
  SELECT c.nombre, COALESCE(NULLIF(c.logo_url, ''), t.logo_url) INTO v_nombre, v_logo
    FROM public.tenants t LEFT JOIN public.config_empresa c ON c.tenant_id = t.id
   WHERE t.id = s.tenant_id ORDER BY c.updated_at DESC NULLS LAST LIMIT 1;
  IF v_nombre IS NULL THEN SELECT nombre INTO v_nombre FROM public.tenants WHERE id = s.tenant_id; END IF;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = s.tenant_id AND actual ORDER BY anio_inicio DESC LIMIT 1;

  -- Cursos con sus secciones (las de los estudiantes y las de las tareas).
  SELECT json_agg(json_build_object('id', c.id, 'nombre', c.nombre, 'nivel', c.nivel,
           'secciones', COALESCE((SELECT json_agg(x.sec ORDER BY x.sec) FROM (
               SELECT DISTINCT upper(btrim(e.seccion)) AS sec FROM public.edu_estudiantes e
                WHERE e.curso_id = c.id AND e.estado = 'activo' AND btrim(COALESCE(e.seccion, '')) <> ''
               UNION
               SELECT DISTINCT ta.seccion FROM public.edu_tareas ta
                WHERE ta.curso_id = c.id AND ta.anio_id = v_anio AND ta.seccion <> '') x), '[]'::json),
           'tareas', (SELECT count(*) FROM public.edu_tareas ta WHERE ta.curso_id = c.id AND ta.anio_id = v_anio))
         ORDER BY c.orden, c.nombre)
    INTO v_cursos
    FROM public.edu_cursos c
   WHERE c.tenant_id = s.tenant_id AND c.activo;

  RETURN json_build_object(
    'disponible', true,
    'vista_previa', NOT v_publico,
    'motivo_previa', CASE WHEN v_publico THEN NULL
                          WHEN NOT s.publicada THEN 'La página está apagada: solo la ve el personal del colegio.'
                          ELSE 'La página pública es del plan Educa Total: por ahora solo la ve el personal del colegio.' END,
    'slug', s.slug, 'dominio', s.dominio, 'nombre', v_nombre, 'logo_url', v_logo,
    'lema', s.lema, 'presentacion', s.presentacion, 'portada_path', s.portada_path,
    'inscripciones_abiertas', s.inscripciones_abiertas, 'requisitos', s.requisitos, 'inscripcion_nota', s.inscripcion_nota,
    'direccion', s.direccion, 'telefono', s.telefono, 'whatsapp', s.whatsapp, 'correo', s.correo, 'horario', s.horario,
    'facebook', s.facebook, 'instagram', s.instagram, 'color', s.color,
    'cursos', COALESCE(v_cursos, '[]'::json));
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_sitio_publico(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_sitio_publico(text, text) TO anon, authenticated;

-- Tareas de un curso (año actual). Sección vacía = las de todo el curso.
CREATE OR REPLACE FUNCTION public.edu_sitio_tareas(p_dominio text, p_slug text, p_curso uuid, p_seccion text DEFAULT '')
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s public.edu_sitio; v_anio uuid; v_sec text := upper(btrim(COALESCE(p_seccion, ''))); v_res json;
BEGIN
  s := private.edu_sitio_de(p_dominio, p_slug);
  IF s.tenant_id IS NULL THEN RETURN '[]'::json; END IF;
  IF NOT (s.publicada AND private.edu_sitio_plan_ok(s.tenant_id))
     AND NOT (auth.uid() IS NOT NULL AND (public.get_user_tenant() = s.tenant_id OR private.edu_es_superadmin())) THEN
    RETURN '[]'::json;
  END IF;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = s.tenant_id AND actual ORDER BY anio_inicio DESC LIMIT 1;
  SELECT json_agg(json_build_object(
           'id', ta.id, 'titulo', ta.titulo, 'instrucciones', ta.instrucciones, 'fecha_entrega', ta.fecha_entrega,
           'enlace', ta.enlace, 'archivo_path', ta.archivo_path, 'archivo_nombre', ta.archivo_nombre,
           'archivo_bytes', ta.archivo_bytes, 'seccion', ta.seccion, 'asignatura', a.nombre,
           'maestro', ta.maestro_nombre, 'created_at', ta.created_at)
         ORDER BY ta.created_at DESC)
    INTO v_res
    FROM (SELECT * FROM public.edu_tareas
           WHERE tenant_id = s.tenant_id AND anio_id = v_anio AND curso_id = p_curso
             AND (v_sec = '' OR seccion IN ('', v_sec))
           ORDER BY created_at DESC LIMIT 200) ta
    LEFT JOIN public.edu_asignaturas a ON a.id = ta.asignatura_id;
  RETURN COALESCE(v_res, '[]'::json);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_sitio_tareas(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_sitio_tareas(text, text, uuid, text) TO anon, authenticated;

-- ── 5. El login en el dominio del colegio sale con su logo ─────────────
CREATE OR REPLACE FUNCTION public.get_tenant_por_dominio(p_dominio text)
RETURNS TABLE(nombre text, logo_url text, telefono text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT x.nombre, x.logo_url, x.telefono FROM (
    SELECT t.nombre, t.logo_url, t.telefono, 1 AS prioridad
      FROM tenants t
     WHERE t.dominio = p_dominio AND t.activo = true
    UNION ALL
    SELECT COALESCE(c.nombre, t.nombre), COALESCE(NULLIF(c.logo_url, ''), t.logo_url), COALESCE(c.telefono, t.telefono), 2
      FROM edu_sitio s
      JOIN tenants t ON t.id = s.tenant_id AND t.activo = true
      LEFT JOIN config_empresa c ON c.tenant_id = t.id
     WHERE s.dominio = private.edu_limpiar_dominio(p_dominio)
  ) x
  ORDER BY x.prioridad
  LIMIT 1;
$function$;

-- ── 6. Notas en la página: padres y estudiantes con su clave ───────────
-- Cada estudiante tiene una clave de 8 letras/números (se entrega impresa).
-- En la página escriben la clave y ven las notas del año actual, pero SOLO
-- de los períodos que el colegio publicó (edu_notas_publicadas). La
-- recuperación y la calificación final salen cuando los 4 están publicados.
ALTER TABLE public.edu_estudiantes ADD COLUMN IF NOT EXISTS clave_portal text;
CREATE UNIQUE INDEX IF NOT EXISTS edu_estudiantes_clave_portal ON public.edu_estudiantes (tenant_id, clave_portal) WHERE clave_portal IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.edu_notas_publicadas (
  tenant_id     uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  anio_id       uuid NOT NULL REFERENCES public.edu_anios(id),
  periodo       smallint NOT NULL CHECK (periodo BETWEEN 1 AND 4),
  publicado_por uuid DEFAULT auth.uid(),
  publicado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio_id, periodo)
);

CREATE OR REPLACE FUNCTION private.edu_notas_publicadas_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE id = NEW.anio_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'El año escolar no es de este colegio';
  END IF;
  NEW.publicado_por := auth.uid();
  NEW.publicado_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_notas_publicadas_antes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS edu_notas_publicadas_antes ON public.edu_notas_publicadas;
CREATE TRIGGER edu_notas_publicadas_antes BEFORE INSERT OR UPDATE ON public.edu_notas_publicadas
  FOR EACH ROW EXECUTE FUNCTION private.edu_notas_publicadas_antes();

ALTER TABLE public.edu_notas_publicadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS edu_notas_publicadas_tenant ON public.edu_notas_publicadas;
CREATE POLICY edu_notas_publicadas_tenant ON public.edu_notas_publicadas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, DELETE ON public.edu_notas_publicadas TO authenticated;

-- Clave: 8 caracteres sin los que se confunden (0/O, 1/I/L).
CREATE OR REPLACE FUNCTION private.edu_clave_nueva()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'pg_catalog', 'extensions'
AS $function$
DECLARE a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); r text := ''; i int;
BEGIN
  FOR i IN 0..7 LOOP
    r := r || substr(a, 1 + (get_byte(b, i) % length(a)), 1);
  END LOOP;
  RETURN r;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_clave_nueva() FROM PUBLIC, anon, authenticated;

-- Da clave a los estudiantes activos que no la tienen (de un curso o todos),
-- o una clave NUEVA a un estudiante (si se perdió la anterior).
CREATE OR REPLACE FUNCTION public.edu_generar_claves_portal(p_curso uuid DEFAULT NULL, p_estudiante uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); e record; v_n int := 0; v_intentos int;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  FOR e IN
    SELECT id FROM public.edu_estudiantes
     WHERE tenant_id = v_t
       AND ((p_estudiante IS NOT NULL AND id = p_estudiante)
         OR (p_estudiante IS NULL AND clave_portal IS NULL AND estado = 'activo' AND (p_curso IS NULL OR curso_id = p_curso)))
  LOOP
    v_intentos := 0;
    LOOP
      BEGIN
        UPDATE public.edu_estudiantes SET clave_portal = private.edu_clave_nueva() WHERE id = e.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_intentos := v_intentos + 1;
        IF v_intentos > 5 THEN RAISE; END IF;
      END;
    END LOOP;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_generar_claves_portal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_generar_claves_portal(uuid, uuid) TO authenticated;

-- Lo que ve el padre/estudiante con su clave.
CREATE OR REPLACE FUNCTION public.edu_sitio_notas(p_dominio text, p_slug text, p_clave text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  s public.edu_sitio; v_clave text := upper(regexp_replace(COALESCE(p_clave, ''), '[^A-Za-z0-9]', '', 'g'));
  est record; v_anio record; v_pub smallint[]; v_asig json;
BEGIN
  IF length(v_clave) <> 8 THEN RETURN json_build_object('encontrado', false); END IF;
  s := private.edu_sitio_de(p_dominio, p_slug);
  IF s.tenant_id IS NULL THEN RETURN json_build_object('encontrado', false); END IF;
  IF NOT (s.publicada AND private.edu_sitio_plan_ok(s.tenant_id))
     AND NOT (auth.uid() IS NOT NULL AND (public.get_user_tenant() = s.tenant_id OR private.edu_es_superadmin())) THEN
    RETURN json_build_object('encontrado', false);
  END IF;
  SELECT e.id, e.nombres, e.apellidos, e.seccion, c.nombre AS curso, c.nivel
    INTO est
    FROM public.edu_estudiantes e LEFT JOIN public.edu_cursos c ON c.id = e.curso_id
   WHERE e.tenant_id = s.tenant_id AND e.clave_portal = v_clave AND e.estado IN ('activo', 'por_confirmar');
  IF est.id IS NULL THEN RETURN json_build_object('encontrado', false); END IF;
  SELECT id, nombre INTO v_anio FROM public.edu_anios WHERE tenant_id = s.tenant_id AND actual ORDER BY anio_inicio DESC LIMIT 1;
  SELECT COALESCE(array_agg(periodo ORDER BY periodo), '{}') INTO v_pub
    FROM public.edu_notas_publicadas WHERE anio_id = v_anio.id;

  SELECT json_agg(json_build_object(
           'nombre', a.nombre,
           'notas', COALESCE((SELECT json_object_agg(n.competencia || '-' || n.periodo, n.nota)
                                FROM public.edu_notas n
                               WHERE n.estudiante_id = est.id AND n.anio_id = v_anio.id AND n.asignatura_id = a.id
                                 AND n.periodo = ANY (v_pub)), '{}'::json),
           'recuperacion', CASE WHEN cardinality(v_pub) = 4 THEN
                             (SELECT r.nota FROM public.edu_notas_recuperacion r
                               WHERE r.estudiante_id = est.id AND r.anio_id = v_anio.id AND r.asignatura_id = a.id) END)
         ORDER BY a.orden, a.nombre)
    INTO v_asig
    FROM public.edu_asignaturas a
   WHERE a.tenant_id = s.tenant_id AND a.nivel = est.nivel
     AND (a.activa OR EXISTS (SELECT 1 FROM public.edu_notas n WHERE n.asignatura_id = a.id AND n.estudiante_id = est.id AND n.anio_id = v_anio.id));

  RETURN json_build_object(
    'encontrado', true,
    'estudiante', est.nombres || ' ' || est.apellidos,
    'curso', est.curso, 'seccion', est.seccion, 'nivel', est.nivel,
    'anio', v_anio.nombre,
    'periodos_publicados', to_json(v_pub),
    'asignaturas', COALESCE(v_asig, '[]'::json));
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_sitio_notas(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edu_sitio_notas(text, text, text) TO anon, authenticated;

SELECT public.registrar_migracion('centros_educativos_pagina_web.sql');
