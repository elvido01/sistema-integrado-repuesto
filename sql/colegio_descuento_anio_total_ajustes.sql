-- ============================================================
-- COLEGIO: descuento del año completo · ajustes de la revisión (25/11/2026)
-- ============================================================
--  · El servidor fija el monto de cada mes del año completo (monto - su
--    parte del descuento): pagado + descuento = monto exacto.
--  · descuento_base = las mensualidades del año (61,500); el concepto y el
--    recibo muestran el 5% sobre eso, aunque en el mismo cobro vaya otra cosa.
--  · Los estudiantes del año completo tienen que ser de la familia.
--  · Orden de los meses igual que la caja (sin periodo primero).
--  · Máscara de montos hasta mil millones; sin variable sobrante.
--  · Recibos viejos: el % sale de sus propios números, no de la config de hoy.
-- ============================================================

ALTER TABLE public.edu_pagos ADD COLUMN IF NOT EXISTS descuento_base numeric(12,2);

CREATE OR REPLACE FUNCTION public.edu_cobrar(p_familia uuid, p_lineas jsonb, p_formas jsonb, p_tasa numeric DEFAULT NULL::numeric, p_anio_completo uuid[] DEFAULT NULL::uuid[], p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  f public.edu_familias%ROWTYPE;
  cfg public.edu_config%ROWTYPE;
  l jsonb; fp jsonb; g public.edu_cargos%ROWTYPE;
  v_m numeric; v_rd numeric; v_total numeric := 0; v_formas numeric := 0; v_pend numeric; v_desc numeric;
  v_pago uuid; v_num integer; v_recibo uuid; v_recibo_num text; v_cliente uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_bancos integer := 0; v_concepto text; v_desc_pct numeric;
  v_mens_anio integer; v_mens_lineas integer := 0;
  v_anio uuid; v_ac boolean;
  v_mapa jsonb := '{}'::jsonb; v_sub numeric := 0; v_desc_tot numeric := 0; v_desc_rd numeric;
  v_est uuid; v_malo text; v_base numeric := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO f FROM public.edu_familias WHERE id = p_familia AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Familia no encontrada'; END IF;
  SELECT * INTO cfg FROM public.edu_config WHERE tenant_id = v_t;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  v_desc_pct := COALESCE(cfg.descuento_anual_pct, 0);
  -- Recargos al día antes de cobrar (no duplica).
  PERFORM private.edu_aplicar_recargos(v_t);

  -- (25/11/2026) Descuento del año completo: SOLO pagando el año entero.
  -- Ningún mes del año puede estar pagado ni abonado. Se calcula sobre el
  -- TOTAL del año del estudiante (6,150 x 10 = 61,500 - 5% = 58,425) y se
  -- reparte entre los meses para la cuenta; el último mes se lleva el
  -- redondeo, así los meses suman exacto el total con descuento.
  IF COALESCE(cardinality(p_anio_completo), 0) > 0 THEN
    IF v_desc_pct <= 0 THEN RAISE EXCEPTION 'El colegio no tiene descuento por año completo'; END IF;
    -- Los estudiantes del año completo tienen que ser de ESTA familia.
    IF EXISTS (SELECT 1 FROM unnest(p_anio_completo) x(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.edu_estudiantes e
                                   WHERE e.id = x.id AND e.tenant_id = v_t AND e.familia_id = f.id)) THEN
      RAISE EXCEPTION 'Un estudiante del año completo no es de esta familia';
    END IF;
    FOREACH v_est IN ARRAY p_anio_completo LOOP
      SELECT string_agg(c.descripcion, ', ' ORDER BY c.periodo) INTO v_malo
        FROM public.edu_cargos c
       WHERE c.tenant_id = v_t AND c.estudiante_id = v_est AND c.anio_id = v_anio AND c.tipo = 'mensualidad'
         AND c.estado <> 'anulado' AND (c.pagado > 0 OR c.descuento > 0 OR c.estado <> 'pendiente');
      IF v_malo IS NOT NULL THEN
        RAISE EXCEPTION 'El descuento es solo pagando el año completo y ya tiene pagado: %', v_malo;
      END IF;
    END LOOP;
    SELECT COALESCE(jsonb_object_agg(s.id::text, s.d), '{}'::jsonb) INTO v_mapa FROM (
      SELECT c.id,
             CASE WHEN row_number() OVER w = count(*) OVER (PARTITION BY c.estudiante_id)
                  THEN round(sum(c.monto) OVER (PARTITION BY c.estudiante_id) * v_desc_pct / 100.0, 2)
                       - COALESCE(sum(round(c.monto * v_desc_pct / 100.0, 2)) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
                  ELSE round(c.monto * v_desc_pct / 100.0, 2) END AS d
        FROM public.edu_cargos c
       WHERE c.tenant_id = v_t AND c.estudiante_id = ANY(p_anio_completo) AND c.anio_id = v_anio
         AND c.tipo = 'mensualidad' AND c.estado <> 'anulado'
      WINDOW w AS (PARTITION BY c.estudiante_id ORDER BY c.periodo NULLS FIRST, c.id)) s;
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'No hay nada que cobrar'; END IF;
  IF jsonb_typeof(p_formas) <> 'array' OR jsonb_array_length(p_formas) = 0 THEN RAISE EXCEPTION 'Falta la forma de pago'; END IF;

  -- Número del recibo del colegio
  PERFORM pg_advisory_xact_lock(hashtext('edu_pago:' || v_t::text));
  SELECT COALESCE(max(numero), 0) + 1 INTO v_num FROM public.edu_pagos WHERE tenant_id = v_t;

  INSERT INTO public.edu_pagos (tenant_id, numero, fecha, familia_id, total, formas_pago, tasa_usd, anio_completo, notas)
  VALUES (v_t, v_num, v_hoy, f.id, 1, p_formas, p_tasa, COALESCE(cardinality(p_anio_completo), 0) > 0, NULLIF(btrim(p_notas), ''))
  RETURNING id INTO v_pago;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT c.* INTO g FROM public.edu_cargos c
      JOIN public.edu_estudiantes e ON e.id = c.estudiante_id
     WHERE c.id = (l->>'cargo_id')::uuid AND c.tenant_id = v_t AND e.familia_id = f.id
     FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un cargo no es de esta familia'; END IF;
    IF private.edu_ficha_incompleta(g.estudiante_id) THEN
      RAISE EXCEPTION '%: estudiante no tiene tarifa seleccionada. No se le puede cobrar hasta que completen su ficha en Estudiantes.', (SELECT nombres || ' ' || apellidos FROM public.edu_estudiantes WHERE id = g.estudiante_id);
    END IF;
    IF g.estado IN ('pagado','anulado') THEN RAISE EXCEPTION '% ya está pagado', g.descripcion; END IF;
    v_m := round((l->>'monto')::numeric, 2);
    IF v_m IS NULL OR v_m <= 0 THEN RAISE EXCEPTION 'Monto no válido en %', g.descripcion; END IF;

    -- Año completo: las mensualidades del año ACTUAL llevan el descuento y se saldan enteras.
    v_ac := g.tipo = 'mensualidad' AND g.anio_id = v_anio AND g.estudiante_id = ANY(COALESCE(p_anio_completo, '{}'));
    v_desc := 0;
    IF v_ac THEN
      IF g.pagado > 0 THEN RAISE EXCEPTION 'El año completo es con las mensualidades sin abonar (% tiene abono)', g.descripcion; END IF;
      v_desc := COALESCE((v_mapa->>g.id::text)::numeric, 0);
      IF abs(v_m - (g.monto - v_desc)) > 0.01 THEN RAISE EXCEPTION 'El año completo de % es %', g.descripcion, g.monto - v_desc; END IF;
      v_m := g.monto - v_desc;   -- cuadra exacto: pagado + descuento = monto
      v_mens_lineas := v_mens_lineas + 1;
    END IF;

    v_pend := g.monto - g.descuento - v_desc - g.pagado;
    IF v_m > v_pend + 0.01 THEN RAISE EXCEPTION '% pendiente es %, no %', g.descripcion, v_pend, v_m; END IF;
    -- Mensualidad: el mes completo o la mitad (regla del colegio), nada de abonos sueltos.
    IF g.tipo = 'mensualidad' AND NOT v_ac AND abs(v_m - v_pend) > 0.01 THEN
      IF NOT COALESCE(cfg.permite_medio_mes, false) OR g.pagado > 0 OR abs(v_m - round(g.monto / 2.0, 2)) > 0.01 THEN
        RAISE EXCEPTION '% se paga completa (%)%', g.descripcion, v_pend,
          CASE WHEN COALESCE(cfg.permite_medio_mes, false) AND g.pagado = 0 THEN ' o la mitad (' || round(g.monto / 2.0, 2) || ')' ELSE '' END;
      END IF;
    END IF;

    IF g.moneda = 'USD' THEN
      IF p_tasa IS NULL OR p_tasa <= 0 THEN RAISE EXCEPTION 'Falta la tasa del dólar para %', g.descripcion; END IF;
      v_rd := round(v_m * p_tasa, 2);
    ELSE
      v_rd := v_m;
    END IF;
    v_desc_rd := CASE WHEN g.moneda = 'USD' THEN round(v_desc * p_tasa, 2) ELSE v_desc END;

    INSERT INTO public.edu_pago_lineas (tenant_id, pago_id, cargo_id, estudiante_id, descripcion, moneda, monto_moneda, monto, descuento)
    VALUES (v_t, v_pago, g.id, g.estudiante_id, g.descripcion, g.moneda, v_m, v_rd, v_desc_rd);

    UPDATE public.edu_cargos
       SET pagado = pagado + v_m,
           descuento = descuento + v_desc,
           estado = CASE WHEN pagado + v_m >= monto - descuento - v_desc - 0.01 THEN 'pagado' ELSE 'parcial' END
     WHERE id = g.id;
    v_total := v_total + v_rd;
    v_sub := v_sub + v_rd + v_desc_rd;
    v_desc_tot := v_desc_tot + v_desc_rd;
    IF v_ac THEN v_base := v_base + v_rd + v_desc_rd; END IF;
  END LOOP;

  -- El año completo tiene que incluir todas las mensualidades pendientes del año actual del estudiante.
  IF COALESCE(cardinality(p_anio_completo), 0) > 0 THEN
    IF v_mens_lineas = 0 THEN RAISE EXCEPTION 'El año completo necesita las mensualidades del año actual'; END IF;
    SELECT count(*) INTO v_mens_anio
      FROM public.edu_cargos c
     WHERE c.tenant_id = v_t AND c.tipo = 'mensualidad' AND c.estado IN ('pendiente','parcial')
       AND c.anio_id = v_anio AND c.estudiante_id = ANY(p_anio_completo);
    IF v_mens_anio > 0 THEN RAISE EXCEPTION 'Para el descuento del año completo hay que pagar todas las mensualidades pendientes'; END IF;
  END IF;

  -- Formas de pago = total
  FOR fp IN SELECT * FROM jsonb_array_elements(p_formas) LOOP
    IF COALESCE((fp->>'monto')::numeric, 0) < 0 THEN RAISE EXCEPTION 'Forma de pago con monto negativo'; END IF;
    v_formas := v_formas + COALESCE((fp->>'monto')::numeric, 0);
    IF NULLIF(fp->>'cuenta_id', '') IS NOT NULL THEN
      v_bancos := v_bancos + 1;
      IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE id = (fp->>'cuenta_id')::uuid AND tenant_id = v_t) THEN
        RAISE EXCEPTION 'La cuenta bancaria no es de este colegio';
      END IF;
    END IF;
  END LOOP;
  IF abs(v_formas - v_total) > 0.01 THEN RAISE EXCEPTION 'Las formas de pago (%) no suman el total (%)', v_formas, v_total; END IF;
  IF v_bancos > 1 THEN RAISE EXCEPTION 'Una transferencia por cobro (una sola cuenta bancaria)'; END IF;

  -- Cliente de la familia (para el recibo de ingreso y la factura con crédito fiscal)
  v_cliente := f.cliente_id;
  IF v_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cliente AND tenant_id = v_t) THEN
    INSERT INTO public.clientes (tenant_id, nombre, telefono)
    VALUES (v_t, left(COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, ''), 'Familia ' || f.nombre)
                      || ' (Fam. ' || f.nombre || ')', 160),
            COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, '')))
    RETURNING id INTO v_cliente;
    UPDATE public.edu_familias SET cliente_id = v_cliente WHERE id = f.id;
  END IF;

  -- Recibo de ingreso normal → Cierre de Caja y reporte del día lo cuentan solos.
  SELECT string_agg(DISTINCT descripcion, ', ') INTO v_concepto FROM public.edu_pago_lineas WHERE pago_id = v_pago;
  v_recibo_num := public.get_next_recibo_ingreso_numero();
  INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen)
  VALUES (v_t, v_recibo_num, v_cliente, v_hoy, v_total,
          left('Colegio RC-' || lpad(v_num::text, 6, '0') || ': '
               || CASE WHEN v_desc_tot > 0 THEN 'Año completo RD$' || to_char(v_base, 'FM999,999,999,990.00')
                    || ' - ' || trim_scale(v_desc_pct)::text || '% (' || to_char(v_desc_tot, 'FM999,999,999,990.00')
                    || ') = ' || to_char(v_base - v_desc_tot, 'FM999,999,999,990.00') || ' · ' ELSE '' END
               || COALESCE(v_concepto, ''), 500),
          p_formas, auth.uid(), 'colegio')
  RETURNING id INTO v_recibo;

  -- La transferencia entra en su cuenta bancaria.
  FOR fp IN SELECT * FROM jsonb_array_elements(p_formas) LOOP
    IF NULLIF(fp->>'cuenta_id', '') IS NOT NULL AND COALESCE((fp->>'monto')::numeric, 0) > 0 THEN
      PERFORM public.registrar_movimiento_bancario((fp->>'cuenta_id')::uuid, 'ENTRADA', (fp->>'monto')::numeric,
        'Colegio RC-' || lpad(v_num::text, 6, '0') || ' · ' || f.nombre, NULLIF(fp->>'referencia', ''), 'recibo', v_recibo, v_hoy);
    END IF;
  END LOOP;

  UPDATE public.edu_pagos SET total = v_total, recibo_ingreso_id = v_recibo,
         subtotal = v_sub, descuento = v_desc_tot, descuento_pct = CASE WHEN v_desc_tot > 0 THEN v_desc_pct END,
         descuento_base = CASE WHEN v_desc_tot > 0 THEN v_base END
   WHERE id = v_pago;
  RETURN jsonb_build_object('pago_id', v_pago, 'numero', v_num, 'total', v_total, 'recibo_ingreso', v_recibo_num,
                            'subtotal', v_sub, 'descuento', v_desc_tot);
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- Recibos de año completo ya hechos: base y % desde sus propias líneas.
UPDATE public.edu_pagos p SET descuento_base = s.base,
       descuento_pct = round(s.des / NULLIF(s.base, 0) * 100, 2)
  FROM (SELECT pago_id, sum(monto + descuento) FILTER (WHERE descuento > 0) base, sum(descuento) des
          FROM public.edu_pago_lineas GROUP BY pago_id) s
 WHERE s.pago_id = p.id AND p.descuento > 0;

