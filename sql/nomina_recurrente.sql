-- =====================================================================
-- NÓMINA RECURRENTE — siempre se ven los DOS próximos pagos (15 y 30)
-- ---------------------------------------------------------------------
-- Pedido del dueño: la nómina es recurrente (no crearla cada quincena),
-- los días de pago son 15 y 30, y "deben aparecer los dos pagos y
-- activarse el día o la semana que le toque".
--
-- Diseño: VENTANA RODANTE de 2 períodos vivos por frecuencia.
--   * Al generar (1 sola vez) se crean el período pedido y el siguiente
--     → en Compromisos a Pagar se ven los DOS pagos (ej. 30/07 y 15/08).
--     El dashboard ya los marca solo como ATRASADO / ESTA SEMANA / FUTURO
--     según su fecha: "se activan" cuando les toca.
--   * Al pagar uno, se crea el que falte para que siempre queden 2 por
--     delante. Nunca hay que volver a generar a mano.
--
-- Piezas:
--   _nomina_periodo_siguiente()   próximo período + fecha de pago
--                                 (quincenal 15 y 30 — o último día si el
--                                 mes es más corto; mensual último día;
--                                 semanal sábado).
--   _nomina_generar_periodo()     generador real (antes en nomina_generar).
--   _nomina_asegurar_compromiso() toda nómina en borrador tiene su
--                                 compromiso ACTIVO y sincronizado
--                                 (repara los borrados desde el dashboard).
--   _nomina_asegurar_ventana()    mantiene los 2 períodos por delante.
--   nomina_generar()/nomina_pagar()  usan la ventana.
--   trg_compromiso_nomina_pagado  pagar el compromiso DESDE EL DASHBOARD
--                                 cierra la nómina igual. OJO: solo cuenta
--                                 como pago si trae fecha_pago (borrar un
--                                 compromiso NO paga la nómina).
--
-- Supersede nomina_generar/nomina_pagar de nomina_modulo.sql y
-- fix_nomina_isr_solo_tss.sql (mantiene ISR solo si cotiza_tss).
-- Al final REPARA lo existente. Idempotente / re-ejecutable.
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
  PERFORM public._nomina_asegurar_compromiso(v_nomina);
  RETURN v_nomina;
END $$;

REVOKE ALL ON FUNCTION public._nomina_generar_periodo(uuid,text,date,date,date,boolean) FROM PUBLIC, anon, authenticated;

-- 3) Toda nómina en borrador tiene su compromiso ACTIVO y sincronizado.
--    (Si lo borraron desde el dashboard, lo vuelve a crear.)
CREATE OR REPLACE FUNCTION public._nomina_asegurar_compromiso(p_nomina_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_nom  record;
  v_comp uuid;
BEGIN
  SELECT * INTO v_nom FROM public.nominas WHERE id = p_nomina_id;
  IF NOT FOUND OR v_nom.estado <> 'borrador' THEN RETURN NULL; END IF;

  SELECT c.id INTO v_comp
  FROM public.compromisos c
  WHERE c.id = v_nom.compromiso_id AND c.activo = true;

  IF FOUND THEN
    UPDATE public.compromisos
       SET monto = v_nom.total_neto, fecha = v_nom.fecha_pago, tipo = 'nomina'
     WHERE id = v_comp;
    RETURN v_comp;
  END IF;

  -- recurrente = FALSE a propósito: la recurrencia la maneja el módulo de
  -- nómina; si fuera true el dashboard crearía un compromiso fantasma.
  INSERT INTO public.compromisos (tenant_id, nombre, monto, fecha, tipo, activo, recurrente, frecuencia, solo_admin)
  VALUES (v_nom.tenant_id,
          'Nómina ' || v_nom.frecuencia || ' ' ||
            to_char(v_nom.fecha_desde, 'DD/MM') || '–' || to_char(v_nom.fecha_hasta, 'DD/MM'),
          v_nom.total_neto, v_nom.fecha_pago, 'nomina', true, false, v_nom.frecuencia, true)
  RETURNING id INTO v_comp;

  UPDATE public.nominas SET compromiso_id = v_comp WHERE id = p_nomina_id;
  RETURN v_comp;
END $$;

REVOKE ALL ON FUNCTION public._nomina_asegurar_compromiso(uuid) FROM PUBLIC, anon, authenticated;

-- 4) Ventana rodante: siempre p_minimo períodos por delante (los 2 pagos)
CREATE OR REPLACE FUNCTION public._nomina_asegurar_ventana(
  p_tenant uuid, p_frecuencia text, p_minimo int DEFAULT 2
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_vivas   int;
  v_ult     record;
  v_sig     record;
  v_new     uuid;
  v_creadas int := 0;
  v_guard   int := 0;
  r         record;
BEGIN
  -- a) reparar compromisos de las nóminas vivas
  FOR r IN
    SELECT id FROM public.nominas
    WHERE tenant_id = p_tenant AND frecuencia = p_frecuencia AND estado = 'borrador'
  LOOP
    PERFORM public._nomina_asegurar_compromiso(r.id);
  END LOOP;

  -- b) completar hasta p_minimo períodos vivos
  LOOP
    SELECT count(*) INTO v_vivas FROM public.nominas
     WHERE tenant_id = p_tenant AND frecuencia = p_frecuencia AND estado = 'borrador';
    EXIT WHEN v_vivas >= p_minimo;

    SELECT * INTO v_ult FROM public.nominas
     WHERE tenant_id = p_tenant AND frecuencia = p_frecuencia AND estado <> 'anulada'
     ORDER BY fecha_hasta DESC, numero DESC
     LIMIT 1;
    EXIT WHEN NOT FOUND;

    SELECT * INTO v_sig
      FROM public._nomina_periodo_siguiente(p_frecuencia, v_ult.fecha_desde, v_ult.fecha_hasta);

    v_new := public._nomina_generar_periodo(p_tenant, p_frecuencia,
                                            v_sig.o_desde, v_sig.o_hasta, v_sig.o_pago, false);
    EXIT WHEN v_new IS NULL;          -- sin empleados o ya existía
    v_creadas := v_creadas + 1;

    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 12;           -- candado anti-bucle
  END LOOP;

  RETURN v_creadas;
