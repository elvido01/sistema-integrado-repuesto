-- ============================================================
-- CUENTA INICIAL: LO QUE YA SE PAGO ANTES DEL SISTEMA (17/11/2026)
-- ============================================================
-- El Centenario entra al sistema a mitad del año 2026-2027. Al completar la
-- ficha de cada estudiante, el colegio marca QUE MESES y QUE CONCEPTOS del
-- año ya pagó (en papel). No todos estan al dia, y no siempre seguido
-- (pagó septiembre, debe octubre, pagó noviembre).
--
-- Se crea la cuenta COMPLETA del año y lo ya pagado queda saldado:
--   * sin recibo y sin dinero en la caja de hoy (no entró hoy);
--   * marcado `saldado_antes` para que se vea por que no se debe;
--   * como la fila existe, "Completar cuenta" nunca lo vuelve a crear como
--     deuda (antes, con "cobrar desde", si alguien elegia septiembre los
--     meses pagados en papel volvian a salir).
-- Los meses atrasados de antes del sistema llevan recargo solo si el
-- colegio lo pide; si no, el recargo nace anulado y no se vuelve a crear.
-- ============================================================

-- OJO: la funcion de este archivo la REEMPLAZA edu_cuenta_inicial_ajustes.sql
-- (firma con p_desde, solo direccion, recargo por colegio). No correr este
-- archivo solo otra vez: dejaria una sobrecarga con la regla vieja.

SELECT public.registrar_migracion('edu_cuenta_inicial_pagado_antes.sql');

ALTER TABLE public.edu_cargos
  ADD COLUMN IF NOT EXISTS saldado_antes    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldado_antes_por uuid,
  ADD COLUMN IF NOT EXISTS saldado_antes_at  timestamptz;

COMMENT ON COLUMN public.edu_cargos.saldado_antes IS
  'Pagado antes de entrar al sistema (en papel). Se salda sin recibo: no es dinero de la caja de hoy.';

