-- =====================================================================
-- La promesa de pago se cierra sola cuando el cliente paga
-- ---------------------------------------------------------------------
-- (2026-07-30) "La cliente acaba de pagar; según la regla debe quitarse la
-- promesa de pago de ese día."
--
-- JHENDRY E. ENCARNACION SANCHEZ tenía promesa para el 30/07/2026 por
-- RD$13,510. Pagó el 30/07 y el recibo siguió mostrando el cartel
-- 🤝 PROMESA DE PAGO, porque la promesa solo se cerraba a mano desde
-- Gestión de Cobro.
--
-- >>> LA REGLA <<<
-- Al registrar un pago se cierran las promesas de ESE cliente con fecha
-- de HOY o de ATRÁS. Una promesa vencida o de hoy ya no sirve de
-- recordatorio: el cliente vino y pagó. Las promesas con fecha FUTURA no se
-- tocan — si prometió para el 15/08 y hoy abonó algo, esa promesa sigue en
-- pie.
--
-- >>> SI PAGÓ MENOS DE LO PROMETIDO <<<
-- La promesa se cierra igual —vino y pagó, que es lo que el cartel
-- recordaba— pero queda escrito cuánto prometió y cuánto trajo:
--
--   resultado: "Pago 0147716: RD$ 6,755.00 (prometió RD$ 13,510.00)"
--   metadata:  { cerrada_por_pago, monto_pagado, fecha_pago }
--
-- Así el gestor ve en el historial que quedó corto y registra la siguiente
-- promesa por el resto, en vez de arrastrar un cartel que ya no dice nada.
-- Si prefieres que solo se cierre cuando pague el monto COMPLETO, es
-- cambiar una línea (la del CASE de abajo por un AND en el WHERE).
--
-- Idempotente / re-ejecutable.
-- =====================================================================

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

  IF position('cerrada_por_pago' in v_src) > 0 THEN
    RAISE NOTICE 'La promesa ya se cerraba sola.';
    RETURN;
  END IF;

  v_src := replace(v_src,
$viejo$  -- contabilidad: Recibo de Ingreso (caja / transacciones / dashboard)$viejo$,
$nuevo$  -- La promesa de pago se cierra sola: el cliente vino y pago, el cartel
  -- ya no recuerda nada. Solo las de hoy o de atras — una promesa para el
  -- mes que viene sigue en pie aunque hoy haya abonado algo.
  -- Si pago menos de lo prometido tambien se cierra, pero queda escrito
  -- cuanto trajo contra cuanto prometio.
  UPDATE public.cobro_gestiones g
     SET estado    = 'cumplida',
         resultado = COALESCE(NULLIF(btrim(g.resultado), '') || ' · ', '')
                   || 'Pago ' || v_numero || ': RD$ ' || to_char(v_total, 'FM999,999,990.00')
                   || CASE WHEN COALESCE(g.monto_promesa, 0) > 0
                            AND v_total + 0.005 < g.monto_promesa
                           THEN ' (prometio RD$ ' || to_char(g.monto_promesa, 'FM999,999,990.00') || ')'
                           ELSE '' END,
         metadata  = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
                       'cerrada_por_pago', v_numero,
                       'monto_pagado',     v_total,
                       'fecha_pago',       v_asof)
   WHERE g.tenant_id  = v_tenant
     AND g.cliente_id = p_cliente_id
     AND g.tipo       = 'promesa_pago'
     AND g.estado NOT IN ('cumplida', 'cancelada')
     AND g.fecha_promesa IS NOT NULL
     AND g.fecha_promesa <= v_asof;

  -- contabilidad: Recibo de Ingreso (caja / transacciones / dashboard)$nuevo$);

  IF position('cerrada_por_pago' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo enganchar el cierre de la promesa — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'La promesa de pago ahora se cierra al registrar el pago.';
END $$;

-- ------------------------------------------------------------
-- La promesa que quedó abierta hoy: se cierra con su pago
-- ------------------------------------------------------------
-- El pago ya está registrado; esto solo pone al día la promesa que el
-- enganche de arriba habría cerrado.
UPDATE public.cobro_gestiones g
   SET estado    = 'cumplida',
       resultado = COALESCE(NULLIF(btrim(g.resultado), '') || ' · ', '')
                 || 'Pago ' || pg.numero || ': RD$ ' || to_char(pg.total_pagado, 'FM999,999,990.00')
                 || CASE WHEN COALESCE(g.monto_promesa, 0) > 0
                          AND pg.total_pagado + 0.005 < g.monto_promesa
                         THEN ' (prometio RD$ ' || to_char(g.monto_promesa, 'FM999,999,990.00') || ')'
                         ELSE '' END,
       metadata  = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
                     'cerrada_por_pago', pg.numero,
                     'monto_pagado',     pg.total_pagado,
                     'fecha_pago',       pg.fecha)
  FROM public.prestamo_pagos pg
 WHERE pg.tenant_id  = g.tenant_id
   AND pg.cliente_id = g.cliente_id
   AND g.tipo   = 'promesa_pago'
   AND g.estado NOT IN ('cumplida', 'cancelada')
   AND g.fecha_promesa IS NOT NULL
   AND pg.fecha >= g.fecha_promesa
   -- el pago mas reciente que la cumple, para no pisar el texto varias veces
   AND pg.id = (SELECT p2.id FROM public.prestamo_pagos p2
                 WHERE p2.tenant_id = g.tenant_id AND p2.cliente_id = g.cliente_id
                   AND p2.fecha >= g.fecha_promesa
                 ORDER BY p2.fecha DESC, p2.created_at DESC LIMIT 1);

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('promesa_se_cierra_al_pagar.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA PROMESA DE JHENDRY, YA CERRADA
SELECT cl.nombre, g.fecha_promesa, g.monto_promesa, g.estado, g.resultado,
       g.metadata->>'cerrada_por_pago' AS recibo
FROM public.cobro_gestiones g
JOIN public.clientes cl ON cl.id = g.cliente_id
WHERE g.tipo = 'promesa_pago'
  AND cl.nombre ILIKE '%JHENDRY%'
ORDER BY g.created_at DESC;
-- esperado: estado 'cumplida' y en resultado el recibo con lo que pagó
-- contra lo que prometió. En pantalla el cartel 🤝 ya no sale.

-- 2) PROMESAS QUE SIGUEN ABIERTAS, y si el cliente ya pagó
SELECT cl.nombre, g.fecha_promesa, g.monto_promesa, g.estado,
       (SELECT MAX(p.fecha) FROM public.prestamo_pagos p
         WHERE p.cliente_id = g.cliente_id AND p.tenant_id = g.tenant_id) AS ultimo_pago
FROM public.cobro_gestiones g
JOIN public.clientes cl ON cl.id = g.cliente_id
WHERE g.tipo = 'promesa_pago'
  AND g.estado NOT IN ('cumplida', 'cancelada')
  AND g.fecha_promesa IS NOT NULL
ORDER BY g.fecha_promesa;
-- esperado: ninguna con ultimo_pago >= fecha_promesa. Las que queden son
-- promesas a futuro o clientes que no han pagado — que es justo lo que el
-- cartel tiene que seguir recordando.
