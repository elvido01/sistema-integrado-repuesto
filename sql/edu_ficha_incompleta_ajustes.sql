-- ============================================================
-- SIN TARIFA NO SE COBRA — AJUSTES (17/11/2026)
-- ============================================================
-- Sobre edu_ficha_incompleta_no_cobra.sql, tras /code-review high y el pedido
-- del dueño:
-- 1. El mensaje dice lo que pidio el colegio: "Estudiante no tiene tarifa
--    seleccionada".
-- 2. Candado en la TABLA de lineas de pago (edu_pago_lineas): cualquier
--    camino de cobro, de hoy o futuro, queda cerrado aunque alguien vuelva a
--    correr el archivo viejo de edu_cobrar y se pierda el injerto.
-- 3. edu_preparar_cuenta no le carga NADA a quien no tiene tarifa (antes
--    solo se saltaba las mensualidades; el cambio de año le cargaba los
--    conceptos anuales y quedaban como deuda que la caja no podia cobrar).
-- 4. private.edu_ficha_incompleta ya no se le da a `authenticated` (no
--    filtra empresa; solo la usan funciones SECURITY DEFINER).
-- ============================================================

SELECT public.registrar_migracion('edu_ficha_incompleta_ajustes.sql');

REVOKE EXECUTE ON FUNCTION private.edu_ficha_incompleta(uuid) FROM authenticated;

-- ── 1. El mensaje ────────────────────────────────────────────────────────
DO $mensaje$
DECLARE
  v_fn    regprocedure;
  v_def   text;
  v_nuevo text;
  v_viejo text := 'El formulario de % está incompleto (falta la mensualidad): no se le puede cobrar hasta que completen su ficha en Estudiantes.';
  v_bueno text := '%: estudiante no tiene tarifa seleccionada. No se le puede cobrar hasta que completen su ficha en Estudiantes.';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.edu_cobrar(uuid,jsonb,jsonb,numeric,uuid[],text)'::regprocedure,
    'public.edu_reservar_cupo(uuid)'::regprocedure,
    'public.edu_agregar_cargo(uuid,uuid,numeric)'::regprocedure]
  LOOP
    v_def := replace(pg_get_functiondef(v_fn), E'\r\n', E'\n');
    IF position(v_bueno IN v_def) > 0 THEN CONTINUE; END IF;
    v_nuevo := replace(v_def, v_viejo, v_bueno);
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro el mensaje viejo en %', v_fn; END IF;
    EXECUTE v_nuevo;
  END LOOP;
END $mensaje$;

-- ── 2. Candado en la tabla de lineas de pago ─────────────────────────────
CREATE OR REPLACE FUNCTION private.edu_linea_sin_tarifa_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF private.edu_ficha_incompleta(NEW.estudiante_id) THEN
    RAISE EXCEPTION '%: estudiante no tiene tarifa seleccionada. No se le puede cobrar hasta que completen su ficha en Estudiantes.',
      (SELECT nombres || ' ' || apellidos FROM public.edu_estudiantes WHERE id = NEW.estudiante_id)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS edu_linea_sin_tarifa_no ON public.edu_pago_lineas;
CREATE TRIGGER edu_linea_sin_tarifa_no
  BEFORE INSERT ON public.edu_pago_lineas
  FOR EACH ROW EXECUTE FUNCTION private.edu_linea_sin_tarifa_no();

-- ── 3. Preparar cuenta: sin tarifa no carga nada ─────────────────────────
DO $preparar$
DECLARE
  v_def   text;
  v_nuevo text;
  v_ancla text := E'  IF e.estado <> ''activo'' THEN RAISE EXCEPTION ''El estudiante no está activo''; END IF;\n';
BEGIN
  v_def := replace(pg_get_functiondef('public.edu_preparar_cuenta(uuid,date,boolean)'::regprocedure), E'\r\n', E'\n');
  IF position('edu_ficha_incompleta' IN v_def) > 0 THEN RAISE NOTICE 'preparar ya no cargaba nada sin tarifa.'; RETURN; END IF;
  v_nuevo := replace(v_def, v_ancla, v_ancla
    || E'  -- Sin tarifa seleccionada: no se le carga nada (ni anuales). No revienta,\n'
    || E'  -- para no trabar el cambio de año entero por un estudiante.\n'
    || E'  IF private.edu_ficha_incompleta(e.id) THEN RETURN 0; END IF;\n');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_preparar_cuenta.'; END IF;
  EXECUTE v_nuevo;
