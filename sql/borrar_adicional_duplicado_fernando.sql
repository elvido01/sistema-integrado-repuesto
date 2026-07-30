-- =====================================================================
-- Borrar el ADICIONAL duplicado de FERNANDO DE LEON (AD-0000393)
-- ---------------------------------------------------------------------
-- (2026-07-30) "El adicional de Fernando del 21/07 es un error, elimínalo."
--
-- Está duplicado. El mismo cargo de RD$3,000 quedó dos veces:
--
--   AD-0010639  fecha 31/07  "Completivo del inicial - factura #13
--                             (CAMINERO MOTORS)"   ligado a PT-0026579
--                             ← lo creó MotoFlow al financiar la venta
--
--   AD-0000393  fecha 16/07  "ADICIONAL"           sin préstamo
--                             creado 21/07 12:35 por el sync del SiiF
--                             ← ESTE ES EL QUE SOBRA
--
-- El 21/07 que se ve en pantalla es el `created_at`: el día que el respaldo
-- diario lo trajo del SiiF. Allá es AD-0000393 del 16/07 con referencia
-- PT-0026582, que es el número del MISMO financiamiento en el sistema viejo
-- (en MotoFlow ese préstamo es PT-0026579; PT-0026582 nunca se importó).
--
-- Se puede borrar sin arrastrar nada: monto_pagado = 0, no está anulado y
-- ninguna nota de crédito lo toca.
--
-- >>> OJO: VA A VOLVER MAÑANA <<<
-- scripts/migracion-siif/fase-financiera-cxc.mjs hace
--   upsert(cargoRows, { onConflict: 'tenant_id,numero' })
-- con `anulado: false` dentro del payload. O sea que mientras AD-0000393
-- siga existiendo en el SiiF, el respaldo diario lo vuelve a crear — y
-- anularlo tampoco aguanta, porque el upsert le pone anulado=false otra vez.
--
-- Para que no vuelva hay que borrarlo TAMBIÉN en el SiiF. Si prefieres
-- dejarlo allá, dime y le pongo al ETL una lista de exclusión.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_cli   uuid := '6de1ddd8-4738-4ccd-89e5-2af87fd46f03';  -- FERNANDO DE LEON (MotoPréstamos)
  v_ten   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_id    uuid;
  v_monto numeric;
BEGIN
  SELECT c.id, c.monto INTO v_id, v_monto
  FROM public.prestamo_cargos c
  WHERE c.tenant_id = v_ten
    AND c.cliente_id = v_cli
    AND c.numero = 'AD-0000393';

  IF v_id IS NULL THEN
    RAISE NOTICE 'AD-0000393 ya no existe. Nada que borrar.';
    RETURN;
  END IF;

  -- Guardas: si alguna se dispara, el cargo NO es el que creemos y hay que
  -- mirarlo a mano antes de tocar nada.
  IF EXISTS (SELECT 1 FROM public.prestamo_cargos c
              WHERE c.id = v_id AND COALESCE(c.monto_pagado, 0) > 0) THEN
    RAISE EXCEPTION 'AD-0000393 tiene pagos aplicados — no se borra a ciegas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.prestamo_nota_credito_detalle d WHERE d.cargo_id = v_id) THEN
    RAISE EXCEPTION 'AD-0000393 está en una nota de crédito — no se borra a ciegas.';
  END IF;

  -- Y que el bueno siga ahí: si no existiera, borrar este dejaría al cliente
  -- SIN el adicional en vez de sin el duplicado.
  IF NOT EXISTS (SELECT 1 FROM public.prestamo_cargos c
                  WHERE c.tenant_id = v_ten AND c.cliente_id = v_cli
                    AND c.numero = 'AD-0010639' AND NOT COALESCE(c.anulado, false)) THEN
    RAISE EXCEPTION 'No aparece AD-0010639 (el bueno). Revisar antes de borrar.';
  END IF;

  DELETE FROM public.prestamo_cargos WHERE id = v_id;
  RAISE NOTICE 'Borrado AD-0000393 de FERNANDO DE LEON (RD$ %). Queda AD-0010639.', v_monto;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('borrar_adicional_duplicado_fernando.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) A FERNANDO LE QUEDA UN SOLO ADICIONAL
SELECT c.numero, c.fecha, c.descripcion, c.monto, c.monto_pagado, c.estado,
       CASE WHEN c.prestamo_id IS NULL THEN 'sin préstamo' ELSE p.numero END AS prestamo,
       c.created_at
FROM public.prestamo_cargos c
LEFT JOIN public.prestamos p ON p.id = c.prestamo_id
WHERE c.cliente_id = '6de1ddd8-4738-4ccd-89e5-2af87fd46f03'
  AND NOT COALESCE(c.anulado, false)
ORDER BY c.fecha;
-- esperado: 1 fila — AD-0010639, 31/07, 3,000.00, préstamo PT-0026579

-- 2) SU BALANCE, PARA VER QUE BAJÓ LOS 3,000
SELECT COALESCE(SUM(c.monto - COALESCE(c.monto_pagado, 0)), 0) AS cargos_pendientes
FROM public.prestamo_cargos c
WHERE c.cliente_id = '6de1ddd8-4738-4ccd-89e5-2af87fd46f03'
  AND NOT COALESCE(c.anulado, false);
-- esperado: 3,000.00 (antes 6,000.00 — los "Otros Cargos" de la pantalla)
