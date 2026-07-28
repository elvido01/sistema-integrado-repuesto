-- =====================================================================
-- CxP Caminero: detallar la deuda de TERUEL & COMPANIA en sus facturas
-- ---------------------------------------------------------------------
-- (2026-07-28) TERUEL estaba como un "SALDO INICIAL papel" (SI-CXP-4) de
-- US$89,885 con US$57,000 abonados → pendiente US$32,885.
--
-- Se cargan las dos facturas que traen TOTAL IMPRESO, cada una dividida en
-- 6 pagarés, igual que Motores del Sur (días 31/62/92/123/153/184):
--
--   F30000104295  13-05-2026  e-NCF E310000013001  tasa 61.25  US$11,345.39
--   F30000106027  01-07-2026  e-NCF E310000014131  tasa 61.00  US$ 6,877.70
--                                                              ─────────────
--                                                              US$18,223.09
--
-- OJO — NO ES TODA LA DEUDA:
--     pendiente actual   US$ 32,885.00
--     documentado ahora  US$ 18,223.09
--                        ─────────────
--     sin documentar     US$ 14,661.91
--
-- Por eso el saldo inicial NO se anula: se recalcula y queda vivo con el
-- resto. Los US$57,000 abonados se quedan donde están (caben de sobra en el
-- resto, así que no hay que repartirlos). El pendiente total NO cambia:
--     14,661.91 + 18,223.09 = US$32,885 ✔
--
-- >>> LOS TRES CONDUCES NO SE CARGAN <<<
-- Llegaron además tres conduces SIN precio impreso, solo con costos escritos
-- a mano. Sumados dan US$20,013 y no cuadran: junto a las dos facturas darían
-- US$38,236.09, o sea US$5,351.09 MÁS que la deuda. Cargarlos así inflaría la
-- cuenta, así que quedan fuera hasta tener sus facturas:
--
--   doc            fecha       contenido              costo a mano        PAGOS
--   F30000102680  25-03-2026  12 x NEW LEAD 150      "1150" (=13,800)      6
--   F30000105109  05-06-2026   4 x HAMMER 125        "1250 x63 = 78,750"   6
--   F30000105108  05-06-2026   1 x SUPER DELIVERY    "74,000 / 61 = 1213"  4
--
-- OJO CON EL PLAZO: cada conduce trae escrito abajo a la izquierda en cuántos
-- pagos va, y NO todos son 6. El F30000105108 (SUPER DELIVERY) es a 4 PAGOS.
-- Cuando se carguen hay que respetar el plazo de cada uno, no asumir 6.
--
-- Las dos facturas electrónicas que SÍ se cargan aquí no traen esa marca
-- (solo QR y código de seguridad), así que van a 6 como se acordó.
--
-- >>> ITBIS / DGII 606 <<<
-- Las facturas traen e-NCF e ITBIS. Como van partidas en 6 cuotas, el NCF NO
-- se pone en la fila (lo reportaría 6 veces en el 606): queda en `notas` con
-- el desglose fiscal completo. Si se quiere el crédito de ITBIS hay que
-- registrarlo aparte.
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam        uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_ter        uuid    := '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f';  -- TERUEL & COMPANIA SRL
  v_si_legacy  text    := 'papel:cxp:2026-07-14:4';                -- saldo inicial SI-CXP-4
  v_total_orig numeric := 89885.00;   -- deuda original del saldo inicial (NO tocar)
  v_dias       int[]   := ARRAY[31, 62, 92, 123, 153, 184];        -- plazos Motores del Sur
  v_detallado  numeric;
  v_pagado     numeric;
  v_resto      numeric;
  v_si_id      uuid;
  v_cuota      numeric;
  v_ultima     numeric;
  r            record;
  i            int;
