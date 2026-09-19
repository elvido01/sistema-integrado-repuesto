-- =====================================================================
-- LOS PAGOS QUE NUNCA LLEGARON A CAMINERO SE REPONEN
-- =====================================================================
-- Compañero de el_financiamiento_nace_enganchado.sql, que hay que correr
-- ANTES: aquel pone la etiqueta que falta, este mueve el dinero.
--
-- De los 9 pagos que MotoPrestamos Los Naranjos le hizo a Caminero Motors
-- (RD$490,102.86), al dealer solo le entraron RD$432,271.14. Faltan
-- RD$57,831.72, por DOS motivos distintos:
--
--   PS-000006  59,000.00 -> 49,516.67   faltan  9,483.33   CxP sin etiqueta
--   PS-000007   9,484.00 ->  5,034.47   faltan  4,449.53   CxP sin etiqueta
--   PS-000008   4,450.00 ->      0.00   faltan  4,450.00   CxP sin etiqueta
--   PS-000009   4,448.86 ->      0.00   faltan  4,448.86   CxP sin etiqueta
--   PS-000004  35,000.00 ->      0.00   faltan 35,000.00   OTRO MOTIVO (*)
--
-- (*) PS-000004 tenia su etiqueta correcta desde siempre (FIN-000012-01 ->
--     factura 25). Se pago desde el boton "Pagar" del tablero
--     (src/pages/HomePage.jsx), que NUNCA llama a sincronizar_pago_a_dealer.
--     La prueba: la factura 25 es de RD$250,000, recibio RD$215,000 y le
--     quedan pendientes exactamente RD$35,000. Dos minutos despues el mismo
--     dia se hizo PS-000005 desde la pantalla buena y ese si cruzo.
--     Que las tres pantallas avisen al dealer se arregla en el codigo, no
--     aqui.
--
-- >>> QUE HACE <<<
-- 1. PARCHEA sincronizar_pago_a_dealer para que se pueda llamar VARIAS
--    VECES en la misma transaccion. Hoy crea su tabla temporal _abonos con
--    ON COMMIT DROP y sin soltarla antes, asi que la segunda llamada de la
--    misma transaccion revienta con "relation _abonos already exists". Sin
--    esto, esta misma reparacion no se puede correr entera.
-- 2. DESHACE los dos recibos que quedaron CORTOS (RI-000057 y RI-000058).
--    Hace falta porque sincronizar_pago_a_dealer es a prueba de
--    repeticiones: si ve un recibo vivo para ese pago devuelve "ya_estaba"
--    y no recalcula. desincronizar_pago_a_dealer devuelve lo abonado y
--    marca el recibo anulado (no lo borra: un ingreso que existio y se
--    deshizo tiene que poder verse). Los nuevos recibos salen con numero
--    nuevo.
-- 3. SINCRONIZA los cinco pagos.
-- 4. PS-000004 se fecha HOY. El recibo se crea en efectivo con la fecha del
--    pago, y Caminero ya tiene CERRADA y cuadrada la caja del 09/09
--    (RD$300,000, diferencia 0.00). Meterle RD$35,000 a un dia cerrado va
--    contra la regla del dueno de no tocar cierres viejos, asi que entra en
--    la caja de hoy. Decision del dueno, 19/09/2026. Los otros cuatro son
--    del 18/09, que todavia no se ha cerrado, y entran con su propia fecha.
--
-- >>> POR QUE HAY QUE HACERLO TODO EN UNA SOLA TRANSACCION <<<
-- desincronizar_pago_a_dealer pone las facturas en PENDIENTE sin condicion.
-- RI-000057 toca las facturas 14, 15, 16 y 17, y la 14 hoy esta PAGADA. Si
-- se deshace y el re-sincronizado no termina, esa factura queda marcada
-- pendiente con el saldo devuelto. Este archivo corre entero o no corre.
--
-- >>> LA IMPERSONACION <<<
-- Las dos RPC resuelven la empresa con get_user_tenant(), asi que hay que
-- correrlas como un usuario de la FINANCIERA. Se usa juan caminero rio
-- (ebb94ffc), cuya empresa activa es MotoPrestamos y que ademas es quien
-- hizo PS-000004 y PS-000009. OJO: yerlin caraballo, que hizo los otros
-- tres, tiene Caminero como empresa activa y habria reparado en la empresa
-- equivocada. El DO comprueba el tenant antes de tocar nada.
--
-- Idempotente: correrlo otra vez deshace y rehace los mismos recibos con el
-- mismo resultado, y no vuelve a mover la fecha de PS-000004.
-- =====================================================================

