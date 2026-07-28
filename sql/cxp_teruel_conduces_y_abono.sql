-- =====================================================================
-- CxP Caminero — TERUEL: cargar los 3 conduces y repartir el abono
-- ---------------------------------------------------------------------
-- (2026-07-28) Continúa a sql/cxp_teruel_facturas.sql, que ya cargó las dos
-- facturas electrónicas (US$18,223.09 en 12 pagarés). Correr ESE primero.
--
-- Ahora entran los tres conduces con los precios confirmados por el usuario.
-- Cada uno lleva EL PLAZO QUE DICE SU PAPEL, no todos son 6:
--
--   doc            fecha       contenido           US$/u   total US$   pagos
--   F30000102680  25-03-2026  12 x NEW LEAD 150    1,150   13,800.00     6
--   F30000105109  05-06-2026   4 x HAMMER 125      1,250    5,000.00     6
--   F30000105108  05-06-2026   1 x SUPER DELIVERY  1,213    1,213.00     4
--                                                          ──────────
--                                                          US$20,013.00
--
-- Los endosos de placa NO se cobran aparte: el propio conduce del 25-03 tiene
-- escrito "13,800", que es 12 x 1,150 pelado.
--
-- >>> LA DIFERENCIA ES ABONO, NO DEUDA NUEVA <<<
-- Con esto los CINCO documentos suman US$38,236.09, pero a Teruel se le deben
-- US$32,885. La diferencia de US$5,351.09 ya estaba pagada: sale de los
-- US$57,000 que el saldo inicial tenía abonados.
--
--   saldo inicial original    US$ 89,885.00   con US$57,000 abonados
--   documentado (5 papeles)   US$ 38,236.09
--                             ─────────────
--   resto sin documentar      US$ 51,648.91   <- se cubre con 51,648.91 del abono
--   abono que sobra           US$  5,351.09   <- baja a los papeles, lo más viejo primero
--
-- El resto queda EXACTAMENTE pagado, así que el saldo inicial sale de cuentas
-- por pagar. Y el pendiente total no se mueve:
--   38,236.09 - 5,351.09 = US$32,885 ✔
--
-- La cascada cae así (por fecha de vencimiento, como cualquier pago):
--   25-04-2026  F30000102680 P1/6   2,300.00  -> saldada
--   26-05-2026  F30000102680 P2/6   2,300.00  -> saldada
--   13-06-2026  F30000104295 P1/6   1,890.90  -> abonados 751.09, quedan 1,139.81
--
-- El pago RD$3,420,000 (US$57,000 a tasa 60) NO se rompe: se parte en la misma
-- proporción y las partes siguen sumando lo mismo.
--
-- Idempotente: al correrlo de nuevo el abono ya no sobra y no reparte nada.
-- =====================================================================

DO $$
DECLARE
  v_cam        uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_ter        uuid    := '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f';  -- TERUEL & COMPANIA SRL
  v_si_legacy  text    := 'papel:cxp:2026-07-14:4';                -- saldo inicial SI-CXP-4
  v_total_orig numeric := 89885.00;
  v_d6         int[]   := ARRAY[31, 62, 92, 123, 153, 184];        -- plazos de 6 pagos
  v_d4         int[]   := ARRAY[31, 62, 92, 123];                  -- plazos de 4 pagos
  v_dias       int[];
  v_detallado  numeric;
  v_resto      numeric;
  v_si_id      uuid;
  v_det_id     uuid;
  v_pago_id    uuid;
  v_ab_usd     numeric;
  v_ab_rd      numeric;
  v_tasa_pago  numeric;
  v_mover      numeric;
  v_falta      numeric;
  v_aplicar    numeric;
  v_cuota      numeric;
  v_ultima     numeric;
  r            record;
  d            record;
  i            int;