END $$;

REVOKE ALL ON FUNCTION public._nomina_asegurar_ventana(uuid,text,int) FROM PUBLIC, anon, authenticated;

-- 5) Generar (web) — crea el período pedido y deja 2 por delante
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
  PERFORM public._nomina_asegurar_ventana(v_tenant, p_frecuencia, 2);

  RETURN jsonb_build_object('ok', true, 'nomina_id', v_nomina,
    'empleados', (SELECT count(*) FROM public.nomina_detalle WHERE nomina_id = v_nomina),
    'total_neto', (SELECT total_neto FROM public.nominas WHERE id = v_nomina),
    'periodos_vivos', (SELECT count(*) FROM public.nominas
                        WHERE tenant_id = v_tenant AND frecuencia = p_frecuencia AND estado = 'borrador'));
END $$;

REVOKE ALL ON FUNCTION public.nomina_generar(text,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_generar(text,date,date,date) TO authenticated, service_role;

-- 6) Pagar — salda el compromiso y rellena la ventana
CREATE OR REPLACE FUNCTION public.nomina_pagar(p_nomina_id uuid, p_forma_pago text DEFAULT 'Efectivo')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nom    record;
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

  PERFORM public._nomina_asegurar_ventana(v_tenant, v_nom.frecuencia, 2);

  RETURN jsonb_build_object('ok', true, 'total_neto', v_nom.total_neto,
    'proxima_pago', (SELECT min(fecha_pago) FROM public.nominas
                      WHERE tenant_id = v_tenant AND frecuencia = v_nom.frecuencia AND estado = 'borrador'),
    'periodos_vivos', (SELECT count(*) FROM public.nominas
                        WHERE tenant_id = v_tenant AND frecuencia = v_nom.frecuencia AND estado = 'borrador'));
END $$;

REVOKE ALL ON FUNCTION public.nomina_pagar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_pagar(uuid,text) TO authenticated, service_role;

-- 7) Pagar el compromiso DESDE EL DASHBOARD cierra la nómina igual.
--    ⚠ Solo cuenta como pago si trae fecha_pago: BORRAR un compromiso
--    (que solo lo desactiva) NO paga la nómina.
CREATE OR REPLACE FUNCTION public.trg_compromiso_nomina_pagado_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_nom record;
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

  PERFORM public._nomina_asegurar_ventana(v_nom.tenant_id, v_nom.frecuencia, 2);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compromiso_nomina_pagado ON public.compromisos;
CREATE TRIGGER trg_compromiso_nomina_pagado
  AFTER UPDATE OF activo ON public.compromisos
  FOR EACH ROW
  WHEN (NEW.tipo = 'nomina' AND OLD.activo = true AND NEW.activo = false
        AND NEW.fecha_pago IS NOT NULL)
  EXECUTE FUNCTION public.trg_compromiso_nomina_pagado_fn();

-- 8) REPARAR lo existente: recrea compromisos borrados y deja 2 períodos
--    vivos por cada frecuencia que ya tenga nóminas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT tenant_id, frecuencia FROM public.nominas WHERE estado = 'borrador'
  LOOP
    PERFORM public._nomina_asegurar_ventana(r.tenant_id, r.frecuencia, 2);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_recurrente.sql');
  END IF;
END $$;

-- Verificación: nóminas vivas y sus compromisos
SELECT n.numero, n.frecuencia, n.fecha_desde, n.fecha_hasta, n.fecha_pago,
       n.total_neto, c.nombre AS compromiso, c.activo AS compromiso_activo
FROM public.nominas n
LEFT JOIN public.compromisos c ON c.id = n.compromiso_id
WHERE n.estado = 'borrador'
ORDER BY n.fecha_pago;
