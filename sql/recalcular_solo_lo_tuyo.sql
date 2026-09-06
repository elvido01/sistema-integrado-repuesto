-- ============================================================
-- RECALCULAR SOLO LO TUYO
-- ============================================================
-- `recalcular_sugerencias_equivalentes` es SECURITY DEFINER y recibe el tenant
-- por parametro (lo necesita el cron, que corre sin sesion). Tal como quedo,
-- un usuario cualquiera podia llamarla con el id de OTRA empresa: no veria el
-- resultado (la RLS de lectura lo tapa), pero le borraria las propuestas
-- pendientes al vecino. Se cierra.
--
-- La regla: si hay sesion, el parametro tiene que ser SU empresa. Sin sesion
-- (service_role, o sea el cron) sigue pudiendo recalcularle a todas.
-- ============================================================

SELECT public.registrar_migracion('recalcular_solo_lo_tuyo.sql');

DO $arreglo$
DECLARE
  v_def text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalcular_sugerencias_equivalentes';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Falta correr los_equivalentes_se_proponen_solos.sql primero.';
  END IF;

  IF position('No puedes recalcular' IN v_def) > 0 THEN
    RAISE NOTICE 'El candado ya estaba puesto.';
    RETURN;
  END IF;

  v_nuevo := replace(
    replace(v_def, E'\r\n', E'\n'),
    'IF v_tenant IS NULL THEN' || E'\n' || '    RETURN jsonb_build_object(''error'', ''sin empresa'');' || E'\n' || '  END IF;',
    'IF v_tenant IS NULL THEN' || E'\n' ||
    '    RETURN jsonb_build_object(''error'', ''sin empresa'');' || E'\n' ||
    '  END IF;' || E'\n\n' ||
    '  -- El cron corre sin sesion y le recalcula a todas. Una persona, solo a' || E'\n' ||
    '  -- la suya: si no, le borraria las propuestas pendientes a otra empresa.' || E'\n' ||
    '  IF p_tenant_id IS NOT NULL AND auth.uid() IS NOT NULL' || E'\n' ||
    '     AND p_tenant_id <> public.get_user_tenant() THEN' || E'\n' ||
    '    RAISE EXCEPTION ''No puedes recalcular las sugerencias de otra empresa.'';' || E'\n' ||
    '  END IF;'
  );

  IF v_nuevo = replace(v_def, E'\r\n', E'\n') THEN
    RAISE EXCEPTION 'No se encontro donde poner el candado: la funcion cambio de forma.';
  END IF;

  EXECUTE v_nuevo;
END $arreglo$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — un usuario de una empresa intentando tocar la otra
-- ============================================================
DO $prueba$
DECLARE
  v_user  UUID;
  v_mio   UUID;
  v_ajeno UUID;
  v_paso  BOOLEAN := false;
BEGIN
  SELECT p.id, p.tenant_id INTO v_user, v_mio
    FROM public.profiles p
    JOIN public.usuario_tenant_activo a ON a.user_id = p.id AND a.tenant_id = p.tenant_id
   WHERE EXISTS (SELECT 1 FROM public.productos x WHERE x.tenant_id = p.tenant_id)
   LIMIT 1;

  SELECT t.id INTO v_ajeno FROM public.tenants t WHERE t.id <> v_mio LIMIT 1;

  IF v_user IS NULL OR v_ajeno IS NULL THEN
    RAISE NOTICE 'No hay con quien probar el candado. Queda puesto igual.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.recalcular_sugerencias_equivalentes(v_ajeno);
    v_paso := true;   -- no debio llegar aqui
  EXCEPTION WHEN OTHERS THEN
    v_paso := false;  -- lo rebotó, que es lo correcto
  END;

  RESET ROLE;

  IF v_paso THEN
    RAISE EXCEPTION 'EL CANDADO NO SIRVE: el usuario % le recalculo a la empresa ajena %.', v_user, v_ajeno;
  END IF;

  RAISE NOTICE 'Candado OK: un usuario no puede recalcularle a otra empresa.';
END $prueba$;
