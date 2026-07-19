-- =====================================================================
-- NÓMINA RECURRENTE — se auto-genera el próximo período al pagar
-- ---------------------------------------------------------------------
-- Pedido del dueño: la nómina es recurrente (no crearla cada quincena) y
-- los días de pago son 15 y 30. Solución (mismo patrón que los
-- compromisos recurrentes del dashboard, que al pagarse crean el
-- siguiente):
--   * _nomina_periodo_siguiente(): dado un período, devuelve el próximo
--     con su fecha de pago — quincenal paga el 15 (1ra) y el 30 (2da,
--     o último día si el mes es más corto); mensual el último día;
--     semanal el sábado.
--   * _nomina_generar_periodo(): el generador real (antes dentro de
--     nomina_generar). p_raise_if_empty=false para el auto-siguiente
--     (si no hay empleados, no crea nada y no revienta el pago).
--   * nomina_generar(): wrapper delgado (lo llama la web).
--   * nomina_pagar(): al pagar, además de saldar el compromiso, GENERA
--     el borrador del próximo período (con su propio compromiso en el
--     dashboard) — si no existe ya. Así solo se genera UNA vez a mano.
-- Supersede nomina_generar/nomina_pagar de nomina_modulo.sql y
-- fix_nomina_isr_solo_tss.sql (mantiene el ISR solo-si-cotiza_tss).
-- Idempotente / re-ejecutable.
-- =====================================================================

-- 1) Siguiente período + fecha de pago (15 y 30)
CREATE OR REPLACE FUNCTION public._nomina_periodo_siguiente(
  p_frecuencia text, p_desde date, p_hasta date,
  OUT o_desde date, OUT o_hasta date, OUT o_pago date
)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_first  date;   -- 1er día del mes de p_desde
  v_last   date;   -- último día del mes de p_desde
  v_nmonth date;   -- 1er día del mes siguiente
