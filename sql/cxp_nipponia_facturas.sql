-- =====================================================================
-- CxP Caminero: cargar las facturas reales de NIPPONIA CARIBE
-- ---------------------------------------------------------------------
-- (2026-07-27) NIPPONIA estaba cargada como un "SALDO INICIAL papel"
-- (SI-CXP-5) de US$30,860 con US$5,500 abonados → pendiente US$25,360.
--
-- El ESTADO DE CUENTA del suplidor (corte 27-07-2026, moneda US$) manda, y
-- dice que se deben US$31,490. El saldo en papel se había quedado corto por
-- US$6,130. Sus partidas abiertas son exactamente estas:
--
--   Doc         Fecha        Cuota  Vence        Valor      Aplicado  Pendiente
--   F-018819    11-05-2026     1    10-06-2026   6,864.00  -4,825.00   2,039.00
--   F-018819    11-05-2026     2    10-07-2026   6,864.00       0.00   6,864.00
--   F-018893    23-06-2026     1    23-07-2026   1,995.00       0.00   1,995.00
--   F-018819    11-05-2026     3    09-08-2026   6,864.00       0.00   6,864.00
--   F-018819    11-05-2026     4    08-09-2026   6,864.00       0.00   6,864.00
--   F-018819    11-05-2026     5    08-10-2026   6,864.00       0.00   6,864.00
--                                                            ─────────────────
--                                                                   US$31,490
--
-- >>> LA TASA 61.25 NO ES INVENTADA <<<
-- La factura física F-018819 dice RD$2,102,100.00 y el estado de cuenta dice
-- US$34,320.00 por el mismo documento: 2,102,100 / 34,320 = 61.25 EXACTO.
-- Y 6,864 x 61.25 = RD$420,420, que es 2,102,100/5 exacto. Las dos fuentes
-- (papel en pesos y estado de cuenta en dólares) cierran entre sí.
--
-- >>> EL ABONO SE PARTE, NO SE INVENTA <<<
-- El sistema tiene US$5,500 abonados a Nipponia (US$500 + US$5,000) pegados
-- al saldo inicial. El estado de cuenta dice que a la F-018819 se le aplicaron
-- US$4,825. En vez de crear un pago falso, se PARTE el detalle de US$5,000:
--     US$4,825 (RD$282,745) → cuota 1 de F-018819
--     US$  175 (RD$ 10,255) → se queda en el saldo inicial
-- Los RD$293,000 del pago original siguen sumando igual (282,745 + 10,255).
-- El saldo inicial queda con US$675 (500 + 175): es el crédito que Nipponia
-- todavía no ha aplicado. Ningún pago se pierde ni se duplica.
--
-- >>> NIPPONIA FACTURA EN LAS DOS MONEDAS <<<
-- F-018819 se emitió en pesos (RD$2,102,100.00) y F-018893 en dólares
-- (US$1,995.00, así impreso en el papel). El estado de cuenta lleva todo a
-- US$, que es la moneda de la relación: por eso el suplidor va en USD y el
-- dólar es lo autoritativo. El RD$ de F-018893 (a 61.25) es referencial.
--
-- >>> QUÉ NO SE TOCA <<<
-- - OC-0001 (RD$1,299,180, PAGADA): no aparece en el estado de cuenta, así
--   que está saldada. Se deja como está.
-- - Conduce 000861 (6 NIPPONIA LEAD150 del 10-09-2025): tampoco aparece en el
--   estado de cuenta → ya está pagado. NO se carga como deuda.
--
-- >>> ITBIS / DGII 606 <<<
-- La factura trae NCF E310000000213 e ITBIS RD$296,741.55. Las cuotas se
-- cargan como filas de financiamiento (exento = total, itbis 0), igual que
-- los pagarés de los demás suplidores, y el NCF + desglose fiscal quedan en
-- `notas`. Si se quiere el crédito de ITBIS en el 606 hay que registrarlo
-- aparte: poner el NCF en las 5 cuotas lo reportaría 5 veces.
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam       uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_nip       uuid    := '18af0cf4-fa81-4726-9cd5-be535a9e6305';  -- NIPPONIA CARIBE SRL
  v_si_legacy text    := 'papel:cxp:2026-07-14:5';                -- saldo inicial SI-CXP-5
  v_det_id    uuid    := 'd8dbded7-37b5-4b1b-8fad-9b258e6f5d3c';  -- abono de US$5,000 a partir
  v_tasa      numeric := 61.25;      -- RD$2,102,100 / US$34,320, de los propios documentos
  v_abono     numeric := 4825.00;    -- lo que el estado de cuenta dice aplicado
  v_si_id     uuid;
  v_c1_id     uuid;
  v_pago_id   uuid;
  v_det_rd    numeric;
  v_det_usd   numeric;
  v_rd_abono  numeric;
  r           record;
  v_notas1    text;
