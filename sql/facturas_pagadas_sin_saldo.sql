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
-- >>> ALCANCE, Y POR QUÉ NO MUEVE NINGÚN CUADRE <<<
-- Solo ocurre en Repuestos Morla (12 facturas). Ninguna otra empresa tiene
-- una sola factura en ese estado. La condición se deja general —PAGADA con
-- pendiente— porque la regla vale para cualquiera, no porque haya más casos.
--
-- Y las 12 son viejas: de julio-2025 a marzo-2026, la más reciente el
-- 12/03/2026. Del mes en curso, ninguna. De hoy, ninguna. Los cuadres de
-- caja además viven en `cierres_caja` con sus totales ya escritos —efectivo
-- en caja, diferencia, desglose—: son una foto firmada, no un cálculo que
-- se rehaga al cambiar una factura de hace cinco meses.
--
-- Por si acaso, el paso 0b se planta si alguna vez apareciera una del mes
-- en curso.
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
-- suelto.
--
-- La primera versión de este freno abortaba ante CUALQUIER trigger de
-- UPDATE, y abortó: existe `update_facturas_updated_at`, que no estaba
-- declarado en el repo. Rendirse ante el nombre no sirve —ni para dejarlo
-- pasar ni para pararlo—, así que ahora se le mira el cuerpo.
--
-- La regla: un trigger que solo sella una marca de tiempo no lee ni
-- escribe nada. Si su código menciona una consulta, una escritura, o
-- alguno de los campos que esta corrección toca, no es un sello y hay que
-- leerlo a mano antes de seguir.
DO $$
DECLARE
  r        record;
  v_malos  text := '';
  v_vistos text := '';
BEGIN
  FOR r IN
    SELECT t.tgname, p.prosrc
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.facturas'::regclass
      AND NOT t.tgisinternal
      AND (t.tgtype & 16) <> 0          -- 16 = el bit de UPDATE
  LOOP
    v_vistos := v_vistos || r.tgname || ' ';
    IF r.prosrc ~* '\m(insert|update|delete|perform|select)\M'
       OR r.prosrc ~* '(monto_pendiente|estado|balance)' THEN
      v_malos := v_malos || r.tgname || ' ';
    END IF;
  END LOOP;

  IF v_malos <> '' THEN
    RAISE EXCEPTION
      'Estos triggers de UPDATE en facturas hacen algo más que sellar la fecha: %. Léelos antes de seguir.',
      btrim(v_malos);
  END IF;

  IF v_vistos <> '' THEN
    RAISE NOTICE 'Triggers de UPDATE revisados y limpios (solo sellan fecha): %', btrim(v_vistos);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 0b. QUE NO SE MUEVA NINGÚN CUADRE
-- ------------------------------------------------------------
-- `cierres_caja` guarda totales cerrados —efectivo en caja, diferencia,
-- desglose—: es una foto firmada, no un cálculo que se rehaga. Aun así, si
-- alguna de las facturas a corregir cayera dentro de un día ya cuadrado,
-- alguien podría comparar el papel con la pantalla y encontrar una
-- diferencia sin explicación.
--
-- Hoy las 12 son de julio-2025 a marzo-2026 y ninguna es del mes en curso,
-- así que esto no debería saltar nunca. Está para el día que sí.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.facturas f
  WHERE f.estado = 'PAGADA'
    AND COALESCE(f.monto_pendiente, 0) > 0
    AND f.fecha >= date_trunc('month', now());

  IF v_n > 0 THEN
    RAISE EXCEPTION
      'Hay % factura(s) a corregir DEL MES EN CURSO. Míralas una por una antes de tocarlas: pueden estar dentro de un cuadre ya cerrado.',
      v_n;
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
