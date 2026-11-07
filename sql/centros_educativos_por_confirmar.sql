-- =====================================================================
-- Cambio de año con confirmación de quién sigue (07/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño: subir de curso puede ser automático, pero hay que
-- CONFIRMAR quién sigue, porque hay estudiantes que pasan de curso y se
-- van a otro colegio.
--
-- REGLA DEL COLEGIO: sigue = PAGÓ la reservación. Sin pago no hay cupo; nadie
-- lo confirma a mano.
--
-- 1. edu_estudiantes.estado admite 'por_confirmar'. Ese estudiante subió
--    de curso (o repite), pero NO sale en las listas del aula, no se le
--    preparan mensualidades y no cuenta para el tope del plan. Lo que debe
--    del año viejo se sigue cobrando (Pendientes y Caja lo muestran).
-- 2. edu_cambiar_anio(..., p_por_confirmar): la pantalla manda ahí a todo el
--    que no tiene la reservación PAGADA. Se borra la firma vieja antes
--    (CREATE OR REPLACE con otros argumentos crearía una segunda función).
-- 3. edu_reservar_cupo: al 'por_confirmar' le carga la reservación del año
--    ACTUAL (el que ya empezó). Al activo, la del año próximo (como antes).
-- 4. Trigger edu_reserva_pagada_confirma: cuando la reservación del año
--    actual queda PAGADA COMPLETA, el estudiante por confirmar pasa a activo
--    y se le prepara la cuenta del año. Pasa dentro del mismo cobro.
-- 5. edu_no_continua(estudiante, motivo): el que se fue → retirado y se
--    anulan los cargos del año actual que no ha pagado.
-- 6. edu_reporte_por_confirmar(): lista para llamar a esas familias.
-- =====================================================================

ALTER TABLE public.edu_estudiantes DROP CONSTRAINT IF EXISTS edu_estudiantes_estado_check;
ALTER TABLE public.edu_estudiantes ADD CONSTRAINT edu_estudiantes_estado_check
  CHECK (estado = ANY (ARRAY['activo'::text, 'por_confirmar'::text, 'retirado'::text, 'graduado'::text]));

-- ── 2. Cambio de año ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer);

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
  e public.edu_estudiantes%ROWTYPE; v_sig uuid; v_tandas text[]; v_estado text;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_prom integer := 0; v_rep integer := 0; v_grad integer := 0; v_ret integer := 0; v_cargos integer := 0; v_conf integer := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede cambiar el año escolar'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('edu_cambio_anio:' || v_t::text));
  SELECT * INTO v_actual FROM public.edu_anios WHERE tenant_id = v_t AND actual FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  -- El año que la dirección confirmó en pantalla: un segundo clic (u otra pestaña) no avanza otro año.
  IF v_actual.id IS DISTINCT FROM p_anio_actual THEN
    RAISE EXCEPTION 'El año escolar ya cambió (ahora es %). Recarga la pantalla.', v_actual.nombre;
  END IF;
  v_nuevo := private.edu_anio_siguiente(v_t, p_mes_inicio, p_meses);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_nuevo;

  FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula FOR UPDATE LOOP
    -- Sin confirmar que sigue: sube (o repite) igual, pero queda fuera del aula hasta que confirme.
    v_estado := CASE WHEN e.id = ANY(COALESCE(p_por_confirmar, '{}')) THEN 'por_confirmar' ELSE 'activo' END;
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
        -- La tanda se mantiene si el curso nuevo la tiene (secundaria es solo matutina).
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

  -- El año viejo se cierra (sus deudas siguen cobrándose en la Caja).
  UPDATE public.edu_anios SET actual = false, cerrado = true WHERE id = v_actual.id;
  UPDATE public.edu_anios SET actual = true, cerrado = false WHERE id = v_nuevo;

  -- Solo a los que siguen (los por confirmar se preparan al confirmar).
  IF p_preparar THEN
    FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula LOOP
      v_cargos := v_cargos + public.edu_preparar_cuenta(e.id, NULL, true);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('anio', v_nombre, 'promovidos', v_prom, 'repiten', v_rep, 'graduados', v_grad,
                            'retirados', v_ret, 'por_confirmar', v_conf, 'cargos', v_cargos);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer, uuid[]) TO authenticated;

