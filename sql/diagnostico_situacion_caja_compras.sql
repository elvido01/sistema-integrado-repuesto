-- ============================================================
-- DIAGNOSTICO FINANCIERO PARA DECISION DE COMPRA
-- ============================================================
-- READ ONLY. Solo SELECTs / llamadas STABLE. No modifica nada.
--
-- Objetivo: saber con exactitud cuanto se puede comprar sin quedarse
-- sin mercancia, considerando que las compras son a credito (ej. 60 dias).
--
-- Correr SECCION por SECCION (cada bloque separado por ';' devuelve
-- su propia tabla de resultados).
--
-- Para foco en un tenant especifico, reemplaza get_user_tenant() por
-- el UUID. Si estas logueado como el tenant, dejalo asi.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECCION 1 — CAJA REAL DISPONIBLE HOY (flujo operacional 30d)
-- ════════════════════════════════════════════════════════════
-- Lo que realmente entro/salio de caja en los ultimos 30 dias:
--   ventas de contado + recibos de cobro − pagos a suplidores − compromisos pagados
SELECT 'SECCION 1: Caja disponible (operacional 30d)' AS seccion;
SELECT public.get_caja_disponible() AS caja_disponible_json;


-- ════════════════════════════════════════════════════════════
-- SECCION 2 — PRESUPUESTO QUE CALCULA EL SISTEMA
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 2: Presupuesto v2 (lo que muestra el panel)' AS seccion;
SELECT public.get_presupuesto_compras_v2() AS presupuesto_v2_json;


-- ════════════════════════════════════════════════════════════
-- SECCION 3 — CUENTAS POR PAGAR (lo que DEBES) CON AGING POR VENCIMIENTO
-- ════════════════════════════════════════════════════════════
-- CLAVE para credito 60 dias: una compra de hoy NO te quita caja hoy,
-- te la quita en (fecha + dias_credito). Aqui ves cuando vence cada deuda.
SELECT 'SECCION 3: Cuentas por pagar por vencimiento' AS seccion;
WITH cxp AS (
  SELECT
    c.id,
    c.numero,
    c.fecha,
    COALESCE(c.dias_credito, pr.dias_credito, 0) AS dias_credito,
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) AS pendiente,
    pr.nombre AS suplidor
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = public.get_user_tenant()
    AND COALESCE(c.estado, '') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) > 0.01
)
SELECT
  CASE
    WHEN fecha_vence < CURRENT_DATE                          THEN '1. VENCIDO (ya deberias haber pagado)'
    WHEN fecha_vence <= CURRENT_DATE + 7                     THEN '2. Vence en 0-7 dias'
    WHEN fecha_vence <= CURRENT_DATE + 30                    THEN '3. Vence en 8-30 dias'
    WHEN fecha_vence <= CURRENT_DATE + 60                    THEN '4. Vence en 31-60 dias'
    ELSE '5. Vence en 60+ dias'
  END AS bucket_vencimiento,
  COUNT(*)                AS num_facturas,
  ROUND(SUM(pendiente),2) AS total_a_pagar
FROM cxp
GROUP BY 1
ORDER BY 1;

-- Total global de lo que debes
SELECT 'SECCION 3b: Total CxP pendiente' AS seccion;
SELECT
  ROUND(COALESCE(SUM(
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0)
  ), 0), 2) AS total_cuentas_por_pagar
FROM public.compras c
WHERE c.tenant_id = public.get_user_tenant()
  AND COALESCE(c.estado, '') NOT ILIKE '%anul%'
  AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) > 0.01;


-- ════════════════════════════════════════════════════════════
-- SECCION 4 — CUENTAS POR COBRAR (lo que TE DEBEN) CON AGING
-- ════════════════════════════════════════════════════════════
-- Caja futura que esperas: facturas a credito pendientes de cobro.
SELECT 'SECCION 4: Cuentas por cobrar por antiguedad' AS seccion;
WITH cxc AS (
  SELECT
    f.id,
    f.fecha,
    COALESCE(f.dias_credito, 0) AS dias_credito,
    (f.fecha::date + COALESCE(f.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_cobro_esperada,
    COALESCE(f.monto_pendiente, 0) AS pendiente
  FROM public.facturas f
  WHERE f.tenant_id = public.get_user_tenant()
    AND COALESCE(f.estado, '') <> 'Anulada'
    AND COALESCE(f.monto_pendiente, 0) > 0.01
)
SELECT
  CASE
    WHEN fecha_cobro_esperada < CURRENT_DATE       THEN '1. VENCIDA (cobrar ya)'
    WHEN fecha_cobro_esperada <= CURRENT_DATE + 30 THEN '2. Cobrable en 0-30 dias'
    WHEN fecha_cobro_esperada <= CURRENT_DATE + 60 THEN '3. Cobrable en 31-60 dias'
    ELSE '4. Cobrable en 60+ dias'
  END AS bucket_cobro,
  COUNT(*)                AS num_facturas,
  ROUND(SUM(pendiente),2) AS total_a_cobrar
FROM cxc
GROUP BY 1
ORDER BY 1;


-- ════════════════════════════════════════════════════════════
-- SECCION 5 — RITMO DE VENTAS (que tan rapido conviertes inventario en caja)
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 5: Ventas por ventana' AS seccion;
SELECT
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_30d,
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 60 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_60d,
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 90 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_90d,
  -- costo de lo vendido (lo que tienes que reponer) 30d
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * COALESCE(p.costo, 0) END), 0), 2) AS costo_vendido_30d
FROM public.facturas f
JOIN public.facturas_detalle fd ON fd.factura_id = f.id
LEFT JOIN public.productos p ON p.id = fd.producto_id
WHERE f.tenant_id = public.get_user_tenant()
  AND f.estado <> 'Anulada'
  AND f.fecha >= CURRENT_DATE - 90;