BEGIN
  -- 1) Los tres conduces, cada uno con SU plazo
  FOR r IN
    SELECT * FROM (VALUES
      ('F30000102680', DATE '2026-03-25', 13800.00, 60.50, 6,
       E'Conduce F30000102680 - 12 x PASOLA X1000 NEW LEAD 150 @ US$1,150 (a 6 pagos)\nPrecio confirmado por el usuario; el conduce no trae total impreso.\nNEGRO      TBLCKV50XT1004154 / TBLCKV500T1004227 / TBLCKV508T1004167\n           TBLCKV50XT1004185 / TBLCKV503T1004156 / TBLCKV504T1004246\nPLATEADO   TBLCKV505T1004479 / TBLCKV502T1004522 / TBLCKV50XT1004431\n           TBLCKV505T1004465 / TBLCKV505T1004451 / TBLCKV507T1004483\n12 endosos de placa incluidos'),

      ('F30000105109', DATE '2026-06-05',  5000.00, 63.00, 6,
       E'Conduce F30000105109 - 4 x MOTOCICLETA X1000 HAMMER 125 NEGRO @ US$1,250 (a 6 pagos)\nPrecio confirmado por el usuario; el conduce no trae total impreso.\nTBLCJ1771T1006591 / TBLCJ1779T1006614 / TBLCJ1776T1006568 / TBLCJ1770T1006615\n4 endosos de placa incluidos'),

      ('F30000105108', DATE '2026-06-05',  1213.00, 61.00, 4,
       E'Conduce F30000105108 - 1 x MOTOCICLETA X1000 SUPER DELIVERY BLANCO/NEGRO @ US$1,213 (a 4 PAGOS)\nPrecio confirmado por el usuario; el conduce no trae total impreso.\nLHJHJHL06TB400356 - maquina 152FMH26A70217\n1 endoso de placa incluido')
    ) AS t(factura, fecha_fac, total_usd, tasa, pagos, detalle)
  LOOP
    v_dias   := CASE WHEN r.pagos = 4 THEN v_d4 ELSE v_d6 END;
    v_cuota  := ROUND(r.total_usd / r.pagos, 2);
    v_ultima := ROUND(r.total_usd - v_cuota * (r.pagos - 1), 2);

    FOR i IN 1..r.pagos LOOP
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
        'Factura ' || r.factura || ' - Pagaré ' || i || '/' || r.pagos || ' (TERUEL & COMPANIA SRL)',
        CASE WHEN i = 1 THEN r.detalle
             ELSE 'Cuota ' || i || '/' || r.pagos || ' de la factura ' || r.factura || ' - detalle completo en la cuota 1' END,
        ROUND((CASE WHEN i = r.pagos THEN v_ultima ELSE v_cuota END) * r.tasa, 2), 0, 0,
        ROUND((CASE WHEN i = r.pagos THEN v_ultima ELSE v_cuota END) * r.tasa, 2),
        'CREDITO', v_dias[i],
        0,
        ROUND((CASE WHEN i = r.pagos THEN v_ultima ELSE v_cuota END) * r.tasa, 2),
        'PENDIENTE', false, false,
        'USD', r.tasa,
        CASE WHEN i = r.pagos THEN v_ultima ELSE v_cuota END,
        CASE WHEN i = r.pagos THEN v_ultima ELSE v_cuota END,
        'papel:cxp:teruel:' || r.factura || ':P' || i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.compras c
        WHERE c.tenant_id = v_cam
          AND c.legacy_id = 'papel:cxp:teruel:' || r.factura || ':P' || i
      );
    END LOOP;
  END LOOP;

  -- 2) Recalcular el saldo inicial contra TODO lo documentado
  SELECT COALESCE(SUM(total_usd), 0) INTO v_detallado
    FROM public.compras
   WHERE tenant_id = v_cam AND suplidor_id = v_ter
     AND legacy_id LIKE 'papel:cxp:teruel:%';

  v_resto := ROUND(v_total_orig - v_detallado, 2);

  IF v_resto < 0 THEN
    RAISE EXCEPTION 'Teruel: los papeles suman US$%, más que la deuda original de US$%.',
      v_detallado, v_total_orig;
  END IF;

  SELECT id INTO v_si_id FROM public.compras
   WHERE tenant_id = v_cam AND legacy_id = v_si_legacy;

  UPDATE public.compras
     SET total_usd    = v_resto,
         total_compra = ROUND(v_resto * COALESCE(tasa_cambio, 60), 2),
         referencia   = regexp_replace(referencia, '\s+—.*$', '')
                        || ' — resto sin documentar (facturas detalladas aparte)'
   WHERE id = v_si_id;

  -- 3) El abono que ya no cabe en el saldo inicial baja a los papeles,
  --    en cascada por vencimiento (lo más viejo primero).
  SELECT id, pago_id, abonado_usd, monto_abonado
    INTO v_det_id, v_pago_id, v_ab_usd, v_ab_rd
    FROM public.pagos_suplidores_detalle
   WHERE compra_id = v_si_id
   ORDER BY abonado_usd DESC NULLS LAST
   LIMIT 1;

  IF FOUND AND v_ab_usd > v_resto THEN
    v_tasa_pago := CASE WHEN v_ab_usd > 0 THEN v_ab_rd / v_ab_usd ELSE 60 END;
    v_mover := ROUND(v_ab_usd - v_resto, 2);

    -- el detalle del saldo inicial se achica a lo que le toca
    UPDATE public.pagos_suplidores_detalle
       SET abonado_usd   = v_resto,
           monto_abonado = ROUND(v_resto * v_tasa_pago, 2)
     WHERE id = v_det_id;

    v_falta := v_mover;
    FOR d IN
      SELECT c.id, c.total_usd,
             COALESCE((SELECT SUM(x.abonado_usd) FROM public.pagos_suplidores_detalle x
                        WHERE x.compra_id = c.id), 0) AS ya
        FROM public.compras c
       WHERE c.tenant_id = v_cam AND c.suplidor_id = v_ter
         AND c.legacy_id LIKE 'papel:cxp:teruel:%'
       ORDER BY (c.fecha + c.dias_credito), c.numero
    LOOP
      EXIT WHEN v_falta <= 0;
      v_aplicar := LEAST(ROUND(d.total_usd - d.ya, 2), v_falta);
      CONTINUE WHEN v_aplicar <= 0;

      INSERT INTO public.pagos_suplidores_detalle
        (id, pago_id, compra_id, monto_abonado, abonado_usd, tenant_id)
      VALUES
        (gen_random_uuid(), v_pago_id, d.id,
         ROUND(v_aplicar * v_tasa_pago, 2), v_aplicar, v_cam);

      v_falta := ROUND(v_falta - v_aplicar, 2);
    END LOOP;

    RAISE NOTICE 'Abono repartido a los papeles: US$% (quedaron sin aplicar US$%)',
      v_mover - v_falta, v_falta;
  END IF;

  -- 4) Recalcular pagado/pendiente/estado de TODAS las filas de Teruel desde
  --    pagos_suplidores_detalle, que es la única fuente de verdad.
  UPDATE public.compras c
     SET monto_pagado    = COALESCE((SELECT SUM(x.monto_abonado) FROM public.pagos_suplidores_detalle x WHERE x.compra_id = c.id), 0),
         pendiente_usd   = c.total_usd - COALESCE((SELECT SUM(x.abonado_usd) FROM public.pagos_suplidores_detalle x WHERE x.compra_id = c.id), 0),
         monto_pendiente = ROUND((c.total_usd - COALESCE((SELECT SUM(x.abonado_usd) FROM public.pagos_suplidores_detalle x WHERE x.compra_id = c.id), 0))
                                 * COALESCE(c.tasa_cambio, 60), 2),
         estado          = CASE WHEN c.total_usd - COALESCE((SELECT SUM(x.abonado_usd) FROM public.pagos_suplidores_detalle x WHERE x.compra_id = c.id), 0) <= 0
                                THEN 'PAGADA' ELSE 'PENDIENTE' END
   WHERE c.tenant_id = v_cam
     AND (c.legacy_id LIKE 'papel:cxp:teruel:%' OR c.legacy_id = v_si_legacy);

  RAISE NOTICE 'Teruel: documentado US$% | resto US$% (queda saldado)', v_detallado, v_resto;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_teruel_conduces_y_abono.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 5 documentos, cada uno con su plazo y su total
