-- =====================================================================
-- CENTROS EDUCATIVOS · PARTE 2: ESTUDIANTES Y FAMILIAS (06/11/2026)
-- ---------------------------------------------------------------------
-- · FAMILIA: los padres/tutor y los datos del hogar son de la familia, no de
--   cada hijo. Así los hermanos quedan enlazados solos: al abrir a Juan se
--   ve que Pedro es su hermano y lo que debe la familia completa.
-- · ESTUDIANTE: la Ficha Integral de Datos del colegio. Guarda una COPIA de
--   su mensualidad (tarifa congelada por antigüedad; a un continuante nunca
--   se le sube). Beca (solo mensualidades), Sala de Tareas, curso y tanda.
--   No se borra: se retira (la secretaria no puede borrar nada).
-- · FOTO obligatoria en la ficha (la exige la pantalla), en un bucket
--   PRIVADO 'edu-fotos': carpeta = empresa; nadie de otra empresa la ve.
-- · TOPE DE ESTUDIANTES del plan (o el especial de la empresa, ej. 700 del
--   precio fundador): cuentan solo los ACTIVOS (inscritos este año). Al
--   llegar al tope no se inscribe más; edu_cupo_estudiantes() avisa antes.
-- Idempotente.
-- =====================================================================

-- ── 1. Familias ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_familias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre                text NOT NULL,                       -- "Pérez Santana"
  direccion             text,
  sector                text,
  telefono_residencial  text,
  madre_nombre          text, madre_profesion text, madre_trabajo text,
  madre_telefono        text, madre_celular   text, madre_correo  text,
  padre_nombre          text, padre_profesion text, padre_trabajo text,
  padre_telefono        text, padre_celular   text, padre_correo  text,
  tutor_nombre          text, tutor_telefono  text, tutor_direccion text,
  estado_padres         text CHECK (estado_padres IS NULL OR estado_padres IN ('casados','separados','divorciados','fallecidos','union_libre','otro')),
  cliente_id            uuid REFERENCES public.clientes(id) ON DELETE SET NULL,  -- para la factura con crédito fiscal (parte 5)
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS edu_familias_tenant_nombre ON public.edu_familias (tenant_id, nombre);

-- ── 2. Estudiantes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_estudiantes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  familia_id          uuid NOT NULL REFERENCES public.edu_familias(id),
  matricula           integer NOT NULL,                       -- correlativo por colegio
  nombres             text NOT NULL,
  apellidos           text NOT NULL,
  fecha_nacimiento    date,
  lugar_nacimiento    text,
  celular             text,
  otro_telefono       text,
  telefono_trabajo    text,
  foto_path           text,                                   -- edu-fotos/<tenant>/<archivo>
  curso_id            uuid REFERENCES public.edu_cursos(id),
  tanda               text CHECK (tanda IS NULL OR tanda IN ('matutina','vespertina','extendida','nocturna')),
  condicion           text NOT NULL DEFAULT 'nuevo' CHECK (condicion IN ('nuevo','continuante')),
  anio_ingreso        integer,                                -- año escolar en que entró
  tarifa_mensual      numeric NOT NULL CHECK (tarifa_mensual >= 0),   -- COPIA congelada
  tarifa_id           uuid REFERENCES public.edu_tarifas(id),         -- de qué tarifa salió (NULL = acuerdo)
  tarifa_acuerdo      boolean NOT NULL DEFAULT false,
  tarifa_nota         text,                                   -- "acuerdo con la dirección", "tarifa del hermano"
  beca_pct            numeric NOT NULL DEFAULT 0 CHECK (beca_pct BETWEEN 0 AND 100),
  beca_motivo         text,
  sala_tareas         boolean NOT NULL DEFAULT false,
  numero_hermanos     integer CHECK (numero_hermanos IS NULL OR numero_hermanos >= 0),
  edades_hermanos     text,
  posicion_familia    text,
  estado              text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','retirado','graduado')),
  fecha_retiro        date,
  motivo_retiro       text,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matricula)
);
CREATE INDEX IF NOT EXISTS edu_estudiantes_familia ON public.edu_estudiantes (familia_id);
CREATE INDEX IF NOT EXISTS edu_estudiantes_tenant_estado ON public.edu_estudiantes (tenant_id, estado);
CREATE INDEX IF NOT EXISTS edu_estudiantes_busqueda ON public.edu_estudiantes (tenant_id, apellidos, nombres);

