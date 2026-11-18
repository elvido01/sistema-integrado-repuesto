-- ============================================================
-- LA CAJA SOLO COBRA — AJUSTES DE LA REVISION (18/11/2026)
-- ============================================================
-- /code-review high sobre edu_caja_solo_cobra.sql:
-- 1. "Lo que ya pagó" (edu_cuenta_inicial) lo puede guardar quien completa
--    fichas: la direccion O quien puede EDITAR Estudiantes
--    (user_module_permissions 'colegio-estudiantes'). Antes era solo la
--    direccion y una secretaria completaba la ficha y el estudiante se
--    quedaba sin cuenta (y la caja ya no puede crearla).
-- 2. edu_cuenta_inicial usa la misma regla de "sin tarifa"
--    (private.edu_ficha_incompleta), no una copia propia.
-- 3. Abrir reservaciones tambien carga a los POR CONFIRMAR (los que tras el
--    cambio de año todavia no reservaron: su reservacion es la del año en
--    curso) y dice POR QUE no se pudo (antes solo contaba).
-- ============================================================

SELECT public.registrar_migracion('edu_caja_solo_cobra_ajustes.sql');

CREATE OR REPLACE FUNCTION private.edu_puede_fichas(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT private.edu_es_direccion(p_tenant)
      OR EXISTS (SELECT 1 FROM public.user_module_permissions m
                  WHERE m.user_id = auth.uid() AND m.module_key = 'colegio-estudiantes' AND m.can_edit);
$fn$;
REVOKE ALL ON FUNCTION private.edu_puede_fichas(uuid) FROM PUBLIC, anon, authenticated;

DO $cuenta$
DECLARE v_def text; v_nuevo text;
BEGIN
  v_def := replace(pg_get_functiondef('public.edu_cuenta_inicial(uuid,date[],text[],boolean,date)'::regprocedure), E'\r\n', E'\n');
  IF position('edu_puede_fichas' IN v_def) > 0 THEN RAISE NOTICE 'edu_cuenta_inicial ya estaba ajustada.'; RETURN; END IF;

  v_nuevo := replace(v_def,
    E'  IF NOT private.edu_es_direccion(v_t) THEN\n'
    || E'    RAISE EXCEPTION ''Solo la dirección puede anotar lo pagado antes del sistema (salda sin recibo).''',
    E'  IF NOT private.edu_puede_fichas(v_t) THEN\n'
    || E'    RAISE EXCEPTION ''Solo la dirección o quien completa las fichas (Estudiantes) puede anotar lo pagado antes del sistema.''');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro el permiso en edu_cuenta_inicial.'; END IF;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    E'  IF COALESCE(e.tarifa_mensual, 0) <= 0 AND COALESCE(e.beca_pct, 0) < 100 THEN\n'
    || E'    RAISE EXCEPTION ''Falta la mensualidad de %: complétala en su ficha.'', e.nombres || '' '' || e.apellidos;',
    E'  IF private.edu_ficha_incompleta(e.id) THEN\n'
    || E'    RAISE EXCEPTION ''%: estudiante no tiene tarifa seleccionada.'', e.nombres || '' '' || e.apellidos;');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro la regla de tarifa en edu_cuenta_inicial.'; END IF;
  EXECUTE v_nuevo;
END $cuenta$;

CREATE OR REPLACE FUNCTION public.edu_abrir_reservaciones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_actual uuid; v_sig uuid; v_nombre text; v_destino uuid;
  e record;
  v_creadas int := 0; v_ya int := 0; v_sin_tarifa int := 0; v_gradua int := 0; v_otros int := 0;
  v_motivo text;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN
    RAISE EXCEPTION 'Solo la dirección abre las reservaciones.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'reservacion' AND activo AND monto > 0) THEN
    RAISE EXCEPTION 'Activa el concepto "Reservación de cupo" (con su monto) en Configuración del Colegio.';
  END IF;
  SELECT id INTO v_actual FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  v_sig := private.edu_anio_siguiente(v_t);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_sig;

  FOR e IN SELECT id, curso_id, estado FROM public.edu_estudiantes
            WHERE tenant_id = v_t AND estado IN ('activo', 'por_confirmar') ORDER BY matricula LOOP
    IF private.edu_ficha_incompleta(e.id) THEN v_sin_tarifa := v_sin_tarifa + 1; CONTINUE; END IF;
    -- Activo: reserva el año que viene. Por confirmar: el año que ya corre.
    v_destino := CASE WHEN e.estado = 'por_confirmar' THEN v_actual ELSE v_sig END;
    IF e.estado = 'activo' AND e.curso_id IS NOT NULL AND private.edu_curso_siguiente(e.curso_id) IS NULL THEN
      v_gradua := v_gradua + 1; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = e.id AND anio_id = v_destino
                AND tipo = 'reservacion' AND estado <> 'anulado') THEN
      v_ya := v_ya + 1; CONTINUE;
    END IF;
    BEGIN
      PERFORM public.edu_reservar_cupo(e.id);
      v_creadas := v_creadas + 1;
    EXCEPTION WHEN OTHERS THEN
      v_otros := v_otros + 1;
      v_motivo := COALESCE(v_motivo, SQLERRM);   -- el primero, para que se sepa por que
    END;
  END LOOP;

  RETURN jsonb_build_object('anio', v_nombre, 'creadas', v_creadas, 'ya_tenian', v_ya,
                            'sin_tarifa', v_sin_tarifa, 'se_graduan', v_gradua,
                            'no_se_pudo', v_otros, 'motivo', v_motivo);
END;
$fn$;
REVOKE ALL ON FUNCTION public.edu_abrir_reservaciones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_abrir_reservaciones() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA (se deshace)
-- ============================================================
DO $prueba$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';   -- el Centenario (no "el primero")
  v_user uuid; v_fam uuid; v_est uuid; v_r jsonb; v_res text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE tenant_id = v_t AND actual) THEN
    RAISE NOTICE 'El Centenario no tiene año actual; se omite.'; RETURN;
  END IF;
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t AND ue.rol IN ('owner','admin') ORDER BY ue.user_id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = v_t;
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin direccion del Centenario para probar.'; END IF;

  BEGIN
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'CON TARIFA', 5000, 'retirado') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;

    -- la direccion puede la cuenta inicial (permiso nuevo)
    PERFORM public.edu_cuenta_inicial(v_est, '{}', '{}', false, NULL);
    -- abrir: al de tarifa le carga la reservacion; sin errores
    v_r := public.edu_abrir_reservaciones();
    IF NOT EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'reservacion') THEN
      v_res := v_res || ' sin-reserva(' || v_r || ')';
    END IF;
    IF (v_r->>'no_se_pudo')::int > 0 THEN v_res := v_res || ' no_se_pudo: ' || (v_r->>'motivo'); END IF;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_res <> '' THEN RAISE EXCEPTION 'Ajustes caja solo cobra:%', v_res; END IF;
END $prueba$;
