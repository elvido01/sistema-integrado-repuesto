-- =====================================================================
-- NÓMINA SEMANAL: se paga POR SÁBADO, no por "un cuarto de mes"
-- ---------------------------------------------------------------------
-- (2026-07-28) Regla del dueño, textual:
--
--   "ese empleado cobra 5,000 cada sábado y el otro cobra 3,000 cada
--    sábado. Hay que hacer que el sistema calcule cada vez que se le deba
--    pagar y se lo agregue a la nómina del mes. Hay meses que cobrarán 5
--    sábados y otros cuatro, pero cobran la misma cantidad cada sábado."
--
-- >>> LO QUE HACÍA MAL <<<
-- nomina_factor('semanal') devolvía 12/52 = 0.2307…, un promedio anual.
-- El de 20,000 cobraba 4,615.38 el sábado en vez de 5,000, y la nómina de
-- un mes de 5 sábados pagaba lo mismo que la de uno de 4. El sueldo
-- semanal salía distinto cada vez sin que nadie moviera nada.
--
-- >>> LA REGLA NUEVA <<<
--   sueldo del sábado = sueldo_mensual / 4        (20,000 → 5,000 fijo)
--   nómina del período = sueldo del sábado × SÁBADOS QUE CAEN EN EL PERÍODO
--
-- Así el sábado SIEMPRE vale lo mismo y el mes vale lo que de verdad se
-- trabajó: 4 sábados = 20,000, 5 sábados = 25,000. El período semanal pasa
-- a ser el MES completo (antes era una sola semana), que es donde el dueño
-- quiere ver el total. Si aun así se genera un período de una semana, la
-- cuenta sigue dando bien: 1 sábado = 5,000.
--
-- Los descuentos (TSS/ISR) se prorratean con el mismo criterio — sábados/4 —
-- para que el empleado reciba NETO IGUAL todos los sábados. Los dos
-- semanales de hoy son informales (cotiza_tss = false), así que no les
-- aplica ninguno.
--
-- >>> EL DÍA DE PAGO ES CONFIGURABLE <<<
-- empleados.dia_pago_semanal (0 = domingo … 6 = sábado). Nace en 6 para
-- todo el mundo: hoy se paga sábado y nada cambia. Queda por empleado por
-- si mañana entra uno que cobra los viernes.
--
-- Idempotente / re-ejecutable. Supersede el factor de nomina_modulo.sql y
-- el generador de nomina_recurrente.sql (mantiene ventana rodante,
-- compromisos, adelantos e ISR-solo-si-cotiza tal como estaban).
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Qué día de la semana cobra cada quien, y cuántos pagos trae la línea
-- ------------------------------------------------------------
ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS dia_pago_semanal smallint NOT NULL DEFAULT 6;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleados_dia_pago_semanal_chk') THEN
    ALTER TABLE public.empleados
      ADD CONSTRAINT empleados_dia_pago_semanal_chk CHECK (dia_pago_semanal BETWEEN 0 AND 6);
  END IF;
END $$;

COMMENT ON COLUMN public.empleados.dia_pago_semanal IS
  'Solo aplica a frecuencia_pago = semanal. 0=domingo … 6=sábado. Cuántas veces cae este día en el período es cuántos sueldos se pagan.';

-- Cuántos pagos trae la línea (4 o 5 sábados). Se guarda para poder
-- mostrar "5 sábados × 5,000" y que el monto se explique solo.
ALTER TABLE public.nomina_detalle
  ADD COLUMN IF NOT EXISTS pagos_periodo smallint NOT NULL DEFAULT 1;

-- ------------------------------------------------------------
-- 2) Cuántas veces cae el día de pago dentro del período
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_pagos_en_periodo(
  p_desde date, p_hasta date, p_dow smallint DEFAULT 6
)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN 0 ELSE (
    SELECT count(*)::int
    FROM generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') g
    WHERE extract(dow FROM g)::int = COALESCE(p_dow, 6)
  ) END
