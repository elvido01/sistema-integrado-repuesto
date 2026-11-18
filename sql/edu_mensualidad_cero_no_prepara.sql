-- ============================================================
-- UN ESTUDIANTE SIN MENSUALIDAD NO SE LE PREPARA LA CUENTA (17/11/2026)
-- ============================================================
-- El Centenario entrego la lista de estudiantes solo con nombre y curso. Se
-- cargan activos con mensualidad 0 y la nota "FALTA MENSUALIDAD" para
-- completarlos a mano (la ficha ya exige la mensualidad al guardar).
--
-- El riesgo: "Preparar cuenta del año" con tarifa 0 crea las mensualidades
-- en 0 y NACEN PAGADAS (es como trata la beca 100%). Nadie se enteraria de
-- que ese estudiante no debe nada por error.
--
-- Ahora: tarifa <= 0 sin beca 100% -> no se prepara y se avisa.
-- ============================================================

SELECT public.registrar_migracion('edu_mensualidad_cero_no_prepara.sql');

DO $injerto$
DECLARE
  v_def   text;
  v_nuevo text;
  v_ancla text := E'  IF e.estado <> ''activo'' THEN RAISE EXCEPTION ''El estudiante no está activo''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.edu_preparar_cuenta(uuid,date,boolean)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('Falta la mensualidad' IN v_def) > 0 THEN
    RAISE NOTICE 'edu_preparar_cuenta ya exigia la mensualidad.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def, v_ancla, v_ancla || E'\n'
    || E'  -- Sin mensualidad (importado sin tarifa): las mensualidades nacerian en 0\n'
    || E'  -- y pagadas. La beca 100% si es legitima (tarifa > 0, beca 100).\n'
    || E'  IF COALESCE(e.tarifa_mensual, 0) <= 0 AND COALESCE(e.beca_pct, 0) < 100 THEN\n'
    || E'    RAISE EXCEPTION ''Falta la mensualidad de %: complétala en su ficha antes de preparar la cuenta.'', e.nombres || '' '' || e.apellidos;\n'
    || E'  END IF;');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro donde injertar en edu_preparar_cuenta.';
  END IF;
  EXECUTE v_nuevo;
END $injerto$;

-- PRUEBA: un estudiante de prueba con tarifa 0 no se prepara (y se deshace).
DO $prueba$
DECLARE
  v_t    uuid;
  v_user uuid;
  v_fam  uuid;
  v_est  uuid;
  v_msg  text := '';
BEGIN
  SELECT a.tenant_id INTO v_t FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.tenant_id = v_t ORDER BY p.id LIMIT 1;
  IF v_t IS NULL OR v_user IS NULL THEN RAISE NOTICE 'Sin colegio de prueba.'; RETURN; END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'SIN TARIFA', 0, 'retirado') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;   -- sin curso: no toca cupos
    PERFORM public.edu_preparar_cuenta(v_est);
    v_msg := 'SE PREPARO';
    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF v_msg = 'SE PREPARO' THEN
      RAISE EXCEPTION 'Con tarifa 0 la cuenta se preparo igual: el candado no funciona.';
    END IF;
    IF SQLERRM NOT LIKE 'Falta la mensualidad%' THEN
      RAISE EXCEPTION 'La prueba fallo por otra cosa: %', SQLERRM;
    END IF;
  END;
END $prueba$;