BEGIN
  IF p_frecuencia = 'semanal' THEN
    o_desde := p_desde + 7;
    o_hasta := p_hasta + 7;
    o_pago  := o_hasta;                         -- el sábado de esa semana
    RETURN;
  END IF;

  v_first  := date_trunc('month', p_desde)::date;
  v_last   := (date_trunc('month', p_desde) + interval '1 month - 1 day')::date;
  v_nmonth := (date_trunc('month', p_desde) + interval '1 month')::date;

  IF p_frecuencia = 'mensual' THEN
    o_desde := v_nmonth;
    o_hasta := (date_trunc('month', v_nmonth) + interval '1 month - 1 day')::date;
    o_pago  := o_hasta;                         -- último día del mes
    RETURN;
  END IF;

  -- quincenal
  IF extract(day FROM p_hasta) <= 15 THEN
    -- veníamos de la 1ra quincena → sigue la 2da del mismo mes (paga 30)
    o_desde := v_first + 15;                    -- día 16
    o_hasta := v_last;
    o_pago  := LEAST(v_first + 29, v_last);     -- día 30 (o último si es más corto)
  ELSE
    -- veníamos de la 2da quincena → sigue la 1ra del mes siguiente (paga 15)
    o_desde := v_nmonth;                        -- día 1
    o_hasta := v_nmonth + 14;                   -- día 15
    o_pago  := v_nmonth + 14;                   -- día 15
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._nomina_periodo_siguiente(text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._nomina_periodo_siguiente(text,date,date) TO authenticated, service_role;

-- 2) Generador real de un período (interno)
CREATE OR REPLACE FUNCTION public._nomina_generar_periodo(
  p_tenant     uuid,
  p_frecuencia text,
  p_desde      date,
  p_hasta      date,
  p_fecha_pago date,
  p_raise_if_empty boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_nomina uuid;
  v_comp   uuid;
  v_emp    record;
  v_det    uuid;
  v_factor numeric := public.nomina_factor(p_frecuencia);
  v_afp_m  numeric; v_sfs_m numeric; v_isr_m numeric;
  v_adel   record;
  v_n      int := 0;
BEGIN
  -- ya existe una nómina viva para ese período
  IF EXISTS (
    SELECT 1 FROM public.nominas
    WHERE tenant_id = p_tenant AND frecuencia = p_frecuencia
      AND fecha_desde = p_desde AND fecha_hasta = p_hasta AND estado <> 'anulada'
  ) THEN
    IF p_raise_if_empty THEN
      RAISE EXCEPTION 'Ya existe una nómina para el período %–%', p_desde, p_hasta;
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO public.nominas (tenant_id, numero, frecuencia, fecha_desde, fecha_hasta, fecha_pago, created_by)
  VALUES (p_tenant,
          COALESCE((SELECT max(numero) FROM public.nominas WHERE tenant_id = p_tenant), 0) + 1,
          p_frecuencia, p_desde, p_hasta, p_fecha_pago, auth.uid())
  RETURNING id INTO v_nomina;

  FOR v_emp IN
    SELECT * FROM public.empleados
    WHERE tenant_id = p_tenant AND activo = true AND frecuencia_pago = p_frecuencia
    ORDER BY nombre
  LOOP
    v_afp_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 464460) * 0.0287, 2) ELSE 0 END;
    v_sfs_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 232230) * 0.0304, 2) ELSE 0 END;
    -- ISR SOLO para el empleado formal (cotiza_tss); informal = sueldo simple
    v_isr_m := CASE WHEN v_emp.cotiza_tss
                    THEN public.nomina_isr_mensual(v_emp.sueldo_mensual - v_afp_m - v_sfs_m)
                    ELSE 0 END;

    INSERT INTO public.nomina_detalle (tenant_id, nomina_id, empleado_id, sueldo_base, tss_afp, tss_sfs, isr)
    VALUES (p_tenant, v_nomina, v_emp.id,
            round(v_emp.sueldo_mensual * v_factor, 2),
            round(v_afp_m * v_factor, 2), round(v_sfs_m * v_factor, 2),
            round(v_isr_m * v_factor, 2))
    RETURNING id INTO v_det;

    FOR v_adel IN
      SELECT g.id,
             g.monto - COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
                                 JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
                                 JOIN public.nominas nn ON nn.id = dd.nomina_id
                                 WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0) AS pendiente
      FROM public.gastos_diarios g
      WHERE g.tenant_id = p_tenant AND g.empleado_id = v_emp.id
        AND g.tipo_gasto = 'Adelanto de sueldo' AND g.anulado = false
      ORDER BY g.fecha, g.created_at
    LOOP
      IF v_adel.pendiente > 0 THEN
        INSERT INTO public.nomina_adelanto_descuentos (tenant_id, nomina_detalle_id, gasto_id, monto)
        VALUES (p_tenant, v_det, v_adel.id, round(v_adel.pendiente, 2));
      END IF;
    END LOOP;

    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    DELETE FROM public.nominas WHERE id = v_nomina;
    IF p_raise_if_empty THEN
      RAISE EXCEPTION 'No hay empleados activos con frecuencia %', p_frecuencia;
    END IF;
    RETURN NULL;
  END IF;

  PERFORM public._nomina_recalcular(v_nomina);

  -- recurrente = FALSE a propósito: la recurrencia la maneja el módulo de
  -- nómina (al pagar se genera el próximo período con SU compromiso). Si
  -- fuera true, el dashboard crearía además un compromiso fantasma.
  INSERT INTO public.compromisos (tenant_id, nombre, monto, fecha, tipo, activo, recurrente, frecuencia, solo_admin)
  SELECT p_tenant,
         'Nómina ' || p_frecuencia || ' ' || to_char(p_desde, 'DD/MM') || '–' || to_char(p_hasta, 'DD/MM'),
         n.total_neto, p_fecha_pago, 'nomina', true, false, p_frecuencia, true
  FROM public.nominas n WHERE n.id = v_nomina
  RETURNING id INTO v_comp;

  UPDATE public.nominas SET compromiso_id = v_comp WHERE id = v_nomina;
  RETURN v_nomina;
END $$;

REVOKE ALL ON FUNCTION public._nomina_generar_periodo(uuid,text,date,date,date,boolean) FROM PUBLIC, anon, authenticated;

