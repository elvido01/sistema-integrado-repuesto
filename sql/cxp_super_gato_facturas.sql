-- =====================================================================
-- CxP Caminero: detallar parte de la deuda de SUPER GATO en sus facturas
-- ---------------------------------------------------------------------
-- (2026-07-27) SUPER GATO SAS (RNC 130878226, Villa González) estaba cargado
-- como un solo "SALDO INICIAL papel" (SI-CXP-6) de US$29,920, con US$9,100 ya
-- pagados → pendiente US$20,820.
--
-- El usuario aportó 3 pre-facturas físicas. Se cargan como una compra cada
-- una, SIN dividir en pagarés (decisión del usuario: "sin dividir los pagos
-- por ahora"), con vencimiento a 6 meses de la fecha del documento.
--
--   FCR005329  26/09/2025  ext. 23008523  4 x SYMAX 180      @1,730 = US$ 6,920
--   FCR005478  30/10/2025  ext. 23008621  4 x GY250 PANTHER  @1,495 = US$ 5,980
--   FCR005584  25/11/2025  ext. 23008705  3 x BENGALA 250    @1,725 = US$ 5,175
--                                                            ─────────────────
--                                                                   US$18,075
--
-- OJO — ESTAS 3 FACTURAS NO SON TODA LA DEUDA:
--     pendiente actual   US$ 20,820
--     detallado ahora    US$ 18,075
--                        ───────────
--     resto sin factura  US$  2,745   (faltan documentos por ese monto)
--
-- Por eso el saldo inicial NO se anula: se REDUCE en los US$18,075 detallados
-- y queda vivo con el resto. El total pendiente de Super Gato NO cambia
-- (2,745 + 18,075 = 20,820).
--
-- LOS US$9,100 YA PAGADOS SE QUEDAN DONDE ESTÁN (enganchados al saldo inicial).
-- No se sabe a cuáles facturas correspondían, y como las 3 cargadas son las
-- más nuevas, lo normal es que ese pago haya cubierto facturas más viejas. Las
-- 3 entran completas como pendientes. Si el pago era de estas, se reasigna
-- después en cascada — el total pendiente es el mismo en cualquier caso.
--
-- Tasa 60.00: la misma del saldo inicial, para que el equivalente en RD$ no
-- se mueva. El US$ es lo autoritativo; cada pago usa la tasa de su día.
--
-- Los chasis/máquina/color de cada moto quedan en `compras.notas` para poder
-- rastrearlas cuando se enganchen al inventario.
--
-- Al no haber pagarés, `cuotas_tipicas` queda NULL para este suplidor y la
-- Orden de Compra NO le inventa un estimado de pago mensual. Correcto por
-- ahora; si luego se dividen los pagos, se sustituyen por filas -01..-0N.
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam       uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_gato      uuid    := '70aa4652-1a34-4633-b779-110bf1d3abcf';  -- SUPER GATO
  v_tasa      numeric := 60.00;      -- misma tasa del saldo inicial
  v_detallado numeric := 18075.00;   -- 6,920 + 5,980 + 5,175
  r           record;
BEGIN
  -- 0) El suplidor factura en dólares
  UPDATE public.proveedores
     SET moneda = 'USD'
   WHERE id = v_gato AND tenant_id = v_cam AND COALESCE(moneda, 'DOP') <> 'USD';

  -- 1) Las 3 facturas, una compra cada una, a 6 meses exactos
  FOR r IN
    SELECT * FROM (VALUES
      ('FCR005329', DATE '2025-09-26', 6920.00, '23008523',
       E'4 x SYMAX 180 (2025) @ US$1,730\n127742  SC4YATDKXS1200002  1P63QMK250100739  NEGRO\n127746  SC4YATDK7S1200006  1P63QMK250100716  NEGRO\n128529  SC4YATDK5S1200120  1P63QMK250100626  BLANCO\n128535  SC4YATDK6S1200126  1P63QMK250100643  BLANCO'),

      ('FCR005478', DATE '2025-10-30', 5980.00, '23008621',
       E'4 x GY250 PANTHER (2025) @ US$1,495 - conduce CNDE004729\n133645  LRPRCM900SA000515  RW166FMM250050754  NEGRO\n133649  LRPRCM900SA000482  RW166FMM250050783  NEGRO\n135626  LRPRCM909SA000559  RW166FMM250050792  ROJO\n135673  LRPRCM905SA000543  RW166FMM250050804  ROJO'),

      ('FCR005584', DATE '2025-11-25', 5175.00, '23008705',
       E'3 x BENGALA 250 (2026) @ US$1,725\n137424  LP7DCNL92T0018653  165FMM T0018653  BLANCO\n137492  LP7DCNL98T0018723  165FMM T0018723  ROJO\n137528  LP7DCNL97T0018759  165FMM T0018759  NEGRO')
    ) AS t(factura, fecha_fac, total_usd, externo, detalle)
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
      'FIN-' || replace(r.factura, 'FCR00', ''),
      r.fecha_fac, v_gato,
      'Factura ' || r.factura || ' (Super Gato)',
      'No. externo ' || r.externo || E' — vence a 6 meses\n' || r.detalle,
      ROUND(r.total_usd * v_tasa, 2), 0, 0, ROUND(r.total_usd * v_tasa, 2),
      'CREDITO',
      -- 6 meses calendario exactos convertidos a días
      ((r.fecha_fac + INTERVAL '6 months')::date - r.fecha_fac),
      0, ROUND(r.total_usd * v_tasa, 2), 'PENDIENTE',
      false, false,
      'USD', v_tasa, r.total_usd, r.total_usd,
      'papel:cxp:factura:' || r.factura
    WHERE NOT EXISTS (
      SELECT 1 FROM public.compras c
      WHERE c.tenant_id = v_cam
        AND c.legacy_id = 'papel:cxp:factura:' || r.factura
    );
  END LOOP;

  -- 2) El saldo inicial se REDUCE (no se anula): todavía quedan US$2,745 sin
  --    documentar. Los US$9,100 pagados siguen enganchados aquí, así que la
  --    fila conserva su monto_pagado y su historial en pagos_suplidores_detalle.
  --    Guardas: solo una vez y solo si el pendiente alcanza.
  UPDATE public.compras
     SET total_usd       = total_usd     - v_detallado,
         pendiente_usd   = pendiente_usd - v_detallado,
         total_compra    = ROUND((total_usd     - v_detallado) * COALESCE(tasa_cambio, v_tasa), 2),
         monto_pendiente = ROUND((pendiente_usd - v_detallado) * COALESCE(tasa_cambio, v_tasa), 2),
         referencia      = referencia || ' — resto; FCR005329/005478/005584 detalladas aparte'
   WHERE tenant_id   = v_cam
     AND suplidor_id = v_gato
     AND legacy_id   = 'papel:cxp:2026-07-14:6'
     AND referencia NOT LIKE '%detalladas aparte%'   -- idempotente
     AND pendiente_usd >= v_detallado;               -- nunca dejarlo en negativo

  IF NOT FOUND THEN
    RAISE NOTICE 'Saldo inicial de Super Gato NO se tocó (ya estaba detallado, o el pendiente no alcanzaba).';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_super_gato_facturas.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las 3 facturas con su vencimiento a 6 meses
SELECT c.numero, c.referencia,
       c.fecha, c.dias_credito,
       (c.fecha + c.dias_credito)::date AS vence,
       c.total_usd, c.pendiente_usd, c.estado
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:factura:FCR%'
ORDER BY c.fecha;
-- esperado: vence 2026-03-26 / 2026-04-30 / 2026-05-25

-- 2) El saldo inicial queda reducido al resto, con su pago intacto
SELECT c.numero, c.referencia, c.total_usd, c.monto_pagado,
       c.pendiente_usd, c.estado,
       (SELECT count(*) FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id) AS pagos_enlazados
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id = 'papel:cxp:2026-07-14:6';
-- esperado: total_usd 11,845 | monto_pagado 546,000 | pendiente_usd 2,745 | pagos_enlazados 1

-- 3) El total pendiente de Super Gato NO cambió: sigue en US$20,820
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd_super_gato,
       COALESCE(SUM(monto_pendiente), 0) AS pendiente_rd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '70aa4652-1a34-4633-b779-110bf1d3abcf'
  AND estado = 'PENDIENTE';