END $preparar$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA (se deshace):
--   sin tarifa: cobrar se niega con el mensaje nuevo; la linea directa a la
--   tabla tambien; preparar cuenta no carga nada.
--   con tarifa: cobrar PASA (el candado no frena a los completos).
-- ============================================================
DO $prueba$
DECLARE
  v_t uuid; v_user uuid; v_fam uuid; v_est uuid; v_anio uuid; v_util uuid; v_cargo uuid; v_pago uuid;
  v_ok text := ''; v_n int;
BEGIN
  -- El Centenario (no "el primero"): tiene utileria activa.
  SELECT a.tenant_id, a.id INTO v_t, v_anio FROM public.edu_anios a WHERE a.actual AND a.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb';
  FOR v_user IN SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_t
                UNION SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = v_t;
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin usuario del colegio para probar.'; END IF;
  SELECT id INTO v_util FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'utileria' AND activo ORDER BY orden, created_at LIMIT 1;
  IF v_util IS NULL THEN RAISE NOTICE 'Sin utileria activa; se omite.'; RETURN; END IF;

  BEGIN
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'SIN TARIFA', 0, 'retirado') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto)
    VALUES (v_t, v_est, v_anio, v_util, 'utileria', 'Utilería PRUEBA', 'DOP', 100, 100) RETURNING id INTO v_cargo;

    -- preparar no carga nada
    SELECT public.edu_preparar_cuenta(v_est, NULL, true) INTO v_n;
    IF v_n <> 0 THEN v_ok := v_ok || ' preparar-cargo=' || v_n; END IF;

    -- cobrar se niega con el mensaje nuevo
    BEGIN
      PERFORM public.edu_cobrar(v_fam, jsonb_build_array(jsonb_build_object('cargo_id', v_cargo, 'monto', 100)),
                                jsonb_build_array(jsonb_build_object('forma', 'efectivo', 'monto', 100)));
      v_ok := v_ok || ' cobro-paso';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%estudiante no tiene tarifa seleccionada%' THEN v_ok := v_ok || ' cobro-msg:' || SQLERRM; END IF;
    END;

    -- con tarifa: cobrar pasa
    UPDATE public.edu_estudiantes SET tarifa_mensual = 5000 WHERE id = v_est;
    BEGIN
      PERFORM public.edu_cobrar(v_fam, jsonb_build_array(jsonb_build_object('cargo_id', v_cargo, 'monto', 100)),
                                jsonb_build_array(jsonb_build_object('forma', 'efectivo', 'monto', 100)));
      IF (SELECT estado FROM public.edu_cargos WHERE id = v_cargo) <> 'pagado' THEN v_ok := v_ok || ' completo-no-quedo-pagado'; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ok := v_ok || ' completo-no-cobra:' || SQLERRM;
    END;

    -- el candado de la tabla: de vuelta sin tarifa, una linea directa se niega
    UPDATE public.edu_estudiantes SET tarifa_mensual = 0 WHERE id = v_est;
    SELECT id INTO v_pago FROM public.edu_pagos WHERE familia_id = v_fam LIMIT 1;
    IF v_pago IS NOT NULL THEN
      BEGIN
        INSERT INTO public.edu_pago_lineas (tenant_id, pago_id, cargo_id, estudiante_id, descripcion, monto_moneda, monto)
        VALUES (v_t, v_pago, v_cargo, v_est, 'PRUEBA', 1, 1);
        v_ok := v_ok || ' linea-directa-paso';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%estudiante no tiene tarifa seleccionada%' THEN v_ok := v_ok || ' linea-msg:' || SQLERRM; END IF;
      END;
    END IF;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_ok <> '' THEN RAISE EXCEPTION 'Sin tarifa:%', v_ok; END IF;
END $prueba$;
