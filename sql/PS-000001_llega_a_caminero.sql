-- =====================================================================
-- Los RD$90,000 de PS-000001 entran en Caminero
-- ---------------------------------------------------------------------
-- (2026-08-20) MotoPrestamos pago y Caminero no registro nada. Este archivo
-- cierra ese caso concreto.
--
-- >>> NO REPITE LA LOGICA: LLAMA AL RPC DE VERDAD <<<
-- Seria mas facil escribir aqui el INSERT del recibo a mano. Seria tambien
-- la tercera vez en un dia que una correccion hecha a mano se olvida de
-- tocar algo. Asi que esto se hace pasando por
-- `sincronizar_pago_a_dealer`, el mismo camino que van a usar todos los
-- pagos de aqui en adelante: si el mecanismo tiene un fallo, aparece aqui y
-- no dentro de un mes.
--
-- Para poder llamarlo hace falta que `get_user_tenant()` responda, y
-- get_user_tenant() lee auth.uid(). Se le presta la identidad del usuario
-- que hizo el pago — set_config es LOCAL a la transaccion, asi que no
-- sobrevive a este archivo.
--
-- El recibo va en EFECTIVO y con la fecha del pago (20/08), asi que cae en
-- el cuadre de Caminero de ese dia. El porque del efectivo esta explicado
-- en pago_a_suplidor_llega_al_dealer.sql: las dos empresas comparten las
-- cuentas fisicas, y acreditar una cuenta haria desaparecer la salida de
-- Odalys.
--
-- Idempotente: el RPC no crea un segundo recibo para el mismo pago.
-- =====================================================================

DO $$
DECLARE
  v_pago   uuid;
  v_user   uuid;
  v_tenant uuid;
  v_out    json;
BEGIN
  SELECT id, usuario_id INTO v_pago, v_user
  FROM public.pagos_suplidores
  WHERE numero = 'PS-000001'
    AND tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

  IF v_pago IS NULL THEN RAISE EXCEPTION 'No se encontro PS-000001'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- Que la identidad prestada resuelva a la financiera, y no a otra
  -- empresa del mismo usuario: escribir en el dealer equivocado seria peor
  -- que no escribir nada.
  v_tenant := public.get_user_tenant();
  IF v_tenant IS DISTINCT FROM '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid THEN
    RAISE EXCEPTION 'La sesion prestada resuelve a % y se esperaba MotoPrestamos', v_tenant;
  END IF;

  v_out := public.sincronizar_pago_a_dealer(v_pago, 'Efectivo');
  RAISE NOTICE 'sincronizar_pago_a_dealer: %', v_out;

  IF NOT (v_out ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'No se pudo sincronizar: %', v_out ->> 'motivo';
  END IF;
END $$;

SELECT public.registrar_migracion('PS-000001_llega_a_caminero.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  r.numero                                   AS recibo_en_caminero,
  r.fecha,
  r.monto_pagado,
  r.formas_pago -> 0 ->> 'forma'             AS forma,
  (SELECT count(*) FROM public.recibos_ingreso_detalle d WHERE d.recibo_id = r.id) AS facturas_abonadas,
  -- Las dos puntas de la misma deuda, que es lo que tiene que cuadrar.
  (SELECT round(SUM(f.monto_pendiente), 2) FROM public.facturas f
     JOIN public.clientes c ON c.id = f.cliente_id
    WHERE f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
      AND c.codigo LIKE 'FIN-%')             AS cxc_caminero,
  (SELECT round(SUM(monto_pendiente), 2) FROM public.compras
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND suplidor_id = '980dcebe-aeab-45b2-bbfb-fbe11553bdef') AS cxp_motoprestamos
FROM public.recibos_ingreso r
WHERE r.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND r.origen = 'pago_suplidor:PS-000001';