BEGIN
  -- 0) El suplidor factura en dólares (el estado de cuenta es en US$)
  UPDATE public.proveedores
     SET moneda = 'USD'
   WHERE id = v_nip AND tenant_id = v_cam AND COALESCE(moneda, 'DOP') <> 'USD';

  v_notas1 :=
    E'NCF E310000000213 - Factura RD$2,102,100.00 (tasa 61.25)\n'
    || E'Exento y placa 156,790.20 | Gravado 1,648,568.25 | ITBIS 296,741.55\n'
    || E'Entregadas por conduces de salida 001151 (parte 1) y 001164 (parte 2)\n'
    || E'12 x NIPPONIA BRIO110 R 2026 @ RD$85,750\n'
    || E'  Azul   XF1NC1102TL533692 / 533698 / 533686 / 533688\n'
    || E'  Gris   XF1NC1102TL533654 / 533655 / 533675 / 533664\n'
    || E'  Negro  XF1NC1102TL533631 / 533638 / 533633 / 533636\n'
    || E'12 x NIPPONIA Brio110 A30 2026 @ RD$89,425\n'
    || E'  Azul   XF1NC1102TL533486 / 533490 / 533491 / 533488\n'
    || E'  Negro  XF1NC1102TL533474 / 533465 / 533470 / 533464\n'
    || E'  Rojo   XF1NC1102TL533448 / 533400 / 533447 / 533399';

  -- 1) Las partidas del estado de cuenta, una compra por cuota.
  --    Las fechas de vencimiento son las que imprime el propio suplidor.
  FOR r IN
    SELECT * FROM (VALUES
      -- doc,        fecha_fac,          cuota, de,  vence,              valor
      ('F-018819', DATE '2026-05-11', 1, 5, DATE '2026-06-10', 6864.00),
      ('F-018819', DATE '2026-05-11', 2, 5, DATE '2026-07-10', 6864.00),
      ('F-018819', DATE '2026-05-11', 3, 5, DATE '2026-08-09', 6864.00),
      ('F-018819', DATE '2026-05-11', 4, 5, DATE '2026-09-08', 6864.00),
      ('F-018819', DATE '2026-05-11', 5, 5, DATE '2026-10-08', 6864.00),
      -- De esta no hay papel físico: sale del estado de cuenta.
      ('F-018893', DATE '2026-06-23', 1, 1, DATE '2026-07-23', 1995.00)
    ) AS t(doc, fecha_fac, cuota, de, vence, total_usd)
  LOOP
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia, notas,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
      itbis_incluido, actualizar_precios,
      moneda, tasa_cambio, total_usd, pendiente_usd, legacy_id
    )
    SELECT
      v_cam,
      'FIN-' || replace(r.doc, 'F-0', '') || '-' || lpad(r.cuota::text, 2, '0'),
      r.fecha_fac, v_nip,
      'Factura ' || r.doc || ' - Cuota ' || r.cuota || '/' || r.de || ' (Nipponia Caribe)',
      CASE WHEN r.doc = 'F-018819' AND r.cuota = 1 THEN v_notas1
           WHEN r.doc = 'F-018819' THEN 'Cuota ' || r.cuota || '/5 de la factura F-018819 - detalle completo en la cuota 1'
           ELSE 'Factura ' || r.doc || ' (ver detalle fiscal más abajo)'
      END,
      ROUND(r.total_usd * v_tasa, 2), 0, 0, ROUND(r.total_usd * v_tasa, 2),
      'CREDITO',
      (r.vence - r.fecha_fac),            -- días exactos hasta el vencimiento impreso
      0, ROUND(r.total_usd * v_tasa, 2), 'PENDIENTE',
      false, false,
      'USD', v_tasa, r.total_usd, r.total_usd,
      'papel:cxp:nipponia:' || r.doc || ':C' || r.cuota
    WHERE NOT EXISTS (
      SELECT 1 FROM public.compras c
      WHERE c.tenant_id = v_cam
        AND c.legacy_id = 'papel:cxp:nipponia:' || r.doc || ':C' || r.cuota
    );
  END LOOP;

  SELECT id INTO v_si_id FROM public.compras
   WHERE tenant_id = v_cam AND legacy_id = v_si_legacy;
  SELECT id INTO v_c1_id FROM public.compras
   WHERE tenant_id = v_cam AND legacy_id = 'papel:cxp:nipponia:F-018819:C1';

  -- 2) Partir el abono: US$4,825 bajan a la cuota 1, US$175 se quedan.
  --    Solo se hace una vez (después el detalle ya no apunta al saldo inicial).
  SELECT pago_id, monto_abonado, abonado_usd
    INTO v_pago_id, v_det_rd, v_det_usd
    FROM public.pagos_suplidores_detalle
   WHERE id = v_det_id AND compra_id = v_si_id;

  IF FOUND AND v_det_usd > v_abono THEN
    -- se reparte el monto en RD$ en la misma proporción, sin perder centavos
    v_rd_abono := ROUND(v_det_rd * v_abono / v_det_usd, 2);

    UPDATE public.pagos_suplidores_detalle
       SET compra_id     = v_c1_id,
           monto_abonado = v_rd_abono,
           abonado_usd   = v_abono
     WHERE id = v_det_id;

    INSERT INTO public.pagos_suplidores_detalle
      (id, pago_id, compra_id, monto_abonado, abonado_usd, tenant_id)
    VALUES
      (gen_random_uuid(), v_pago_id, v_si_id,
       v_det_rd - v_rd_abono, v_det_usd - v_abono, v_cam);

    RAISE NOTICE 'Abono partido: US$% a la cuota 1 de F-018819, US$% quedan como crédito.',
      v_abono, v_det_usd - v_abono;
  END IF;

  -- 3) El saldo inicial en papel queda reemplazado por los documentos reales.
  --    Se ANULA, no se borra: conserva los US$675 de abonos que Nipponia
  --    todavía no ha aplicado y todo el rastro de pagos.
  UPDATE public.compras
     SET estado          = 'ANULADA',
         monto_pendiente = 0,
         pendiente_usd   = 0,
         referencia      = regexp_replace(referencia, '\s+—.*$', '')
                           || ' — reemplazado por F-018819 y F-018893 (estado de cuenta 27/07/2026)'
   WHERE id = v_si_id;

  -- 4) Recalcular pagado/pendiente/estado de las cuotas nuevas desde
  --    pagos_suplidores_detalle, que es la única fuente de verdad.
  --    Acotado a las filas nuevas: OC-0001 es en DOP y no se toca.
  UPDATE public.compras c
     SET monto_pagado    = COALESCE((SELECT SUM(d.monto_abonado) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id), 0),
         pendiente_usd   = c.total_usd - COALESCE((SELECT SUM(d.abonado_usd) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id), 0),
         monto_pendiente = ROUND((c.total_usd - COALESCE((SELECT SUM(d.abonado_usd) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id), 0))
                                 * COALESCE(c.tasa_cambio, v_tasa), 2),
         estado          = CASE WHEN c.total_usd - COALESCE((SELECT SUM(d.abonado_usd) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id), 0) <= 0
                                THEN 'PAGADA' ELSE 'PENDIENTE' END
   WHERE c.tenant_id = v_cam
     AND c.legacy_id LIKE 'papel:cxp:nipponia:%';

  -- 5) F-018893: apareció el papel físico. Es una factura de UNA sola línea
  --    (no va partida en cuotas), así que aquí sí se puede poner el NCF y el
  --    desglose fiscal sin ensuciar el 606: se reporta una vez, como debe ser.
  --    Los montos NO cambian, el total sigue siendo US$1,995.00.
  UPDATE public.compras
     SET ncf           = 'E310000000286',
         total_exento  = ROUND( 163.87 * v_tasa, 2),   -- placa
         total_gravado = ROUND(1551.81 * v_tasa, 2),
         itbis_total   = ROUND( 279.32 * v_tasa, 2),
         notas         = E'NCF E310000000286 - Factura emitida en US$1,995.00 (Orden 01847/C-000528)\n'
                      || E'Desglose en US$: exento y placa 163.87 | gravado 1,551.81 | ITBIS 279.32\n'
                      || E'RD$ referencial a tasa 61.25 - el dólar es lo autoritativo\n'
                      || E'1 x NIPPONIA TN250 Blanco/Negro 2025\n'
                      || E'  XF1TN250ASC000594\n'
                      || E'Términos 30 días. e-CF firmado 23/06/2026 18:57:17, código YhBohK'
   WHERE tenant_id = v_cam
     AND legacy_id = 'papel:cxp:nipponia:F-018893:C1';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_nipponia_facturas.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las 6 partidas, que deben calcar el estado de cuenta línea por línea