SELECT split_part(legacy_id, ':', 4) AS documento,
       count(*) AS pagares, SUM(total_usd) AS total_usd,
       SUM(pendiente_usd) AS pendiente_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:teruel:%'
GROUP BY 1 ORDER BY 1;
-- esperado:
--   F30000102680  6 pagares  13,800.00  pendiente  9,200.00  (2 saldados)
--   F30000104295  6 pagares  11,345.39  pendiente 10,594.30
--   F30000105108  4 pagares   1,213.00  pendiente  1,213.00
--   F30000105109  6 pagares   5,000.00  pendiente  5,000.00
--   F30000106027  6 pagares   6,877.70  pendiente  6,877.70

-- 2) EL NÚMERO QUE IMPORTA: Teruel debe quedar en US$32,885 de estos papeles
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND estado = 'PENDIENTE'
  AND (legacy_id LIKE 'papel:cxp:teruel:%' OR legacy_id = 'papel:cxp:2026-07-14:4');
-- esperado: 32,885.00

-- 3) El saldo inicial queda SALDADO y fuera de cuentas por pagar
SELECT numero, total_usd, monto_pagado, pendiente_usd, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id = 'papel:cxp:2026-07-14:4';
-- esperado: total_usd 51,648.91 | pendiente 0 | estado PAGADA

-- 4) El pago original NO se rompió: sus partes siguen sumando RD$3,420,000
SELECT d.pago_id, count(*) AS partes,
       SUM(d.monto_abonado) AS suma_rd, SUM(d.abonado_usd) AS suma_usd
FROM public.pagos_suplidores_detalle d
JOIN public.compras c ON c.id = d.compra_id
WHERE c.suplidor_id = '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f'
GROUP BY d.pago_id;
-- esperado: 4 partes | 3,420,000.00 | 57,000.00

-- 5) Dónde cayó el abono de US$5,351.09
SELECT c.numero, c.referencia, (c.fecha + c.dias_credito)::date AS vence,
       c.total_usd, c.monto_pagado, c.pendiente_usd, c.estado
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:teruel:%'
  AND c.monto_pagado > 0
ORDER BY vence;
-- esperado: F30000102680 P1 y P2 saldados (2,300 c/u) y P1 de F30000104295
--           con 751.09 abonados
