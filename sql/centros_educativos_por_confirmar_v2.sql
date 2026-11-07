-- =====================================================================
-- Por confirmar, arreglos de la revisión (07/11/2026)
-- ---------------------------------------------------------------------
-- Sobre sql/centros_educativos_por_confirmar.sql (ya corrido):
-- 1. edu_cambiar_anio decide ÉL quién queda por confirmar, mirando dentro
--    de la transacción si la reservación del año nuevo está PAGADA (antes
--    confiaba en la lista de la pantalla: quien pagaba con la ventana
--    abierta quedaba atascado). p_por_confirmar se acepta pero no se usa.
--    Si el colegio no cobra reservación (concepto inactivo o en 0), nadie
--    queda por confirmar: no habría forma de confirmarse.
--    El que seguía 'por_confirmar' desde el año anterior (nunca pagó en un
--    año entero) sale como retirado en este cambio.
-- 2. El trigger prepara la cuenta desde el MES ACTUAL (no le carga los
--    meses que estuvo fuera del aula ni sus recargos). Y va de vuelta:
--    si se anula el cobro de la reservación y el estudiante no ha pagado
--    nada más del año, vuelve a 'por_confirmar' y se borran los cargos del
--    año que nunca se tocaron (para poder crearlos de nuevo al pagar).
-- 3. edu_no_continua: solo la dirección (anula cargos, como edu_anular_cargo);
--    y no deja retirar si hay un cargo del año con abono (hay que devolver
--    o anular ese recibo primero).
-- =====================================================================