-- ════════════════════════════════════════════════════════════
-- SECCION 6 — PROYECCION DE LIQUIDEZ A 60 DIAS
-- ════════════════════════════════════════════════════════════
-- La pregunta real: si compro a credito 60 dias, ¿tendre caja para
-- pagar esa compra cuando venza, ademas de lo que ya debo?
--
-- Liquidez proyectada 60d =
--     caja_hoy
--   + cobros esperados (CxC) que vencen en <= 60 dias
--   + ventas de contado proyectadas (ritmo 30d x 2)
--   − CxP que vence en <= 60 dias
SELECT 'SECCION 6: Proyeccion de liquidez a 60 dias' AS seccion;
WITH
caja AS (
  SELECT (public.get_caja_disponible()->>'caja_disponible')::numeric AS caja_hoy,
         (public.get_caja_disponible()->>'ventas_contado_30d')::numeric AS contado_30d
),
cxc_60 AS (
  SELECT COALESCE(SUM(f.monto_pendiente), 0) AS cobros_60d
  FROM public.facturas f
  WHERE f.tenant_id = public.get_user_tenant()
    AND f.estado <> 'Anulada'
    AND COALESCE(f.monto_pendiente, 0) > 0.01
    AND (f.fecha::date + COALESCE(f.dias_credito, 0) * INTERVAL '1 day')::date <= CURRENT_DATE + 60
),
cxp_60 AS (
  SELECT COALESCE(SUM(
           COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0)
         ), 0) AS pagos_60d
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = public.get_user_tenant()
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01
    AND (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date <= CURRENT_DATE + 60
)
SELECT
  ROUND(caja.caja_hoy, 2)                                   AS caja_hoy,
  ROUND(cxc_60.cobros_60d, 2)                               AS cobros_esperados_60d,
  ROUND(caja.contado_30d * 2, 2)                            AS ventas_contado_proyectadas_60d,
  ROUND(cxp_60.pagos_60d, 2)                                AS deudas_a_pagar_60d,
  ROUND(
    caja.caja_hoy + cxc_60.cobros_60d + (caja.contado_30d * 2) - cxp_60.pagos_60d
  , 2)                                                      AS liquidez_proyectada_60d,
  '-> Si liquidez_proyectada_60d es POSITIVA, ese es tu margen sano para comprar a credito 60d' AS interpretacion
FROM caja, cxc_60, cxp_60;


-- ════════════════════════════════════════════════════════════
-- SECCION 7 — QUE COMPRAR: productos bajo minimo que SI rotan
-- ════════════════════════════════════════════════════════════
-- "Lo necesario": productos con stock <= minimo y con ventas reales
-- en los ultimos 90 dias (no comprar lo que no se mueve).
SELECT 'SECCION 7: Top productos a reponer (bajo minimo + con rotacion)' AS seccion;
WITH ventas_90 AS (
  SELECT fd.producto_id, SUM(fd.cantidad) AS vendidas_90d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = public.get_user_tenant()
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 90
  GROUP BY fd.producto_id
)
SELECT
  p.codigo,
  p.descripcion,
  public.get_stock_actual(p.id)        AS existencia,
  p.min_stock,
  p.max_stock,
  COALESCE(v.vendidas_90d, 0)          AS vendidas_90d,
  ROUND(COALESCE(p.costo,0), 2)        AS costo_unitario,
  GREATEST(0, COALESCE(p.max_stock, p.min_stock, 0) - public.get_stock_actual(p.id)) AS sugerido_comprar,
  ROUND(
    GREATEST(0, COALESCE(p.max_stock, p.min_stock, 0) - public.get_stock_actual(p.id)) * COALESCE(p.costo,0)
  , 2)                                 AS inversion_estimada
FROM public.productos p
JOIN ventas_90 v ON v.producto_id = p.id          -- solo los que SI rotan
WHERE p.tenant_id = public.get_user_tenant()
  AND COALESCE(p.activo, true) = true
  AND public.get_stock_actual(p.id) <= COALESCE(p.min_stock, 0)
ORDER BY v.vendidas_90d DESC
LIMIT 50;

-- Inversion total necesaria para reponer TODO lo critico que rota
SELECT 'SECCION 7b: Inversion total para reponer lo critico que rota' AS seccion;
WITH ventas_90 AS (
  SELECT fd.producto_id, SUM(fd.cantidad) AS vendidas_90d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = public.get_user_tenant()
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 90
  GROUP BY fd.producto_id
)
SELECT
  COUNT(*) AS productos_criticos,
  ROUND(SUM(
    GREATEST(0, COALESCE(p.max_stock, p.min_stock, 0) - public.get_stock_actual(p.id)) * COALESCE(p.costo,0)
  ), 2) AS inversion_total_reposicion
FROM public.productos p
JOIN ventas_90 v ON v.producto_id = p.id
WHERE p.tenant_id = public.get_user_tenant()
  AND COALESCE(p.activo, true) = true
  AND public.get_stock_actual(p.id) <= COALESCE(p.min_stock, 0);