SELECT public.registrar_migracion('los_pagos_perdidos_llegan_al_dealer.sql');

-- ------------------------------------------------------------
-- 1. QUE LA RPC SE PUEDA LLAMAR VARIAS VECES POR TRANSACCION
-- ------------------------------------------------------------
DO $parche$
DECLARE
  v_src text;
  v_n   int;
BEGIN
  v_src := pg_get_functiondef('public.sincronizar_pago_a_dealer(uuid,text)'::regprocedure);

  IF position('DROP TABLE IF EXISTS _abonos' in v_src) > 0 THEN
    RAISE NOTICE 'La RPC ya suelta su tabla temporal: no se toca';
    RETURN;
  END IF;

  v_n := (length(v_src) - length(replace(v_src, 'CREATE TEMP TABLE _abonos ON COMMIT DROP AS', '')))
         / length('CREATE TEMP TABLE _abonos ON COMMIT DROP AS');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperaba una sola tabla temporal _abonos y encontre %', v_n;
  END IF;

  EXECUTE replace(v_src,
    'CREATE TEMP TABLE _abonos ON COMMIT DROP AS',
    'DROP TABLE IF EXISTS _abonos;' || chr(10) ||
    '  CREATE TEMP TABLE _abonos ON COMMIT DROP AS');
END $parche$;

-- ------------------------------------------------------------
-- 2. QUE PAGOS HAY QUE REPONER
-- ------------------------------------------------------------
-- Se decide ANTES de impersonar, y a proposito: el recibo vive en el
-- DEALER, asi que un usuario de la financiera no lo ve (RLS se lo tapa) y
-- la comprobacion daria siempre "no hay recibo". Aqui todavia se mira con
-- el rol de servicio, que ve las dos empresas.
--
-- No hay numeros de pago escritos a mano: se pide lo que NO cuadra.
--   _rehacer     = tiene recibo vivo pero por menos de lo que se pago
--   _sincronizar = no tiene recibo, y tiene al menos una CxP enganchada
--                  (sin esa condicion la RPC responderia ok:false y esto
--                   reventaria por un pago que no le toca al dealer)
CREATE TEMP TABLE _rehacer ON COMMIT DROP AS
SELECT p.id, p.numero
  FROM public.pagos_suplidores p
  JOIN public.recibos_ingreso ri
    ON ri.origen = 'pago_suplidor:' || p.numero
   AND COALESCE(ri.anulado, false) = false
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND COALESCE(p.anulado, false) = false
   AND round(p.monto_pagado - ri.monto_pagado, 2) <> 0;

CREATE TEMP TABLE _sincronizar ON COMMIT DROP AS
SELECT p.id, p.numero
  FROM public.pagos_suplidores p
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND COALESCE(p.anulado, false) = false
   AND EXISTS (SELECT 1 FROM public.pagos_suplidores_detalle d
                 JOIN public.compras c ON c.id = d.compra_id
                WHERE d.pago_id = p.id AND c.factura_dealer_id IS NOT NULL)
   AND (p.id IN (SELECT id FROM _rehacer)
        OR NOT EXISTS (SELECT 1 FROM public.recibos_ingreso ri
                        WHERE ri.origen = 'pago_suplidor:' || p.numero
                          AND COALESCE(ri.anulado, false) = false));

GRANT SELECT ON _rehacer, _sincronizar TO authenticated;

-- ------------------------------------------------------------
-- 3. REPONERLOS (como la financiera)
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ebb94ffc-9c5c-419a-889d-a354964f57bc","role":"authenticated"}';

DO $reparar$
DECLARE
  v_fin uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  r     record;
  res   json;
