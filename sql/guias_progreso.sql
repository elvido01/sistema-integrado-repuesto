-- =====================================================================
-- Guías interactivas — progreso por usuario (Fase 3 del onboarding, 19/11/2026)
-- ---------------------------------------------------------------------
-- El progreso es de la PERSONA, no de la empresa: varios empleados necesitan
-- aprender a vender aunque la empresa ya tenga miles de ventas (decisión del
-- dueño). Se guarda en el servidor para que siga entre sesiones y entre la
-- web y la app.
--
--   estado: iniciada | completada | omitida
--   version: la de la guía cuando se tocó. Solo un cambio de versión MAYOR
--            (2.x frente a 1.x) la vuelve a ofrecer: un retoque de pantalla no
--            obliga a repetir nada.
--   paso: el último paso alcanzado (para continuar una guía interrumpida).
--
-- La definición de cada guía (pasos, elementos de pantalla) vive en el código
-- (src/guias/): aquí solo el progreso y los eventos para medir.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.guias_progreso (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guia_id     text NOT NULL CHECK (guia_id ~ '^[a-z0-9-]{2,60}$'),
  tenant_id   uuid REFERENCES public.tenants(id),
  version     text NOT NULL,
  estado      text NOT NULL CHECK (estado IN ('iniciada', 'completada', 'omitida')),
  paso        integer NOT NULL DEFAULT 0 CHECK (paso >= 0),
  plataforma  text NOT NULL DEFAULT 'web' CHECK (plataforma IN ('web', 'movil')),
  iniciada_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, guia_id)
);

ALTER TABLE public.guias_progreso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guias_progreso FROM anon;
DROP POLICY IF EXISTS guias_progreso_propio ON public.guias_progreso;
CREATE POLICY guias_progreso_propio ON public.guias_progreso
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Se escribe solo por guardar_guia() (valida estado, paso y la empresa activa).

-- Eventos para medir dónde se atasca la gente (Fase 6): solo qué guía, qué
-- paso y qué pasó. Ningún dato del negocio.
CREATE TABLE IF NOT EXISTS public.guias_eventos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid REFERENCES public.tenants(id),
  guia_id    text NOT NULL,
  version    text NOT NULL,
  evento     text NOT NULL CHECK (evento IN ('ofrecida', 'iniciada', 'paso', 'completada', 'omitida', 'reiniciada', 'elemento_no_encontrado')),
  paso       integer,
  plataforma text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guias_eventos_guia ON public.guias_eventos (guia_id, created_at);
ALTER TABLE public.guias_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guias_eventos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mis_guias()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(jsonb_object_agg(guia_id, jsonb_build_object(
           'version', version, 'estado', estado, 'paso', paso, 'updated_at', updated_at)), '{}'::jsonb)
    FROM public.guias_progreso WHERE user_id = auth.uid()
$function$;
REVOKE ALL ON FUNCTION public.mis_guias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_guias() TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_guia(
  p_guia text, p_version text, p_estado text, p_paso integer DEFAULT 0,
  p_evento text DEFAULT NULL, p_plataforma text DEFAULT 'web')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF p_guia IS NULL OR p_guia !~ '^[a-z0-9-]{2,60}$' OR length(COALESCE(p_version, '')) NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'guía no válida');
  END IF;
  IF p_plataforma IS NULL OR p_plataforma NOT IN ('web', 'movil') THEN p_plataforma := 'web'; END IF;

  IF p_estado IS NOT NULL THEN
    IF p_estado NOT IN ('iniciada', 'completada', 'omitida') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'estado no válido');
    END IF;
    INSERT INTO public.guias_progreso (user_id, guia_id, tenant_id, version, estado, paso, plataforma)
    VALUES (v_uid, p_guia, v_tenant, p_version, p_estado, GREATEST(COALESCE(p_paso, 0), 0), p_plataforma)
    ON CONFLICT (user_id, guia_id) DO UPDATE
      SET version = EXCLUDED.version, estado = EXCLUDED.estado, paso = EXCLUDED.paso,
          tenant_id = EXCLUDED.tenant_id, plataforma = EXCLUDED.plataforma, updated_at = now(),
          iniciada_at = CASE WHEN EXCLUDED.estado = 'iniciada' AND guias_progreso.estado <> 'iniciada'
                             THEN now() ELSE guias_progreso.iniciada_at END;
  END IF;

  IF p_evento IN ('ofrecida', 'iniciada', 'paso', 'completada', 'omitida', 'reiniciada', 'elemento_no_encontrado') THEN
    INSERT INTO public.guias_eventos (user_id, tenant_id, guia_id, version, evento, paso, plataforma)
    VALUES (v_uid, v_tenant, p_guia, p_version, p_evento, p_paso, p_plataforma);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.guardar_guia(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_guia(text, text, text, integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Prueba: sin sesión no guarda nada; las reglas de la tabla se cumplen ──
DO $prueba$
DECLARE r jsonb;
BEGIN
  r := public.guardar_guia('venta', '1.0', 'iniciada', 0, 'iniciada');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'prueba: guardó sin sesión'; END IF;
  IF public.mis_guias() <> '{}'::jsonb THEN RAISE EXCEPTION 'prueba: sin sesión devuelve progreso'; END IF;
  BEGIN
    INSERT INTO public.guias_progreso (user_id, guia_id, version, estado)
    VALUES ((SELECT id FROM auth.users ORDER BY created_at LIMIT 1), 'Venta Mala!', '1.0', 'iniciada');
    RAISE EXCEPTION 'prueba: aceptó un id de guía inválido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$prueba$;

SELECT public.registrar_migracion('guias_progreso.sql');
