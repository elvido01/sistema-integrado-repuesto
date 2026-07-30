-- =====================================================================
-- No se puede pagar un pagaré dejando otro anterior sin pagar
-- ---------------------------------------------------------------------
-- (2026-07-30) "El sistema dejó aplicar el pago al pagaré 7/12. No puede
-- dejar pagar pagarés con fechas futuras."
--
-- Pasó de verdad. JHENDRY E. ENCARNACION SANCHEZ, préstamo PT-0026528:
-- el recibo 0147716 (RD$6,755 por transferencia) entró a la cuota 007/012,
-- que vence el 29/12/2026, con la 001 a la 006 abiertas desde junio.
--
--   001/012  vence 29/06/2026   6,755.00   pendiente
--   ...
--   006/012  vence 29/11/2026   6,755.00   pendiente
--   007/012  vence 29/12/2026   6,755.00   PAGADA   ← el pago se fue aquí
--
-- >>> POR QUÉ PASÓ <<<
-- registrar_pago_prestamo tiene dos caminos. El de reparto automático
-- siempre va de la cuota más vieja a la más nueva y estaba bien. El otro
-- —el de abonos exactos, que es el que usa la pantalla cuando se marca una
-- fila— aplicaba lo que le mandaran, a la cuota que fuera, sin mirar si
-- había cuotas anteriores abiertas.
--
-- >>> LA REGLA <<<
-- Un abono no puede entrar a una cuota si queda otra ANTERIOR del mismo
-- préstamo con saldo. Prepagar SIGUE PERMITIDO: si las anteriores ya están
-- saldadas, se puede abonar a una que vence más adelante — que es lo que
-- hace un cliente que se adelanta.
--
-- Y para que un recibo con varias cuotas marcadas no choque contra su
-- propio candado, ahora los abonos se aplican en orden de vencimiento: la
-- más vieja primero, así el candado la ve pagada cuando llega a la
-- siguiente. Las filas de interés corriente ('IC-') van delante y no pasan
-- por el candado: no son cuotas futuras.
--
-- >>> Y SE REPARA EL RECIBO 0147716 <<<
-- Se mueve el abono de la 007/012 a la 001/012, que era la que tocaba. No
-- se toca el monto ni la fecha ni la forma de pago: solo a qué pagaré se
-- aplicó.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL CANDADO
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'registrar_pago_prestamo'
  ORDER BY p.pronargs DESC LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe registrar_pago_prestamo';
  END IF;

  IF position('antes hay que pagar el' in v_src) > 0 THEN
    RAISE NOTICE 'El candado ya estaba puesto.';
    RETURN;
  END IF;

  -- las variables del mensaje de error
  v_src := replace(v_src,
$viejo$  v_ic_monto    numeric;$viejo$,
$nuevo$  v_ic_monto    numeric;
  v_ant_num     int;
  v_ant_fec     date;$nuevo$);

  -- los abonos, en orden de vencimiento
  v_src := replace(v_src,
$viejo$    FOR a IN SELECT * FROM jsonb_array_elements(p_abonos) LOOP$viejo$,
$nuevo$    -- En orden de vencimiento. Si un recibo trae varias cuotas marcadas,
    -- la mas vieja tiene que aplicarse primero: asi el candado de abajo la
    -- ve ya pagada cuando llega a la siguiente. Las filas virtuales de
    -- interes corriente ('IC-') van delante, no son cuotas futuras.
    FOR a IN
      SELECT e.value
      FROM jsonb_array_elements(p_abonos) e
      LEFT JOIN public.prestamo_cuotas oc
             ON oc.tenant_id = v_tenant
            AND oc.id = CASE WHEN (e.value->>'cuota_id') LIKE 'IC-%' THEN NULL
                             ELSE NULLIF(e.value->>'cuota_id', '')::uuid END
      ORDER BY COALESCE(oc.fecha_vencimiento, '-infinity'::date),
               COALESCE(oc.numero_cuota, 0)
    LOOP$nuevo$);

  -- el candado, justo antes de calcular el abono
  v_src := replace(v_src,
$viejo$      ab_cap  := LEAST(round(COALESCE((a->>'capital')::numeric,0),2), GREATEST(q.capital - q.capital_pagado, 0));
      ab_int  := LEAST(round(COALESCE((a->>'interes')::numeric,0),2), GREATEST(q.interes - q.interes_pagado, 0));
      ab_mora := GREATEST(round(COALESCE((a->>'mora')::numeric,0),2), 0);$viejo$,
$nuevo$      -- CANDADO: no se abona a una cuota si hay otra ANTERIOR del mismo
      -- prestamo con saldo. Prepagar sigue permitido — lo que no se permite
      -- es SALTARSE una. El recibo 0147716 entro a la 007/012 (29/12) con
      -- la 001 a la 006 abiertas; esto es lo que lo habria impedido.
      IF (a->>'cuota_id') NOT LIKE 'IC-%' THEN
        SELECT ant.numero_cuota, ant.fecha_vencimiento INTO v_ant_num, v_ant_fec
        FROM public.prestamo_cuotas ant
        WHERE ant.tenant_id = v_tenant
          AND ant.prestamo_id = q.prestamo_id
          AND (ant.fecha_vencimiento, ant.numero_cuota) < (q.fecha_vencimiento, q.numero_cuota)
          AND (COALESCE(ant.capital, 0) + COALESCE(ant.interes, 0))
              - (COALESCE(ant.capital_pagado, 0) + COALESCE(ant.interes_pagado, 0)) > 0.005
        ORDER BY ant.fecha_vencimiento, ant.numero_cuota
        LIMIT 1;

        IF FOUND THEN
          RAISE EXCEPTION 'No se puede abonar al pagare % (vence %): antes hay que pagar el % (vence %).',
            q.numero_cuota, to_char(q.fecha_vencimiento, 'DD/MM/YYYY'),
            v_ant_num, to_char(v_ant_fec, 'DD/MM/YYYY');
        END IF;
      END IF;

      ab_cap  := LEAST(round(COALESCE((a->>'capital')::numeric,0),2), GREATEST(q.capital - q.capital_pagado, 0));
      ab_int  := LEAST(round(COALESCE((a->>'interes')::numeric,0),2), GREATEST(q.interes - q.interes_pagado, 0));
      ab_mora := GREATEST(round(COALESCE((a->>'mora')::numeric,0),2), 0);$nuevo$);

  IF position('antes hay que pagar el' in v_src) = 0
     OR position('En orden de vencimiento' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo poner el candado — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Candado puesto: no se puede saltar un pagare.';
END $$;

-- ------------------------------------------------------------
-- 2) REPARAR EL RECIBO 0147716: de la 007/012 a la 001/012
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ten  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_det  uuid := 'af8c7d10-14e5-42ab-82b5-a84eefd913c7';  -- linea del pago
  v_de   uuid := '96ff6f9b-ede8-474d-a368-ad21f73e7e28';  -- cuota 007/012 (29/12/2026)
  v_a    uuid := '8e726a9e-e680-44e2-8be9-d0a53a4298dd';  -- cuota 001/012 (29/06/2026)
  v_cap  numeric;
  v_int  numeric;
  v_mora numeric;
