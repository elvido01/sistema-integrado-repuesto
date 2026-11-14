-- =====================================================================
-- Ayudante contable: textos de "compras a mano" al día (14/11/2026)
-- ---------------------------------------------------------------------
-- Compras ya guarda el tipo de retención de ISR y el NCF que modifica (nota
-- de débito): sql/compras_nota_y_retencion_606.sql. Los avisos de
-- "Pague menos" y de la Hoja del IT-1 decían que MotoFlow no los guardaba;
-- ahora dicen dónde completarlos. La nota de CRÉDITO del suplidor sigue a
-- mano en la herramienta de la DGII (no se graba en Compras: subiría el
-- inventario y la deuda). Solo cambian textos; generado desde producción.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._contab_recomendaciones(p_tenant uuid, p_anio integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
  v_ant date := (make_date(p_anio, p_mes, 1) - interval '1 month')::date;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_rnc text; v_fisica boolean; v_exenta boolean;
  v_nota_exenta CONSTANT text := ' En una financiera los intereses están exentos de ITBIS, así que el ITBIS de sus compras no se resta en el IT-1: va al costo. El comprobante sí hace falta para que el gasto baje el Impuesto sobre la Renta.';
  v_items jsonb := '[]'::jsonb;
  v_n int; v_m numeric; v_i numeric; v_txt text;
  v_saldo numeric; v_favor_ant numeric; v_anio_perdido numeric;
  fm CONSTANT text := 'FM999,999,990.00';
BEGIN
  SELECT regexp_replace(COALESCE(ce.rnc, ''), '\D', '', 'g'), COALESCE(ce.tipo_negocio, '') = 'financiera'
    INTO v_rnc, v_exenta FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant;
  v_fisica := length(v_rnc) = 11;
  v_exenta := COALESCE(v_exenta, false);   -- financiera: ventas exentas, el ITBIS de compras no se deduce

  -- 1. Facturas de consumo: el ITBIS pagado no se puede restar.
  SELECT count(*), COALESCE(sum(k.itbis), 0) INTO v_n, v_i
    FROM public._contab_compras_606(p_tenant, v_ini, v_fin) k WHERE k.motivo = 'consumo';
  IF v_n > 0 THEN
    -- Los suplidores que más lo hacen, mirando tres meses.
    SELECT string_agg(format('%s (RD$ %s)', x.proveedor, to_char(x.itbis, fm)), ', ' ORDER BY x.itbis DESC) INTO v_txt
      FROM (SELECT COALESCE(NULLIF(btrim(k.proveedor), ''), 'sin nombre') AS proveedor, sum(k.itbis) AS itbis
              FROM public._contab_compras_606(p_tenant, (v_ini - interval '2 months')::date, v_fin) k
             WHERE k.motivo = 'consumo' GROUP BY 1 ORDER BY 2 DESC LIMIT 3) x;
    v_items := v_items || jsonb_build_object(
      'clave', 'consumo', 'tipo', CASE WHEN v_exenta THEN 'evaluar' ELSE 'ahorro' END,
      'ahorro', CASE WHEN v_exenta THEN NULL ELSE round(v_i, 2) END, 'estimado', false,
      'titulo', 'Pida factura de crédito fiscal, no de consumo',
      'detalle', CASE WHEN v_exenta
                   THEN format('%s compra(s) del mes llegaron con factura de consumo (B02 o E32), que no va en el 606.', v_n) || v_nota_exenta
                   ELSE format('%s compra(s) del mes llegaron con factura de consumo (B02 o E32). Usted pagó ese ITBIS, pero con esa factura no lo puede restar.', v_n)
                        || COALESCE(' En los últimos tres meses, donde más: ' || v_txt || '.', '') END,
      'que_hacer', 'Antes de pagar, dé su RNC o cédula y pida factura de crédito fiscal (B01 o E31). Para las de este mes, pídale al suplidor que la cambie y corrija el NCF en la compra.',
      'panel', 'reportes-dgii',
      'base', 'Código Tributario, arts. 346 y 347: el ITBIS de las compras se deduce si está sustentado en un comprobante válido para crédito fiscal.');
  END IF;

  -- 2. Compras con datos incompletos: el ITBIS no entra hasta completarlos.
  SELECT count(*), COALESCE(sum(k.itbis), 0),
         concat_ws('; ',
           CASE WHEN count(*) FILTER (WHERE k.motivo = 'sin_ncf') > 0 THEN count(*) FILTER (WHERE k.motivo = 'sin_ncf') || ' sin NCF' END,
           CASE WHEN count(*) FILTER (WHERE k.motivo = 'ncf_mal') > 0 THEN count(*) FILTER (WHERE k.motivo = 'ncf_mal') || ' con el NCF mal escrito' END,
           CASE WHEN count(*) FILTER (WHERE k.motivo = 'rnc') > 0 THEN count(*) FILTER (WHERE k.motivo = 'rnc') || ' de suplidores sin RNC en la ficha' END,
           CASE WHEN count(*) FILTER (WHERE k.motivo IN ('tipo', 'rnc_empresa')) > 0 THEN count(*) FILTER (WHERE k.motivo IN ('tipo', 'rnc_empresa')) || ' con otro dato por revisar' END)
    INTO v_n, v_i, v_txt
    FROM public._contab_compras_606(p_tenant, v_ini, v_fin) k
   WHERE k.motivo IN ('sin_ncf', 'ncf_mal', 'rnc', 'tipo', 'rnc_empresa');
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'incompletas', 'tipo', CASE WHEN v_exenta THEN 'evaluar' ELSE 'ahorro' END,
      'ahorro', CASE WHEN v_exenta THEN NULL ELSE round(v_i, 2) END, 'estimado', false,
      'titulo', 'Complete los datos de las compras que no entran al 606',
      'detalle', format('%s compra(s) están fuera del 606: %s. Mientras sigan así, %s', v_n, v_txt,
                        CASE WHEN v_exenta THEN 'el gasto no se le reconoce para el Impuesto sobre la Renta.'
                             ELSE 'su ITBIS no se resta y el gasto tampoco se le reconoce para el Impuesto sobre la Renta.' END),
      'que_hacer', 'Las que tienen NCF salen en Reportes DGII (escoja este mes), pestaña 606, en el cuadro «No van», cada una con lo que le falta. Las que no tienen NCF búsquelas en Compras, en las fechas del mes, y escríbales el NCF de la factura; si de verdad no tiene comprobante, pídalo. El RNC se corrige en la ficha del suplidor.',
      'panel', 'reportes-dgii',
      'base', 'Norma General 07-2018 (formato 606) y Código Tributario, art. 287: los gastos se deducen si están documentados.');
  END IF;

  -- 2b. Notas de crédito/débito y compras con retención de ISR: van a mano.
  SELECT count(*) INTO v_n FROM public._contab_compras_606(p_tenant, v_ini, v_fin) k WHERE k.motivo IN ('nota', 'ret_isr');
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'a_mano', 'tipo', 'evaluar', 'ahorro', NULL, 'estimado', false,
      'titulo', 'Compras que se agregan a mano al 606',
      'detalle', format('%s compra(s) del mes son notas de crédito o débito de suplidores, o tienen retención de ISR. Les falta el NCF que modifican (notas) o el tipo de retención, así que no salen en el TXT.', v_n),
      'que_hacer', 'Retención de ISR o nota de débito: complete el dato en la compra y vuelva a generar el 606. Nota de crédito del suplidor: agréguela en la herramienta de la DGII. Si se quedan fuera, pierde el ITBIS de esas compras (o deja de restar una nota de crédito, que la DGII sí conoce).',
      'panel', 'reportes-dgii', 'base', 'Norma General 07-2018, formato 606: columnas 5 (NCF modificado) y 17 (tipo de retención).');
  END IF;

  -- 3. Comprobantes de gastos esperando revisión.
  SELECT count(*), COALESCE(sum(g.itbis), 0) INTO v_n, v_i
    FROM public.gastos_comprobantes g
   WHERE g.tenant_id = p_tenant AND g.fecha >= v_ini AND g.fecha < v_fin AND g.estado = 'por_revisar' AND g.entra_606;
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'por_revisar', 'tipo', CASE WHEN v_exenta THEN 'evaluar' ELSE 'ahorro' END,
      'ahorro', CASE WHEN v_exenta THEN NULL ELSE round(v_i, 2) END, 'estimado', false,
      'titulo', 'Apruebe los comprobantes de gastos pendientes',
      'detalle', format('Hay %s foto(s) de facturas de gastos «por revisar» que sí dan crédito. Hasta que las apruebe no entran al 606.', v_n),
      'que_hacer', 'Ábralas, compare los datos con la foto y apruébelas.',
      'panel', 'comprobantes-gastos', 'base', NULL);
  END IF;

  -- 4. Gastos diarios sin comprobante.
  SELECT count(*), COALESCE(sum(g.monto), 0) INTO v_n, v_m
    FROM public.gastos_diarios g
   WHERE g.tenant_id = p_tenant AND g.fecha >= v_ini AND g.fecha < v_fin AND NOT COALESCE(g.anulado, false)
     AND NOT COALESCE(g.es_tercero, false) AND COALESCE(g.tipo_gasto, '') NOT IN ('Nomina', 'Terceros')
     -- (14/11) El gasto que ya tiene su comprobante unido no cuenta como "sin comprobante".
     AND NOT EXISTS (SELECT 1 FROM public.gastos_comprobantes gcx WHERE gcx.gasto_id = g.id AND gcx.estado <> 'descartado');
  -- No hay vínculo entre un gasto diario y su comprobante: se resta el total
  -- de los comprobantes de gastos del mes (aprobados o por revisar) para no
  -- contar como "sin comprobante" lo que ya se documentó.
  v_m := GREATEST(v_m - COALESCE((SELECT sum(gc.total) FROM public.gastos_comprobantes gc
                                   WHERE gc.tenant_id = p_tenant AND gc.fecha >= v_ini AND gc.fecha < v_fin
                                     AND gc.estado IN ('aprobado', 'por_revisar')
                                     AND gc.gasto_id IS NULL), 0), 0);   -- los unidos a un gasto ya se excluyeron arriba
  IF v_n > 0 AND v_m >= 1 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'gastos', 'tipo', CASE WHEN v_exenta THEN 'evaluar' ELSE 'ahorro' END,
      'ahorro', CASE WHEN v_exenta THEN NULL ELSE round(v_m * 18 / 118, 2) END, 'estimado', NOT v_exenta,
      'titulo', 'Documente los gastos del día a día',
      'detalle', CASE WHEN v_exenta
                   THEN format('De los %s gasto(s) diarios del mes, unos RD$ %s no tienen comprobante fiscal registrado.', v_n, to_char(v_m, fm)) || v_nota_exenta
                   ELSE format('De los %s gasto(s) diarios del mes, unos RD$ %s no tienen comprobante fiscal registrado. Si todos llevaran ITBIS, serían hasta RD$ %s que podría restar; y sin comprobante tampoco bajan su Impuesto sobre la Renta.',
                               v_n, to_char(v_m, fm), to_char(v_m * 18 / 118, fm)) END,
      'que_hacer', 'Gasto con factura (combustible, supermercado, luz, teléfono, alquiler): pídala con NCF a su nombre y súbale la foto. Gasto pequeño sin factura (parqueo, mensajería, propinas): solicite a la DGII la secuencia de Comprobante de Gastos Menores (B13); no da ITBIS, pero el gasto cuenta para la renta. Compra a una persona que no es contribuyente: Comprobante de Compras (B11).',
      'panel', 'comprobantes-gastos',
      'base', 'Reglamento 254-06 de comprobantes fiscales (gastos menores y comprobante de compras); Código Tributario, art. 287.');
  END IF;

  -- 5. Saldo a favor del mes anterior sin usar.
  SELECT COALESCE((SELECT cp.saldo_favor_anterior FROM public.contab_periodos cp
                    WHERE cp.tenant_id = p_tenant AND cp.anio = p_anio AND cp.mes = p_mes), 0) INTO v_saldo;
  IF v_saldo = 0 AND NOT v_exenta THEN
    SELECT COALESCE((SELECT sum(k.itbis)
                       FROM public._contab_compras_606(p_tenant, v_ant, v_ini) k WHERE k.motivo = 'ok'), 0)
         + COALESCE((SELECT cp.saldo_favor_anterior FROM public.contab_periodos cp
                      WHERE cp.tenant_id = p_tenant AND cp.anio = extract(year FROM v_ant)::int AND cp.mes = extract(month FROM v_ant)::int), 0)
         - COALESCE((SELECT sum(v.itbis - v.itbis_retenido) FROM public._contab_ventas_607(p_tenant, v_ant, v_ini) v), 0)
         + COALESCE((SELECT sum(dv.itbis_total) FROM public.devoluciones dv
                      WHERE dv.tenant_id = p_tenant AND dv.fecha_devolucion >= v_ant AND dv.fecha_devolucion < v_ini
                        AND COALESCE(btrim(dv.ncf_modificado), '') <> ''), 0)
      INTO v_favor_ant;
    IF v_favor_ant > 1 THEN
      v_items := v_items || jsonb_build_object(
        'clave', 'saldo', 'tipo', 'ahorro', 'ahorro', round(v_favor_ant, 2), 'estimado', true,
        'titulo', 'Use el saldo a favor del mes pasado',
        'detalle', format('Según MotoFlow, el mes anterior le quedaron unos RD$ %s a favor, y este mes no tiene saldo a favor escrito. Ese monto se resta del ITBIS de este mes (casilla 29 del IT-1).', to_char(v_favor_ant, fm)),
        'que_hacer', 'Confirme el monto en su último IT-1 presentado (casilla «nuevo saldo a favor») y escríbalo en el Resumen de este mes.',
        'panel', 'mi-contabilidad',
        'base', 'Código Tributario, art. 350: el exceso de ITBIS pagado se traslada a los meses siguientes.');
    END IF;
  END IF;

  -- 6. Compromisos vencidos sin marcar: recargos e intereses.
  SELECT count(*), string_agg(split_part(q.nombre, ' · ', 1), ', ' ORDER BY q.vence) INTO v_n, v_txt
    FROM public._contab_compromisos(p_tenant, p_anio, p_mes) q
   WHERE NOT q.hecho AND q.vence < v_hoy AND NOT q.confirmar AND q.clave <> '608';
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'vencidos', 'tipo', 'riesgo', 'ahorro', NULL, 'estimado', false,
      'titulo', 'Presente lo vencido cuanto antes',
      'detalle', format('%s compromiso(s) de este mes ya vencieron y no están marcados como presentados: %s. Declarar o pagar tarde cuesta recargo por cada mes o fracción, más interés.', v_n, v_txt),
      'que_hacer', 'Si ya los presentó, márquelos en el Resumen. Si no, preséntelos hoy: el recargo crece cada mes. Siga la Guía paso a paso.',
      'panel', 'mi-contabilidad',
      'base', 'Código Tributario, arts. 26, 27 y 252 (mora). Tasas vigentes según el instructivo del IT-1 de la DGII (julio 2026): 3 % de recargo mensual y 1.10 % de interés.');
  END IF;

  -- 7. Ventas sin comprobante: no es ahorro, es riesgo.
  SELECT count(*), COALESCE(sum(fa.total), 0) INTO v_n, v_m
    FROM public.facturas fa
   WHERE fa.tenant_id = p_tenant
     AND fa.fecha >= (v_ini::timestamp AT TIME ZONE 'America/Santo_Domingo')
     AND fa.fecha <  (v_fin::timestamp AT TIME ZONE 'America/Santo_Domingo')
     AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
     AND NULLIF(btrim(fa.ncf), '') IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                        AND COALESCE(d.ncf, d.encf, d.proveedor_number) IS NOT NULL);
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object(
      'clave', 'ventas_sin_ncf', 'tipo', 'riesgo', 'ahorro', NULL, 'estimado', false,
      'titulo', 'Ventas sin comprobante fiscal',
      'detalle', format('%s venta(s) por RD$ %s salieron sin comprobante. No aparecen en el 607 ni en el IT-1.', v_n, to_char(v_m, fm)),
      'que_hacer', 'Toda venta lleva comprobante: de consumo si el cliente no da RNC, de crédito fiscal si lo da. Revise que las secuencias estén cargadas y vigentes en Comprobantes Fiscales. Vender sin comprobante expone a multas y a que la DGII estime sus ingresos por su cuenta.',
      'panel', NULL,
      'base', 'Código Tributario, arts. 50 y 257; Reglamento 254-06.');
  END IF;

  -- 8. Para conversar con el contador (no sale de un cálculo).
  v_items := v_items || jsonb_build_object(
    'clave', 'evaluar', 'tipo', 'evaluar', 'ahorro', NULL, 'estimado', false,
    'titulo', 'Para evaluar con su contador',
    'detalle', CASE WHEN v_fisica
      THEN 'Usted declara como persona física. Dos decisiones cambian cuánto paga al año: si califica y le conviene el Régimen Simplificado de Tributación (RST), y si le conviene operar como sociedad (SRL). Dependen de sus ingresos y de cuánto compra con comprobante.'
      ELSE 'Decisiones que cambian cuánto paga al año: registrar los equipos y vehículos del negocio como activos para depreciarlos, tener la nómina completa en la TSS para que los sueldos cuenten como gasto, y revisar el monto de los anticipos si sus ganancias bajaron.' END,
    'que_hacer', 'Lleve los 606 y 607 del año y el reporte de ventas y compras: con eso un contador le responde con números.',
    'panel', NULL, 'base', NULL);

  -- En lo que va del año: ITBIS pagado que no se pudo restar.
  SELECT COALESCE(sum(k.itbis), 0) INTO v_anio_perdido
    FROM public._contab_compras_606(p_tenant, make_date(p_anio, 1, 1), v_fin) k
   WHERE k.motivo IN ('consumo', 'sin_ncf', 'ncf_mal', 'rnc', 'tipo', 'rnc_empresa');

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes,
    'ahorro_seguro', (SELECT COALESCE(sum((x->>'ahorro')::numeric), 0) FROM jsonb_array_elements(v_items) x
                       WHERE x->>'tipo' = 'ahorro' AND NOT (x->>'estimado')::boolean),
    'exenta', v_exenta,
    'ahorro_posible', (SELECT COALESCE(sum((x->>'ahorro')::numeric), 0) FROM jsonb_array_elements(v_items) x
                        WHERE x->>'tipo' = 'ahorro' AND (x->>'estimado')::boolean),
    'anio_perdido', round(v_anio_perdido, 2),
    'items', v_items);
