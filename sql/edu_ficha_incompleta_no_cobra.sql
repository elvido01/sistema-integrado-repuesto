-- ============================================================
-- FICHA INCOMPLETA: LA CAJA NO COBRA (17/11/2026)
-- ============================================================
-- El Centenario entra a mitad de año con la lista sin tarifas: 640
-- estudiantes activos con mensualidad 0. La cajera no llena fichas. Hasta que
-- la direccion/secretaria complete la ficha (mensualidad), a ese estudiante no
-- se le cobra, no se le emite recibo y no se le cargan conceptos.
-- La pantalla lo avisa ("Formulario incompleto"); esto lo cierra en la base
-- para que no dependa de la pantalla.
-- Regla (igual que fichaIncompleta en src/lib/colegio.js): activo o por
-- confirmar, mensualidad <= 0 y sin beca 100%.
-- ============================================================

SELECT public.registrar_migracion('edu_ficha_incompleta_no_cobra.sql');

CREATE OR REPLACE FUNCTION private.edu_ficha_incompleta(p_estudiante uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.edu_estudiantes e
                  WHERE e.id = p_estudiante
                    AND e.estado IN ('activo', 'por_confirmar')
                    AND COALESCE(e.tarifa_mensual, 0) <= 0
                    AND COALESCE(e.beca_pct, 0) < 100);
$fn$;

REVOKE ALL ON FUNCTION private.edu_ficha_incompleta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edu_ficha_incompleta(uuid) TO authenticated, service_role;

DO $injertos$
DECLARE
  v_def text; v_nuevo text;
  v_msg text := '''El formulario de % está incompleto (falta la mensualidad): no se le puede cobrar hasta que completen su ficha en Estudiantes.''';
BEGIN
  -- 1. Cobrar
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'edu_cobrar';
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('edu_ficha_incompleta' IN v_def) = 0 THEN
    v_nuevo := replace(v_def,
      E'    IF NOT FOUND THEN RAISE EXCEPTION ''Un cargo no es de esta familia''; END IF;\n',
      E'    IF NOT FOUND THEN RAISE EXCEPTION ''Un cargo no es de esta familia''; END IF;\n'
      || E'    IF private.edu_ficha_incompleta(g.estudiante_id) THEN\n'
      || E'      RAISE EXCEPTION ' || v_msg || E', (SELECT nombres || '' '' || apellidos FROM public.edu_estudiantes WHERE id = g.estudiante_id);\n'
      || E'    END IF;\n');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_cobrar.'; END IF;
    EXECUTE v_nuevo;
  END IF;

  -- 2. Reservar cupo
  SELECT pg_get_functiondef('public.edu_reservar_cupo(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('edu_ficha_incompleta' IN v_def) = 0 THEN
    v_nuevo := replace(v_def,
      E'  IF e.estado NOT IN (''activo'', ''por_confirmar'') THEN RAISE EXCEPTION ''El estudiante no está activo''; END IF;\n',
      E'  IF e.estado NOT IN (''activo'', ''por_confirmar'') THEN RAISE EXCEPTION ''El estudiante no está activo''; END IF;\n'
      || E'  IF private.edu_ficha_incompleta(e.id) THEN\n'
      || E'    RAISE EXCEPTION ' || v_msg || E', e.nombres || '' '' || e.apellidos;\n'
      || E'  END IF;\n');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_reservar_cupo.'; END IF;
    EXECUTE v_nuevo;
  END IF;

  -- 3. Agregar cargo
  SELECT pg_get_functiondef('public.edu_agregar_cargo(uuid,uuid,numeric)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('edu_ficha_incompleta' IN v_def) = 0 THEN
    v_nuevo := replace(v_def,
      E'THEN RAISE EXCEPTION ''Estudiante no encontrado''; END IF;\n',
      E'THEN RAISE EXCEPTION ''Estudiante no encontrado''; END IF;\n'
      || E'  IF private.edu_ficha_incompleta(p_estudiante) THEN\n'
      || E'    RAISE EXCEPTION ' || v_msg || E', (SELECT nombres || '' '' || apellidos FROM public.edu_estudiantes WHERE id = p_estudiante);\n'
      || E'  END IF;\n');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_agregar_cargo.'; END IF;
    EXECUTE v_nuevo;
  END IF;
END $injertos$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — un estudiante con cargo y mensualidad 0: cobrar, reservar y
-- agregar se niegan; con mensualidad, cobrar pasa. Se deshace.
-- ============================================================
DO $prueba$
DECLARE
  v_t uuid; v_user uuid; v_fam uuid; v_est uuid; v_anio uuid; v_conc uuid; v_util uuid; v_cargo uuid;
  v_ok text := ''; v_err text;
BEGIN
  SELECT a.tenant_id, a.id INTO v_t, v_anio FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  FOR v_user IN SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_t
                UNION SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = v_t;
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE NOTICE 'Sin usuario del colegio.'; RETURN; END IF;
  SELECT id INTO v_conc FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'otro' AND activo LIMIT 1;
  SELECT id INTO v_util FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'utileria' AND activo LIMIT 1;

  BEGIN
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'INCOMPLETA', 0, 'retirado') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto)
    VALUES (v_t, v_est, v_anio, v_util, 'utileria', 'Utilería PRUEBA', 'DOP', 100, 100) RETURNING id INTO v_cargo;

    BEGIN
      PERFORM public.edu_cobrar(v_fam, jsonb_build_array(jsonb_build_object('cargo_id', v_cargo, 'monto', 100)),
                                jsonb_build_array(jsonb_build_object('forma', 'efectivo', 'monto', 100)));
      v_ok := v_ok || ' cobro-paso';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'El formulario de %' THEN v_ok := v_ok || ' cobro-otro-error:' || SQLERRM; END IF;
    END;
    BEGIN
      PERFORM public.edu_reservar_cupo(v_est);
      v_ok := v_ok || ' reserva-paso';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'El formulario de %' THEN v_ok := v_ok || ' reserva-otro-error:' || SQLERRM; END IF;
    END;
    IF v_util IS NOT NULL THEN
      BEGIN
        PERFORM public.edu_agregar_cargo(v_est, v_util, 50);
        v_ok := v_ok || ' agregar-paso';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'El formulario de %' THEN v_ok := v_ok || ' agregar-otro-error:' || SQLERRM; END IF;
      END;
    END IF;

    -- Con la ficha completa, el bloqueo ya no aplica.
    UPDATE public.edu_estudiantes SET tarifa_mensual = 5000 WHERE id = v_est;
    IF private.edu_ficha_incompleta(v_est) THEN v_ok := v_ok || ' sigue-incompleta'; END IF;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_ok <> '' THEN RAISE EXCEPTION 'Ficha incompleta:%', v_ok; END IF;
END $prueba$;