$$;

COMMENT ON FUNCTION public.nomina_pagos_en_periodo(date, date, smallint) IS
  'Sábados (o el día que sea) que caen entre desde y hasta, ambos incluidos.';

-- ------------------------------------------------------------
-- 3) El factor: cuánto de un sueldo mensual toca en este período
-- ------------------------------------------------------------
-- Compatibilidad: la versión de un solo argumento pasa a valer UN sábado.
CREATE OR REPLACE FUNCTION public.nomina_factor(p_frecuencia text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_frecuencia WHEN 'quincenal' THEN 0.5
                           WHEN 'semanal'   THEN 0.25   -- un sábado = sueldo/4
                           ELSE 1 END
$$;

CREATE OR REPLACE FUNCTION public.nomina_factor_periodo(
  p_frecuencia text, p_desde date, p_hasta date, p_dow smallint DEFAULT 6
)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_frecuencia
           WHEN 'quincenal' THEN 0.5
           WHEN 'semanal'   THEN public.nomina_pagos_en_periodo(p_desde, p_hasta, p_dow) / 4.0
           ELSE 1
         END
$$;

GRANT EXECUTE ON FUNCTION public.nomina_pagos_en_periodo(date, date, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nomina_factor_periodo(text, date, date, smallint) TO authenticated;

-- ------------------------------------------------------------
-- 4) El período semanal pasa a ser el MES (paga el último sábado)
-- ------------------------------------------------------------
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
  v_first  := date_trunc('month', p_desde)::date;
  v_last   := (date_trunc('month', p_desde) + interval '1 month - 1 day')::date;
  v_nmonth := (date_trunc('month', p_desde) + interval '1 month')::date;

  -- Semanal y mensual corren por MES. El semanal paga el último sábado;
  -- el mensual, el último día.
  IF p_frecuencia IN ('mensual', 'semanal') THEN
    o_desde := v_nmonth;
    o_hasta := (date_trunc('month', v_nmonth) + interval '1 month - 1 day')::date;
    IF p_frecuencia = 'semanal' THEN
      o_pago := o_hasta - ((extract(dow FROM o_hasta)::int - 6 + 7) % 7);   -- último sábado
    ELSE
      o_pago := o_hasta;
    END IF;
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

-- ------------------------------------------------------------
-- 5) El generador: cada empleado con SU cantidad de pagos
-- ------------------------------------------------------------
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
  v_emp    record;
  v_det    uuid;
  v_factor numeric;
  v_pagos  int;
  v_afp_m  numeric; v_sfs_m numeric; v_isr_m numeric;
  v_adel   record;
  v_n      int := 0;
  v_sin    int := 0;   -- semanales que no tienen ningún día de pago en el período
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
    -- Cuántos sueldos le tocan en este período. Fuera del semanal es 1.
    IF p_frecuencia = 'semanal' THEN
      v_pagos := public.nomina_pagos_en_periodo(p_desde, p_hasta, v_emp.dia_pago_semanal);
      IF v_pagos = 0 THEN
        -- No le cae ningún día de pago aquí: no se le arma línea en cero.
        v_sin := v_sin + 1;
        CONTINUE;
      END IF;
      v_factor := v_pagos / 4.0;
    ELSE
      v_pagos  := 1;
      v_factor := public.nomina_factor(p_frecuencia);
    END IF;

    v_afp_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 464460) * 0.0287, 2) ELSE 0 END;
    v_sfs_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 232230) * 0.0304, 2) ELSE 0 END;
    -- ISR SOLO para el empleado formal (cotiza_tss); informal = sueldo simple
    v_isr_m := CASE WHEN v_emp.cotiza_tss
                    THEN public.nomina_isr_mensual(v_emp.sueldo_mensual - v_afp_m - v_sfs_m)
                    ELSE 0 END;

    -- Semanal: se redondea el SÁBADO y después se multiplica, para que el
    -- sábado sea siempre el mismo número redondo y los meses sean múltiplos
    -- exactos de él (5,000 → 25,000, nunca 24,999.95).
    INSERT INTO public.nomina_detalle (tenant_id, nomina_id, empleado_id, sueldo_base,
                                       tss_afp, tss_sfs, isr, pagos_periodo)
    VALUES (p_tenant, v_nomina, v_emp.id,
            CASE WHEN p_frecuencia = 'semanal'
                 THEN round(v_emp.sueldo_mensual / 4.0, 2) * v_pagos
                 ELSE round(v_emp.sueldo_mensual * v_factor, 2) END,
            CASE WHEN p_frecuencia = 'semanal' THEN round(v_afp_m / 4.0, 2) * v_pagos
                 ELSE round(v_afp_m * v_factor, 2) END,
            CASE WHEN p_frecuencia = 'semanal' THEN round(v_sfs_m / 4.0, 2) * v_pagos
                 ELSE round(v_sfs_m * v_factor, 2) END,
            CASE WHEN p_frecuencia = 'semanal' THEN round(v_isr_m / 4.0, 2) * v_pagos
                 ELSE round(v_isr_m * v_factor, 2) END,
            v_pagos)
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
      IF v_sin > 0 THEN
        RAISE EXCEPTION 'En el período %–% no cae ningún día de pago de los % empleados semanales',
          p_desde, p_hasta, v_sin;
      END IF;
      RAISE EXCEPTION 'No hay empleados activos con frecuencia %', p_frecuencia;
    END IF;
    RETURN NULL;
  END IF;

  PERFORM public._nomina_recalcular(v_nomina);
  PERFORM public._nomina_asegurar_compromiso(v_nomina);
  RETURN v_nomina;