BEGIN
  IF public.get_user_tenant() IS DISTINCT FROM v_fin THEN
    RAISE EXCEPTION 'La impersonacion no cayo en MotoPrestamos, cayo en %', public.get_user_tenant();
  END IF;

  -- Los que quedaron cortos: se deshacen para poder rehacerlos enteros.
  FOR r IN SELECT id, numero FROM _rehacer ORDER BY numero LOOP
    res := public.desincronizar_pago_a_dealer(r.id);
    IF NOT COALESCE((res->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'No se pudo deshacer %: %', r.numero, COALESCE(res->>'motivo', res::text);
    END IF;
  END LOOP;

  -- Y ahora si, los que le faltan al dealer.
  FOR r IN SELECT id, numero FROM _sincronizar ORDER BY numero LOOP
    res := public.sincronizar_pago_a_dealer(r.id, 'Efectivo');
    IF NOT COALESCE((res->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'No se pudo sincronizar %: %', r.numero, COALESCE(res->>'motivo', res::text);
    END IF;
  END LOOP;
END $reparar$;

RESET ROLE;

-- ------------------------------------------------------------
-- 4. PS-000004 ENTRA EN LA CAJA DE HOY, NO EN UN DIA CERRADO
-- ------------------------------------------------------------
UPDATE public.recibos_ingreso ri
   SET fecha    = current_date,
       concepto = ri.concepto || ' - se registra el ' || to_char(current_date, 'DD/MM/YYYY')
                  || ' porque la caja del ' || to_char(p.fecha, 'DD/MM/YYYY') || ' ya estaba cerrada'
  FROM public.pagos_suplidores p
 WHERE p.numero = 'PS-000004'
   AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND ri.origen = 'pago_suplidor:PS-000004'
   AND COALESCE(ri.anulado, false) = false
   AND ri.fecha = p.fecha;          -- solo la primera vez

DO $prueba$
DECLARE
  v_mal     int;
  v_pagado  numeric;
  v_llegado numeric;
  v_fecha   date;
  v_fin uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
BEGIN
  -- a) Cada pago de la financiera tiene que haber llegado COMPLETO.
  SELECT count(*) INTO v_mal
    FROM public.pagos_suplidores p
   WHERE p.tenant_id = v_fin
     AND COALESCE(p.anulado, false) = false
     AND round(p.monto_pagado - COALESCE((
           SELECT ri.monto_pagado FROM public.recibos_ingreso ri
            WHERE ri.origen = 'pago_suplidor:' || p.numero
              AND COALESCE(ri.anulado, false) = false), 0), 2) <> 0;
  IF v_mal > 0 THEN
    RAISE EXCEPTION '% pago(s) de la financiera siguen sin llegarle completos al dealer', v_mal;
  END IF;

  -- b) Y lo que llego tiene que ser exactamente lo que se pago.
  SELECT COALESCE(sum(p.monto_pagado), 0) INTO v_pagado
    FROM public.pagos_suplidores p
   WHERE p.tenant_id = v_fin AND COALESCE(p.anulado, false) = false;
  SELECT COALESCE(sum(ri.monto_pagado), 0) INTO v_llegado
    FROM public.recibos_ingreso ri
   WHERE ri.origen LIKE 'pago_suplidor:%' AND COALESCE(ri.anulado, false) = false;
  IF round(v_pagado - v_llegado, 2) <> 0 THEN
    RAISE EXCEPTION 'Pagado RD$% pero llegado RD$%', v_pagado, v_llegado;
  END IF;

  -- c) El recibo de PS-000004 no puede haber caido en la caja cerrada.
  SELECT ri.fecha INTO v_fecha
    FROM public.recibos_ingreso ri
   WHERE ri.origen = 'pago_suplidor:PS-000004' AND COALESCE(ri.anulado, false) = false;
  IF v_fecha IS DISTINCT FROM current_date THEN
    RAISE EXCEPTION 'El recibo de PS-000004 quedo fechado % y tenia que ser hoy', v_fecha;
  END IF;

  RAISE NOTICE 'Llegaron RD$% de RD$% pagados', v_llegado, v_pagado;
END $prueba$;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT p.numero,
       p.monto_pagado                                        AS pagado,
       COALESCE(ri.monto_pagado, 0)                          AS llego,
       round(p.monto_pagado - COALESCE(ri.monto_pagado, 0), 2) AS falta,
       COALESCE(ri.numero, '(sin recibo)')                   AS recibo,
       ri.fecha                                              AS fecha_recibo
  FROM public.pagos_suplidores p
  LEFT JOIN public.recibos_ingreso ri
         ON ri.origen = 'pago_suplidor:' || p.numero
        AND COALESCE(ri.anulado, false) = false
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND COALESCE(p.anulado, false) = false
 ORDER BY p.numero;
