-- =====================================================================
-- SUPER GATO: dejar la CxP idéntica a su estado de cuenta
-- ---------------------------------------------------------------------
-- (2026-07-28) Llegó el Estado de Cuenta real de SUPERGATO SAS (corte
-- 24/07/2026): 17 partidas abiertas por US$20,555.59.
--
-- LO QUE ESTABA BIEN: el total facturado. Ellos facturan US$27,750 y es
-- exactamente lo que teníamos cargado. Los montos por documento estaban
-- correctos.
--
-- LO QUE ESTABA MAL, y sale a la luz con este papel:
--
-- 1) CADA FACTURA VA EN PAGARÉS, no en una sola línea. Super Gato parte
--    cada factura en cuotas mensuales (30 días), igual que los demás
--    suplidores. Nosotros teníamos una línea por factura.
--
-- 2) LA FACTURA DEL CONDUCE 23008447 ES LA "FCR005207". Se había cargado
--    como "CNDE004555" porque solo teníamos el conduce, sin la pre-factura.
--    El monto (US$9,675) era correcto: son 6 pagarés de 1,612.50.
--
-- 3) NO EXISTE EL "RESTO SIN DOCUMENTAR" DE US$2,170. La deuda de Super
--    Gato son esas 4 facturas y nada más. El saldo inicial de papel decía
--    US$29,920 y estaba inflado.
--
-- 4) ELLOS APLICARON MENOS PAGOS QUE NOSOTROS:
--       nosotros teníamos aplicados   US$ 9,100.00
--       ellos reconocen               US$ 7,194.41
--                                     ─────────────
--       diferencia                    US$ 1,905.59
--    Los US$1,905.59 quedan como CRÉDITO A FAVOR sin aplicar, pegados al
--    saldo inicial anulado. HAY QUE RECLAMÁRSELOS A SUPER GATO: o los
--    aplican, o hay que averiguar a qué fueron.
--
--   pendiente nuestro antes  US$ 20,820.00
--   estado de cuenta de ellos US$ 20,555.59
--   diferencia                US$    264.41  (= 2,170 inexistentes - 1,905.59)
--
-- COMO QUEDA: las 22 cuotas de las 4 facturas, con sus vencimientos reales
-- (30 días corridos desde la fecha de cada factura). Las que ellos dan por
-- cobradas quedan PAGADAS, y las 17 abiertas calcan su estado línea por
-- línea, incluida la FCR005207-3 que va parcial (1,612.50 con 666.08
-- abonados = 946.42 pendientes).
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam       uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_gato      uuid := '70aa4652-1a34-4633-b779-110bf1d3abcf';  -- SUPER GATO
  v_si_legacy text := 'papel:cxp:2026-07-14:6';
  v_tasa      numeric := 60.00;
  v_si_id     uuid;
  v_det_id    uuid;
  v_pago_id   uuid;
  v_ab_usd    numeric;
  v_ab_rd     numeric;
  v_tasa_pago numeric;
  v_credito   numeric := 1905.59;   -- lo que Super Gato NO tiene aplicado
  r           record;
  v_id        uuid;
  v_n         int;