-- ── 1. Cambio de año ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_cambiar_anio(p_anio_actual uuid, p_repiten uuid[] DEFAULT NULL, p_retirar uuid[] DEFAULT NULL,
                                                   p_preparar boolean DEFAULT true,
                                                   p_mes_inicio integer DEFAULT NULL, p_meses integer DEFAULT NULL,
                                                   p_por_confirmar uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_actual public.edu_anios%ROWTYPE; v_nuevo uuid; v_nombre text;
  e public.edu_estudiantes%ROWTYPE; v_sig uuid; v_tandas text[]; v_estado text; v_hay_reserva boolean;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_prom integer := 0; v_rep integer := 0; v_grad integer := 0; v_ret integer := 0; v_cargos integer := 0; v_conf integer := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede cambiar el año escolar'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('edu_cambio_anio:' || v_t::text));
  SELECT * INTO v_actual FROM public.edu_anios WHERE tenant_id = v_t AND actual FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  IF v_actual.id IS DISTINCT FROM p_anio_actual THEN
    RAISE EXCEPTION 'El año escolar ya cambió (ahora es %). Recarga la pantalla.', v_actual.nombre;
  END IF;
  v_nuevo := private.edu_anio_siguiente(v_t, p_mes_inicio, p_meses);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_nuevo;
  -- Sin reservación que cobrar no hay cómo confirmarse: todos siguen.
  v_hay_reserva := EXISTS (SELECT 1 FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'reservacion' AND activo AND monto > 0);

  FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado IN ('activo', 'por_confirmar') ORDER BY matricula FOR UPDATE LOOP
    -- Pasó un año entero sin pagar la reservación: no volvió.
    IF e.estado = 'por_confirmar' THEN
      UPDATE public.edu_estudiantes
         SET estado = 'retirado', fecha_retiro = v_hoy, motivo_retiro = 'No confirmó su cupo en ' || v_actual.nombre
       WHERE id = e.id;
      v_ret := v_ret + 1;
      CONTINUE;
    END IF;
    -- Sigue = PAGÓ la reservación del año nuevo (se mira aquí, no en la pantalla).
    v_estado := CASE WHEN v_hay_reserva AND NOT EXISTS (
                       SELECT 1 FROM public.edu_cargos r
                        WHERE r.estudiante_id = e.id AND r.anio_id = v_nuevo AND r.tipo = 'reservacion' AND r.estado = 'pagado')
                     THEN 'por_confirmar' ELSE 'activo' END;
    IF e.id = ANY(COALESCE(p_retirar, '{}')) THEN
      UPDATE public.edu_estudiantes
         SET estado = 'retirado', fecha_retiro = v_hoy, motivo_retiro = COALESCE(NULLIF(motivo_retiro, ''), 'No continuó en ' || v_nombre)
       WHERE id = e.id;
      UPDATE public.edu_cargos
         SET estado = 'anulado', anulado_motivo = 'No continuó en ' || v_nombre, anulado_por = auth.uid(), anulado_at = now()
       WHERE tenant_id = v_t AND estudiante_id = e.id AND anio_id = v_nuevo AND estado = 'pendiente' AND pagado = 0;
      v_ret := v_ret + 1;
      CONTINUE;
    ELSIF e.id = ANY(COALESCE(p_repiten, '{}')) OR e.curso_id IS NULL THEN
      UPDATE public.edu_estudiantes SET condicion = 'continuante', estado = v_estado WHERE id = e.id;
      IF e.curso_id IS NOT NULL THEN v_rep := v_rep + 1; ELSE v_prom := v_prom + 1; END IF;
    ELSE
      v_sig := private.edu_curso_siguiente(e.curso_id);
      IF v_sig IS NULL THEN
        UPDATE public.edu_estudiantes SET estado = 'graduado', condicion = 'continuante' WHERE id = e.id;
        v_grad := v_grad + 1;
        CONTINUE;
      ELSE
        SELECT tandas INTO v_tandas FROM public.edu_cursos WHERE id = v_sig;
        UPDATE public.edu_estudiantes
           SET curso_id = v_sig, condicion = 'continuante', estado = v_estado,
               tanda = CASE WHEN tanda IS NULL OR tanda = ANY(v_tandas) THEN tanda ELSE v_tandas[1] END
         WHERE id = e.id;
        v_prom := v_prom + 1;
      END IF;
    END IF;
    IF v_estado = 'por_confirmar' THEN v_conf := v_conf + 1; END IF;
  END LOOP;

  UPDATE public.edu_anios SET actual = false, cerrado = true WHERE id = v_actual.id;
  UPDATE public.edu_anios SET actual = true, cerrado = false WHERE id = v_nuevo;

  IF p_preparar THEN
    FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula LOOP
      v_cargos := v_cargos + public.edu_preparar_cuenta(e.id, NULL, true);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('anio', v_nombre, 'promovidos', v_prom, 'repiten', v_rep, 'graduados', v_grad,
                            'retirados', v_ret, 'por_confirmar', v_conf, 'cargos', v_cargos, 'con_reserva', v_hay_reserva);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer, uuid[]) TO authenticated;

