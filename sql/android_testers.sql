-- =====================================================================
-- Testers de la app Android (botón "Instalar en Android")
-- ---------------------------------------------------------------------
-- (19/11/2026) Google exige 12 testers en prueba cerrada 14 días seguidos
-- para publicar la app. El botón (login e Inicio) pide el Gmail, lo guarda
-- aquí y guía a la persona: unirse al grupo de Google abierto → aceptar la
-- prueba → instalar (scripts/play-testers.mjs pone el grupo en Play).
-- Aquí queda la lista para contar y para escribirles si se salen.
-- Cualquiera puede registrarse (el login no tiene sesión): solo por la RPC.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.android_testers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  origen      text NOT NULL DEFAULT 'login' CHECK (origen IN ('login', 'inicio', 'otro')),
  user_id     uuid,
  tenant_id   uuid,
  veces       int  NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS android_testers_email ON public.android_testers (lower(email));

ALTER TABLE public.android_testers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.android_testers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_tester_android(p_email text, p_origen text DEFAULT 'login')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_nuevo boolean;
  v_total int;
BEGIN
  IF length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe un correo válido (el de tu cuenta de Google).');
  END IF;

  INSERT INTO public.android_testers (email, origen, user_id, tenant_id)
  VALUES (v_email,
          CASE WHEN p_origen IN ('login', 'inicio') THEN p_origen ELSE 'otro' END,
          auth.uid(),
          CASE WHEN auth.uid() IS NOT NULL THEN public.get_user_tenant() END)
  ON CONFLICT (lower(email)) DO UPDATE
    SET veces = android_testers.veces + 1, updated_at = now(),
        user_id = COALESCE(android_testers.user_id, EXCLUDED.user_id),
        tenant_id = COALESCE(android_testers.tenant_id, EXCLUDED.tenant_id)
  RETURNING (xmax = 0) INTO v_nuevo;

  SELECT count(*) INTO v_total FROM public.android_testers;

  -- Campanita al dueño de MotoFlow (empresa Morla) por cada tester nuevo.
  IF v_nuevo THEN
    BEGIN
      PERFORM public._crm_notificar_admins('00000000-0000-0000-0000-000000000001'::uuid, 'android_tester',
        format('Nuevo tester Android (%s de 12)', v_total), v_email);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'nuevo', v_nuevo, 'total', v_total);
END $fn$;

REVOKE ALL ON FUNCTION public.registrar_tester_android(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_tester_android(text, text) TO anon, authenticated;

-- Prueba (se deshace sola)
DO $prueba$
DECLARE r jsonb; n int;
BEGIN
  BEGIN
    r := public.registrar_tester_android('no-es-correo', 'login');
    IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FALLO: aceptó un correo inválido'; END IF;
    r := public.registrar_tester_android('Prueba.Tester@Gmail.com ', 'inicio');
    IF NOT (r->>'ok')::boolean OR NOT (r->>'nuevo')::boolean THEN RAISE EXCEPTION 'FALLO: no registró (%)', r; END IF;
    r := public.registrar_tester_android('prueba.tester@gmail.com', 'login');
    IF (r->>'nuevo')::boolean THEN RAISE EXCEPTION 'FALLO: duplicó el correo'; END IF;
    SELECT veces INTO n FROM public.android_testers WHERE email = 'prueba.tester@gmail.com';
    IF n <> 2 THEN RAISE EXCEPTION 'FALLO: veces=%', n; END IF;
    RAISE EXCEPTION 'prueba_ok';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'prueba_ok' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'android_testers: prueba OK';
END $prueba$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('android_testers.sql');