BEGIN
  -- 0) Fuera lo que se había cargado a mano: se reemplaza por el estado real.
  --    Primero se sueltan los pagos para no romper la integridad.
  DELETE FROM public.pagos_suplidores_detalle d
   USING public.compras c
   WHERE d.compra_id = c.id
     AND c.tenant_id = v_cam AND c.suplidor_id = v_gato
     AND c.legacy_id LIKE 'papel:cxp:factura:%';
  DELETE FROM public.compras
   WHERE tenant_id = v_cam AND suplidor_id = v_gato
     AND legacy_id LIKE 'papel:cxp:factura:%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Filas viejas de Super Gato eliminadas: %', v_n;

  -- 1) Las 22 cuotas, tal como las lleva Super Gato.
  --    pagado = lo que ellos dan por cobrado en cada una.
  FOR r IN
    SELECT * FROM (VALUES
      -- factura,     conduce,    fecha_fac,          n, vence,              monto,   pagado
      ('FCR005207','23008447', DATE '2025-09-02', 1, DATE '2025-10-02', 1612.50, 1612.50),
      ('FCR005207','23008447', DATE '2025-09-02', 2, DATE '2025-11-01', 1612.50, 1612.50),
      ('FCR005207','23008447', DATE '2025-09-02', 3, DATE '2025-12-01', 1612.50,  666.08),
      ('FCR005207','23008447', DATE '2025-09-02', 4, DATE '2025-12-31', 1612.50,    0.00),
      ('FCR005207','23008447', DATE '2025-09-02', 5, DATE '2026-01-30', 1612.50,    0.00),
      ('FCR005207','23008447', DATE '2025-09-02', 6, DATE '2026-03-01', 1612.50,    0.00),

      ('FCR005329','23008523', DATE '2025-09-26', 1, DATE '2025-10-26', 1153.34, 1153.34),
      ('FCR005329','23008523', DATE '2025-09-26', 2, DATE '2025-11-25', 1153.34, 1153.34),
      ('FCR005329','23008523', DATE '2025-09-26', 3, DATE '2025-12-25', 1153.33,    0.00),
      ('FCR005329','23008523', DATE '2025-09-26', 4, DATE '2026-01-24', 1153.33,    0.00),
      ('FCR005329','23008523', DATE '2025-09-26', 5, DATE '2026-02-23', 1153.33,    0.00),
      ('FCR005329','23008523', DATE '2025-09-26', 6, DATE '2026-03-25', 1153.33,    0.00),

      ('FCR005478','23008621', DATE '2025-10-30', 1, DATE '2025-11-29',  996.65,  996.65),
      ('FCR005478','23008621', DATE '2025-10-30', 2, DATE '2025-12-29',  996.67,    0.00),
      ('FCR005478','23008621', DATE '2025-10-30', 3, DATE '2026-01-28',  996.67,    0.00),
      ('FCR005478','23008621', DATE '2025-10-30', 4, DATE '2026-02-27',  996.67,    0.00),
      ('FCR005478','23008621', DATE '2025-10-30', 5, DATE '2026-03-29',  996.67,    0.00),
      ('FCR005478','23008621', DATE '2025-10-30', 6, DATE '2026-04-28',  996.67,    0.00),

      ('FCR005584','23008705', DATE '2025-11-25', 1, DATE '2025-12-25', 1293.75,    0.00),
      ('FCR005584','23008705', DATE '2025-11-25', 2, DATE '2026-01-24', 1293.75,    0.00),
      ('FCR005584','23008705', DATE '2025-11-25', 3, DATE '2026-02-23', 1293.75,    0.00),
      ('FCR005584','23008705', DATE '2025-11-25', 4, DATE '2026-03-25', 1293.75,    0.00)
    ) AS t(factura, conduce, fecha_fac, n, vence, monto, pagado)
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
      'FIN-' || right(r.factura, 4) || '-' || lpad(r.n::text, 2, '0'),
      r.fecha_fac, v_gato,
      'Factura ' || r.factura || ' - Pagaré ' || r.n || '/'
        || CASE WHEN r.factura = 'FCR005584' THEN 4 ELSE 6 END || ' (Super Gato)',
      'Conduce/No. externo ' || r.conduce
        || ' — según Estado de Cuenta de Super Gato del 24/07/2026',
      ROUND(r.monto * v_tasa, 2), 0, 0, ROUND(r.monto * v_tasa, 2),
      'CREDITO', (r.vence - r.fecha_fac),
      ROUND(r.pagado * v_tasa, 2),
      ROUND((r.monto - r.pagado) * v_tasa, 2),
      CASE WHEN r.pagado >= r.monto THEN 'PAGADA' ELSE 'PENDIENTE' END,
      false, false,
      'USD', v_tasa, r.monto, (r.monto - r.pagado),
      'papel:cxp:gato:' || r.factura || ':P' || r.n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.compras c
      WHERE c.tenant_id = v_cam
        AND c.legacy_id = 'papel:cxp:gato:' || r.factura || ':P' || r.n
    );
  END LOOP;

  -- 2) El saldo inicial de papel se ANULA: la deuda real son esas 4 facturas.
  --    Se queda con el crédito de US$1,905.59 que Super Gato no ha aplicado.
  SELECT id INTO v_si_id FROM public.compras
   WHERE tenant_id = v_cam AND legacy_id = v_si_legacy;

  UPDATE public.compras
     SET estado          = 'ANULADA',
         total_usd       = v_credito,
         total_compra    = ROUND(v_credito * v_tasa, 2),
         monto_pendiente = 0,
         pendiente_usd   = 0,
         referencia      = regexp_replace(referencia, '\s+—.*$', '')
                           || ' — anulado; la deuda real son las 4 facturas del estado de cuenta'
   WHERE id = v_si_id;

  -- 3) El pago de US$9,100: 7,194.41 quedan aplicados a las cuotas (ya van en
  --    monto_pagado arriba) y 1,905.59 se dejan como crédito sin aplicar.
  SELECT id, pago_id, abonado_usd, monto_abonado
    INTO v_det_id, v_pago_id, v_ab_usd, v_ab_rd
    FROM public.pagos_suplidores_detalle
   WHERE compra_id = v_si_id
   ORDER BY abonado_usd DESC NULLS LAST LIMIT 1;

  IF FOUND THEN
    v_tasa_pago := CASE WHEN v_ab_usd > 0 THEN v_ab_rd / v_ab_usd ELSE v_tasa END;
    UPDATE public.pagos_suplidores_detalle
       SET abonado_usd   = v_credito,
           monto_abonado = ROUND(v_credito * v_tasa_pago, 2)
     WHERE id = v_det_id;
    RAISE NOTICE 'Crédito sin aplicar dejado en el saldo inicial: US$%', v_credito;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_super_gato_estado_real.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL NÚMERO QUE IMPORTA: debe dar US$20,555.59, igual que su papel
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '70aa4652-1a34-4633-b779-110bf1d3abcf'
  AND estado = 'PENDIENTE';
