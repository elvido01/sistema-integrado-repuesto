-- =====================================================================
-- Comprobante del gasto diario: anulación y conteo (14/11/2026)
-- ---------------------------------------------------------------------
-- Sigue a sql/comprobante_de_gasto_diario.sql (correcciones de la revisión):
--   1. Si un gasto diario se ANULA (los gastos no se borran: anulado = true),
--      su comprobante pasa a 'descartado' y sale del 606: no se compró.
--      Trigger en la tabla, para que valga desde cualquier pantalla.
--   2. contab_resumen_mes y _contab_recomendaciones ya no cuentan como
--      "gastos sin comprobante" los que tienen su comprobante unido; y la
--      resta aproximada por total solo usa los comprobantes SUELTOS
--      (gasto_id NULL), para no restar dos veces.
-- Las dos funciones salen de la versión de producción del 14/11 con solo
-- esos dos cambios (generado y comparado, no copiado del repo viejo).
-- No toca caja ni banco. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gasto_anulado_descarta_comprobante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
BEGIN
  IF COALESCE(NEW.anulado, false) AND NOT COALESCE(OLD.anulado, false) THEN
    UPDATE public.gastos_comprobantes
       SET estado = 'descartado',
           nota = concat_ws(' · ', NULLIF(btrim(nota), ''), 'Descartado: se anuló el gasto diario.')
     WHERE gasto_id = NEW.id AND estado <> 'descartado';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.gasto_anulado_descarta_comprobante() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gasto_anulado_descarta_comprobante_trg ON public.gastos_diarios;
CREATE TRIGGER gasto_anulado_descarta_comprobante_trg
  AFTER UPDATE OF anulado ON public.gastos_diarios
  FOR EACH ROW EXECUTE FUNCTION public.gasto_anulado_descarta_comprobante();

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
      'detalle', format('%s compra(s) del mes son notas de crédito o débito de suplidores, o tienen retención de ISR. MotoFlow no guarda el NCF que modifican ni el tipo de retención, así que no salen en el TXT.', v_n),
      'que_hacer', 'Antes de enviar el 606, agréguelas en la herramienta de la DGII con ese dato. Si se quedan fuera, pierde el ITBIS de esas compras (o deja de restar una nota de crédito, que la DGII sí conoce).',
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