SELECT c.numero, c.referencia,
       c.fecha, (c.fecha + c.dias_credito)::date AS vence,
       c.total_usd AS valor, c.monto_pagado, c.pendiente_usd, c.estado
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:nipponia:%'
ORDER BY vence;
-- esperado (mismo orden que el estado de cuenta):
--   FIN-18819-01  vence 2026-06-10  6,864  pagado 282,745  pendiente 2,039
--   FIN-18819-02  vence 2026-07-10  6,864  pagado       0  pendiente 6,864
--   FIN-18893-01  vence 2026-07-23  1,995  pagado       0  pendiente 1,995
--   FIN-18819-03  vence 2026-08-09  6,864  pagado       0  pendiente 6,864
--   FIN-18819-04  vence 2026-09-08  6,864  pagado       0  pendiente 6,864
--   FIN-18819-05  vence 2026-10-08  6,864  pagado       0  pendiente 6,864

-- 2) EL NÚMERO QUE IMPORTA: debe dar US$31,490 clavado
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd_nipponia,
       COALESCE(SUM(monto_pendiente), 0) AS pendiente_rd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '18af0cf4-fa81-4726-9cd5-be535a9e6305'
  AND estado = 'PENDIENTE';
-- esperado: 31,490.00 USD / 1,928,762.50 RD

