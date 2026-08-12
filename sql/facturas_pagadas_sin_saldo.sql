-- =====================================================================
-- Una factura PAGADA no puede arrastrar saldo pendiente
-- ---------------------------------------------------------------------
-- (2026-08-12) Salió mirando la línea "Ventas a crédito sin préstamo" de
-- Gestión Empresarial en Repuestos Morla: 37 facturas por RD$39,420. Al
-- abrirlas, 12 estaban marcadas PAGADA y seguían con `monto_pendiente`
-- por encima de cero.
--
-- No es una deuda. Son ventas de mostrador, de contado, cobradas en
-- efectivo, todas al Cliente Genérico —cuyo balance es 0, o sea que nadie
-- las reclama—. Lo que quedó mal es el campo: se cobró la factura y no se
-- puso el pendiente en cero.
--
-- >>> POR QUÉ IMPORTA MÁS ALLÁ DE ESA PANTALLA <<<
-- `monto_pendiente` es de donde sale el "por cobrar" desde
-- gestion_por_cobrar_real.sql. Mientras esos 12 arrastren saldo, cualquier
-- reporte que sume cuentas por cobrar cuenta RD$4,406 que no existen.
--
-- >>> ALCANCE <<<
-- Hoy solo ocurre en Repuestos Morla (12 facturas). La condición se deja
-- general —PAGADA con pendiente— porque la regla vale para cualquier
-- empresa, no porque haya más casos.
--
-- >>> LO QUE ESTE ARCHIVO NO TOCA <<<
-- Las 3 facturas de contado que quedaron PENDIENTE (#1, #2 y #3 del 6 y 7
-- de julio de 2025). Están al final, comentadas, con lo que se sabe de
-- ellas. Borrarlas o no es una decisión, no un arreglo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. QUE NADIE ESTÉ ESCUCHANDO
-- ------------------------------------------------------------
-- Un trigger de UPDATE en facturas podría recalcular balances de clientes
-- o kardex al pasar por aquí, y eso ya no sería una corrección de un campo
-- suelto. Hoy no hay ninguno; si mañana lo hay, esto se para en vez de
-- enterarse después.
DO $$
DECLARE v_trg text;
BEGIN
  SELECT string_agg(t.tgname, ', ') INTO v_trg
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.facturas'::regclass
    AND NOT t.tgisinternal
    AND (t.tgtype & 16) <> 0;          -- 16 = el bit de UPDATE

  IF v_trg IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay triggers de UPDATE en facturas (%). Míralos antes de correr esto: si recalculan balances, la corrección deja de ser inocente.',
      v_trg;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. QUÉ SE VA A CAMBIAR, ANTES DE CAMBIARLO
-- ------------------------------------------------------------
DO $$
DECLARE v_n int; v_monto numeric;
BEGIN
  SELECT count(*), COALESCE(SUM(monto_pendiente), 0) INTO v_n, v_monto
  FROM public.facturas
  WHERE estado = 'PAGADA' AND COALESCE(monto_pendiente, 0) > 0;

  RAISE NOTICE 'Facturas PAGADAS con saldo: % · RD$ %', v_n, round(v_monto, 2);
END $$;

-- ------------------------------------------------------------
-- 2. LA CORRECCIÓN
-- ------------------------------------------------------------
UPDATE public.facturas
SET monto_pendiente = 0,
    updated_at = now()
WHERE estado = 'PAGADA'
  AND COALESCE(monto_pendiente, 0) > 0;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('facturas_pagadas_sin_saldo.sql');
  END IF;
END $$;

COMMIT;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT count(*) AS pagadas_con_saldo
FROM public.facturas
WHERE estado = 'PAGADA' AND COALESCE(monto_pendiente, 0) > 0;
-- Esperado: 0

-- Y lo que queda por cobrar de verdad en Morla, ya limpio:
SELECT count(*) AS facturas, round(SUM(monto_pendiente), 2) AS por_cobrar
FROM public.facturas
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND COALESCE(monto_pendiente, 0) > 0
  AND COALESCE(estado, '') <> 'ANULADA';
-- Esperado: 25 facturas · RD$ 35,014.18
--   (22 de fiado legítimo + las 3 de contado de abajo, que siguen ahí)


-- =====================================================================
-- PENDIENTE DE DECISIÓN — las tres primeras facturas del sistema
-- ---------------------------------------------------------------------
-- #1, #2 y #3 del 6 y 7 de julio de 2025, marcadas PENDIENTE, con el
-- pendiente igual al total:
--
--     #1  06/07/2025   RD$ 1,472.65   forma_pago = 'contado'
--     #2  07/07/2025   RD$ 1,096.97   forma_pago = 'contado'
--     #3  07/07/2025   RD$ 1,142.05   forma_pago = 'contado'
--
-- Lo que las delata: 'contado' en minúsculas. Todas las facturas reales
-- del sistema lo guardan en MAYÚSCULAS. Y hay OTRAS #1, #2 y #3 —del 9 y
-- 10 de julio, en mayúsculas y con el pendiente en cero— que son la
-- numeración de verdad. O sea: estas tres repiten números que después se
-- volvieron a usar.
--
-- Todo apunta a las pruebas de arranque, tres días antes de empezar. Pero
-- son RD$3,712 y no me consta que nadie deba ese dinero: si alguna es una
-- venta real que quedó sin cobrar, borrarla la desaparece.
--
-- Si se confirma que son pruebas, quitar los comentarios de abajo:
--
-- BEGIN;
-- UPDATE public.facturas
-- SET estado = 'ANULADA', monto_pendiente = 0, updated_at = now()
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
--   AND numero IN (1, 2, 3)
--   AND forma_pago = 'contado'          -- minúsculas: SOLO las de prueba
--   AND estado = 'PENDIENTE';
-- COMMIT;
--
-- Se anulan, no se borran: una factura que desaparece de la numeración es
-- un hueco que nadie sabe explicar seis meses después.
-- =====================================================================
