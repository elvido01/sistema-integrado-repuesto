-- =====================================================================
-- Caminero Motors: gasto de GPS del 24/07/2026 que se olvidó
-- ---------------------------------------------------------------------
-- (2026-07-28) Se pidió agregar un gasto de RD$3,600 de GPS al día
-- 24/07/2026, que no se aplicó en su momento.
--
-- NOTA: Caminero ya tiene otro GPS de RD$3,600 el 23/07, que entró en el
-- cierre de ese día (junto a un SEGURO de 1,000, total 4,600). Se preguntó
-- por si era el mismo y EL USUARIO CONFIRMÓ que el del 24 es aparte: son dos
-- cobros distintos, no un duplicado.
--
-- >>> EL CIERRE DEL 24 NO ESTÁ CERRADO <<<
-- Caminero solo tiene grabado el cierre del 23/07. El del 24 nunca se cerró
-- (por eso la pantalla ofrece "Cerrar el Turno" en vez de mostrarlo hecho).
-- O sea que NO hay que modificar nada: el gasto entra solo cuando se cierre.
--
-- Efecto en el cierre del 24: el efectivo esperado baja de RD$28,000 a
-- RD$24,400 (28,000 de recibos - 3,600 del GPS).
--
-- El gasto sale de la GAVETA: sin cuenta bancaria y afecta_caja = true, que
-- es lo que hace que el cierre lo descuente del efectivo.
--
-- Idempotente: no lo crea dos veces.
-- =====================================================================

DO $$
DECLARE
  v_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_n   int;
BEGIN
  INSERT INTO public.gastos_diarios
    (tenant_id, fecha, monto, descripcion, tipo_gasto,
     cuenta_bancaria_id, afecta_caja, anulado)
  SELECT v_cam, DATE '2026-07-24', 3600, 'GPS', 'Operativo',
         NULL,        -- sale de la gaveta, no de una cuenta bancaria
         true,        -- por eso SÍ descuenta del efectivo del cierre
         false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.gastos_diarios
     WHERE tenant_id = v_cam
       AND fecha = DATE '2026-07-24'
       AND monto = 3600
       AND descripcion ILIKE 'GPS'
       AND NOT anulado
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE NOTICE 'El gasto de GPS del 24/07 ya existía — no se duplicó.';
  ELSE
    RAISE NOTICE 'Gasto de GPS del 24/07 creado (RD$3,600).';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gasto_gps_24jul_caminero.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los gastos de Caminero de esos dos días, para comparar
SELECT fecha, monto, tipo_gasto, descripcion,
       CASE WHEN cuenta_bancaria_id IS NULL AND afecta_caja IS NOT FALSE
            THEN 'sale de la gaveta' ELSE 'no toca la caja' END AS origen
FROM public.gastos_diarios
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND fecha BETWEEN DATE '2026-07-23' AND DATE '2026-07-24'
  AND NOT anulado
ORDER BY fecha, descripcion;
-- esperado: GPS 3,600 el 23 y el 24 (confirmado por el usuario: son dos cobros)

-- 2) Cómo queda el efectivo esperado del 24 al cerrar el turno
SELECT
  (SELECT COALESCE(SUM(r.monto_pagado), 0) FROM public.recibos_ingreso r
    WHERE r.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
      AND r.fecha = DATE '2026-07-24' AND NOT r.anulado)          AS recibos,
  (SELECT COALESCE(SUM(g.monto), 0) FROM public.gastos_diarios g
    WHERE g.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
      AND g.fecha = DATE '2026-07-24' AND NOT g.anulado
      AND g.cuenta_bancaria_id IS NULL AND g.afecta_caja IS NOT FALSE) AS gastos_gaveta;
-- esperado: 28,000 - 3,600 = 24,400 de efectivo en caja

-- 3) El 24 NO tiene cierre grabado (por eso no hay nada que modificar)
SELECT fecha, turno, efectivo_en_caja, total_gastos_diarios
FROM public.cierres_caja
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
ORDER BY fecha DESC;
-- esperado: solo aparece el 2026-07-23

