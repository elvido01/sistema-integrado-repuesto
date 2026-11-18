-- ============================================================
-- CUENTA INICIAL Y RECARGO — AJUSTES DE LA REVISION (17/11/2026)
-- ============================================================
-- /code-review high sobre edu_cuenta_inicial_pagado_antes.sql,
-- edu_mensualidad_cero_no_prepara.sql y edu_recargo_al_juntar_dos_meses.sql:
--
-- 1. edu_preparar_cuenta con tarifa 0 ya NO revienta: no crea las
--    mensualidades (y nada nace pagado). Reventar trababa el cambio de año
--    entero (edu_cambiar_anio) o el cobro de una reservacion
--    (edu_reserva_pagada_confirma) por un solo estudiante sin tarifa.
-- 2. Cuantos meses se juntan para el recargo es POR COLEGIO
--    (edu_config.recargo_meses). Los dos Centenario: 2. Los demas: 1 (como
--    antes). El cambio global de edu_recargo_al_juntar_dos_meses.sql queda
--    reemplazado aqui.
-- 3. edu_cuenta_inicial:
--    - "Empezo en": a quien entra a mitad de año no se le crean los meses de
--      antes (antes solo se podia marcarlos pagados, y eso es mentir).
--    - Solo la direccion (owner/admin): salda dinero sin que entre a caja.
--    - Lo que debe incluye los conceptos del año.
--    - Sin recargo = TODOS los meses de antes del sistema que debe quedan sin
--      recargo para siempre (antes solo los que ya habian cruzado el umbral;
--      octubre lo cogia el 1ro de diciembre).
--    - Tarifa 0: avisa en vez de crear una cuenta sin mensualidades.
-- ============================================================

SELECT public.registrar_migracion('edu_cuenta_inicial_ajustes.sql');

-- ── 1. preparar cuenta: tarifa 0 no crea mensualidades ──────────────────
DO $preparar$
DECLARE
  v_def   text;
  v_nuevo text;
  v_raise text := E'  -- Sin mensualidad (importado sin tarifa): las mensualidades nacerian en 0\n'
               || E'  -- y pagadas. La beca 100% si es legitima (tarifa > 0, beca 100).\n'
               || E'  IF COALESCE(e.tarifa_mensual, 0) <= 0 AND COALESCE(e.beca_pct, 0) < 100 THEN\n'
               || E'    RAISE EXCEPTION ''Falta la mensualidad de %: complétala en su ficha antes de preparar la cuenta.'', e.nombres || '' '' || e.apellidos;\n'
               || E'  END IF;\n';
  v_ancla text := E'    -- Beca 100%: la mensualidad queda en 0 y nace pagada (no sale como deuda).\n';
BEGIN
  SELECT pg_get_functiondef('public.edu_preparar_cuenta(uuid,date,boolean)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');
  IF position('EXIT WHEN COALESCE(e.tarifa_mensual' IN v_def) > 0 THEN
    RAISE NOTICE 'edu_preparar_cuenta ya saltaba las mensualidades sin tarifa.';
    RETURN;
  END IF;
  v_nuevo := replace(v_def, v_raise, '');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro el candado anterior en edu_preparar_cuenta.'; END IF;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, v_ancla,
       E'    -- Sin mensualidad (importado sin tarifa): no se crea; naceria en 0 y\n'
    || E'    -- PAGADA. La beca 100% si es legitima (tarifa > 0, beca 100).\n'
    || E'    EXIT WHEN COALESCE(e.tarifa_mensual, 0) <= 0 AND COALESCE(e.beca_pct, 0) < 100;\n'
    || v_ancla);
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'No se encontro el bucle de mensualidades en edu_preparar_cuenta.'; END IF;
  EXECUTE v_nuevo;
END $preparar$;

-- ── 2. recargo: cuantos meses se juntan, por colegio ────────────────────
ALTER TABLE public.edu_config
  ADD COLUMN IF NOT EXISTS recargo_meses integer NOT NULL DEFAULT 1;