-- 3) El saldo inicial queda anulado, con el crédito de US$675 aún enlazado
SELECT c.numero, c.estado, c.pendiente_usd, c.referencia,
       (SELECT COALESCE(SUM(d.abonado_usd), 0) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id) AS credito_usd
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id = 'papel:cxp:2026-07-14:5';
-- esperado: ANULADA | pendiente 0 | credito_usd 675

-- 4) F-018893: el desglose fiscal debe sumar el total, sin descuadre por redondeo
SELECT numero, ncf, total_exento, total_gravado, itbis_total,
       (total_exento + total_gravado + itbis_total) AS suma_desglose,
       total_compra, total_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id = 'papel:cxp:nipponia:F-018893:C1';
-- esperado: 10,037.04 + 95,048.36 + 17,108.35 = 122,193.75 = total_compra | US$1,995

-- 5) El pago original no se rompió al partirlo: sigue sumando RD$293,000
SELECT d.pago_id, SUM(d.monto_abonado) AS suma_rd, SUM(d.abonado_usd) AS suma_usd
FROM public.pagos_suplidores_detalle d
WHERE d.pago_id = 'fd302cd9-07da-4314-9c60-a9a893cab3ee'
GROUP BY d.pago_id;
-- esperado: 293,000.00 | 5,000.00