DO $prueba$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  v_anio uuid; v_fam uuid; v_fam2 uuid; v_e1 uuid; v_e2 uuid; v_ex uuid; r jsonb; v_lin jsonb; v_ri text; i int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb', 'role', 'authenticated')::text, true);
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  UPDATE public.edu_config SET descuento_anual_pct = 5 WHERE tenant_id = v_t;

  INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA DESC 2') RETURNING id INTO v_fam;
  INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA OTRA') RETURNING id INTO v_fam2;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam, 990011, 'Uno', 'Prueba', 6150, 'activo') RETURNING id INTO v_e1;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam, 990012, 'Dos', 'Prueba', 5120.50, 'activo') RETURNING id INTO v_e2;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam2, 990013, 'Ajeno', 'Prueba', 6150, 'activo') RETURNING id INTO v_ex;
  DELETE FROM public.edu_cargos WHERE estudiante_id IN (v_e1, v_e2, v_ex);
  FOR i IN 0..9 LOOP
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, tipo, descripcion, monto_bruto, monto, periodo)
    VALUES (v_t, v_e1, v_anio, 'mensualidad', 'Mes ' || i, 6150, 6150, date '2026-09-01' + make_interval(months => i)),
           (v_t, v_e2, v_anio, 'mensualidad', 'Mes ' || i, 5120.50, 5120.50, date '2026-09-01' + make_interval(months => i)),
           (v_t, v_ex, v_anio, 'mensualidad', 'Mes ' || i, 6150, 6150, date '2026-09-01' + make_interval(months => i));
  END LOOP;
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, tipo, descripcion, monto_bruto, monto)
  VALUES (v_t, v_e1, v_anio, 'inscripcion', 'Inscripción', 10000, 10000);

  -- Año completo + inscripción en el mismo cobro: el 5% es sobre 61,500
  SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', CASE WHEN tipo = 'mensualidad' THEN 5842.50 ELSE 10000 END)) INTO v_lin
    FROM public.edu_cargos WHERE estudiante_id = v_e1 AND tipo IN ('mensualidad', 'inscripcion');
  r := public.edu_cobrar(v_fam, v_lin, '[{"forma":"efectivo","monto":68425}]'::jsonb, NULL, ARRAY[v_e1]);
  SELECT concepto INTO v_ri FROM public.recibos_ingreso WHERE numero = r->>'recibo_ingreso' AND tenant_id = v_t;
  IF v_ri NOT LIKE '%Año completo RD$61,500.00 - 5% (3,075.00) = 58,425.00%' THEN RAISE EXCEPTION 'Concepto: %', v_ri; END IF;
  IF (SELECT descuento_base FROM public.edu_pagos WHERE id = (r->>'pago_id')::uuid) <> 61500 THEN RAISE EXCEPTION 'Base'; END IF;

  -- 5,120.50 x 10 = 51,205 x 5% = 2,560.25; por mes 256.03 (x9) y el último 255.98. El cliente manda un centavo
  -- de diferencia y el servidor deja el mes cuadrado exacto.
  SELECT jsonb_agg(jsonb_build_object('cargo_id', id,
           'monto', CASE WHEN periodo = date '2027-06-01' THEN 5120.50 - 255.98 ELSE 5120.50 - 256.02 END)) INTO v_lin
    FROM public.edu_cargos WHERE estudiante_id = v_e2 AND tipo = 'mensualidad';
  r := public.edu_cobrar(v_fam, v_lin, '[{"forma":"efectivo","monto":48644.75}]'::jsonb, NULL, ARRAY[v_e2]);
  IF (r->>'total')::numeric <> 48644.75 OR (r->>'descuento')::numeric <> 2560.25 THEN RAISE EXCEPTION 'Centavos: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = v_e2 AND tipo = 'mensualidad'
              AND (estado <> 'pagado' OR pagado + descuento <> monto)) THEN RAISE EXCEPTION 'Mes descuadrado'; END IF;

  -- Estudiante de otra familia: no
  BEGIN
    PERFORM public.edu_cobrar(v_fam, (SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', 6150))
                                        FROM public.edu_cargos WHERE estudiante_id = v_e1 AND tipo = 'recargo'),
                              '[{"forma":"efectivo","monto":1}]'::jsonb, NULL, ARRAY[v_ex]);
    RAISE EXCEPTION 'Aceptó otra familia';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Un estudiante del año completo no es de esta familia' THEN RAISE EXCEPTION 'Otro error: %', SQLERRM; END IF;
  END;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('colegio_descuento_anio_total_ajustes.sql');