-- ── 3. Seguridad: empresa activa; sin DELETE (se retira, no se borra) ───
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_familias','edu_estudiantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant())',
                   t || '_tenant', t);
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── 4. Tope de estudiantes ──────────────────────────────────────────────
-- Límite: el especial de la empresa (tenants.limite_estudiantes_especial)
-- o el del plan de su suscripción vigente. NULL = sin límite.
CREATE OR REPLACE FUNCTION public.edu_limite_estudiantes(p_tenant uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(
    (SELECT t.limite_estudiantes_especial FROM public.tenants t WHERE t.id = p_tenant),
    (SELECT p.limite_estudiantes
       FROM public.suscripciones s JOIN public.planes p ON p.id = s.plan_id
      WHERE s.tenant_id = p_tenant
      ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC
      LIMIT 1)
  );
$function$;
REVOKE ALL ON FUNCTION public.edu_limite_estudiantes(uuid) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: cuántos van, cuál es el tope y cuántos quedan.
CREATE OR REPLACE FUNCTION public.edu_cupo_estudiantes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_lim integer; v_act integer;
BEGIN
  IF v_t IS NULL THEN RETURN NULL; END IF;
  v_lim := public.edu_limite_estudiantes(v_t);
  SELECT count(*) INTO v_act FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo';
  RETURN jsonb_build_object('activos', v_act, 'limite', v_lim,
                            'quedan', CASE WHEN v_lim IS NULL THEN NULL ELSE greatest(v_lim - v_act, 0) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cupo_estudiantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cupo_estudiantes() TO authenticated;

-- Matrícula correlativa + tope al inscribir o reactivar.
CREATE OR REPLACE FUNCTION public.edu_estudiante_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_lim integer; v_act integer;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' AND NEW.matricula IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('edu_matricula:' || NEW.tenant_id::text));
    SELECT COALESCE(max(matricula), 0) + 1 INTO NEW.matricula FROM public.edu_estudiantes WHERE tenant_id = NEW.tenant_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Un estudiante no cambia de empresa';
  END IF;
  -- El hermano tiene que ser de la misma empresa.
  IF NOT EXISTS (SELECT 1 FROM public.edu_familias f WHERE f.id = NEW.familia_id AND f.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'La familia no es de este colegio';
  END IF;
  IF NEW.estado = 'activo' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'activo') THEN
    v_lim := public.edu_limite_estudiantes(NEW.tenant_id);
    IF v_lim IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('edu_tope:' || NEW.tenant_id::text));
      SELECT count(*) INTO v_act FROM public.edu_estudiantes WHERE tenant_id = NEW.tenant_id AND estado = 'activo';
      IF v_act >= v_lim THEN
        RAISE EXCEPTION 'Llegaste al tope de % estudiantes de tu plan. Para inscribir más, sube de plan.', v_lim
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS edu_estudiante_antes ON public.edu_estudiantes;
CREATE TRIGGER edu_estudiante_antes BEFORE INSERT OR UPDATE ON public.edu_estudiantes
  FOR EACH ROW EXECUTE FUNCTION public.edu_estudiante_antes();

CREATE OR REPLACE FUNCTION public.edu_familia_antes()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;
DROP TRIGGER IF EXISTS edu_familia_antes ON public.edu_familias;
CREATE TRIGGER edu_familia_antes BEFORE UPDATE ON public.edu_familias
  FOR EACH ROW EXECUTE FUNCTION public.edu_familia_antes();

-- ── 5. Fotos: bucket privado, una carpeta por empresa ───────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('edu-fotos', 'edu-fotos', false, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS edu_fotos_leer ON storage.objects;
CREATE POLICY edu_fotos_leer ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'edu-fotos' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);
DROP POLICY IF EXISTS edu_fotos_subir ON storage.objects;
CREATE POLICY edu_fotos_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'edu-fotos' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);
DROP POLICY IF EXISTS edu_fotos_cambiar ON storage.objects;
CREATE POLICY edu_fotos_cambiar ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'edu-fotos' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

SELECT public.registrar_migracion('centros_educativos_estudiantes.sql');