BEGIN
  SELECT d.abono_capital, d.abono_interes, d.abono_mora
    INTO v_cap, v_int, v_mora
  FROM public.prestamo_pago_detalle d
  WHERE d.id = v_det AND d.tenant_id = v_ten AND d.cuota_id = v_de;

  IF NOT FOUND THEN
    RAISE NOTICE 'El abono ya no esta en la 007/012 — nada que mover.';
    RETURN;
  END IF;

  -- sale de la 007
  UPDATE public.prestamo_cuotas c
     SET capital_pagado = GREATEST(c.capital_pagado - v_cap, 0),
         interes_pagado = GREATEST(c.interes_pagado - v_int, 0),
         mora_pagada    = GREATEST(c.mora_pagada - v_mora, 0)
   WHERE c.id = v_de AND c.tenant_id = v_ten;

  -- entra a la 001
  UPDATE public.prestamo_cuotas c
     SET capital_pagado = c.capital_pagado + v_cap,
         interes_pagado = c.interes_pagado + v_int,
         mora_pagada    = c.mora_pagada + v_mora
   WHERE c.id = v_a AND c.tenant_id = v_ten;

  -- el recibo apunta a la cuota correcta
  UPDATE public.prestamo_pago_detalle d
     SET cuota_id = v_a
   WHERE d.id = v_det AND d.tenant_id = v_ten;

  -- y los dos estados se recalculan de lo que quedo, no a mano
  UPDATE public.prestamo_cuotas c
     SET estado = CASE
           WHEN c.capital_pagado >= c.capital AND c.interes_pagado >= c.interes THEN 'pagada'
           WHEN (c.capital_pagado + c.interes_pagado + c.mora_pagada) > 0 THEN 'parcial'
           ELSE 'pendiente' END
   WHERE c.id IN (v_de, v_a) AND c.tenant_id = v_ten;

  RAISE NOTICE 'Recibo 0147716: RD$ % movidos de la 007/012 a la 001/012.', v_cap + v_int + v_mora;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('pago_no_saltar_pagares.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL PRÉSTAMO DE JHENDRY, CUOTA POR CUOTA
SELECT c.numero_cuota, c.fecha_vencimiento, c.capital, c.capital_pagado, c.estado
FROM public.prestamo_cuotas c
JOIN public.prestamos p ON p.id = c.prestamo_id
WHERE p.numero = 'PT-0026528'
ORDER BY c.numero_cuota;
-- esperado: la 001 pagada (6,755.00) y la 007 pendiente en 0.00.
-- Antes era al revés.

-- 2) A QUÉ CUOTA APUNTA EL RECIBO
SELECT pg.numero AS recibo, pg.fecha, pg.forma_pago, pg.total_pagado,
       c.numero_cuota, c.fecha_vencimiento, d.abono_capital, d.abono_interes, d.abono_mora
