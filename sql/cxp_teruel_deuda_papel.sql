-- =====================================================================
-- TERUEL: "DEUDA PAPEL" — cuadrar el total con su estado de cuenta
-- ---------------------------------------------------------------------
-- (2026-07-28) El Estado Flujo Cliente de Teruel (corte 28/07/2026, 4:35 PM)
-- dice que se le deben US$51,814.06 en la columna Balance.
--
-- Nuestros pagarés suman US$51,810.30. Faltan US$3.76 para que el total
-- coincida con el de ellos, y eso es lo único que hace este script.
--
-- >>> POR QUE SOLO US$3.76 <<<
-- La diferencia grande (US$2,484.66) desapareció al corregir la factura
-- 14628: le faltaba un motor y su valor real es US$4,961.80 en 6 pagos, no
-- US$2,480.90. Con eso los dos totales quedaron a menos de 4 dólares.
--
-- >>> LO QUE ESTE SCRIPT NO HACE, A PROPOSITO <<<
-- Mes a mes nuestros montos NO coinciden con los de Teruel, y no se tocan.
-- Cuadrarlos exigiría mover 17 pagarés a meses que nada tienen que ver con
-- su vencimiento real y partir un pagaré en 17 pedazos de centavos: el total
-- se vería bien y Cuentas por Pagar dejaría de servir para saber cuándo hay
-- que pagar.
--
-- La causa real del desfase es que los vencimientos de los 3 conduces
-- (F30000102680, F30000105108, F30000105109) se estimaron con el patrón de
-- Motores del Sur porque los papeles no traían calendario. Se arregla de
-- verdad cuando Teruel mande el estado con DETALLE POR DOCUMENTO, como el
-- que mandó Super Gato: ahí cada pagaré va a su mes sin inventar nada.
--
-- Vence en 2027/10 (el último mes del calendario de Teruel) para no inflar
-- la caja que se necesita en los próximos meses por 4 dólares.
--
-- Idempotente por compras.legacy_id.
-- =====================================================================

DO $$
DECLARE
  v_cam   uuid    := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_ter   uuid    := '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f';  -- TERUEL & COMPANIA SRL
  v_monto numeric := 3.76;
  v_tasa  numeric := 61.00;
  v_fecha date    := DATE '2026-07-28';
  v_vence date    := DATE '2027-10-28';
  v_n     int;
BEGIN
  INSERT INTO public.compras (
    tenant_id, numero, fecha, suplidor_id, referencia, notas,
    total_exento, total_gravado, itbis_total, total_compra,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
    itbis_incluido, actualizar_precios,
    moneda, tasa_cambio, total_usd, pendiente_usd, legacy_id
  )
  SELECT
    v_cam, 'DEUDA-PAPEL-TER', v_fecha, v_ter,
    'DEUDA PAPEL - cuadre con estado de cuenta Teruel 28/07/2026',
    E'Ajuste para que el total coincida con la columna Balance del Estado\n'
    || E'Flujo Cliente de Teruel del 28/07/2026: US$51,814.06.\n'
    || E'Nuestros pagarés sumaban US$51,810.30.\n'
    || E'NO cuadra los montos POR MES: eso se arregla cuando Teruel mande el\n'
    || E'estado con detalle por documento (los vencimientos de los 3 conduces\n'
    || E'están estimados, no confirmados por ellos).',
    ROUND(v_monto * v_tasa, 2), 0, 0, ROUND(v_monto * v_tasa, 2),
    'CREDITO', (v_vence - v_fecha),
    0, ROUND(v_monto * v_tasa, 2), 'PENDIENTE',
    false, false,
    'USD', v_tasa, v_monto, v_monto,
    'papel:cxp:teruel:DEUDA-PAPEL'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.compras c
    WHERE c.tenant_id = v_cam AND c.legacy_id = 'papel:cxp:teruel:DEUDA-PAPEL'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE NOTICE 'La DEUDA PAPEL de Teruel ya existía — no se duplicó.';
  ELSE
    RAISE NOTICE 'DEUDA PAPEL creada: US$% (vence %)', v_monto, v_vence;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_teruel_deuda_papel.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL NÚMERO QUE IMPORTA: el total con Teruel debe dar US$51,814.06
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd,
       51814.06 - COALESCE(SUM(pendiente_usd), 0) AS diferencia_con_su_estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f'
  AND estado = 'PENDIENTE';
-- esperado: 51,814.06 | diferencia 0.00

-- 2) De qué se compone esa deuda, documento por documento
SELECT COALESCE(split_part(legacy_id, ':', 4), regexp_replace(numero, '-\d{2}$', '')) AS documento,
       count(*) AS pagares, SUM(total_usd) AS total, SUM(pendiente_usd) AS pendiente
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f'
  AND estado = 'PENDIENTE'
GROUP BY 1 ORDER BY 1;
-- esperado: F30000102680, F30000104295, F30000105108, F30000105109,
--           F30000106027, OC-0004 (4,961.80), OC-0005, DEUDA-PAPEL (3.76)

-- 3) Cómo se reparte por mes contra el estado de Teruel (informativo:
--    NO tiene que cuadrar mes a mes, ver la nota de arriba)
SELECT to_char((fecha + dias_credito)::date, 'YYYY/MM') AS mes,
       SUM(pendiente_usd) AS nuestro
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '1fe3ea65-aecf-41bb-a9d9-d44a7270b62f'
  AND estado = 'PENDIENTE'
GROUP BY 1 ORDER BY 1;
-- Teruel dice: 06/227.26  07/8,310.00  08/10,067.44  09/8,465.61
--              10/6,153.00  11/5,860.41  12/2,595.00  01/1,757.81
--              02..08/931.00  09/930.53  10/930.00
