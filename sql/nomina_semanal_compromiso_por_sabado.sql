-- =====================================================================
-- NÓMINA SEMANAL: cada SÁBADO es su propio compromiso a pagar
-- ---------------------------------------------------------------------
-- (2026-07-28) Reportado: "falta que aparezca el monto de los pagos
-- semanales en compromisos por pagar como lo hace la nómina que se paga
-- los 15 y 30".
--
-- >>> POR QUE NO APARECÍA <<<
-- Nunca se generó ninguna nómina semanal. El compromiso nace con la
-- nómina, así que no había nada que mostrar. Este script la arranca.
--
-- >>> Y DE PASO CORRIGE nomina_semanal_por_sabado.sql <<<
-- Ese script dejó el período semanal en un MES completo. Eso daba UN
-- compromiso de 32,000 con fecha del último sábado, y eso es mentira:
--   * el último sábado no se pagan 32,000, se pagan 8,000;
--   * los otros 3 sábados aparecían como si no hubiera que pagar nada;
--   * el botón "Pagar" de cada empleado le habría pagado el MES entero
--     (25,000 a JUAN) en vez del sábado que le toca (5,000).
--
-- El período semanal vuelve a ser UNA SEMANA (lunes a sábado). Así cada
-- sábado tiene su compromiso por lo que de verdad sale de la caja ese día,
-- exactamente como el quincenal tiene el suyo el 15 y el 30. El mes sigue
-- sumando 4 o 5 sábados según le toque — que era el pedido original.
--
-- Lo que NO cambia (quedó bien y sigue igual):
--   sueldo del sábado = sueldo_mensual / 4   (20,000 → 5,000 fijo)
--   el conteo de días de pago, dia_pago_semanal y pagos_periodo.
--   Con período de una semana cae 1 sábado → 1 × 5,000. La misma fórmula.
--
-- >>> LA VENTANA DEL SEMANAL ES MÁS LARGA <<<
-- El quincenal mantiene 2 pagos por delante (un mes). Para ver el mes
-- completo, el semanal mantiene 5. Así en Compromisos a Pagar se ven todos
-- los sábados del mes, no dos sueltos.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Cuántos períodos vivos mantener por delante, según la frecuencia
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._nomina_ventana_minimo(p_frecuencia text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  -- semanal: 5 sábados = el mes completo a la vista. Resto: 2 pagos.
  SELECT CASE WHEN p_frecuencia = 'semanal' THEN 5 ELSE 2 END
$$;

-- ------------------------------------------------------------
-- 2) El período semanal vuelve a ser UNA SEMANA (lunes a sábado)
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
  -- Semanal: la semana siguiente. Cada semana = un sueldo = un compromiso.
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