DO $chk$ BEGIN
  ALTER TABLE public.edu_config ADD CONSTRAINT edu_config_recargo_meses_chk CHECK (recargo_meses BETWEEN 1 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL;
END $chk$;
COMMENT ON COLUMN public.edu_config.recargo_meses IS
  'Meses que se juntan antes del recargo. 1 = el recargo de septiembre nace el 1ro de octubre; 2 = el 1ro de noviembre (septiembre y octubre juntos sin pagar).';

-- Los dos Centenario (pedido del colegio 17/11/2026).
UPDATE public.edu_config SET recargo_meses = 2
 WHERE tenant_id IN ('8bcd59ef-9502-486c-b919-c77b991387bb', '29ad429d-71ad-4bab-bba1-392299ba1880');

CREATE OR REPLACE FUNCTION private.edu_aplicar_recargos(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := p_tenant; v_rec numeric; v_c uuid; v_n integer; v_meses integer;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_t IS NULL THEN RETURN 0; END IF;
  SELECT recargo_monto, COALESCE(recargo_meses, 1) INTO v_rec, v_meses FROM public.edu_config WHERE tenant_id = v_t;
  IF COALESCE(v_rec, 0) <= 0 THEN RETURN 0; END IF;
  SELECT id INTO v_c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'recargo' AND activo ORDER BY orden, created_at LIMIT 1;
  IF v_c IS NULL THEN RETURN 0; END IF;     -- el colegio apagó el recargo
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence,
                                 moneda, monto_bruto, monto, cargo_origen_id)
  SELECT m.tenant_id, m.estudiante_id, m.anio_id, v_c, 'recargo', 'Recargo ' || substr(m.descripcion, 13),
         m.periodo, v_hoy, 'DOP', v_rec, v_rec, m.id
    FROM public.edu_cargos m
    JOIN public.edu_estudiantes e ON e.id = m.estudiante_id AND e.estado = 'activo'
   WHERE m.tenant_id = v_t AND m.tipo = 'mensualidad' AND m.estado IN ('pendiente','parcial')
     AND m.monto > 0
     AND v_hoy >= (m.periodo + make_interval(months => v_meses))::date   -- se juntaron los meses del colegio
     AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.cargo_origen_id = m.id AND x.tipo = 'recargo' AND x.estado = 'anulado')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- ── 3. cuenta inicial ────────────────────────────────────────────────────
-- Cambia la firma (p_desde): se borra la vieja para no dejar una sobrecarga.
DROP FUNCTION IF EXISTS public.edu_cuenta_inicial(uuid, date[], text[], boolean);

