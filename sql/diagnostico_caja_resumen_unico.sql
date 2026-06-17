-- ============================================================
-- RESUMEN FINANCIERO EN UNA SOLA CONSULTA
-- ============================================================
-- READ ONLY. Devuelve TODO en una tabla (metrica | valor).
-- Corre TODO el bloque de una vez — es una sola sentencia SELECT.
-- ============================================================

WITH tnt AS (
  SELECT ce.tenant_id
  FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL
  ORDER BY ce.nombre LIMIT 1
),
caja AS (
  SELECT public.get_caja_disponible((SELECT tenant_id FROM tnt)) AS j
),
pres AS (
  SELECT public.get_presupuesto_compras_v2((SELECT tenant_id FROM tnt)) AS j
),
cxp AS (  -- cuentas por pagar (lo que debes)
  SELECT
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) AS pend
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(c.estado, '') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) > 0.01
),
cxp_agg AS (
  SELECT
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence < CURRENT_DATE), 0)                                          AS vencido,
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence >= CURRENT_DATE AND fecha_vence <= CURRENT_DATE + 15), 0)    AS b0_15,
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence >  CURRENT_DATE + 15 AND fecha_vence <= CURRENT_DATE + 30), 0) AS b16_30,
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence >  CURRENT_DATE + 30 AND fecha_vence <= CURRENT_DATE + 60), 0) AS b31_60,
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence >  CURRENT_DATE + 60), 0)                                    AS b60mas,
    COALESCE(SUM(pend), 0)                                                                                    AS total,
    COALESCE(SUM(pend) FILTER (WHERE fecha_vence <= CURRENT_DATE + 60), 0)                                    AS vence_60d
  FROM cxp
),
cxc AS (  -- cuentas por cobrar (lo que te deben)
  SELECT
    (f.fecha::date + COALESCE(f.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_cobro,
    COALESCE(f.monto_pendiente, 0) AS pend
  FROM public.facturas f
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(f.estado, '') <> 'Anulada'
    AND COALESCE(f.monto_pendiente, 0) > 0.01
),
cxc_agg AS (
  SELECT
    COALESCE(SUM(pend), 0)                                              AS total,
    COALESCE(SUM(pend) FILTER (WHERE fecha_cobro <= CURRENT_DATE + 60), 0) AS cobrable_60d,
    COALESCE(SUM(pend) FILTER (WHERE fecha_cobro < CURRENT_DATE), 0)    AS vencida
  FROM cxc
),
vts AS (
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * fd.precio END), 0), 2) AS v30,
    ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 60 THEN fd.cantidad * fd.precio END), 0), 2) AS v60,
    ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 90 THEN fd.cantidad * fd.precio END), 0), 2) AS v90,
    ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * COALESCE(p.costo,0) END), 0), 2) AS costo_vendido_30d
  FROM public.facturas f
  JOIN public.facturas_detalle fd ON fd.factura_id = f.id
  LEFT JOIN public.productos p ON p.id = fd.producto_id
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 90
),
liq AS (
  SELECT
    (caja.j->>'caja_disponible')::numeric AS caja_hoy,
    (caja.j->>'ventas_contado_30d')::numeric AS contado_30d,
    cxc_agg.cobrable_60d,
    cxp_agg.vence_60d
  FROM caja, cxc_agg, cxp_agg
)
SELECT m.orden, m.metrica, m.valor FROM (
  SELECT 0  AS orden, 'TENANT' AS metrica, (SELECT nombre FROM public.config_empresa WHERE tenant_id = (SELECT tenant_id FROM tnt) LIMIT 1) AS valor
  UNION ALL SELECT 1,  'CAJA HOY (operacional 30d)',        TO_CHAR(ROUND((caja.j->>'caja_disponible')::numeric,2), 'FM999,999,990.00') FROM caja
  UNION ALL SELECT 2,  'Ventas contado 30d',                TO_CHAR(ROUND((caja.j->>'ventas_contado_30d')::numeric,2), 'FM999,999,990.00') FROM caja
  UNION ALL SELECT 3,  '=== PANEL COMPRA INTELIGENTE ===',  ''
  UNION ALL SELECT 4,  'Presupuesto modo',                  (pres.j->>'modo') FROM pres
  UNION ALL SELECT 5,  'Presupuesto MES (monto_base)',      TO_CHAR(ROUND((pres.j->>'monto_base_mensual')::numeric,2), 'FM999,999,990.00') FROM pres
  UNION ALL SELECT 6,  '(-) Comprado este mes',             TO_CHAR(ROUND((pres.j->>'comprado_mes')::numeric,2), 'FM999,999,990.00') FROM pres
  UNION ALL SELECT 7,  '(-) Caja minima (colchon)',         TO_CHAR(ROUND((pres.j->>'caja_minima')::numeric,2), 'FM999,999,990.00') FROM pres
  UNION ALL SELECT 8,  '= DISP AHORA (lo que muestra el panel)', TO_CHAR(ROUND((pres.j->>'disponible')::numeric,2), 'FM999,999,990.00') FROM pres
  UNION ALL SELECT 10, '--- DEUDA (CxP) ---',               ''
  UNION ALL SELECT 11, 'CxP VENCIDO (pagar ya)',            TO_CHAR(ROUND(vencido,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 12, 'CxP vence 0-15 dias',               TO_CHAR(ROUND(b0_15,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 13, 'CxP vence 16-30 dias',              TO_CHAR(ROUND(b16_30,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 14, 'CxP vence 31-60 dias',              TO_CHAR(ROUND(b31_60,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 15, 'CxP vence 60+ dias',                TO_CHAR(ROUND(b60mas,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 16, 'CxP TOTAL (debes en total)',        TO_CHAR(ROUND(total,2), 'FM999,999,990.00') FROM cxp_agg
  UNION ALL SELECT 20, '--- POR COBRAR (CxC) ---',          ''
  UNION ALL SELECT 21, 'CxC TOTAL (te deben)',              TO_CHAR(ROUND(total,2), 'FM999,999,990.00') FROM cxc_agg
  UNION ALL SELECT 22, 'CxC vencida (cobrar ya)',           TO_CHAR(ROUND(vencida,2), 'FM999,999,990.00') FROM cxc_agg
  UNION ALL SELECT 23, 'CxC cobrable <= 60 dias',           TO_CHAR(ROUND(cobrable_60d,2), 'FM999,999,990.00') FROM cxc_agg
  UNION ALL SELECT 30, '--- VENTAS ---',                    ''
  UNION ALL SELECT 31, 'Ventas 30d',                        TO_CHAR(v30, 'FM999,999,990.00') FROM vts
  UNION ALL SELECT 32, 'Ventas 60d',                        TO_CHAR(v60, 'FM999,999,990.00') FROM vts
  UNION ALL SELECT 33, 'Ventas 90d',                        TO_CHAR(v90, 'FM999,999,990.00') FROM vts
  UNION ALL SELECT 34, 'COSTO de lo vendido 30d (reponer minimo)', TO_CHAR(costo_vendido_30d, 'FM999,999,990.00') FROM vts
  UNION ALL SELECT 40, '=== LIQUIDEZ PROYECTADA 60d ===',   ''
  UNION ALL SELECT 41, 'Formula: caja + cobros60 + contado*2 - deuda60', TO_CHAR(
       ROUND(caja_hoy + cobrable_60d + (contado_30d*2) - vence_60d, 2), 'FM999,999,990.00') FROM liq
) m
ORDER BY m.orden;
