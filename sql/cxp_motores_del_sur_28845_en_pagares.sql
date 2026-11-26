-- ============================================================
-- CxP MOTORES DEL SUR: FACTURA 028845 EN SUS 6 PAGARÉS (26/11/2026)
-- ============================================================
-- El dueño: "esa factura está mal editada, divídemela en los 6 pagos".
-- El CONDUCE 028845 (09/09/2026, 3 LONCIN CL200 2027, US$9,450) dice
-- "Cant. Pagarés: 6 x 1,575.00". En Motopréstamos estaba como UNA sola
-- deuda CAM-OC-0011 de US$9,450 (pasada de Caminero el 17/10), mientras
-- Motores del Sur la cobra por pagarés.
--
-- Se divide igual que las otras (CAM-OC-0014-01..06, factura 029017):
--   CAM-OC-0011-01..06, US$1,575 c/u = RD$93,712.50 a la tasa 59.50 de la
--   compra; vencen el 9 de cada mes (oct-2026 → mar-2027): dias_credito =
--   días desde la fecha de la factura hasta ese vencimiento.
-- No tenía ningún pago aplicado (verificado) ni líneas de detalle (la
-- mercancía está en la compra OC-0011 de Caminero): no se mueve dinero ni
-- inventario. El total sigue siendo US$9,450 / RD$562,275.
-- ============================================================

DO $dividir$
DECLARE
  c_mp  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_c   public.compras%ROWTYPE;
  v_n   int;
  v_venc date;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE tenant_id = c_mp AND numero = 'CAM-OC-0011' FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = c_mp AND numero = 'CAM-OC-0011-01') THEN
      RAISE NOTICE 'Ya estaba dividida.'; RETURN;
    END IF;
    RAISE EXCEPTION 'No encontré CAM-OC-0011 en Motopréstamos';
  END IF;
  IF v_c.total_usd <> 9450 OR v_c.pendiente_usd <> 9450 OR v_c.monto_pagado <> 0 OR v_c.estado <> 'PENDIENTE'
     OR v_c.fecha <> '2026-09-09' OR v_c.tasa_cambio <> 59.5 THEN
    RAISE EXCEPTION 'CAM-OC-0011 no es la que se espera: %', row_to_json(v_c);
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos_suplidores_detalle WHERE compra_id = v_c.id) THEN
    RAISE EXCEPTION 'CAM-OC-0011 ya tiene pagos aplicados: dividirla movería pagos. Para y mira.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.compras_detalle WHERE compra_id = v_c.id) THEN
    RAISE EXCEPTION 'CAM-OC-0011 tiene líneas de detalle: no se esperaba.';
  END IF;

  FOR v_n IN 1..6 LOOP
    v_venc := (v_c.fecha + make_interval(months => v_n))::date;
    IF v_n = 1 THEN
      UPDATE public.compras SET
        numero = 'CAM-OC-0011-01',
        referencia = 'Deuda de CAMINERO MOTORS (compra OC-0011-01) · Factura 028845 - Pagaré 1/6 (MOTORES DEL SUR S.R.L)',
        total_usd = 1575, pendiente_usd = 1575,
        total_compra = 93712.50, total_gravado = 93712.50, monto_pendiente = 93712.50,
        dias_credito = v_venc - v_c.fecha,
        notas = concat_ws(' · ', NULLIF(v_c.notas, ''), '26/11/2026: dividida en 6 pagarés de US$1,575 como dice el CONDUCE 028845.'),
        updated_at = now()
      WHERE id = v_c.id;
    ELSE
      INSERT INTO public.compras (ncf, fecha, notas, pagos, estado, moneda, numero, ocr_text, sub_tipo, legacy_id, tenant_id,
        total_usd, almacen_id, forma_pago, referencia, usuario_id, itbis_total, suplidor_id, tasa_cambio, dias_credito,
        monto_pagado, total_compra, total_exento, pendiente_usd, total_gravado, extracted_json, itbis_incluido,
        ncf_modificado, descuento_total, id_orden_origen, monto_pendiente, es_saldo_inicial, isr_retenido_pct,
        factura_dealer_id, tipo_pago_detalle, actualizar_precios, invoice_image_path, itbis_retenido_pct,
        tipo_retencion_isr, tipo_bienes_servicios)
      VALUES (v_c.ncf, v_c.fecha,
        concat_ws(' · ', NULLIF(v_c.notas, ''), '26/11/2026: dividida en 6 pagarés de US$1,575 como dice el CONDUCE 028845.'),
        v_c.pagos, 'PENDIENTE', v_c.moneda, 'CAM-OC-0011-' || lpad(v_n::text, 2, '0'), NULL, v_c.sub_tipo,
        v_c.legacy_id || ':pagare' || v_n, c_mp,
        1575, v_c.almacen_id, v_c.forma_pago,
        'Deuda de CAMINERO MOTORS (compra OC-0011-' || lpad(v_n::text, 2, '0') || ') · Factura 028845 - Pagaré ' || v_n || '/6 (MOTORES DEL SUR S.R.L)',
        v_c.usuario_id, 0, v_c.suplidor_id, v_c.tasa_cambio, v_venc - v_c.fecha,
        0, 93712.50, 0, 1575, 93712.50, NULL, v_c.itbis_incluido,
        NULL, 0, NULL, 93712.50, false, 0,
        NULL, NULL, false, NULL, 0, NULL, NULL);
    END IF;
  END LOOP;
END $dividir$;

-- VERIFICACIÓN: 6 pagarés de 1,575 que suman lo mismo que antes.
DO $prueba$
DECLARE r record;
BEGIN
  SELECT count(*) n, sum(total_usd) usd, sum(pendiente_usd) pend, sum(total_compra) rd,
         string_agg(dias_credito::text, ',' ORDER BY numero) dias
    INTO r FROM public.compras
   WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero LIKE 'CAM-OC-0011-%';
  IF r.n <> 6 OR r.usd <> 9450 OR r.pend <> 9450 OR r.rd <> 562275 THEN RAISE EXCEPTION 'No cuadra: %', row_to_json(r); END IF;
  IF r.dias <> '30,61,91,122,153,181' THEN RAISE EXCEPTION 'Vencimientos: %', r.dias; END IF;
  IF EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero = 'CAM-OC-0011') THEN
    RAISE EXCEPTION 'Quedó la deuda vieja entera'; END IF;
END $prueba$;

SELECT public.registrar_migracion('cxp_motores_del_sur_28845_en_pagares.sql');

SELECT json_agg(json_build_object('numero', numero, 'usd', total_usd, 'vence', fecha + dias_credito) ORDER BY numero) AS pagares
  FROM public.compras WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero LIKE 'CAM-OC-0011-%';