FROM public.prestamo_pago_detalle d
JOIN public.prestamo_pagos  pg ON pg.id = d.pago_id
JOIN public.prestamo_cuotas c  ON c.id = d.cuota_id
WHERE pg.numero = '0147716';
-- esperado: cuota 1, vence 29/06/2026, capital 6,755.00

-- 3) NINGÚN PRÉSTAMO CON UNA CUOTA PAGADA Y OTRA ANTERIOR ABIERTA
-- Si aparece alguno más, es del mismo error y hay que moverlo igual.
SELECT p.numero AS prestamo, cl.nombre AS cliente,
       c.numero_cuota AS pagada, c.fecha_vencimiento AS vence_pagada,
       (SELECT MIN(a.numero_cuota) FROM public.prestamo_cuotas a
         WHERE a.prestamo_id = c.prestamo_id
           AND (a.fecha_vencimiento, a.numero_cuota) < (c.fecha_vencimiento, c.numero_cuota)
           AND (a.capital + a.interes) - (a.capital_pagado + a.interes_pagado) > 0.005) AS anterior_abierta
FROM public.prestamo_cuotas c
JOIN public.prestamos p  ON p.id = c.prestamo_id
JOIN public.clientes  cl ON cl.id = p.cliente_id
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND COALESCE(p.estado, '') <> 'castigado'
  AND (c.capital_pagado + c.interes_pagado) > 0.005
  AND EXISTS (SELECT 1 FROM public.prestamo_cuotas a
               WHERE a.prestamo_id = c.prestamo_id
                 AND (a.fecha_vencimiento, a.numero_cuota) < (c.fecha_vencimiento, c.numero_cuota)
                 AND (a.capital + a.interes) - (a.capital_pagado + a.interes_pagado) > 0.005)
ORDER BY cl.nombre, p.numero, c.numero_cuota;
-- OJO: los préstamos migrados del SiiF pueden salir aquí por cómo venían
-- los pagos del sistema viejo. Lo que importa es que NO aparezca
-- PT-0026528 y que de hoy en adelante no se sume ninguno nuevo.
