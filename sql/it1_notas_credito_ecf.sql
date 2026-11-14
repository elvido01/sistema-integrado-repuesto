-- =====================================================================
-- Hoja del IT-1: notas de crédito electrónicas (E34) desde el e-CF (14/11/2026)
-- ---------------------------------------------------------------------
-- Antes contaba las devoluciones con ncf_modificado, por la fecha de la
-- devolución y con sus montos. Ahora, igual que el 607 (ReportesDGIIPage):
-- las notas E34 emitidas (documentos_fiscales.tipo_documento='nota_credito'),
-- en el mes de su EMISIÓN y con MontoTotal/TotalITBIS del comprobante.
-- Generado desde la versión de producción del 14/11; solo cambia ese bloque.
-- =====================================================================

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
  -- (14/11/2026) Las notas de crédito electrónicas (E34) emitidas por MotoFlow:
  -- mes y montos del e-CF (fecha de emisión, MontoTotal, TotalITBIS), igual
  -- que el 607. Las rechazadas por la DGII no cuentan.
  SELECT count(*),
         COALESCE(sum(COALESCE((df.request_payload->'impresion'->>'monto_total')::numeric, 0)
                    - COALESCE((df.request_payload->'impresion'->>'total_itbis')::numeric, 0)), 0),
         COALESCE(sum(COALESCE((df.request_payload->'impresion'->>'total_itbis')::numeric, 0)), 0)
    INTO v_nc_n, v_nc_monto, v_nc_itbis
    FROM public.documentos_fiscales df
   WHERE df.tenant_id = v_t AND df.tipo_documento = 'nota_credito' AND df.estado = 'emitido'
     AND COALESCE(df.estado_dgii, '') <> 'rechazado'
     AND (df.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini
     AND (df.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date < v_fin;

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

SELECT registrar_migracion('it1_notas_credito_ecf.sql');