CREATE OR REPLACE FUNCTION public.edu_cuenta_inicial(
  p_estudiante     uuid,
  p_meses_pagados  date[] DEFAULT '{}',
  p_anuales_pagados text[] DEFAULT '{}',
  p_con_recargo    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_t      uuid := public.get_user_tenant();
  e        public.edu_estudiantes%ROWTYPE;
  a        public.edu_anios%ROWTYPE;
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_creados int;
  v_saldados int;
  v_sin_rec int := 0;
  v_c_rec  uuid;
  v_rec    numeric;
BEGIN
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  SELECT * INTO a FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;

  -- Solo para la PRIMERA cuenta del año: si ya tiene, se maneja en la Caja.
  IF EXISTS (SELECT 1 FROM public.edu_cargos
              WHERE estudiante_id = e.id AND anio_id = a.id AND estado <> 'anulado') THEN
    RAISE EXCEPTION '% ya tiene la cuenta de %: los pagos se manejan en la Caja.',
      e.nombres || ' ' || e.apellidos, a.nombre;
  END IF;

  -- La cuenta completa: todos los meses desde el inicio + los anuales de su condicion.
  -- (edu_preparar_cuenta exige activo y mensualidad > 0.)
  v_creados := public.edu_preparar_cuenta(e.id, make_date(a.anio_inicio, a.mes_inicio, 1), true);

  -- Lo ya pagado: saldado sin recibo.
  UPDATE public.edu_cargos c
     SET pagado = GREATEST(c.monto - c.descuento, 0),
         estado = 'pagado',
         saldado_antes = true,
         saldado_antes_por = auth.uid(),
         saldado_antes_at = now()
   WHERE c.estudiante_id = e.id AND c.anio_id = a.id
     AND c.estado IN ('pendiente', 'parcial')
     AND (   (c.tipo IN ('mensualidad', 'sala_tareas') AND c.periodo = ANY (COALESCE(p_meses_pagados, '{}')))
          OR (c.periodo IS NULL AND c.tipo = ANY (COALESCE(p_anuales_pagados, '{}'))));
  GET DIAGNOSTICS v_saldados = ROW_COUNT;

  -- Meses atrasados de antes del sistema: sin recargo, salvo que el colegio lo pida.
  -- El recargo nace anulado y edu_aplicar_recargos ya no lo vuelve a crear.
  IF NOT COALESCE(p_con_recargo, false) THEN
    SELECT id INTO v_c_rec FROM public.edu_conceptos
     WHERE tenant_id = v_t AND tipo = 'recargo' AND activo ORDER BY orden, created_at LIMIT 1;
    SELECT recargo_monto INTO v_rec FROM public.edu_config WHERE tenant_id = v_t;
    IF v_c_rec IS NOT NULL AND COALESCE(v_rec, 0) > 0 THEN
      INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence,
                                     moneda, monto_bruto, monto, cargo_origen_id, estado,
                                     anulado_motivo, anulado_por, anulado_at)
      SELECT m.tenant_id, m.estudiante_id, m.anio_id, v_c_rec, 'recargo', 'Recargo ' || substr(m.descripcion, 13),
             m.periodo, v_hoy, 'DOP', v_rec, v_rec, m.id, 'anulado',
             'Deuda de antes del sistema: sin recargo', auth.uid(), now()
        FROM public.edu_cargos m
       WHERE m.estudiante_id = e.id AND m.anio_id = a.id
         AND m.tipo = 'mensualidad' AND m.estado IN ('pendiente', 'parcial')
         AND v_hoy >= (m.periodo + interval '1 month')::date
         AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.cargo_origen_id = m.id AND x.tipo = 'recargo');
      GET DIAGNOSTICS v_sin_rec = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'creados', v_creados,
    'saldados', v_saldados,
    'meses_sin_recargo', v_sin_rec,
    'debe', (SELECT COALESCE(SUM(GREATEST(c.monto - c.descuento - c.pagado, 0)), 0)
               FROM public.edu_cargos c
              WHERE c.estudiante_id = e.id AND c.anio_id = a.id AND c.estado IN ('pendiente', 'parcial')
                AND c.moneda = 'DOP' AND c.periodo IS NOT NULL AND c.periodo <= v_hoy)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.edu_cuenta_inicial(uuid, date[], text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cuenta_inicial(uuid, date[], text[], boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — como usuario del colegio, y se deshace
-- ============================================================
DO $prueba$
DECLARE
  v_t    uuid;
  v_user uuid;
  v_fam  uuid;
  v_est  uuid;
  v_r    jsonb;
  v_sep  date;
  v_oct  date;
  v_nov  date;
  v_ok   text := '';
  v_n_sep text; v_n_oct text; v_n_nov text; v_util text; v_bil text; v_rec_oct text;
BEGIN
  SELECT a.tenant_id, make_date(a.anio_inicio, a.mes_inicio, 1) INTO v_t, v_sep
    FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.tenant_id = v_t ORDER BY p.id LIMIT 1;
  IF v_t IS NULL OR v_user IS NULL THEN RAISE NOTICE 'Sin colegio de prueba.'; RETURN; END IF;
  v_oct := (v_sep + interval '1 month')::date;
  v_nov := (v_sep + interval '2 month')::date;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado, condicion)
    VALUES (v_t, v_fam, 'PRUEBA', 'CUENTA INICIAL', 5000, 'retirado', 'continuante') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;

    -- Pagó septiembre y noviembre (debe octubre), y la utilería; no el bilingüe.
    v_r := public.edu_cuenta_inicial(v_est, ARRAY[v_sep, v_nov], ARRAY['utileria'], false);

    SELECT estado INTO v_n_sep FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'mensualidad' AND periodo = v_sep;
    SELECT estado INTO v_n_oct FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'mensualidad' AND periodo = v_oct;
    SELECT estado INTO v_n_nov FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'mensualidad' AND periodo = v_nov;
    SELECT estado INTO v_util  FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'utileria';
    SELECT estado INTO v_bil   FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'bilingue';
    SELECT estado INTO v_rec_oct FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'recargo' AND periodo = v_oct;

    -- El recargo automatico no debe crear otro para octubre.
    PERFORM private.edu_aplicar_recargos(v_t);

    IF v_n_sep <> 'pagado' OR v_n_nov <> 'pagado' OR v_n_oct <> 'pendiente'
       OR v_util <> 'pagado' OR v_bil <> 'pendiente'
       OR (v_rec_oct IS NOT NULL AND v_rec_oct <> 'anulado')
       OR (SELECT count(*) FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'recargo' AND estado <> 'anulado') > 0
       OR EXISTS (SELECT 1 FROM public.edu_pagos p WHERE p.familia_id = v_fam) THEN
      v_ok := format('MAL sep=%s oct=%s nov=%s util=%s bil=%s rec_oct=%s r=%s', v_n_sep, v_n_oct, v_n_nov, v_util, v_bil, v_rec_oct, v_r);
    ELSE
      v_ok := 'BIEN';
    END IF;

    -- Una segunda vez no se deja.
    BEGIN
      PERFORM public.edu_cuenta_inicial(v_est, '{}', '{}', false);
      v_ok := v_ok || ' / SEGUNDA VEZ PASO';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;

  IF v_ok <> 'BIEN' THEN RAISE EXCEPTION 'Prueba de cuenta inicial: %', v_ok; END IF;
END $prueba$;