-- ── 2. Reservación pagada ⇄ confirmado ─────────────────────────────────
CREATE OR REPLACE FUNCTION private.edu_reserva_pagada_confirma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE a public.edu_anios%ROWTYPE; v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF NEW.tipo <> 'reservacion' OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.edu_anios WHERE id = NEW.anio_id AND actual;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NEW.estado = 'pagado' AND OLD.estado <> 'pagado'
     AND EXISTS (SELECT 1 FROM public.edu_estudiantes e WHERE e.id = NEW.estudiante_id AND e.estado = 'por_confirmar') THEN
    -- Pagó: entra al aula. La cuenta desde el mes en curso (lo que estuvo fuera no se le cobra).
    UPDATE public.edu_estudiantes SET estado = 'activo', fecha_retiro = NULL, motivo_retiro = NULL WHERE id = NEW.estudiante_id;
    PERFORM public.edu_preparar_cuenta(NEW.estudiante_id,
              greatest(make_date(a.anio_inicio, a.mes_inicio, 1), date_trunc('month', v_hoy)::date), true);

  ELSIF OLD.estado = 'pagado' AND NEW.estado IN ('pendiente', 'parcial')
     AND EXISTS (SELECT 1 FROM public.edu_estudiantes e WHERE e.id = NEW.estudiante_id AND e.estado = 'activo')
     -- Si ya pagó otra cosa del año (una mensualidad), está estudiando: no se saca.
     AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.estudiante_id = NEW.estudiante_id AND x.anio_id = NEW.anio_id
                      AND x.id <> NEW.id AND x.pagado > 0 AND x.estado <> 'anulado') THEN
    -- Se anuló el cobro de la reservación: sin pago no hay cupo.
    UPDATE public.edu_estudiantes SET estado = 'por_confirmar' WHERE id = NEW.estudiante_id;
    -- Los cargos del año nunca tocados se borran (anularlos impediría crearlos de nuevo al pagar).
    DELETE FROM public.edu_cargos x
     WHERE x.estudiante_id = NEW.estudiante_id AND x.anio_id = NEW.anio_id AND x.tipo = 'recargo'
       AND x.pagado = 0 AND x.estado = 'pendiente'
       AND NOT EXISTS (SELECT 1 FROM public.edu_pago_lineas l WHERE l.cargo_id = x.id);
    DELETE FROM public.edu_cargos x
     WHERE x.estudiante_id = NEW.estudiante_id AND x.anio_id = NEW.anio_id AND x.id <> NEW.id
       AND x.tipo IN ('mensualidad', 'sala_tareas', 'inscripcion', 'utileria', 'bilingue')
       AND x.pagado = 0 AND x.estado = 'pendiente'
       AND NOT EXISTS (SELECT 1 FROM public.edu_pago_lineas l WHERE l.cargo_id = x.id)
       AND NOT EXISTS (SELECT 1 FROM public.edu_cargos r WHERE r.cargo_origen_id = x.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_reserva_pagada_confirma() FROM PUBLIC, anon, authenticated;

-- ── 3. No sigue: solo la dirección ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_no_continua(p_estudiante uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  e public.edu_estudiantes%ROWTYPE; v_anio uuid; v_nombre text; v_anulados integer := 0; v_abono text;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede marcar que un estudiante no sigue'; END IF;
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF e.estado <> 'por_confirmar' THEN RAISE EXCEPTION '% no está por confirmar (está %)', e.nombres, e.estado; END IF;
  SELECT id, nombre INTO v_anio, v_nombre FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF v_anio IS NULL THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  -- Con un abono del año (media reservación) hay dinero de por medio: primero se devuelve o se anula ese recibo.
  SELECT string_agg(descripcion, ', ') INTO v_abono FROM public.edu_cargos
   WHERE tenant_id = v_t AND estudiante_id = e.id AND anio_id = v_anio AND estado = 'parcial';
  IF v_abono IS NOT NULL THEN
    RAISE EXCEPTION '% tiene un abono en %. Anula ese recibo (o devuelve el dinero) antes de marcar que no sigue.', e.nombres, v_abono;
  END IF;
  UPDATE public.edu_estudiantes
     SET estado = 'retirado', fecha_retiro = v_hoy,
         motivo_retiro = COALESCE(NULLIF(btrim(p_motivo), ''), 'No continuó en ' || v_nombre)
   WHERE id = e.id;
  UPDATE public.edu_cargos
     SET estado = 'anulado', anulado_motivo = 'No continuó en ' || v_nombre, anulado_por = auth.uid(), anulado_at = now()
   WHERE tenant_id = v_t AND estudiante_id = e.id AND anio_id = v_anio AND estado = 'pendiente' AND pagado = 0;
  GET DIAGNOSTICS v_anulados = ROW_COUNT;
  RETURN jsonb_build_object('anulados', v_anulados);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_no_continua(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_no_continua(uuid, text) TO authenticated;

SELECT public.registrar_migracion('centros_educativos_por_confirmar_v2.sql');