END $function$;

CREATE OR REPLACE FUNCTION public.contab_hoja_it1(p_anio integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_saldo numeric;
  v_ncf jsonb; v_pago jsonb;
  v_nc_n int; v_nc_monto numeric; v_nc_itbis numeric;
  v_total numeric; v_exento numeric; v_b16 numeric; v_itbis_fact numeric; v_ret_cli numeric; v_total_pago numeric;
  v_ad_bienes numeric; v_ad_serv numeric; v_ret_supl numeric; v_isr numeric; v_ret_fisica numeric; v_ret_soc numeric;
  v_ir17 jsonb;
  c1 numeric; c9 numeric; c10 numeric; c11 numeric; c12 numeric; c16 numeric; c17 numeric; c21 numeric;
  c25 numeric; c26 numeric; c27 numeric; v_neto numeric; c33 numeric; c34 numeric;
  v_avisos jsonb := '[]'::jsonb;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month')::date;
  SELECT COALESCE((SELECT saldo_favor_anterior FROM public.contab_periodos
                    WHERE tenant_id = v_t AND anio = p_anio AND mes = p_mes), 0) INTO v_saldo;

  -- Notas de crédito del mes (devoluciones sobre facturas con comprobante).
  SELECT count(*), COALESCE(sum(COALESCE(dv.total_devolucion, 0) - COALESCE(dv.itbis_total, 0)), 0), COALESCE(sum(dv.itbis_total), 0)
    INTO v_nc_n, v_nc_monto, v_nc_itbis
    FROM public.devoluciones dv
   WHERE dv.tenant_id = v_t AND dv.fecha_devolucion >= v_ini AND dv.fecha_devolucion < v_fin
     AND COALESCE(btrim(dv.ncf_modificado), '') <> '';

  -- Anexo A, renglón II: por tipo de comprobante (cantidad y monto sin impuestos).
  WITH v AS (SELECT * FROM public._contab_ventas_607(v_t, v_ini, v_fin)),
  cas(cas, nombre, tipos) AS (VALUES
    (1, 'Comprobante válido para crédito fiscal (01 y 31)', ARRAY['01','31']),
    (2, 'Comprobantes de consumo (02 y 32)', ARRAY['02','32']),
    (3, 'Notas de débito (03 y 33)', ARRAY['03','33']),
    (5, 'Registro único de ingresos (12)', ARRAY['12']),
    (6, 'Regímenes especiales (14 y 44)', ARRAY['14','44']),
    (7, 'Gubernamentales (15 y 45)', ARRAY['15','45']),
    (8, 'Exportaciones (16 y 46)', ARRAY['16','46']))
  SELECT jsonb_agg(jsonb_build_object('cas', x.cas, 'nombre', x.nombre, 'cantidad', x.n, 'monto', round(x.monto, 2)) ORDER BY x.cas)
    INTO v_ncf
    FROM (
      SELECT cas.cas, cas.nombre, count(v.id) AS n, COALESCE(sum(v.base), 0) AS monto
        FROM cas LEFT JOIN v ON v.tipo = ANY (cas.tipos) GROUP BY cas.cas, cas.nombre
      UNION ALL
      SELECT 4, 'Notas de crédito (04 y 34)', v_nc_n, v_nc_monto
    ) x;

  SELECT COALESCE(sum(v.base), 0), COALESCE(sum(v.exento), 0), COALESCE(sum(v.base16), 0),
         COALESCE(sum(v.itbis), 0), COALESCE(sum(v.itbis_retenido), 0), COALESCE(sum(v.total), 0),
         jsonb_build_object(
           'c12', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'efectivo'), 0), 2),
           'c13', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'cheque'), 0), 2),
           'c14', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'tarjeta'), 0), 2),
           'c15', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'credito'), 0), 2),
           'c16', 0, 'c17', 0,
           'c18', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'otros'), 0), 2))
    INTO v_total, v_exento, v_b16, v_itbis_fact, v_ret_cli, v_total_pago, v_pago
    FROM public._contab_ventas_607(v_t, v_ini, v_fin) v;

  -- 606: ITBIS por adelantar (bienes / servicios) y retenciones a suplidores.
  SELECT COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok' AND NOT k.es_servicio), 0),
         COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok' AND k.es_servicio), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
         COALESCE(sum(k.isr_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr') AND length(k.rnc) = 11), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr') AND length(k.rnc) <> 11), 0),
         COALESCE(jsonb_agg(jsonb_build_object('suplidor', k.proveedor, 'rnc', k.rnc, 'ncf', k.ncf, 'base', round(k.base, 2),
                    'pct', k.isr_pct, 'monto', k.isr_ret) ORDER BY k.proveedor, k.ncf)
                  FILTER (WHERE k.motivo IN ('ok', 'ret_isr') AND k.isr_ret > 0), '[]'::jsonb)
    INTO v_ad_bienes, v_ad_serv, v_ret_supl, v_isr, v_ret_fisica, v_ret_soc, v_ir17
    FROM public._contab_compras_606(v_t, v_ini, v_fin) k;

  -- ===== IT-1 =====
  c1  := round(v_total - v_nc_monto, 2);                       -- Anexo A, casilla 11
  c9  := round(LEAST(v_exento, GREATEST(c1, 0)), 2);           -- no gravadas (aquí: solo exentas, casilla 4)
  c10 := c1 - c9;                                              -- gravadas
  c12 := round(LEAST(v_b16, GREATEST(c10, 0)), 2);             -- al 16 %
  c11 := c10 - c12;                                            -- al 18 %
  c16 := round(c11 * 0.18, 2);
  c17 := round(c12 * 0.16, 2);
  c21 := c16 + c17;
  c25 := round(v_ad_bienes + v_ad_serv, 2);
  c26 := GREATEST(c21 - c25, 0);
  c27 := GREATEST(c25 - c21, 0);
  v_neto := c26 - c27 - v_saldo - round(v_ret_cli, 2);
  c33 := GREATEST(v_neto, 0);
  c34 := GREATEST(-v_neto, 0);

  IF abs(c21 - (v_itbis_fact - v_nc_itbis)) > 1 THEN
    v_avisos := v_avisos || jsonb_build_array(format(
      'El formulario calcula el ITBIS como 18 %% de la casilla 11 (RD$ %s); en sus facturas el ITBIS suma RD$ %s. La diferencia sale de descuentos o redondeos: al declarar manda el formulario.',
      to_char(c21, 'FM999,999,990.00'), to_char(v_itbis_fact - v_nc_itbis, 'FM999,999,990.00')));
  END IF;
  IF v_nc_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Hay devoluciones en el mes. La casilla 4 del Anexo A solo se llena sola si la nota de crédito (B04 o E34) está en el 607: agréguela allí si no la emitió por MotoFlow.');
  END IF;
  IF c9 > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Tiene ventas exentas. Si una compra sirve a la vez para ventas gravadas y exentas, su ITBIS va por proporcionalidad (Anexo A, casillas 53-55): esta hoja no lo calcula.');
  END IF;
  IF round(v_ret_cli, 2) > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Lo que le retuvieron va en el Anexo A, casillas 27 a 31 según quién retuvo (tarjetas: 27; una sociedad por servicios: 29; el Estado: 31). La suma pasa sola a la casilla 30.');
  END IF;
  IF EXISTS (SELECT 1 FROM public._contab_compras_606(v_t, v_ini, v_fin) k WHERE k.motivo IN ('nota', 'ret_isr')) THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Hay notas de crédito/débito de suplidores o compras con retención de ISR. Les falta un dato y no salen en el TXT del 606 ni en las casillas 22 a 25 de esta hoja: complete en la compra el tipo de retención o el NCF que modifica (nota de débito); la nota de crédito del suplidor va a mano en la herramienta de la DGII. Al ITBIS deducible súmele el de las compras con retención y las notas de débito, y RÉSTELE el de las notas de crédito.');
  END IF;
  v_avisos := v_avisos || jsonb_build_array(
    'Las importaciones (ITBIS pagado en Aduanas, casilla 24) no están en MotoFlow: si importó, súmelas del lado de la DGA.');

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'anexo', jsonb_build_object(
      'ncf', v_ncf, 'c11', c1,
      'pago', v_pago, 'c19', round(v_total_pago, 2),
      'c20', round(v_total, 2), 'c26', round(v_total, 2),
      'retenciones_que_le_hicieron', round(v_ret_cli, 2),
      'c50', round(v_ad_bienes, 2), 'c51', round(v_ad_serv, 2),
      'c56', jsonb_build_object('compras', round(v_ad_bienes, 2), 'servicios', round(v_ad_serv, 2), 'importaciones', 0, 'total', c25)),
    'it1', jsonb_build_object(
      'c1', c1, 'c4', c9, 'c9', c9, 'c10', c10, 'c11', c11, 'c12', c12,
      'c16', c16, 'c17', c17, 'c21', c21,
      'c22', round(v_ad_bienes, 2), 'c23', round(v_ad_serv, 2), 'c24', 0, 'c25', c25,
      'c26', c26, 'c27', c27, 'c29', v_saldo, 'c30', round(v_ret_cli, 2), 'c33', c33, 'c34', c34,
      'itbis_facturado', round(v_itbis_fact - v_nc_itbis, 2),
      -- A. ITBIS retenido a suplidores (casillas 39-63): debe cuadrar con el 606.
      'c60', round(v_ret_supl, 2), 'retenido_personas_fisicas', round(v_ret_fisica, 2), 'retenido_sociedades', round(v_ret_soc, 2),
      'c68', c33 + round(v_ret_supl, 2)),
    'ir17', jsonb_build_object('total_isr', round(v_isr, 2), 'filas', v_ir17),
    'avisos', v_avisos);
END $function$;

SELECT registrar_migracion('ayudante_textos_compras_606.sql');