-- esperado: 20,555.59

-- 2) Las 17 partidas abiertas, en el mismo orden que su estado de cuenta
SELECT c.numero,
       split_part(c.legacy_id, ':', 4) || '-' || split_part(c.legacy_id, ':P', 2) AS documento,
       substring(c.notas from 'externo (\d+)') AS conduce,
       c.fecha, (c.fecha + c.dias_credito)::date AS vence,
       c.total_usd AS monto, c.pendiente_usd AS pendiente
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:gato:%'
  AND c.estado = 'PENDIENTE'
ORDER BY vence, documento;
-- esperado: 17 filas, empezando por FCR005207-3 (946.42, vence 01/12/2025)
--           y terminando en FCR005478-6 (996.67, vence 28/04/2026)

-- 3) Cada factura debe sumar su total
SELECT split_part(legacy_id, ':', 4) AS factura,
       count(*) AS pagares, SUM(total_usd) AS total, SUM(pendiente_usd) AS pendiente
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:gato:%'
GROUP BY 1 ORDER BY 1;
-- esperado: FCR005207 6/9,675.00 | FCR005329 6/6,920.00
--           FCR005478 6/5,980.00 | FCR005584 4/5,175.00   = 27,750.00

-- 4) El crédito que Super Gato NO ha aplicado (reclamárselo)
SELECT c.numero, c.estado, c.pendiente_usd,
       (SELECT COALESCE(SUM(d.abonado_usd), 0) FROM public.pagos_suplidores_detalle d
         WHERE d.compra_id = c.id) AS credito_sin_aplicar
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id = 'papel:cxp:2026-07-14:6';
-- esperado: ANULADA | pendiente 0 | credito 1,905.59
