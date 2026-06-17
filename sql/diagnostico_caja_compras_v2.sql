-- ============================================================
-- DIAGNOSTICO FINANCIERO v2 — corre como ADMIN en SQL editor
-- ============================================================
-- READ ONLY. Resuelve el tenant por nombre (no depende de sesion).
--
-- Por que v2: el editor SQL de Supabase corre como 'postgres', sin
-- auth.uid(), asi que get_user_tenant() devuelve NULL -> "Sin tenant".
-- Aqui resolvemos el tenant de Morla por config_empresa.nombre y lo
-- pasamos explicito a cada RPC.
--
-- Si tu empresa NO se llama con "morla", corre primero la SECCION 0
-- para ver el tenant resuelto; si sale vacio, cambia el ILIKE.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECCION 0 — confirmar que tenant se esta resolviendo
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 0: Tenant resuelto' AS seccion;
SELECT ce.tenant_id, ce.nombre
FROM public.config_empresa ce
WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL
ORDER BY ce.nombre
LIMIT 1;


-- ════════════════════════════════════════════════════════════
-- SECCION 1 — CAJA REAL DISPONIBLE HOY (flujo operacional 30d)
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 1: Caja disponible (operacional 30d)' AS seccion;
SELECT public.get_caja_disponible(
  (SELECT ce.tenant_id FROM public.config_empresa ce
   WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1)
) AS caja_disponible_json;


-- ════════════════════════════════════════════════════════════
-- SECCION 2 — PRESUPUESTO QUE CALCULA EL SISTEMA
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 2: Presupuesto v2 (lo que muestra el panel)' AS seccion;
SELECT public.get_presupuesto_compras_v2(
  (SELECT ce.tenant_id FROM public.config_empresa ce
   WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1)
) AS presupuesto_v2_json;


-- ════════════════════════════════════════════════════════════
-- SECCION 3 — CUENTAS POR PAGAR con aging por vencimiento
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 3: Cuentas por pagar por vencimiento' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
cxp AS (
  SELECT
    (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_vence,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) AS pendiente
  FROM public.compras c
  LEFT JOIN public.proveedores pr ON pr.id = c.suplidor_id
  WHERE c.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(c.estado, '') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0), 0) > 0.01
)
SELECT
  CASE
    WHEN fecha_vence < CURRENT_DATE         THEN '1. VENCIDO'
    WHEN fecha_vence <= CURRENT_DATE + 7    THEN '2. Vence 0-7 dias'
    WHEN fecha_vence <= CURRENT_DATE + 15   THEN '3. Vence 8-15 dias'
    WHEN fecha_vence <= CURRENT_DATE + 30   THEN '4. Vence 16-30 dias'
    WHEN fecha_vence <= CURRENT_DATE + 60   THEN '5. Vence 31-60 dias'
    ELSE '6. Vence 60+ dias'
  END AS bucket_vencimiento,
  COUNT(*)                AS num_facturas,
  ROUND(SUM(pendiente),2) AS total_a_pagar
FROM cxp
GROUP BY 1
ORDER BY 1;


-- ════════════════════════════════════════════════════════════
-- SECCION 4 — CUENTAS POR COBRAR (lo que te deben)
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 4: Cuentas por cobrar por antiguedad' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
cxc AS (
  SELECT
    (f.fecha::date + COALESCE(f.dias_credito, 0) * INTERVAL '1 day')::date AS fecha_cobro,
    COALESCE(f.monto_pendiente, 0) AS pendiente
  FROM public.facturas f
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(f.estado, '') <> 'Anulada'
    AND COALESCE(f.monto_pendiente, 0) > 0.01
)
SELECT
  CASE
    WHEN fecha_cobro < CURRENT_DATE       THEN '1. VENCIDA (cobrar ya)'
    WHEN fecha_cobro <= CURRENT_DATE + 30 THEN '2. Cobrable 0-30 dias'
    WHEN fecha_cobro <= CURRENT_DATE + 60 THEN '3. Cobrable 31-60 dias'
    ELSE '4. Cobrable 60+ dias'
  END AS bucket_cobro,
  COUNT(*)                AS num_facturas,
  ROUND(SUM(pendiente),2) AS total_a_cobrar
FROM cxc
GROUP BY 1
ORDER BY 1;


-- ════════════════════════════════════════════════════════════
-- SECCION 5 — RITMO DE VENTAS
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 5: Ventas por ventana' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
)
SELECT
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_30d,
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 60 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_60d,
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 90 THEN fd.cantidad * fd.precio END), 0), 2) AS ventas_90d,
  ROUND(COALESCE(SUM(CASE WHEN f.fecha >= CURRENT_DATE - 30 THEN fd.cantidad * COALESCE(p.costo, 0) END), 0), 2) AS costo_vendido_30d
FROM public.facturas f
JOIN public.facturas_detalle fd ON fd.factura_id = f.id
LEFT JOIN public.productos p ON p.id = fd.producto_id
WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
  AND f.estado <> 'Anulada'
  AND f.fecha >= CURRENT_DATE - 90;


-- ════════════════════════════════════════════════════════════
-- SECCION 6 — PROYECCION DE LIQUIDEZ A 60 DIAS
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 6: Proyeccion de liquidez a 60 dias' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
caja AS (
  SELECT
    (public.get_caja_disponible((SELECT tenant_id FROM tnt))->>'caja_disponible')::numeric AS caja_hoy,
    (public.get_caja_disponible((SELECT tenant_id FROM tnt))->>'ventas_contado_30d')::numeric AS contado_30d
),
cxc_60 AS (
  SELECT COALESCE(SUM(f.monto_pendiente), 0) AS cobros_60d
  FROM public.facturas f
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
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
  WHERE c.tenant_id = (SELECT tenant_id FROM tnt)
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01
    AND (c.fecha + COALESCE(c.dias_credito, pr.dias_credito, 0) * INTERVAL '1 day')::date <= CURRENT_DATE + 60
)
SELECT
  ROUND(caja.caja_hoy, 2)                     AS caja_hoy,
  ROUND(cxc_60.cobros_60d, 2)                 AS cobros_esperados_60d,
  ROUND(caja.contado_30d * 2, 2)              AS ventas_contado_proyectadas_60d,
  ROUND(cxp_60.pagos_60d, 2)                  AS deudas_a_pagar_60d,
  ROUND(caja.caja_hoy + cxc_60.cobros_60d + (caja.contado_30d * 2) - cxp_60.pagos_60d, 2) AS liquidez_proyectada_60d
FROM caja, cxc_60, cxp_60;


-- ════════════════════════════════════════════════════════════
-- SECCION 7 — INVERSION TOTAL PARA REPONER LO CRITICO QUE ROTA
-- ════════════════════════════════════════════════════════════
SELECT 'SECCION 7: Inversion para reponer critico que rota' AS seccion;
WITH tnt AS (
  SELECT ce.tenant_id FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%' AND ce.tenant_id IS NOT NULL ORDER BY ce.nombre LIMIT 1
),
ventas_90 AS (
  SELECT fd.producto_id, SUM(fd.cantidad) AS vendidas_90d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = (SELECT tenant_id FROM tnt)
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
WHERE p.tenant_id = (SELECT tenant_id FROM tnt)
  AND COALESCE(p.activo, true) = true
  AND public.get_stock_actual(p.id) <= COALESCE(p.min_stock, 0);
