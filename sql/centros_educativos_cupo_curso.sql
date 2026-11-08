-- =====================================================================
-- Colegios: CUPO MÁXIMO por curso y tanda (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño: "en 4to de Primaria caben 25". Se escribe una vez y
-- sirve todos los años (va en el curso, no en el año escolar).
--
-- · edu_cursos.cupos = {"matutina": 25, "vespertina": 30}; tanda sin número
--   = sin límite.
-- · edu_cursos.cupo_por_seccion: el número es por cada sección (1ro A = 30,
--   1ro B = 30). Sin marcar: es para todo el curso en esa tanda.
-- · Cuentan los ACTIVOS y los POR CONFIRMAR (ya tienen su lugar apartado).
-- · Se frena al INSCRIBIR (también el Excel) y al REACTIVAR un retirado.
--   El cambio de año NO se frena (todo el curso sube junto; la directora
--   reparte las secciones) y el pago de la reservación tampoco (ese
--   estudiante ya contaba).
-- · edu_cupo_curso(): lo que queda, para la pantalla de inscripción y para
--   avisar al mover a un estudiante de curso.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.edu_cursos ADD COLUMN IF NOT EXISTS cupos jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.edu_cursos ADD COLUMN IF NOT EXISTS cupo_por_seccion boolean NOT NULL DEFAULT false;

-- Cupo y ocupados de un curso/tanda (y sección si el cupo es por sección).
CREATE OR REPLACE FUNCTION public.edu_cupo_curso(p_curso uuid, p_tanda text, p_seccion text DEFAULT NULL, p_excluir uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE c public.edu_cursos%ROWTYPE; v_cupo integer; v_ocup integer; v_secc text := NULLIF(upper(btrim(COALESCE(p_seccion, ''))), '');
BEGIN
  SELECT * INTO c FROM public.edu_cursos WHERE id = p_curso;
  IF NOT FOUND OR c.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN RETURN NULL; END IF;
  v_cupo := NULLIF(c.cupos ->> p_tanda, '')::integer;
  IF v_cupo IS NULL OR v_cupo <= 0 THEN RETURN jsonb_build_object('cupo', NULL); END IF;
  SELECT count(*) INTO v_ocup FROM public.edu_estudiantes e
   WHERE e.tenant_id = c.tenant_id AND e.curso_id = c.id AND e.tanda = p_tanda
     AND e.estado IN ('activo', 'por_confirmar')
     AND (p_excluir IS NULL OR e.id <> p_excluir)
     AND (NOT c.cupo_por_seccion OR NULLIF(upper(btrim(COALESCE(e.seccion, ''))), '') IS NOT DISTINCT FROM v_secc);
  RETURN jsonb_build_object('cupo', v_cupo, 'ocupados', v_ocup, 'quedan', greatest(v_cupo - v_ocup, 0),
                            'por_seccion', c.cupo_por_seccion, 'seccion', v_secc);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cupo_curso(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cupo_curso(uuid, text, text, uuid) TO authenticated;

-- El freno (aparte del trigger del tope del plan).
CREATE OR REPLACE FUNCTION private.edu_cupo_curso_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE c public.edu_cursos%ROWTYPE; v_cupo integer; v_ocup integer; v_secc text;
BEGIN
  IF NEW.estado NOT IN ('activo', 'por_confirmar') THEN RETURN NEW; END IF;
  -- Solo una inscripción nueva o un retirado/graduado que vuelve.
  IF TG_OP = 'UPDATE' AND OLD.estado IN ('activo', 'por_confirmar') THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.edu_cursos WHERE id = NEW.curso_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_cupo := NULLIF(c.cupos ->> NEW.tanda, '')::integer;
  IF v_cupo IS NULL OR v_cupo <= 0 THEN RETURN NEW; END IF;
  v_secc := NULLIF(upper(btrim(COALESCE(NEW.seccion, ''))), '');
  PERFORM pg_advisory_xact_lock(hashtext('edu_cupo:' || c.id::text || ':' || NEW.tanda));
  SELECT count(*) INTO v_ocup FROM public.edu_estudiantes e
   WHERE e.tenant_id = NEW.tenant_id AND e.curso_id = c.id AND e.tanda = NEW.tanda
     AND e.estado IN ('activo', 'por_confirmar') AND e.id <> NEW.id
     AND (NOT c.cupo_por_seccion OR NULLIF(upper(btrim(COALESCE(e.seccion, ''))), '') IS NOT DISTINCT FROM v_secc);
  IF v_ocup >= v_cupo THEN
    RAISE EXCEPTION '% % está lleno (% de %). Escoge otra tanda o sección, o sube el cupo en Configuración → Cursos.',
      c.nombre,
      initcap(NEW.tanda) || CASE WHEN c.cupo_por_seccion THEN ' sección ' || COALESCE(v_secc, '(sin sección)') ELSE '' END,
      v_ocup, v_cupo
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_cupo_curso_antes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS edu_cupo_curso_antes ON public.edu_estudiantes;
CREATE TRIGGER edu_cupo_curso_antes BEFORE INSERT OR UPDATE OF estado ON public.edu_estudiantes
  FOR EACH ROW EXECUTE FUNCTION private.edu_cupo_curso_antes();

SELECT public.registrar_migracion('centros_educativos_cupo_curso.sql');