-- ── 3. Reservar cupo (también al por confirmar, para el año actual) ─────
CREATE OR REPLACE FUNCTION public.edu_reservar_cupo(p_estudiante uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  e public.edu_estudiantes%ROWTYPE; c public.edu_conceptos%ROWTYPE;
  v_anio uuid; v_nombre text; v_id uuid;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF e.estado NOT IN ('activo', 'por_confirmar') THEN RAISE EXCEPTION 'El estudiante no está activo'; END IF;
  IF e.estado = 'activo' AND e.curso_id IS NOT NULL AND private.edu_curso_siguiente(e.curso_id) IS NULL THEN
    RAISE EXCEPTION '% está en el último curso: se gradúa este año', e.nombres;
  END IF;
  SELECT * INTO c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'reservacion' AND activo ORDER BY orden, created_at LIMIT 1;
  IF NOT FOUND OR c.monto <= 0 THEN RAISE EXCEPTION 'Activa el concepto "Reservación de cupo" (con su monto) en Configuración del Colegio'; END IF;
  IF e.estado = 'por_confirmar' THEN
    -- Ya subió de curso: reserva el año que está corriendo; al pagarla queda confirmado.
    SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
    IF v_anio IS NULL THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  ELSE
    v_anio := private.edu_anio_siguiente(v_t);
  END IF;
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_anio;
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto, es_tercero)
  VALUES (v_t, e.id, v_anio, c.id, 'reservacion', c.nombre || ' ' || v_nombre, c.moneda, c.monto, c.monto, c.es_tercero)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Ya tiene el cupo de % reservado', v_nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reservar_cupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reservar_cupo(uuid) TO authenticated;

-- ── 4. Reservación pagada = confirmado ─────────────────────────────────
-- Corre dentro de edu_cobrar: si el estudiante no cabe en el tope del plan,
-- el cobro entero se rechaza con ese mensaje (no se cobra un cupo que no hay).
CREATE OR REPLACE FUNCTION private.edu_reserva_pagada_confirma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.tipo = 'reservacion' AND NEW.estado = 'pagado' AND OLD.estado IS DISTINCT FROM 'pagado'
     AND EXISTS (SELECT 1 FROM public.edu_anios a WHERE a.id = NEW.anio_id AND a.actual)
     AND EXISTS (SELECT 1 FROM public.edu_estudiantes e WHERE e.id = NEW.estudiante_id AND e.estado = 'por_confirmar') THEN
    UPDATE public.edu_estudiantes SET estado = 'activo', fecha_retiro = NULL, motivo_retiro = NULL WHERE id = NEW.estudiante_id;
    PERFORM public.edu_preparar_cuenta(NEW.estudiante_id, NULL, true);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_reserva_pagada_confirma() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS edu_reserva_pagada_confirma ON public.edu_cargos;
CREATE TRIGGER edu_reserva_pagada_confirma AFTER UPDATE OF estado ON public.edu_cargos
  FOR EACH ROW EXECUTE FUNCTION private.edu_reserva_pagada_confirma();

-- ── 5. No sigue ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_no_continua(p_estudiante uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  e public.edu_estudiantes%ROWTYPE; v_anio uuid; v_nombre text; v_anulados integer := 0;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF e.estado <> 'por_confirmar' THEN RAISE EXCEPTION '% no está por confirmar (está %)', e.nombres, e.estado; END IF;
  SELECT id, nombre INTO v_anio, v_nombre FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF v_anio IS NULL THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
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

-- ── 6. Reporte: los que faltan por confirmar ───────────────────────────
CREATE OR REPLACE FUNCTION public.edu_reporte_por_confirmar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_r jsonb;
BEGIN
  IF v_t IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'curso_orden', x->>'estudiante'), '[]'::jsonb) INTO v_r
    FROM (
      SELECT jsonb_build_object(
               'estudiante_id', e.id, 'estudiante', e.nombres || ' ' || e.apellidos, 'matricula', e.matricula,
               'curso', COALESCE(cu.nombre, 'Sin curso'), 'curso_orden', lpad(COALESCE(cu.orden, 999)::text, 4, '0'),
               'tanda', e.tanda, 'tarifa', e.tarifa_mensual,
               'familia_id', f.id, 'familia', f.nombre,
               'tutor', COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, '')),
               'telefono', COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, '')),
               'debe', COALESCE((SELECT sum(c.monto - c.descuento - c.pagado) FROM public.edu_cargos c
                                  WHERE c.estudiante_id = e.id AND c.moneda = 'DOP' AND c.estado IN ('pendiente','parcial')), 0)
             ) AS x
        FROM public.edu_estudiantes e
        JOIN public.edu_familias f ON f.id = e.familia_id
        LEFT JOIN public.edu_cursos cu ON cu.id = e.curso_id
       WHERE e.tenant_id = v_t AND e.estado = 'por_confirmar'
    ) s;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reporte_por_confirmar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reporte_por_confirmar() TO authenticated;

SELECT public.registrar_migracion('centros_educativos_por_confirmar.sql');
