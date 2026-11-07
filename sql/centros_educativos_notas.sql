-- =====================================================================
-- Registro de notas y boletín de calificaciones (07/11/2026)
-- ---------------------------------------------------------------------
-- Plan EDUCA TOTAL (la pantalla lo frena por plan). Formato del boletín
-- MINERD de primaria (foto del dueño): por asignatura, 3 competencias
-- fundamentales × 4 períodos (P1-P4); C1-C3 = promedio de los 4 períodos
-- de cada competencia; calificación final del área = promedio de C1-C3;
-- recuperación final se escribe a mano. Lo calcula la pantalla.
--
-- 1. edu_estudiantes.seccion (A, B...): sale en el boletín.
-- 2. edu_asignaturas: por nivel (primaria / secundaria), editables.
--    Se precargan las 8 del boletín MINERD de primaria (y secundaria).
-- 3. edu_notas: una nota por estudiante/año/asignatura/competencia/período.
-- 4. edu_notas_recuperacion: la calificación de recuperación final.
-- 5. edu_grupos_maestro: el maestro(a) encargado(a) de cada curso/sección.
-- Cada colegio ve solo lo suyo (empresa activa), como el resto del módulo.
-- =====================================================================

ALTER TABLE public.edu_estudiantes ADD COLUMN IF NOT EXISTS seccion text;

CREATE TABLE IF NOT EXISTS public.edu_asignaturas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nivel       text NOT NULL CHECK (nivel IN ('primaria', 'secundaria')),
  nombre      text NOT NULL CHECK (btrim(nombre) <> ''),
  orden       integer NOT NULL DEFAULT 0,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nivel, nombre)
);

CREATE TABLE IF NOT EXISTS public.edu_notas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  anio_id        uuid NOT NULL REFERENCES public.edu_anios(id),
  estudiante_id  uuid NOT NULL REFERENCES public.edu_estudiantes(id) ON DELETE CASCADE,
  asignatura_id  uuid NOT NULL REFERENCES public.edu_asignaturas(id),
  competencia    smallint NOT NULL CHECK (competencia BETWEEN 1 AND 3),
  periodo        smallint NOT NULL CHECK (periodo BETWEEN 1 AND 4),
  nota           numeric(5,2) NOT NULL CHECK (nota BETWEEN 0 AND 100),
  updated_by     uuid DEFAULT auth.uid(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudiante_id, anio_id, asignatura_id, competencia, periodo)
);
CREATE INDEX IF NOT EXISTS edu_notas_anio ON public.edu_notas (tenant_id, anio_id, asignatura_id);

CREATE TABLE IF NOT EXISTS public.edu_notas_recuperacion (
  tenant_id      uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  anio_id        uuid NOT NULL REFERENCES public.edu_anios(id),
  estudiante_id  uuid NOT NULL REFERENCES public.edu_estudiantes(id) ON DELETE CASCADE,
  asignatura_id  uuid NOT NULL REFERENCES public.edu_asignaturas(id),
  nota           numeric(5,2) NOT NULL CHECK (nota BETWEEN 0 AND 100),
  updated_by     uuid DEFAULT auth.uid(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estudiante_id, anio_id, asignatura_id)
);

CREATE TABLE IF NOT EXISTS public.edu_grupos_maestro (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  anio_id     uuid NOT NULL REFERENCES public.edu_anios(id),
  curso_id    uuid NOT NULL REFERENCES public.edu_cursos(id),
  seccion     text NOT NULL DEFAULT '',
  maestro     text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio_id, curso_id, seccion)
);

-- Lo que se enlaza tiene que ser del mismo colegio (la RLS solo mira tenant_id).
CREATE OR REPLACE FUNCTION private.edu_notas_misma_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME IN ('edu_notas', 'edu_notas_recuperacion') THEN
    IF NOT EXISTS (SELECT 1 FROM public.edu_estudiantes WHERE id = NEW.estudiante_id AND tenant_id = NEW.tenant_id)
       OR NOT EXISTS (SELECT 1 FROM public.edu_asignaturas WHERE id = NEW.asignatura_id AND tenant_id = NEW.tenant_id)
       OR NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE id = NEW.anio_id AND tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'La nota no corresponde a este colegio';
    END IF;
    NEW.updated_by := auth.uid();
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.edu_cursos WHERE id = NEW.curso_id AND tenant_id = NEW.tenant_id)
       OR NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE id = NEW.anio_id AND tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'El curso no corresponde a este colegio';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_notas_misma_empresa() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_notas', 'edu_notas_recuperacion', 'edu_grupos_maestro'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_empresa', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.edu_notas_misma_empresa()', t || '_empresa', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['edu_asignaturas', 'edu_notas', 'edu_notas_recuperacion', 'edu_grupos_maestro'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant())',
                   t || '_tenant', t);
  END LOOP;
  -- Una nota se puede borrar (casilla vaciada); una asignatura no: se desactiva.
  GRANT SELECT, INSERT, UPDATE ON public.edu_asignaturas TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.edu_notas, public.edu_notas_recuperacion TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.edu_grupos_maestro TO authenticated;
END $$;

-- Asignaturas del boletín MINERD (solo crea las que faltan).
CREATE OR REPLACE FUNCTION public.edu_preparar_asignaturas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_n integer;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  INSERT INTO public.edu_asignaturas (tenant_id, nivel, nombre, orden)
  SELECT v_t, n.nivel, a.nombre, a.orden
    FROM (VALUES ('primaria'), ('secundaria')) n(nivel)
   CROSS JOIN (VALUES ('Lengua Española', 1), ('Matemáticas', 2), ('Ciencias Sociales', 3), ('Ciencias de la Naturaleza', 4),
                      ('Educación Artística', 5), ('Educación Física', 6), ('Formación Integral Humana y Religiosa', 7), ('Inglés', 8)) a(nombre, orden)
   WHERE NOT EXISTS (SELECT 1 FROM public.edu_asignaturas x WHERE x.tenant_id = v_t AND x.nivel = n.nivel)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_preparar_asignaturas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_preparar_asignaturas() TO authenticated;

-- Lo que dice cada plan (los recordatorios por WhatsApp pasan al Educa Pro).
UPDATE public.planes SET descripcion = 'Colegios de hasta 800 estudiantes, con recordatorios por WhatsApp' WHERE nombre = 'EDUCA PRO';
UPDATE public.planes SET descripcion = 'Colegios sin límite, con registro de notas y boletines' WHERE nombre = 'EDUCA TOTAL';

SELECT public.registrar_migracion('centros_educativos_notas.sql');