CREATE OR REPLACE FUNCTION public.edu_cuenta_inicial(
  p_estudiante      uuid,
  p_meses_pagados   date[]  DEFAULT '{}',
  p_anuales_pagados text[]  DEFAULT '{}',
  p_con_recargo     boolean DEFAULT false,
  p_desde           date    DEFAULT NULL
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
  v_mes_hoy date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo'))::date;
  v_inicio date;
  v_desde  date;
  v_creados int;
  v_saldados int;
  v_sin_rec int := 0;
  v_c_rec  uuid;
  v_rec    numeric;
BEGIN
  IF NOT private.edu_es_direccion(v_t) THEN
    RAISE EXCEPTION 'Solo la dirección puede anotar lo pagado antes del sistema (salda sin recibo).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF COALESCE(e.tarifa_mensual, 0) <= 0 AND COALESCE(e.beca_pct, 0) < 100 THEN
    RAISE EXCEPTION 'Falta la mensualidad de %: complétala en su ficha.', e.nombres || ' ' || e.apellidos;
  END IF;
  SELECT * INTO a FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;

  IF EXISTS (SELECT 1 FROM public.edu_cargos
              WHERE estudiante_id = e.id AND anio_id = a.id AND estado <> 'anulado') THEN
    RAISE EXCEPTION '% ya tiene la cuenta de %: los pagos se manejan en la Caja.',
      e.nombres || ' ' || e.apellidos, a.nombre;
  END IF;

  v_inicio := make_date(a.anio_inicio, a.mes_inicio, 1);
  v_desde  := GREATEST(v_inicio, date_trunc('month', COALESCE(p_desde, v_inicio))::date);

  -- La cuenta desde que empezó: los meses y los anuales de su condición.
  v_creados := public.edu_preparar_cuenta(e.id, v_desde, true);

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

  -- Sin recargo: TODOS los meses de antes del sistema que debe (anteriores al
  -- mes en curso), ya hayan cruzado el umbral o no. El recargo nace anulado y
  -- el automático ya no lo vuelve a crear.
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
         AND m.periodo < v_mes_hoy
         AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.cargo_origen_id = m.id AND x.tipo = 'recargo');
      GET DIAGNOSTICS v_sin_rec = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'creados', v_creados,
    'saldados', v_saldados,
    'meses_sin_recargo', v_sin_rec,
    -- Lo que debe hoy en pesos: meses ya corridos + conceptos del año.
    'debe', (SELECT COALESCE(SUM(GREATEST(c.monto - c.descuento - c.pagado, 0)), 0)
               FROM public.edu_cargos c
              WHERE c.estudiante_id = e.id AND c.anio_id = a.id AND c.estado IN ('pendiente', 'parcial')
                AND c.moneda = 'DOP' AND (c.periodo IS NULL OR c.periodo <= v_hoy)),
    'debe_usd', (SELECT COALESCE(SUM(GREATEST(c.monto - c.descuento - c.pagado, 0)), 0)
                   FROM public.edu_cargos c
                  WHERE c.estudiante_id = e.id AND c.anio_id = a.id AND c.estado IN ('pendiente', 'parcial')
                    AND c.moneda = 'USD')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.edu_cuenta_inicial(uuid, date[], text[], boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cuenta_inicial(uuid, date[], text[], boolean, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — como la direccion del colegio, y se deshace
-- ============================================================
DO $prueba$
DECLARE
  v_t uuid; v_user uuid; v_fam uuid; v_est uuid; v_est0 uuid; v_r jsonb; v_n int;
  v_sep date; v_oct date; v_nov date; v_ok text := '';
  v_oct_rec text; v_hay_sep int;
BEGIN
  SELECT a.tenant_id, make_date(a.anio_inicio, a.mes_inicio, 1) INTO v_t, v_sep
    FROM public.edu_anios a WHERE a.actual ORDER BY a.created_at LIMIT 1;
  -- Alguien de la direccion cuya empresa ACTIVA sea el colegio.
  FOR v_user IN
    SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t AND ue.rol IN ('owner', 'admin')
    UNION
    SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_t AND p.role IN ('admin', 'owner')
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = v_t AND private.edu_es_direccion(v_t);
    v_user := NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_t IS NULL OR v_user IS NULL THEN RAISE NOTICE 'Sin direccion de prueba.'; RETURN; END IF;
  v_oct := (v_sep + interval '1 month')::date;
  v_nov := (v_sep + interval '2 month')::date;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA') RETURNING id INTO v_fam;

    -- (a) tarifa 0: preparar cuenta no crea mensualidades ni revienta
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado, condicion)
    VALUES (v_t, v_fam, 'PRUEBA', 'SIN TARIFA', 0, 'retirado', 'continuante') RETURNING id INTO v_est0;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est0;
    PERFORM public.edu_preparar_cuenta(v_est0, NULL, false);
    SELECT count(*) INTO v_n FROM public.edu_cargos WHERE estudiante_id = v_est0 AND tipo = 'mensualidad';
    IF v_n > 0 THEN v_ok := v_ok || ' tarifa0-creo-mensualidades'; END IF;

    -- (b) empezó en octubre, pagó noviembre, debe octubre; sin recargo
    INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, tarifa_mensual, estado, condicion)
    VALUES (v_t, v_fam, 'PRUEBA', 'CUENTA INICIAL', 5000, 'retirado', 'continuante') RETURNING id INTO v_est;
    UPDATE public.edu_estudiantes SET estado = 'activo' WHERE id = v_est;
    v_r := public.edu_cuenta_inicial(v_est, ARRAY[v_nov], ARRAY['utileria', 'reservacion', 'bilingue'], false, v_oct);

    SELECT count(*) INTO v_hay_sep FROM public.edu_cargos WHERE estudiante_id = v_est AND periodo = v_sep;
    IF v_hay_sep > 0 THEN v_ok := v_ok || ' creo-septiembre'; END IF;
    SELECT estado INTO v_oct_rec FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'recargo' AND periodo = v_oct;
    IF (SELECT estado FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'mensualidad' AND periodo = v_oct) <> 'pendiente'
       OR (SELECT estado FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'mensualidad' AND periodo = v_nov) <> 'pagado' THEN
      v_ok := v_ok || ' meses-mal';
    END IF;
    -- octubre es de antes del sistema: su recargo nace anulado aunque no haya cruzado el umbral
    IF v_oct < date_trunc('month', now() AT TIME ZONE 'America/Santo_Domingo')::date AND COALESCE(v_oct_rec, '') <> 'anulado' THEN
      v_ok := v_ok || ' octubre-sin-recargo-anulado';
    END IF;
    PERFORM private.edu_aplicar_recargos(v_t);
    IF EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = v_est AND tipo = 'recargo' AND estado <> 'anulado') THEN
      v_ok := v_ok || ' se-creo-recargo';
    END IF;
    IF (v_r->>'debe')::numeric <> 5000 THEN v_ok := v_ok || ' debe=' || (v_r->>'debe'); END IF;

    RAISE EXCEPTION 'DESHACER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER' THEN RAISE EXCEPTION 'La prueba fallo: %', SQLERRM; END IF;
  END;
  IF v_ok <> '' THEN RAISE EXCEPTION 'Prueba de cuenta inicial:%', v_ok; END IF;

  -- (c) la sobrecarga vieja no quedo
  IF to_regprocedure('public.edu_cuenta_inicial(uuid,date[],text[],boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'Quedo la firma vieja de edu_cuenta_inicial.';
  END IF;
END $prueba$;
