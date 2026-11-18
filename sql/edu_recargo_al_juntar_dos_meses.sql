-- ============================================================
-- RECARGO SOLO CUANDO SE JUNTAN DOS MESES (17/11/2026)
-- ============================================================
-- Correccion del colegio (Centenario): los RD$200 se cobran solo si el padre
-- deja juntar 2 meses. Pagar con 29 dias de atraso NO lleva recargo.
--   Antes: el recargo de septiembre nacia el 1ro de octubre.
--   Ahora: nace el 1ro de noviembre (septiembre y octubre juntos sin pagar).
--   Sigue siendo RD$200 por cada mes atrasado (octubre, el 1ro de diciembre...).
-- Mismo cambio en la cuenta inicial (que meses de antes del sistema estan
-- "atrasados" para la opcion de cobrarles recargo).
-- Recargos ya creados que con la regla nueva todavia no tocan: se anulan si
-- no se han cobrado.
-- ============================================================

SELECT public.registrar_migracion('edu_recargo_al_juntar_dos_meses.sql');

DO $injerto$
DECLARE
  v_def   text;
  v_nuevo text;
  v_viejo text := 'v_hoy >= (m.periodo + interval ''1 month'')::date';
  v_bueno text := 'v_hoy >= (m.periodo + interval ''2 month'')::date   -- se juntaron 2 meses';
BEGIN
  -- Recargo automatico
  SELECT pg_get_functiondef('private.edu_aplicar_recargos(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('se juntaron 2 meses' IN v_def) = 0 THEN
    v_nuevo := replace(v_def, v_viejo, v_bueno);
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro la regla del mes en private.edu_aplicar_recargos.'; END IF;
    EXECUTE v_nuevo;
  END IF;

  -- Cuenta inicial
  SELECT pg_get_functiondef('public.edu_cuenta_inicial(uuid,date[],text[],boolean)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('se juntaron 2 meses' IN v_def) = 0 THEN
    v_nuevo := replace(v_def, v_viejo, v_bueno);
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro la regla del mes en edu_cuenta_inicial.'; END IF;
    EXECUTE v_nuevo;
  END IF;
END $injerto$;

-- Recargos pendientes que con la regla nueva todavia no tocaban: se BORRAN
-- (no se anulan: un recargo anulado impide que el automatico lo vuelva a
-- crear cuando de verdad toque). Corregido tras /code-review; la primera
-- corrida fue un UPDATE a 'anulado' que no toco ninguna fila (0 recargos).
-- OJO: la regla global de este archivo la reemplaza edu_cuenta_inicial_ajustes.sql
-- (recargo_meses por colegio).
DELETE FROM public.edu_cargos r
 USING public.edu_cargos m
 WHERE r.tipo = 'recargo' AND r.estado = 'pendiente' AND COALESCE(r.pagado, 0) = 0
   AND r.cargo_origen_id = m.id
   AND (now() AT TIME ZONE 'America/Santo_Domingo')::date < (m.periodo + interval '2 month')::date;

-- PRUEBA: con la regla nueva, un mes de hace 1 mes no lleva recargo y uno de
-- hace 2 si (se deshace).
DO $prueba$
DECLARE
  v_t uuid; v_user uuid; v_fam uuid; v_est uuid; v_anio uuid; v_conc uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_m1 date; v_m2 date; v_r1 int; v_r2 int; v_ok text := '';
BEGIN
  SELECT a.tenant_id, a.id INTO v_t, v_anio FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  IF v_t IS NULL THEN RAISE NOTICE 'Sin colegio.'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.edu_config WHERE tenant_id = v_t AND COALESCE(recargo_monto, 0) > 0) THEN
    RAISE NOTICE 'Recargo apagado en el colegio; no hay que probar.'; RETURN;
  END IF;
  SELECT id INTO v_conc FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'mensualidad' LIMIT 1;
  v_m1 := (date_trunc('month', v_hoy) - interval '1 month')::date;   -- mes pasado
  v_m2 := (date_trunc('month', v_hoy) - interval '2 month')::date;   -- hace 2 meses

  BEGIN
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado)
    VALUES (v_t, v_fam, 'PRUEBA', 'RECARGO', 5000, 'retirado') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence, moneda, monto_bruto, monto)
    VALUES (v_t, v_est, v_anio, v_conc, 'mensualidad', 'Mensualidad PRUEBA1', v_m1, v_m1 + 4, 'DOP', 5000, 5000),
           (v_t, v_est, v_anio, v_conc, 'mensualidad', 'Mensualidad PRUEBA2', v_m2, v_m2 + 4, 'DOP', 5000, 5000);
    PERFORM private.edu_aplicar_recargos(v_t);
    SELECT count(*) INTO v_r1 FROM public.edu_cargos r JOIN public.edu_cargos m ON m.id = r.cargo_origen_id
     WHERE r.tipo = 'recargo' AND m.estudiante_id = v_est AND m.periodo = v_m1;
    SELECT count(*) INTO v_r2 FROM public.edu_cargos r JOIN public.edu_cargos m ON m.id = r.cargo_origen_id
     WHERE r.tipo = 'recargo' AND m.estudiante_id = v_est AND m.periodo = v_m2;
    v_ok := CASE WHEN v_r1 = 0 AND v_r2 = 1 THEN 'BIEN' ELSE format('MAL mes pasado=%s hace 2 meses=%s', v_r1, v_r2) END;
    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_ok <> 'BIEN' THEN RAISE EXCEPTION 'Recargo: %', v_ok; END IF;
END $prueba$;
