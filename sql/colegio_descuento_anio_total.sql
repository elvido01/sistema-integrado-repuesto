-- ============================================================
-- COLEGIO: DESCUENTO DEL AÑO COMPLETO SOBRE EL TOTAL (25/11/2026)
-- ============================================================
-- Pedido del colegio: el padre que paga el año completo
--   6,150 x 10 meses = 61,500 - 5% = 58,425
-- y el recibo debe mostrar el descuento sobre la TOTALIDAD (subtotal,
-- descuento 5%, total), no mes por mes. Y el descuento solo vale pagando
-- el año entero: si ya pagó o abonó algún mes del año, no hay descuento.
--  · edu_pago_lineas.descuento: lo rebajado en esa línea (monto sigue
--    siendo lo cobrado: los reportes no cambian).
--  · edu_pagos.subtotal / descuento / descuento_pct para el recibo.
--  · El recibo de ingreso lleva el cálculo en el concepto.
-- Base: la edu_cobrar de producción del 25/11 (misma firma).
-- ============================================================

ALTER TABLE public.edu_pago_lineas ADD COLUMN IF NOT EXISTS descuento numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.edu_pagos ADD COLUMN IF NOT EXISTS subtotal numeric(12,2);
ALTER TABLE public.edu_pagos ADD COLUMN IF NOT EXISTS descuento numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.edu_pagos ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2);

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
  v_est uuid; v_malo text; v_ord bigint;
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
      WINDOW w AS (PARTITION BY c.estudiante_id ORDER BY c.periodo, c.id)) s;
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
               || CASE WHEN v_desc_tot > 0 THEN 'Año completo RD$' || to_char(v_sub, 'FM999,999,990.00')
                    || ' - ' || trim_scale(v_desc_pct)::text || '% (' || to_char(v_desc_tot, 'FM999,999,990.00')
                    || ') = ' || to_char(v_total, 'FM999,999,990.00') || ' · ' ELSE '' END
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
         subtotal = v_sub, descuento = v_desc_tot, descuento_pct = CASE WHEN v_desc_tot > 0 THEN v_desc_pct END
   WHERE id = v_pago;
  RETURN jsonb_build_object('pago_id', v_pago, 'numero', v_num, 'total', v_total, 'recibo_ingreso', v_recibo_num,
                            'subtotal', v_sub, 'descuento', v_desc_tot);
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- Los cobros de año completo que ya se hicieron: el descuento de cada mes
-- estaba en el cargo; se pasa a la línea y al recibo (para reimprimir igual).
UPDATE public.edu_pago_lineas l SET descuento = c.descuento
  FROM public.edu_pagos p, public.edu_cargos c
 WHERE p.id = l.pago_id AND c.id = l.cargo_id AND p.anio_completo AND NOT p.anulado
   AND c.tipo = 'mensualidad' AND c.descuento > 0 AND l.descuento = 0;
UPDATE public.edu_pagos p SET subtotal = s.sub, descuento = s.des,
       descuento_pct = (SELECT descuento_anual_pct FROM public.edu_config WHERE tenant_id = p.tenant_id)
  FROM (SELECT pago_id, sum(monto + descuento) sub, sum(descuento) des FROM public.edu_pago_lineas GROUP BY pago_id) s
 WHERE s.pago_id = p.id AND p.anio_completo AND s.des > 0 AND p.subtotal IS NULL;

