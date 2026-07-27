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
--     deuda original     US$ 29,920
--     detallado ahora    US$ 18,075
--                        ───────────
--     sin documentar     US$ 11,845   ← FALTA AL MENOS UNA FACTURA
--
-- Por eso el saldo inicial NO se anula: queda vivo cubriendo lo que todavía
-- no tiene papel. El total pendiente de Super Gato NO cambia.
--
-- >>> LOS CONDUCES NO SON FACTURAS APARTE <<<
-- Super Gato emite DOS papeles por despacho: un CONDUCE y una PRE-FACTURA, y
-- ambos llevan el MISMO "No. Externo". Ese número identifica la compra real:
--
--   No. Externo   Pre-factura   Conduce        Monto
--   23008523      FCR005329     CNDE004631     US$ 6,920
--   23008621      FCR005478     CNDE004729     US$ 5,980
--   23008705      FCR005584     (sin foto)     US$ 5,175
--
-- Los conduces traen los MISMOS códigos y chasis que su pre-factura (chequeado
-- uno por uno). Cargar un conduce como compra duplicaría el monto y registraría
-- motos que no existen — el chasis es único, no puede estar en dos compras.
--
-- REGLA PARA CLASIFICAR LA PILA: si el No. Externo ya está en la tabla de
-- arriba, ese papel YA está cargado. Solo es compra nueva si trae un No.
-- Externo distinto.
--
-- >>> CÓMO AGREGAR LA FACTURA QUE FALTA <<<
-- Este script RECALCULA (no resta) el saldo inicial a partir de la suma de las
-- facturas ya detalladas, así que es seguro correrlo las veces que haga falta:
--   1. Agrega la factura como una fila más en la lista VALUES de abajo.
--   2. Vuelve a correr el script completo.
-- El saldo inicial se reajusta solo y el total pendiente sigue cuadrando.
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
  v_cam        uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_gato       uuid    := '70aa4652-1a34-4633-b779-110bf1d3abcf';  -- SUPER GATO
  v_si_legacy  text    := 'papel:cxp:2026-07-14:6';                -- saldo inicial SI-CXP-6
  v_tasa       numeric := 60.00;      -- misma tasa del saldo inicial
  v_total_orig numeric := 29920.00;   -- deuda original del saldo inicial (NO tocar)
  v_detallado  numeric;               -- se calcula: suma de las facturas cargadas
  v_pagado     numeric;               -- se calcula: lo ya abonado al saldo inicial
  v_resto      numeric;
  r            record;
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

      -- ↓↓↓ AQUÍ VA LA FACTURA QUE FALTA (hueco de US$11,845) ↓↓↓
      -- Copia el patrón de arriba, pon una coma al final de la línea anterior
      -- y vuelve a correr el script completo. Se ajusta todo solo.
      --
      -- ,('FCR00XXXX', DATE 'AAAA-MM-DD', 0000.00, '2300XXXX',
      --   E'N x MODELO (AÑO) @ US$0,000\ncódigo  chasis  máquina  COLOR')
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

  -- 2) El saldo inicial se RECALCULA contra lo ya detallado.
  --    No resta: reconstruye el valor desde cero cada vez. Por eso se puede
  --    correr N veces y se puede agregar la factura que falta después.
  SELECT COALESCE(SUM(total_usd), 0) INTO v_detallado
    FROM public.compras
   WHERE tenant_id = v_cam
     AND suplidor_id = v_gato
     AND legacy_id LIKE 'papel:cxp:factura:FCR%';

  -- Lo ya pagado se lee del historial real, no se asume
  SELECT COALESCE(SUM(d.abonado_usd), 0) INTO v_pagado
    FROM public.pagos_suplidores_detalle d
    JOIN public.compras c ON c.id = d.compra_id
   WHERE c.tenant_id = v_cam AND c.legacy_id = v_si_legacy;

  v_resto := v_total_orig - v_detallado;   -- lo que aún no tiene papel

  IF v_resto < v_pagado THEN
    -- Las facturas detalladas ya superan lo que queda por documentar:
    -- el saldo inicial no puede absorberlas sin quedar negativo.
    RAISE EXCEPTION 'Super Gato: lo detallado (US$%) deja un resto de US$% menor que lo ya pagado (US$%). Revisa las facturas antes de seguir.',
      v_detallado, v_resto, v_pagado;
  END IF;

  --    Los US$9,100 pagados siguen enganchados aquí: la fila conserva su
  --    monto_pagado y su historial en pagos_suplidores_detalle.
  UPDATE public.compras
     SET total_usd       = v_resto,
         pendiente_usd   = v_resto - v_pagado,
         total_compra    = ROUND(v_resto * COALESCE(tasa_cambio, v_tasa), 2),
         monto_pendiente = ROUND((v_resto - v_pagado) * COALESCE(tasa_cambio, v_tasa), 2),
         estado          = CASE WHEN v_resto - v_pagado <= 0 THEN 'PAGADA' ELSE 'PENDIENTE' END,
         -- se reescribe entera (no se acumula sufijo al correr de nuevo)
         referencia      = regexp_replace(referencia, '\s+—.*$', '')
                           || ' — resto sin documentar (facturas detalladas aparte)'
   WHERE tenant_id   = v_cam
     AND suplidor_id = v_gato
     AND legacy_id   = v_si_legacy;

  RAISE NOTICE 'Super Gato: detallado US$% | pagado US$% | resto sin documentar US$% (pendiente US$%)',
    v_detallado, v_pagado, v_resto, v_resto - v_pagado;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_super_gato_facturas.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las facturas cargadas con su vencimiento a 6 meses
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
-- esperado: 20,820 USD / 1,249,200 RD — igual que antes de correr el script

-- 4) CUÁNTO FALTA POR DOCUMENTAR (el hueco a buscar en papeles)
SELECT 29920.00 AS deuda_original_usd,
       COALESCE(SUM(c.total_usd), 0) AS documentado_usd,
       29920.00 - COALESCE(SUM(c.total_usd), 0) AS falta_documentar_usd,
       count(*) AS facturas_cargadas
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:factura:FCR%';
-- hoy: documentado 18,075 | falta 11,845 | 3 facturas
-- cuando aparezca la que falta, agrégala arriba y este hueco debe dar 0