CREATE OR REPLACE FUNCTION public.contab_resumen_mes(p_anio integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_ini_ts timestamptz; v_fin_ts timestamptz;
  v_saldo numeric;
  v_ventas jsonb; v_sin jsonb; v_dev numeric; v_compras jsonb; v_gastos jsonb; v_comp jsonb; v_por_revisar jsonb;
  v_itbis_ventas numeric; v_itbis_ret numeric; v_itbis_adel numeric; v_ret_supl numeric; v_estimado numeric;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month')::date;
  v_ini_ts := v_ini::timestamp AT TIME ZONE 'America/Santo_Domingo';
  v_fin_ts := v_fin::timestamp AT TIME ZONE 'America/Santo_Domingo';
  SELECT COALESCE((SELECT saldo_favor_anterior FROM public.contab_periodos
                    WHERE tenant_id = v_t AND anio = p_anio AND mes = p_mes), 0) INTO v_saldo;

  -- ===== Ventas con comprobante (607) =====
  SELECT jsonb_build_object(
      'con_ncf', count(*), 'base', COALESCE(sum(v.base), 0), 'itbis', COALESCE(sum(v.itbis), 0),
      'itbis_retenido', COALESCE(sum(v.itbis_retenido), 0))
    INTO v_ventas FROM public._contab_ventas_607(v_t, v_ini, v_fin) v;

  -- ===== Ventas sin comprobante: no salen en el 607 =====
  SELECT jsonb_build_object('sin_ncf', count(*), 'sin_ncf_total', COALESCE(sum(fa.total), 0), 'sin_ncf_itbis', COALESCE(sum(fa.itbis), 0))
    INTO v_sin
    FROM public.facturas fa
   WHERE fa.tenant_id = v_t AND fa.fecha >= v_ini_ts AND fa.fecha < v_fin_ts
     AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
     AND NULLIF(btrim(fa.ncf), '') IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                        AND COALESCE(d.ncf, d.encf, d.proveedor_number) IS NOT NULL);
  v_ventas := v_ventas || v_sin;

  -- Devoluciones del mes sobre facturas con comprobante (notas de crédito).
  SELECT COALESCE(sum(dv.itbis_total), 0) INTO v_dev
    FROM public.devoluciones dv
   WHERE dv.tenant_id = v_t AND dv.fecha_devolucion >= v_ini AND dv.fecha_devolucion < v_fin
     AND COALESCE(btrim(dv.ncf_modificado), '') <> '';

  -- ===== Compras: lo que entra al 606 y lo que no =====
  SELECT jsonb_build_object(
      'en_606', count(*) FILTER (WHERE k.motivo = 'ok'),
      'itbis_adelantado', COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok'), 0),
      -- Lo retenido se debe igual, aunque esa compra se agregue a mano al 606.
      'itbis_retenido_a_suplidores', COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
      'isr_retenido_a_suplidores', COALESCE(sum(k.isr_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
      'fuera', count(*) FILTER (WHERE k.motivo <> 'ok'),
      -- 'nota' y 'ret_isr' no se pierden: se agregan a mano en la herramienta de la DGII.
      'itbis_perdido', COALESCE(sum(k.itbis) FILTER (WHERE k.motivo NOT IN ('ok', 'nota', 'ret_isr')), 0),
      'a_mano', count(*) FILTER (WHERE k.motivo IN ('nota', 'ret_isr')),
      'motivos', COALESCE((SELECT jsonb_agg(jsonb_build_object('motivo', m.motivo, 'cantidad', m.n, 'monto', m.monto, 'itbis', m.itbis) ORDER BY m.itbis DESC)
                             FROM (SELECT k2.motivo, count(*) n, sum(k2.total) monto, sum(k2.itbis) itbis
                                     FROM public._contab_compras_606(v_t, v_ini, v_fin) k2
                                    WHERE k2.motivo <> 'ok' GROUP BY k2.motivo) m), '[]'::jsonb))
    INTO v_compras FROM public._contab_compras_606(v_t, v_ini, v_fin) k;

  -- ===== Gastos diarios: no llevan comprobante fiscal (no entran al 606) =====
  SELECT jsonb_build_object('cantidad', count(*), 'monto', COALESCE(sum(g.monto), 0))
    INTO v_gastos
    FROM public.gastos_diarios g
   WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin AND NOT COALESCE(g.anulado, false)
     AND NOT COALESCE(g.es_tercero, false) AND COALESCE(g.tipo_gasto, '') NOT IN ('Nomina', 'Terceros')
     -- (14/11) El gasto que ya tiene su comprobante unido no cuenta como "sin comprobante".
     AND NOT EXISTS (SELECT 1 FROM public.gastos_comprobantes gcx WHERE gcx.gasto_id = g.id AND gcx.estado <> 'descartado');

  SELECT jsonb_build_object(
      'por_revisar', count(*) FILTER (WHERE g.estado = 'por_revisar'),
      'por_revisar_itbis', COALESCE(sum(g.itbis) FILTER (WHERE g.estado = 'por_revisar'), 0),
      'aprobados', count(*) FILTER (WHERE g.estado = 'aprobado' AND g.entra_606),
      'aprobados_itbis', COALESCE(sum(g.itbis) FILTER (WHERE g.estado = 'aprobado' AND g.entra_606), 0),
      'aprobados_fuera', count(*) FILTER (WHERE g.estado = 'aprobado' AND NOT g.entra_606))
    INTO v_por_revisar
    FROM public.gastos_comprobantes g
   WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.vence, q.clave), '[]'::jsonb) INTO v_comp
    FROM public._contab_compromisos(v_t, p_anio, p_mes) q;

  v_itbis_ventas := (v_ventas->>'itbis')::numeric - v_dev;
  v_itbis_ret := (v_ventas->>'itbis_retenido')::numeric;
  v_itbis_adel := (v_compras->>'itbis_adelantado')::numeric;
  v_ret_supl := round((v_compras->>'itbis_retenido_a_suplidores')::numeric, 2);
  v_estimado := round(v_itbis_ventas - v_itbis_adel - v_itbis_ret - v_saldo, 2);

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'ventas', v_ventas, 'devoluciones_itbis', v_dev, 'compras', v_compras, 'gastos_sin_comprobante', v_gastos,
    'comprobantes_gastos', v_por_revisar,
    'saldo_favor_anterior', v_saldo,
    'itbis', jsonb_build_object(
      'ventas', round(v_itbis_ventas, 2), 'adelantado', round(v_itbis_adel, 2),
      'retenido_por_clientes', round(v_itbis_ret, 2), 'saldo_favor_anterior', v_saldo,
      'a_pagar', GREATEST(v_estimado, 0), 'saldo_a_favor', GREATEST(-v_estimado, 0),
      'retenido_a_suplidores', v_ret_supl,
      'total_a_pagar', GREATEST(v_estimado, 0) + v_ret_supl),
    'compromisos', v_comp,
    'avisos', (SELECT contab_avisos FROM public.config_empresa WHERE tenant_id = v_t),
    'cierre_fiscal_mes', (SELECT cierre_fiscal_mes FROM public.config_empresa WHERE tenant_id = v_t));
END $function$;

SELECT registrar_migracion('comprobante_de_gasto_diario_2.sql');