-- PRUEBA con una familia inventada en el colegio; todo se deshace.
DO $prueba$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  v_anio uuid; v_fam uuid; v_e1 uuid; v_e2 uuid; v_e3 uuid; r jsonb; v_lin jsonb; v_ri text; v_pct numeric;
  i int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb', 'role', 'authenticated')::text, true);
  IF public.get_user_tenant() IS DISTINCT FROM v_t THEN RAISE EXCEPTION 'El usuario de prueba no está en el colegio'; END IF;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  -- La prueba usa 5% (lo que tiene el colegio); se fija por si cambió.
  UPDATE public.edu_config SET descuento_anual_pct = 5 WHERE tenant_id = v_t;

  INSERT INTO public.edu_familias (tenant_id, nombre) VALUES (v_t, 'PRUEBA DESCUENTO') RETURNING id INTO v_fam;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam, 990001, 'Uno', 'Prueba', 6150, 'activo') RETURNING id INTO v_e1;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam, 990002, 'Dos', 'Prueba', 6333.33, 'activo') RETURNING id INTO v_e2;
  INSERT INTO public.edu_estudiantes (tenant_id, familia_id, matricula, nombres, apellidos, tarifa_mensual, estado)
  VALUES (v_t, v_fam, 990003, 'Tres', 'Prueba', 6150, 'activo') RETURNING id INTO v_e3;
  DELETE FROM public.edu_cargos WHERE estudiante_id IN (v_e1, v_e2, v_e3);
  FOR i IN 0..9 LOOP
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, tipo, descripcion, monto_bruto, monto, periodo)
    VALUES (v_t, v_e1, v_anio, 'mensualidad', 'Mes ' || i, 6150, 6150, date '2026-09-01' + make_interval(months => i)),
           (v_t, v_e2, v_anio, 'mensualidad', 'Mes ' || i, 6333.33, 6333.33, date '2026-09-01' + make_interval(months => i)),
           (v_t, v_e3, v_anio, 'mensualidad', 'Mes ' || i, 6150, 6150, date '2026-09-01' + make_interval(months => i));
  END LOOP;

  -- 1) El caso del colegio: 61,500 - 5% = 58,425
  SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', 5842.50)) INTO v_lin
    FROM public.edu_cargos WHERE estudiante_id = v_e1 AND tipo = 'mensualidad';
  r := public.edu_cobrar(v_fam, v_lin, '[{"forma":"efectivo","monto":58425}]'::jsonb, NULL, ARRAY[v_e1]);
  IF (r->>'total')::numeric <> 58425 OR (r->>'subtotal')::numeric <> 61500 OR (r->>'descuento')::numeric <> 3075 THEN
    RAISE EXCEPTION 'Caso 61,500: %', r;
  END IF;
  SELECT concepto INTO v_ri FROM public.recibos_ingreso WHERE numero = r->>'recibo_ingreso' AND tenant_id = v_t;
  IF v_ri NOT LIKE '%Año completo RD$61,500.00 - 5% (3,075.00) = 58,425.00%' THEN RAISE EXCEPTION 'Concepto: %', v_ri; END IF;
  IF EXISTS (SELECT 1 FROM public.edu_cargos WHERE estudiante_id = v_e1 AND tipo = 'mensualidad' AND estado <> 'pagado') THEN RAISE EXCEPTION 'Quedaron meses sin saldar'; END IF;

  -- 2) Tarifa con centavos: el descuento es sobre el total (63,333.30 x 5% = 3,166.67), el último mes redondea
  SELECT jsonb_agg(jsonb_build_object('cargo_id', id,
           'monto', CASE WHEN periodo = date '2027-06-01' THEN 6333.33 - 316.64 ELSE 6333.33 - 316.67 END)) INTO v_lin
    FROM public.edu_cargos WHERE estudiante_id = v_e2 AND tipo = 'mensualidad';
  r := public.edu_cobrar(v_fam, v_lin, '[{"forma":"efectivo","monto":60166.63}]'::jsonb, NULL, ARRAY[v_e2]);
  IF (r->>'descuento')::numeric <> 3166.67 OR (r->>'total')::numeric <> 60166.63 THEN RAISE EXCEPTION 'Centavos: %', r; END IF;

  -- 3) Con un mes ya pagado: sin descuento
  PERFORM public.edu_cobrar(v_fam, (SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', 6150))
                                      FROM public.edu_cargos WHERE estudiante_id = v_e3 AND tipo = 'mensualidad' AND periodo = date '2026-09-01'),
                            '[{"forma":"efectivo","monto":6150}]'::jsonb);
  BEGIN
    PERFORM public.edu_cobrar(v_fam, (SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', 5842.50))
                                        FROM public.edu_cargos WHERE estudiante_id = v_e3 AND tipo = 'mensualidad' AND estado = 'pendiente'),
                              '[{"forma":"efectivo","monto":52582.50}]'::jsonb, NULL, ARRAY[v_e3]);
    RAISE EXCEPTION 'Dio descuento con un mes pagado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Dio descuento con un mes pagado' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'El descuento es solo pagando el año completo%' THEN RAISE EXCEPTION 'Otro error: %', SQLERRM; END IF;
  END;

  -- 4) Un cobro normal no lleva descuento
  r := public.edu_cobrar(v_fam, (SELECT jsonb_agg(jsonb_build_object('cargo_id', id, 'monto', 6150))
                                   FROM public.edu_cargos WHERE estudiante_id = v_e3 AND tipo = 'mensualidad' AND periodo = date '2026-10-01'),
                         '[{"forma":"efectivo","monto":6150}]'::jsonb);
  IF (r->>'descuento')::numeric <> 0 OR (r->>'subtotal')::numeric <> 6150 THEN RAISE EXCEPTION 'Normal: %', r; END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('colegio_descuento_anio_total.sql');