-- ------------------------------------------------------------
-- 3) El compromiso del semanal se llama por SU sábado
-- ------------------------------------------------------------
-- "Nómina semanal sábado 01/08" dice más que "semanal 27/07–01/08" en una
-- tarjeta donde lo que importa es qué día sale la plata.
CREATE OR REPLACE FUNCTION public._nomina_asegurar_compromiso(p_nomina_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_nom    record;
  v_comp   uuid;
  v_nombre text;
  v_dias   text[] := ARRAY['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
BEGIN
  SELECT * INTO v_nom FROM public.nominas WHERE id = p_nomina_id;
  IF NOT FOUND OR v_nom.estado <> 'borrador' THEN RETURN NULL; END IF;

  v_nombre := CASE WHEN v_nom.frecuencia = 'semanal'
    THEN 'Nómina semanal ' || v_dias[extract(dow FROM v_nom.fecha_pago)::int + 1]
         || ' ' || to_char(v_nom.fecha_pago, 'DD/MM')
    ELSE 'Nómina ' || v_nom.frecuencia || ' ' ||
         to_char(v_nom.fecha_desde, 'DD/MM') || '–' || to_char(v_nom.fecha_hasta, 'DD/MM')
  END;

  SELECT c.id INTO v_comp
  FROM public.compromisos c
  WHERE c.id = v_nom.compromiso_id AND c.activo = true;

  IF FOUND THEN
    UPDATE public.compromisos
       SET monto = v_nom.total_neto, fecha = v_nom.fecha_pago, tipo = 'nomina', nombre = v_nombre
     WHERE id = v_comp;
    RETURN v_comp;
  END IF;

  -- recurrente = FALSE a propósito: la recurrencia la maneja el módulo de
  -- nómina; si fuera true el dashboard crearía un compromiso fantasma.
  INSERT INTO public.compromisos (tenant_id, nombre, monto, fecha, tipo, activo, recurrente, frecuencia, solo_admin)
  VALUES (v_nom.tenant_id, v_nombre, v_nom.total_neto, v_nom.fecha_pago,
          'nomina', true, false, v_nom.frecuencia, true)
  RETURNING id INTO v_comp;

  UPDATE public.nominas SET compromiso_id = v_comp WHERE id = p_nomina_id;
  RETURN v_comp;
END $$;

REVOKE ALL ON FUNCTION public._nomina_asegurar_compromiso(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4) Los tres puntos donde se rellena la ventana usan el mínimo correcto
-- ------------------------------------------------------------
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
  PERFORM public._nomina_asegurar_ventana(v_tenant, p_frecuencia,
                                          public._nomina_ventana_minimo(p_frecuencia));

  RETURN jsonb_build_object('ok', true, 'nomina_id', v_nomina,
    'empleados', (SELECT count(*) FROM public.nomina_detalle WHERE nomina_id = v_nomina),
    'total_neto', (SELECT total_neto FROM public.nominas WHERE id = v_nomina),
    'periodos_vivos', (SELECT count(*) FROM public.nominas
                        WHERE tenant_id = v_tenant AND frecuencia = p_frecuencia AND estado = 'borrador'));
END $$;

REVOKE ALL ON FUNCTION public.nomina_generar(text,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_generar(text,date,date,date) TO authenticated, service_role;

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

  PERFORM public._nomina_asegurar_ventana(v_tenant, v_nom.frecuencia,
                                          public._nomina_ventana_minimo(v_nom.frecuencia));

  RETURN jsonb_build_object('ok', true, 'total_neto', v_nom.total_neto,
    'proxima_pago', (SELECT min(fecha_pago) FROM public.nominas
                      WHERE tenant_id = v_tenant AND frecuencia = v_nom.frecuencia AND estado = 'borrador'),
    'periodos_vivos', (SELECT count(*) FROM public.nominas
                        WHERE tenant_id = v_tenant AND frecuencia = v_nom.frecuencia AND estado = 'borrador'));
END $$;

REVOKE ALL ON FUNCTION public.nomina_pagar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_pagar(uuid,text) TO authenticated, service_role;

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

  PERFORM public._nomina_asegurar_ventana(v_nom.tenant_id, v_nom.frecuencia,
                                          public._nomina_ventana_minimo(v_nom.frecuencia));
  RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- 5) ARRANCAR la nómina semanal donde haya empleados semanales
-- ------------------------------------------------------------
-- Sin esto no aparece nada en Compromisos a Pagar: el compromiso nace con
-- la nómina. Se crea la semana en curso (lunes–sábado) y la ventana rellena
-- el resto del mes sola.
DO $$
DECLARE
  r        record;
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_lunes  date;
  v_sabado date;
BEGIN
  v_lunes  := v_hoy - ((extract(dow FROM v_hoy)::int + 6) % 7);   -- lunes de esta semana
  v_sabado := v_lunes + 5;

  FOR r IN
    SELECT DISTINCT e.tenant_id
    FROM public.empleados e
    WHERE e.activo = true AND e.frecuencia_pago = 'semanal'
      AND NOT EXISTS (SELECT 1 FROM public.nominas n
                       WHERE n.tenant_id = e.tenant_id AND n.frecuencia = 'semanal'
                         AND n.estado <> 'anulada')
  LOOP
    PERFORM public._nomina_generar_periodo(r.tenant_id, 'semanal', v_lunes, v_sabado, v_sabado, false);
    RAISE NOTICE 'Nómina semanal arrancada en % — semana %–%', r.tenant_id, v_lunes, v_sabado;
  END LOOP;

  -- Y a todos los que ya tienen semanal, dejarles el mes completo a la vista
  FOR r IN
    SELECT DISTINCT tenant_id FROM public.nominas
    WHERE frecuencia = 'semanal' AND estado = 'borrador'
  LOOP
    PERFORM public._nomina_asegurar_ventana(r.tenant_id, 'semanal',
                                            public._nomina_ventana_minimo('semanal'));
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_semanal_compromiso_por_sabado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LO QUE PEDISTE: los sábados en Compromisos a Pagar, uno por uno
SELECT c.fecha, c.nombre, c.monto
FROM public.compromisos c
WHERE c.tipo = 'nomina' AND c.activo = true AND c.frecuencia = 'semanal'
ORDER BY c.fecha;
-- esperado: 5 líneas, una por sábado, de 8,000 cada una
--           (JUAN 5,000 + EUCEBIO 3,000)

-- 2) Las nóminas semanales vivas: una semana cada una, un sueldo cada una
SELECT n.numero, n.fecha_desde, n.fecha_hasta, n.fecha_pago, n.total_neto,
       (SELECT string_agg(e.nombre || ' ' || d.pagos_periodo || '×' ||
                          round(d.sueldo_base / NULLIF(d.pagos_periodo,0), 2), ', ')
          FROM public.nomina_detalle d
          JOIN public.empleados e ON e.id = d.empleado_id
         WHERE d.nomina_id = n.id) AS detalle
FROM public.nominas n
WHERE n.frecuencia = 'semanal' AND n.estado = 'borrador'
ORDER BY n.fecha_pago;
-- esperado: total_neto 8,000 en cada una; detalle "… 1×5000, … 1×3000"

-- 3) El mes completo: cuántos sábados y cuánto suma
SELECT to_char(n.fecha_pago, 'MM/YYYY') AS mes, count(*) AS sabados,
       sum(n.total_neto) AS total_del_mes
FROM public.nominas n
WHERE n.frecuencia = 'semanal' AND n.estado <> 'anulada'
GROUP BY 1 ORDER BY 1;
-- esperado: meses de 4 sábados → 32,000 | de 5 sábados → 40,000