-- 3) Generar (web) — wrapper delgado
CREATE OR REPLACE FUNCTION public.nomina_generar(
  p_frecuencia text,
  p_desde      date,
  p_hasta      date,
  p_fecha_pago date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nomina uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_frecuencia NOT IN ('mensual','quincenal','semanal') THEN
    RAISE EXCEPTION 'Frecuencia inválida: %', p_frecuencia;
  END IF;
  IF p_hasta < p_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;

  v_nomina := public._nomina_generar_periodo(v_tenant, p_frecuencia, p_desde, p_hasta, p_fecha_pago, true);

  RETURN jsonb_build_object('ok', true, 'nomina_id', v_nomina,
    'empleados', (SELECT count(*) FROM public.nomina_detalle WHERE nomina_id = v_nomina),
    'total_neto', (SELECT total_neto FROM public.nominas WHERE id = v_nomina));
END $$;

REVOKE ALL ON FUNCTION public.nomina_generar(text,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_generar(text,date,date,date) TO authenticated, service_role;

-- 4) Pagar — salda el compromiso y AUTO-GENERA el próximo período
CREATE OR REPLACE FUNCTION public.nomina_pagar(p_nomina_id uuid, p_forma_pago text DEFAULT 'Efectivo')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nom    record;
  v_sig    record;
  v_next   uuid := NULL;
BEGIN
  SELECT * INTO v_nom FROM public.nominas
  WHERE id = p_nomina_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF v_nom.estado <> 'borrador' THEN RAISE EXCEPTION 'La nómina ya está %', v_nom.estado; END IF;

  UPDATE public.nominas SET estado = 'pagada', forma_pago = p_forma_pago, pagada_at = now()
  WHERE id = p_nomina_id;

  UPDATE public.compromisos SET activo = false, fecha_pago = now(),
         forma_pago = p_forma_pago, referencia_pago = 'Nómina #' || v_nom.numero
  WHERE id = v_nom.compromiso_id;

  -- Recurrencia: crear el borrador del próximo período (con su compromiso)
  SELECT * INTO v_sig FROM public._nomina_periodo_siguiente(v_nom.frecuencia, v_nom.fecha_desde, v_nom.fecha_hasta);
  v_next := public._nomina_generar_periodo(v_tenant, v_nom.frecuencia, v_sig.o_desde, v_sig.o_hasta, v_sig.o_pago, false);

  RETURN jsonb_build_object('ok', true, 'total_neto', v_nom.total_neto,
    'siguiente_nomina_id', v_next,
    'siguiente_desde', v_sig.o_desde, 'siguiente_hasta', v_sig.o_hasta, 'siguiente_pago', v_sig.o_pago);
END $$;

REVOKE ALL ON FUNCTION public.nomina_pagar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_pagar(uuid,text) TO authenticated, service_role;

-- 5) Si el compromiso de nómina se paga DESDE EL DASHBOARD, la nómina
--    también se cierra y se genera el próximo período (mismo resultado
--    que pagar desde el módulo). Cuando el pago viene de nomina_pagar,
--    la nómina ya está 'pagada' y el trigger no hace nada.
CREATE OR REPLACE FUNCTION public.trg_compromiso_nomina_pagado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_nom record;
  v_sig record;
BEGIN
  SELECT * INTO v_nom FROM public.nominas
  WHERE compromiso_id = NEW.id AND estado = 'borrador'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.nominas
     SET estado = 'pagada',
         forma_pago = COALESCE(NEW.forma_pago, 'Efectivo'),
         pagada_at = now()
   WHERE id = v_nom.id;

  SELECT * INTO v_sig FROM public._nomina_periodo_siguiente(v_nom.frecuencia, v_nom.fecha_desde, v_nom.fecha_hasta);
  PERFORM public._nomina_generar_periodo(v_nom.tenant_id, v_nom.frecuencia,
                                         v_sig.o_desde, v_sig.o_hasta, v_sig.o_pago, false);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compromiso_nomina_pagado ON public.compromisos;
CREATE TRIGGER trg_compromiso_nomina_pagado
  AFTER UPDATE OF activo ON public.compromisos
  FOR EACH ROW
  WHEN (NEW.tipo = 'nomina' AND OLD.activo = true AND NEW.activo = false)
  EXECUTE FUNCTION public.trg_compromiso_nomina_pagado_fn();

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_recurrente.sql');
  END IF;
END $$;

SELECT 'Nómina recurrente: al pagar se genera el próximo período (pago 15 y 30)' AS status;