BEGIN
  UPDATE public.proveedores SET moneda = 'USD'
   WHERE id = v_ter AND tenant_id = v_cam AND COALESCE(moneda, 'DOP') <> 'USD';

  -- 1) Las dos facturas, cada una en 6 pagarés
  FOR r IN
    SELECT * FROM (VALUES
      ('F30000104295', DATE '2026-05-13', 11345.39, 61.25, 'E310000013001',
       E'e-NCF E310000013001 (vence 31-12-2026) - factura en US$, tasa 61.25\nGravado 9,614.74 | Exento 0.00 | ITBIS 1,730.65 | TOTAL 11,345.39\n1 x MOTOCICLETA X1000 CRF250 AD GOMAS DUAL @ 1,652.54\n2 x MOTOCICLETA X1000 HAMMER 125 @ 1,059.32\n1 x MOTOCICLETA X1000 CRF250A GOMAS OFF ROAD @ 1,618.64\n2 x TRICICLO 200ZH5DL CON PALANCA X1000 @ 2,097.46\n6 x ENDOSOS DE PLACA @ 5.00'),

      ('F30000106027', DATE '2026-07-01',  6877.70, 61.00, 'E310000014131',
       E'e-NCF E310000014131 (vence 31-12-2027) - factura en US$, tasa 61.00\nGravado 5,828.56 | Exento 0.00 | ITBIS 1,049.14 | TOTAL 6,877.70\n1 x MOTOCICLETA X1000 CRF250A GOMAS OFF ROAD @ 1,618.64\n2 x TRICICLO 200ZH5DL CON PALANCA X1000 @ 2,097.46\n3 x ENDOSOS DE PLACA @ 5.00')
    ) AS t(factura, fecha_fac, total_usd, tasa, ncf, detalle)
  LOOP
    -- 5 cuotas iguales y la última cuadra el total al centavo
    v_cuota  := ROUND(r.total_usd / 6, 2);
    v_ultima := ROUND(r.total_usd - v_cuota * 5, 2);

    FOR i IN 1..6 LOOP
      INSERT INTO public.compras (
        tenant_id, numero, fecha, suplidor_id, referencia, notas,
        total_exento, total_gravado, itbis_total, total_compra,
        forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
        itbis_incluido, actualizar_precios,
        moneda, tasa_cambio, total_usd, pendiente_usd, legacy_id
      )
      SELECT
        v_cam,
        'FIN-' || right(r.factura, 5) || '-' || lpad(i::text, 2, '0'),
        r.fecha_fac, v_ter,
        'Factura ' || r.factura || ' - Pagaré ' || i || '/6 (TERUEL & COMPANIA SRL)',
        CASE WHEN i = 1 THEN r.detalle
             ELSE 'Cuota ' || i || '/6 de la factura ' || r.factura || ' - detalle completo en la cuota 1' END,
        ROUND((CASE WHEN i = 6 THEN v_ultima ELSE v_cuota END) * r.tasa, 2), 0, 0,
        ROUND((CASE WHEN i = 6 THEN v_ultima ELSE v_cuota END) * r.tasa, 2),
        'CREDITO', v_dias[i],
        0,
        ROUND((CASE WHEN i = 6 THEN v_ultima ELSE v_cuota END) * r.tasa, 2),
        'PENDIENTE', false, false,
        'USD', r.tasa,
        CASE WHEN i = 6 THEN v_ultima ELSE v_cuota END,
        CASE WHEN i = 6 THEN v_ultima ELSE v_cuota END,
        'papel:cxp:teruel:' || r.factura || ':P' || i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.compras c
        WHERE c.tenant_id = v_cam
          AND c.legacy_id = 'papel:cxp:teruel:' || r.factura || ':P' || i
      );
    END LOOP;
  END LOOP;

  -- 2) Recalcular el saldo inicial contra lo detallado (no resta: reconstruye,
  --    así se puede volver a correr cuando aparezcan las facturas que faltan)
  SELECT COALESCE(SUM(total_usd), 0) INTO v_detallado
    FROM public.compras
   WHERE tenant_id = v_cam AND suplidor_id = v_ter
     AND legacy_id LIKE 'papel:cxp:teruel:%';

  v_resto := v_total_orig - v_detallado;

  SELECT id INTO v_si_id FROM public.compras
   WHERE tenant_id = v_cam AND legacy_id = v_si_legacy;

  SELECT COALESCE(SUM(abonado_usd), 0) INTO v_pagado
    FROM public.pagos_suplidores_detalle WHERE compra_id = v_si_id;

  IF v_resto < v_pagado THEN
    RAISE EXCEPTION 'Teruel: lo detallado (US$%) deja un resto de US$% menor que lo ya pagado (US$%). Revisa antes de seguir.',
      v_detallado, v_resto, v_pagado;
  END IF;

  UPDATE public.compras
     SET total_usd       = v_resto,
         total_compra    = ROUND(v_resto * COALESCE(tasa_cambio, 60), 2),
         pendiente_usd   = v_resto - v_pagado,
         monto_pendiente = ROUND((v_resto - v_pagado) * COALESCE(tasa_cambio, 60), 2),
         referencia      = regexp_replace(referencia, '\s+—.*$', '')
                           || ' — resto sin documentar (facturas detalladas aparte)'
   WHERE id = v_si_id;

  RAISE NOTICE 'Teruel: documentado US$% | resto sin documentar US$% | abonado US$%',
    v_detallado, v_resto, v_pagado;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_teruel_facturas.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 12 pagarés (6 por factura) con su vencimiento
SELECT numero, referencia, fecha, dias_credito,
       (fecha + dias_credito)::date AS vence, total_usd, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:teruel:%'
ORDER BY numero;
-- esperado: F30000104295 -> 5 de 1,890.90 + 1 de 1,890.89 = 11,345.39
--           F30000106027 -> 5 de 1,146.28 + 1 de 1,146.30 =  6,877.70

-- 2) Cada factura debe sumar EXACTO su total impreso
SELECT split_part(legacy_id, ':', 4) AS factura,
       count(*) AS pagares, SUM(total_usd) AS total_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:teruel:%'
GROUP BY 1 ORDER BY 1;
-- esperado: F30000104295 | 6 | 11,345.39     F30000106027 | 6 | 6,877.70

-- 3) EL NÚMERO QUE IMPORTA: el saldo inicial + lo detallado sigue en US$32,885
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_del_saldo_inicial_y_facturas
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND estado = 'PENDIENTE'
  AND (legacy_id = 'papel:cxp:2026-07-14:4' OR legacy_id LIKE 'papel:cxp:teruel:%');
-- esperado: 32,885.00 — el mismo de antes de correr el script

-- 4) Cuánto falta por documentar (el hueco a buscar en papeles)
SELECT 89885.00 AS deuda_original_usd,
       COALESCE(SUM(total_usd), 0) AS documentado_usd,
       89885.00 - COALESCE(SUM(total_usd), 0) AS falta_documentar_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:teruel:%';
-- hoy: documentado 18,223.09 | falta 71,661.91 del total original
-- (de esos, US$57,000 ya están pagados, así que sin documentar deben
--  US$14,661.91 — que es lo que queda vivo en el saldo inicial)
