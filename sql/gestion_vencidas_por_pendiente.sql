-- =====================================================================
-- Vencidas = las que TODAVÍA SE DEBEN, no las que en pesos "no cuadran"
-- ---------------------------------------------------------------------
-- (2026-07-31) "La cantidad de cuotas, la que dice 32, no actualizó."
--
-- No era que no actualizara: la posición y el detalle contaban cosas
-- distintas.
--
--   posición  32 cuotas · RD$2,983,185    total > pagado
--   detalle   25 cuotas · RD$2,945,994    pendiente > 0
--
-- >>> LAS 7 DE DIFERENCIA ESTÁN PAGADAS <<<
-- Todas de TERUEL, todas en dólares, todas con monto_pendiente = 0:
--
--   FIN-02680-01  total RD$139,150.00  pagado RD$138,000.00  pendiente 0
--   FIN-02680-02  total RD$139,150.00  pagado RD$138,000.00  pendiente 0
--   FIN-02680-03  total RD$139,150.00  pagado RD$134,780.00  pendiente 0
--   FIN-04295-01  total RD$115,817.63  pagado RD$111,858.27  pendiente 0
--   FIN-04295-02  total RD$115,817.63  pagado RD$110,806.74  pendiente 0
--   FIN-05108-01  total RD$ 18,498.25  pagado RD$ 17,770.45  pendiente 0
--   FIN-05109-01  total RD$ 52,499.79  pagado RD$ 48,833.14  pendiente 0
--
-- La factura se pactó en US$ y se pagó completa en US$, pero a una tasa MÁS
-- BAJA que la del día de la compra. Los mismos dólares costaron menos pesos:
-- FIN-02680-01 son US$2,300 comprados a 60.5 y pagados a 60.0. Esos
-- RD$1,150 de menos no son deuda — son ganancia cambiaria.
--
-- Preguntar "¿pagó menos pesos de los que costó?" no es lo mismo que
-- preguntar "¿todavía debe algo?". La segunda es la que importa, y es la que
-- ya usaba el detalle. El panel pasa a usarla también.
--
-- Después de esto los dos dicen 25 cuotas · RD$2,945,994.10.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Falta get_gestion_empresarial_ia — corre antes sql/gestion_posicion_grupo.sql';
  END IF;

  IF position('vence < v_hoy AND pendiente > 0' in v_src) > 0 THEN
    RAISE NOTICE 'Las vencidas ya se cuentan por lo pendiente.';
    RETURN;
  END IF;

  v_src := replace(v_src,
$viejo$        'cuotas_vencidas_cant',  (SELECT COUNT(*) FROM cxp WHERE vence < v_hoy AND total > pagado),
        'cuotas_vencidas_monto', (SELECT ROUND(COALESCE(SUM(total - pagado), 0), 2)
                                    FROM cxp WHERE vence < v_hoy AND total > pagado)$viejo$,
$nuevo$        -- Vencida = paso la fecha y TODAVIA SE DEBE. Con "total > pagado"
        -- entraban 7 facturas de TERUEL ya saldadas: en dolares se pagaron
        -- completas, pero a una tasa mas baja que la de la compra, asi que
        -- costaron menos pesos. Esa diferencia es ganancia cambiaria, no
        -- deuda. Es el mismo criterio del detalle que abre con doble clic.
        'cuotas_vencidas_cant',  (SELECT COUNT(*) FROM cxp WHERE vence < v_hoy AND pendiente > 0),
        'cuotas_vencidas_monto', (SELECT ROUND(COALESCE(SUM(pendiente), 0), 2)
                                    FROM cxp WHERE vence < v_hoy AND pendiente > 0)$nuevo$);

  IF position('vence < v_hoy AND pendiente > 0' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo cambiar el criterio de vencidas — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Las vencidas ahora se cuentan por lo que todavia se debe.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_vencidas_por_pendiente.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LOS DOS CRITERIOS, UNO AL LADO DEL OTRO
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
cxp AS (
  SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
         COALESCE(co.total_compra, 0) AS total,
         COALESCE(co.monto_pagado, 0) AS pagado,
         COALESCE(co.monto_pendiente, 0) AS pendiente
  FROM public.compras co
  LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
  CROSS JOIN g
  WHERE co.tenant_id = ANY(g.ids)
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.estado, '') <> 'ANULADA'
    AND COALESCE(co.total_compra, 0) > 0
    AND NOT COALESCE(co.es_saldo_inicial, false)
    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
)
SELECT 'ANTES  (total > pagado)' AS criterio,
       COUNT(*) FILTER (WHERE vence < CURRENT_DATE AND total > pagado) AS cuotas,
       ROUND(COALESCE(SUM(total - pagado) FILTER (WHERE vence < CURRENT_DATE AND total > pagado), 0), 2) AS monto
FROM cxp
UNION ALL
SELECT 'AHORA  (pendiente > 0)',
       COUNT(*) FILTER (WHERE vence < CURRENT_DATE AND pendiente > 0),
       ROUND(COALESCE(SUM(pendiente) FILTER (WHERE vence < CURRENT_DATE AND pendiente > 0), 0), 2)
FROM cxp;
-- esperado: ANTES 32 · 2,983,185.05   AHORA 25 · 2,945,994.10
-- El "AHORA" es el mismo número del detalle que abre con doble clic.

-- 2) LAS 7 QUE SALEN, Y POR QUÉ
SELECT COALESCE(NULLIF(co.numero, ''), NULLIF(co.ncf, ''), NULLIF(co.referencia, '')) AS factura,
       pv.nombre AS suplidor, co.moneda,
       co.total_compra AS costo_rd, co.monto_pagado AS pagado_rd,
       co.monto_pendiente AS pendiente,
       co.total_usd, co.pendiente_usd, co.tasa_cambio AS tasa_de_la_compra,
       ROUND(co.total_compra - co.monto_pagado, 2) AS diferencia_cambiaria
FROM public.compras co
JOIN public.proveedores pv ON pv.id = co.suplidor_id
WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                       '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(co.monto_pendiente, 0) = 0
  AND COALESCE(co.total_compra, 0) > COALESCE(co.monto_pagado, 0)
  AND (co.fecha + COALESCE(co.dias_credito, 0))::date < CURRENT_DATE
ORDER BY factura;
-- esperado: 7 facturas de TERUEL, todas USD, pendiente_usd = 0 (saldadas).
-- La "diferencia_cambiaria" suma RD$37,190.95: es lo que se AHORRÓ pagando
-- a una tasa mas baja que la de la compra, no lo que se debe.