END $$;

REVOKE ALL ON FUNCTION public._nomina_generar_periodo(uuid,text,date,date,date,boolean) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_semanal_por_sabado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El sábado vale lo que debe valer
SELECT e.nombre, e.sueldo_mensual,
       round(e.sueldo_mensual / 4.0, 2) AS por_sabado
FROM public.empleados e
WHERE e.activo AND e.frecuencia_pago = 'semanal'
ORDER BY e.nombre;
-- esperado: JUAN CAMINERO RIO 20,000 → 5,000 | EUCEBIO CAMINERO 12,000 → 3,000

-- 2) Cuántos sábados trae cada mes y qué se pagaría (sin tocar nada)
SELECT to_char(m.d, 'MM/YYYY') AS mes,
       public.nomina_pagos_en_periodo(
         m.d::date,
         (m.d + interval '1 month - 1 day')::date, 6::smallint) AS sabados,
       (SELECT sum(round(e.sueldo_mensual / 4.0, 2)
                   * public.nomina_pagos_en_periodo(
                       m.d::date, (m.d + interval '1 month - 1 day')::date, e.dia_pago_semanal))
          FROM public.empleados e
         WHERE e.activo AND e.frecuencia_pago = 'semanal') AS nomina_semanal_del_mes
FROM generate_series(date_trunc('month', CURRENT_DATE),
                     date_trunc('month', CURRENT_DATE) + interval '5 month',
                     interval '1 month') m(d);
-- con los 2 empleados de hoy (5,000 + 3,000 = 8,000 por sábado):
--   meses de 4 sábados → 32,000 | meses de 5 sábados → 40,000

-- 3) Las piezas quedaron instaladas
SELECT to_regprocedure('public.nomina_pagos_en_periodo(date,date,smallint)')::text  AS f_pagos,
       to_regprocedure('public.nomina_factor_periodo(text,date,date,smallint)')::text AS f_factor,
       public.nomina_factor('semanal') AS factor_un_sabado,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'empleados' AND column_name = 'dia_pago_semanal') AS col_dia_pago,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'nomina_detalle' AND column_name = 'pagos_periodo') AS col_pagos;
-- esperado: las 2 firmas | 0.25 | 1 | 1
