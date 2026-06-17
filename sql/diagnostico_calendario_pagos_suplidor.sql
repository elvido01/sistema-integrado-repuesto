-- ============================================================
-- CALENDARIO DE PAGOS POR SUPLIDOR (ventanas de 15 dias)
-- ============================================================
-- READ ONLY. Complementa diagnostico_situacion_caja_compras.sql.
--
-- Contexto real del negocio:
--   - Se compra a credito, pero los plazos VARIAN por suplidor.
--   - Distribuidores que visitan cada 15 dias = facturas que vencen
--     cada 15 dias (compromiso rodante rapido).
--   - Otros suplidores a 30/60 dias.
--
-- Objetivo: ver CUANDO y A QUIEN hay que pagar, para escalonar las
-- compras nuevas de forma que la deuda venza despues de que entre la
-- caja de las ventas.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECCION A — PERFIL DE CREDITO POR SUPLIDOR
-- ════════════════════════════════════════════════════════════
-- Cuanto le debes a cada suplidor, su plazo, y cuando vence lo mas proximo.
SELECT 'SECCION A: Perfil de credito por suplidor' AS seccion;
WITH cxp AS (
  SELECT
    c.suplidor_id,
    COALESCE(c.dias_credito, pr.dias_credito, 0) AS dias_credito_factura,
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) AS pendiente
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = public.get_user_tenant()
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01
)
SELECT
  pr.nombre                                  AS suplidor,
  COALESCE(pr.dias_credito, 0)               AS dias_credito_config,
  pr.vende_a_credito,
  COUNT(*)                                   AS facturas_pendientes,
  ROUND(SUM(cxp.pendiente), 2)               AS total_debes,
  MIN(cxp.fecha_vence)                        AS proximo_vencimiento,
  ROUND(SUM(CASE WHEN cxp.fecha_vence <= CURRENT_DATE + 15 THEN cxp.pendiente ELSE 0 END), 2) AS vence_proximos_15d
FROM cxp
JOIN public.proveedores pr ON pr.id = cxp.suplidor_id
GROUP BY pr.nombre, pr.dias_credito, pr.vende_a_credito
ORDER BY vence_proximos_15d DESC, total_debes DESC;


-- ════════════════════════════════════════════════════════════
-- SECCION B — CALENDARIO DE PAGOS EN VENTANAS DE 15 DIAS
-- ════════════════════════════════════════════════════════════
-- Cuanto tienes que desembolsar en cada quincena de los proximos 90 dias.
SELECT 'SECCION B: Calendario de pagos por quincena' AS seccion;
WITH cxp AS (
  SELECT
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) AS pendiente
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = public.get_user_tenant()
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01
)
SELECT
  CASE
    WHEN fecha_vence < CURRENT_DATE             THEN '0. VENCIDO (pagar ya)'
    WHEN fecha_vence <= CURRENT_DATE + 15        THEN '1. Quincena 1 (dia 1-15)'
    WHEN fecha_vence <= CURRENT_DATE + 30        THEN '2. Quincena 2 (dia 16-30)'
    WHEN fecha_vence <= CURRENT_DATE + 45        THEN '3. Quincena 3 (dia 31-45)'
    WHEN fecha_vence <= CURRENT_DATE + 60        THEN '4. Quincena 4 (dia 46-60)'
    WHEN fecha_vence <= CURRENT_DATE + 90        THEN '5. Dia 61-90'
    ELSE '6. Mas de 90 dias'
  END AS quincena,
  COUNT(*)                AS facturas,
  ROUND(SUM(pendiente),2) AS a_pagar
FROM cxp
GROUP BY 1
ORDER BY 1;


-- ════════════════════════════════════════════════════════════
-- SECCION C — VENTAS DIARIAS PROMEDIO (capacidad de generar caja)
-- ════════════════════════════════════════════════════════════
-- Cuanto entra en promedio por dia. Sirve para saber cuanta caja
-- generas en cada ventana de 15 dias (ingreso quincenal estimado).
SELECT 'SECCION C: Capacidad de generar caja' AS seccion;
WITH v AS (
  SELECT COALESCE(SUM(f.total), 0) AS ventas_30d,
         COALESCE(SUM(CASE WHEN UPPER(COALESCE(f.forma_pago,'')) = 'CONTADO' THEN f.total ELSE 0 END), 0) AS contado_30d
  FROM public.facturas f
  WHERE f.tenant_id = public.get_user_tenant()
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 30
)
SELECT
  ROUND(ventas_30d, 2)            AS ventas_totales_30d,
  ROUND(contado_30d, 2)          AS ventas_contado_30d,
  ROUND(ventas_30d / 30.0, 2)    AS venta_promedio_diaria,
  ROUND(contado_30d / 30.0, 2)   AS contado_promedio_diario,
  ROUND(contado_30d / 2.0, 2)    AS caja_estimada_por_quincena,
  '-> Compara caja_estimada_por_quincena con el a_pagar de cada quincena en SECCION B' AS interpretacion
FROM v;


-- ════════════════════════════════════════════════════════════
-- SECCION D — VEREDICTO POR QUINCENA: ¿alcanza la caja?
-- ════════════════════════════════════════════════════════════
-- Cruza lo que generas por quincena (contado) contra lo que debes pagar.
SELECT 'SECCION D: Caja generada vs deuda, por quincena' AS seccion;
WITH cxp AS (
  SELECT
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) AS pendiente
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = public.get_user_tenant()
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01
),
deuda_q AS (
  SELECT
    CASE
      WHEN fecha_vence <= CURRENT_DATE + 15 THEN 1
      WHEN fecha_vence <= CURRENT_DATE + 30 THEN 2
      WHEN fecha_vence <= CURRENT_DATE + 45 THEN 3
      WHEN fecha_vence <= CURRENT_DATE + 60 THEN 4
      ELSE 9
    END AS q,
    SUM(pendiente) AS a_pagar
  FROM cxp
  WHERE fecha_vence <= CURRENT_DATE + 60
  GROUP BY 1
),
caja AS (
  SELECT COALESCE(SUM(CASE WHEN UPPER(COALESCE(forma_pago,'')) = 'CONTADO' THEN total ELSE 0 END),0) / 2.0 AS caja_quincena
  FROM public.facturas
  WHERE tenant_id = public.get_user_tenant()
    AND estado <> 'Anulada'
    AND fecha >= CURRENT_DATE - 30
)
SELECT
  CASE deuda_q.q
    WHEN 1 THEN 'Quincena 1 (dia 1-15)'
    WHEN 2 THEN 'Quincena 2 (dia 16-30)'
    WHEN 3 THEN 'Quincena 3 (dia 31-45)'
    WHEN 4 THEN 'Quincena 4 (dia 46-60)'
  END                                          AS quincena,
  ROUND(deuda_q.a_pagar, 2)                    AS debes_pagar,
  ROUND(caja.caja_quincena, 2)                 AS caja_estimada,
  ROUND(caja.caja_quincena - deuda_q.a_pagar, 2) AS margen_quincena,
  CASE
    WHEN caja.caja_quincena - deuda_q.a_pagar >= 0 THEN 'OK: te alcanza, hay margen para comprar'
    ELSE 'DEFICIT: esta quincena NO alcanza, NO sumes deuda que venza aqui'
  END                                          AS veredicto
FROM deuda_q, caja
WHERE deuda_q.q IN (1,2,3,4)
ORDER BY deuda_q.q;
