-- ============================================================
-- LA CAJA SOLO COBRA (17/11/2026)
-- ============================================================
-- Decision del dueño: la cajera solo cobra lo que el sistema ya tiene
-- cargado por informacion suministrada antes. No crea cuentas, no carga
-- reservaciones, no agrega conceptos.
--   * La cuenta del año se crea al completar la ficha ("Lo que ya pagó",
--     edu_cuenta_inicial, direccion). Para casos raros (Sala de Tareas a
--     mitad de año) la direccion tiene "Completar cuenta" (edu_completar_cuenta).
--   * Las reservaciones del año que viene las carga la direccion de una vez:
--     "Abrir reservaciones" (edu_abrir_reservaciones). La cajera las cobra.
--   * Agregar un concepto suelto: solo la direccion.
-- edu_preparar_cuenta deja de estar abierta a los usuarios: la siguen usando
-- por dentro edu_cuenta_inicial, edu_cambiar_anio y el cobro de la
-- reservacion (todas SECURITY DEFINER).
-- ============================================================

SELECT public.registrar_migracion('edu_caja_solo_cobra.sql');

REVOKE EXECUTE ON FUNCTION public.edu_preparar_cuenta(uuid, date, boolean) FROM PUBLIC, anon, authenticated;

-- Completar cuenta: solo la direccion.
CREATE OR REPLACE FUNCTION public.edu_completar_cuenta(p_estudiante uuid, p_desde date DEFAULT NULL, p_anuales boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  IF NOT private.edu_es_direccion(public.get_user_tenant()) THEN
    RAISE EXCEPTION 'Solo la dirección prepara o completa la cuenta del año. La caja solo cobra.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF private.edu_ficha_incompleta(p_estudiante) THEN
    RAISE EXCEPTION 'Estudiante no tiene tarifa seleccionada: completa su ficha en Estudiantes.';
  END IF;
  RETURN public.edu_preparar_cuenta(p_estudiante, p_desde, p_anuales);
END;
$fn$;
REVOKE ALL ON FUNCTION public.edu_completar_cuenta(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_completar_cuenta(uuid, date, boolean) TO authenticated;

-- Reservar cupo y agregar concepto: solo la direccion.
DO $injertos$
DECLARE
  v_def text; v_nuevo text;
  v_check text := E'  IF NOT private.edu_es_direccion(v_t) THEN\n'
               || E'    RAISE EXCEPTION ''Solo la dirección carga reservaciones y conceptos. La caja solo cobra.'' USING ERRCODE = ''insufficient_privilege'';\n'
               || E'  END IF;\n';
BEGIN
  v_def := replace(pg_get_functiondef('public.edu_reservar_cupo(uuid)'::regprocedure), E'\r\n', E'\n');
  IF position('edu_es_direccion' IN v_def) = 0 THEN
    v_nuevo := replace(v_def,
      E'  IF v_t IS NULL THEN RAISE EXCEPTION ''Sin empresa activa''; END IF;\n',
      E'  IF v_t IS NULL THEN RAISE EXCEPTION ''Sin empresa activa''; END IF;\n' || v_check);
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_reservar_cupo.'; END IF;
    EXECUTE v_nuevo;
  END IF;

  v_def := replace(pg_get_functiondef('public.edu_agregar_cargo(uuid,uuid,numeric)'::regprocedure), E'\r\n', E'\n');
  IF position('edu_es_direccion' IN v_def) = 0 THEN
    v_nuevo := replace(v_def,
      E'BEGIN\n  IF NOT EXISTS (SELECT 1 FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t)',
      E'BEGIN\n' || v_check || E'  IF NOT EXISTS (SELECT 1 FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t)');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro donde injertar en edu_agregar_cargo.'; END IF;
    EXECUTE v_nuevo;
  END IF;
END $injertos$;

-- Abrir reservaciones del año que viene: a todos los activos con tarifa que
-- siguen (no a 6to de secundaria, que se gradua). Se puede pulsar otra vez:
-- solo carga a quien todavia no la tiene (p.ej. fichas completadas despues).
CREATE OR REPLACE FUNCTION public.edu_abrir_reservaciones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_anio uuid; v_nombre text;
  e record;
  v_creadas int := 0; v_ya int := 0; v_sin_tarifa int := 0; v_gradua int := 0; v_otros int := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN
    RAISE EXCEPTION 'Solo la dirección abre las reservaciones.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_anio := private.edu_anio_siguiente(v_t);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_anio;

  FOR e IN SELECT id, curso_id FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula LOOP
    IF private.edu_ficha_incompleta(e.id) THEN v_sin_tarifa := v_sin_tarifa + 1; CONTINUE; END IF;
    IF e.curso_id IS NOT NULL AND private.edu_curso_siguiente(e.curso_id) IS NULL THEN v_gradua := v_gradua + 1; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = e.id AND anio_id = v_anio
                AND tipo = 'reservacion' AND estado <> 'anulado') THEN
      v_ya := v_ya + 1; CONTINUE;
    END IF;
    BEGIN
      PERFORM public.edu_reservar_cupo(e.id);
      v_creadas := v_creadas + 1;
    EXCEPTION WHEN OTHERS THEN
      v_otros := v_otros + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('anio', v_nombre, 'creadas', v_creadas, 'ya_tenian', v_ya,
                            'sin_tarifa', v_sin_tarifa, 'se_graduan', v_gradua, 'no_se_pudo', v_otros);
END;
$fn$;
REVOKE ALL ON FUNCTION public.edu_abrir_reservaciones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_abrir_reservaciones() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA (se deshace): como la direccion, un estudiante con tarifa recibe
-- su reservacion al abrir; uno sin tarifa no; abrir otra vez no duplica.
-- ============================================================
DO $prueba$
DECLARE
  v_t uuid; v_user uuid; v_fam uuid; v_ok_est uuid; v_sin uuid; v_curso uuid; v_r1 jsonb; v_r2 jsonb; v_res text := '';
BEGIN
  SELECT a.tenant_id INTO v_t FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t AND ue.rol IN ('owner','admin')
                UNION SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_t AND p.role IN ('admin','owner') LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = v_t AND private.edu_es_direccion(v_t);
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin direccion del colegio para probar.'; END IF;
  SELECT id INTO v_curso FROM public.edu_cursos WHERE tenant_id = v_t AND nombre = '3ro de Primaria';

  BEGIN
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    -- sin curso: no toca cupos; curso NULL = no se gradua
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'CON TARIFA', 5000, 'retirado') RETURNING id INTO v_ok_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_ok_est;

    v_r1 := public.edu_abrir_reservaciones();
    IF NOT EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = v_ok_est AND tipo = 'reservacion') THEN
      v_res := v_res || ' sin-reserva-al-de-tarifa(' || v_r1 || ')';
    END IF;

    v_r2 := public.edu_abrir_reservaciones();
    IF (v_r2->>'creadas')::int <> 0 THEN v_res := v_res || ' segunda-vez-creo=' || (v_r2->>'creadas'); END IF;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_res <> '' THEN RAISE EXCEPTION 'Abrir reservaciones:%', v_res; END IF;
END $prueba$;
