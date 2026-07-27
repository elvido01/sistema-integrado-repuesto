-- =====================================================================
-- Arreglar el cierre de caja del 25/07/2026 — MOTOPRESTAMOS LOS NARANJOS
-- ---------------------------------------------------------------------
-- (2026-07-27) Reportado: "el día 25/07 no lo veo en las cuentas bancarias
-- y se supone que debe estar en el de Odalys".
--
-- QUÉ PASÓ: ese día la caja se cerró CUATRO veces y el efectivo se mandó a
-- CAJA CHICA en vez de a OFICINA ODALYS.
--
--   cierre     turno  hora   efectivo  desglose  dif    movimiento
--   943fb890     1    12:19    1,700        0   -1,700  (ninguno)
--   0378ca68     1    19:55    1,300    1,300       0   1,300 -> CAJA CHICA
--   2559e316     1    20:19    1,700    1,700       0   1,700 -> CAJA CHICA
--   7895ae2f     2    20:21    1,700        0   -1,700  1,700 -> CAJA CHICA
--
-- CUÁNTO ERA DE VERDAD: los 5 recibos del día suman 6,700 en efectivo y de la
-- gaveta salieron 5,000 (nómina semanal Sr. Caminero), así que a depositar
-- quedaban 6,700 - 5,000 = 1,700. Se depositaron 4,700: 3,000 de más.
--
-- EL CIERRE BUENO es 2559e316: es el único con el efectivo correcto (1,700)
-- Y el desglose contado cuadrando (1,700, diferencia cero). Los otros tres son
-- intentos: uno se hizo con los recibos a medias (1,300) y dos se grabaron sin
-- contar el desglose.
--
-- QUÉ HACE ESTE SCRIPT
--   1. Manda el movimiento bueno (1,700) a OFICINA ODALYS.
--   2. Borra los DOS movimientos de los cierres repetidos (1,300 y 1,700).
--      Con eso CAJA CHICA vuelve a cero, que es donde estaba.
--   3. Borra los TRES cierres repetidos y deja uno solo ese día.
--
-- Los recibos, los gastos y los préstamos NO se tocan: el dinero de los
-- clientes está bien registrado, lo que estaba mal era el depósito.
--
-- Es transaccional e idempotente: al correrlo de nuevo ya no encuentra nada.
-- =====================================================================

DO $$
DECLARE
  v_ten     uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MOTOPRESTAMOS LOS NARANJOS
  v_odalys  uuid := '88e08d17-50c0-46e2-b6bb-93530e75f9d0';  -- OFICINA ODALYS
  v_bueno   uuid := '2559e316-5e17-4e4e-ad38-d126076d9d24';  -- el cierre que se queda
  v_malos   uuid[] := ARRAY['943fb890-0972-4bae-9895-4bd26e28fd3d',   -- 12:19, sin movimiento
                            '0378ca68-90f6-4717-ad42-d70215428670',   -- 19:55, recibos a medias
                            '7895ae2f-e844-4af7-8da5-65655fcdd59c']::uuid[]; -- 20:21, turno 2
  v_n       int;
BEGIN
  -- Salvaguarda: si el cierre bueno ya no existe, no seguir a ciegas.
  IF NOT EXISTS (SELECT 1 FROM public.cierres_caja
                  WHERE id = v_bueno AND tenant_id = v_ten AND fecha = DATE '2026-07-25') THEN
    RAISE NOTICE 'El cierre bueno del 25/07 ya no está — no se hace nada.';
    RETURN;
  END IF;

  -- 1) El depósito bueno se muda a Odalys
  UPDATE public.movimientos_bancarios
     SET cuenta_id = v_odalys
   WHERE tenant_id   = v_ten
     AND origen_tipo = 'cierre_caja'
     AND origen_id   = v_bueno
     AND cuenta_id  <> v_odalys;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Movimiento del cierre bueno mandado a Odalys: % fila(s)', v_n;

  -- 2) Fuera los depósitos de los cierres repetidos
  DELETE FROM public.movimientos_bancarios
   WHERE tenant_id   = v_ten
     AND origen_tipo = 'cierre_caja'
     AND origen_id   = ANY(v_malos);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Depósitos duplicados borrados: % fila(s)', v_n;

  -- 3) Fuera los cierres repetidos
  DELETE FROM public.cierres_caja
   WHERE tenant_id = v_ten
     AND id = ANY(v_malos);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Cierres duplicados borrados: % fila(s)', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_cierre_25jul_naranjos.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El 25/07 debe quedar con UN solo cierre, de 1,700
SELECT id, fecha, turno, efectivo_en_caja, total_desglose, diferencia, total_recibos
FROM public.cierres_caja
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND fecha = DATE '2026-07-25';
-- esperado: 1 fila | efectivo 1,700 | desglose 1,700 | diferencia 0

-- 2) Y UN solo depósito ese día, en OFICINA ODALYS
SELECT m.fecha, c.banco, c.alias, m.tipo, m.monto, m.concepto
FROM public.movimientos_bancarios m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
WHERE m.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND m.origen_tipo = 'cierre_caja'
  AND m.fecha = DATE '2026-07-25';
-- esperado: 1 fila | OFICINA ODALYS | ENTRADA | 1,700

-- 3) CAJA CHICA debe volver a cero
SELECT c.banco, c.alias,
       COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.monto ELSE -m.monto END), 0) AS neto_movimientos
FROM public.cuentas_bancarias c
LEFT JOIN public.movimientos_bancarios m ON m.cuenta_id = c.id
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
GROUP BY c.id, c.banco, c.alias
ORDER BY c.banco;
-- esperado: CAJA CHICA en 0 y Odalys 1,700 más arriba que antes

-- 4) El cuadre del día: recibos en efectivo - gastos de la gaveta = lo depositado
SELECT
  (SELECT COALESCE(SUM(total_pagado), 0) FROM public.prestamo_pagos
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND fecha = DATE '2026-07-25' AND NOT anulado
      AND (forma_pago IS NULL OR forma_pago ILIKE '%efec%'))            AS recibos_efectivo,
  (SELECT COALESCE(SUM(monto), 0) FROM public.gastos_diarios
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND fecha = DATE '2026-07-25' AND NOT anulado
      AND cuenta_bancaria_id IS NULL AND afecta_caja IS NOT FALSE)      AS gastos_gaveta,
  (SELECT COALESCE(SUM(monto), 0) FROM public.movimientos_bancarios
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND origen_tipo = 'cierre_caja' AND fecha = DATE '2026-07-25')    AS depositado;
-- esperado: 6,700 - 5,000 = 1,700 depositado
