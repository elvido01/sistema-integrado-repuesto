-- ============================================================
-- Diagnostico: ¿la factura 2331 vino del pedido 91?
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Como facturas NO tiene pedido_id, comparamos heuristicamente:
-- mismo cliente, mismo monto/items, fecha cercana.
-- ============================================================

-- 1) Datos basicos de la factura 2331
SELECT 'FACTURA 2331' AS seccion,
  f.id, f.numero, f.fecha, f.cliente_id,
  COALESCE(c.nombre, f.manual_cliente_nombre, 'GENERICO') AS cliente_nombre,
  f.vendedor_id, v.nombre AS vendedor_nombre,
  f.total, f.estado, f.created_at
FROM public.facturas f
LEFT JOIN public.clientes c ON c.id = f.cliente_id
LEFT JOIN public.vendedores v ON v.id = f.vendedor_id
WHERE f.numero = 2331;

-- 2) Datos del pedido 91
SELECT 'PEDIDO 91' AS seccion,
  p.id, p.numero, p.fecha, p.cliente_id,
  COALESCE(c.nombre, p.manual_cliente_nombre, 'GENERICO') AS cliente_nombre,
  p.vendedor_id, v.nombre AS vendedor_nombre,
  p.monto_total, p.estado, p.created_at
FROM public.pedidos p
LEFT JOIN public.clientes c ON c.id = p.cliente_id
LEFT JOIN public.vendedores v ON v.id = p.vendedor_id
WHERE p.numero = 91;

-- 3) Detalle pedido 91 vs detalle factura 2331 lado a lado
WITH ped AS (
  SELECT pd.codigo, pd.descripcion, pd.cantidad::numeric, pd.precio::numeric, pd.importe::numeric
  FROM public.pedidos_detalle pd
  JOIN public.pedidos p ON p.id = pd.pedido_id
  WHERE p.numero = 91
), fac AS (
  SELECT fd.codigo, fd.descripcion, fd.cantidad::numeric, fd.precio::numeric, fd.importe::numeric
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.numero = 2331
)
SELECT
  COALESCE(p.codigo, f.codigo) AS codigo,
  COALESCE(p.descripcion, f.descripcion) AS descripcion,
  p.cantidad AS pedido_cant, f.cantidad AS factura_cant,
  p.precio AS pedido_precio, f.precio AS factura_precio,
  p.importe AS pedido_importe, f.importe AS factura_importe,
  CASE
    WHEN p.codigo IS NOT NULL AND f.codigo IS NOT NULL THEN '✓ en ambos'
    WHEN p.codigo IS NULL THEN '+ solo en factura'
    WHEN f.codigo IS NULL THEN '- solo en pedido'
  END AS estado
FROM ped p
FULL OUTER JOIN fac f USING (codigo)
ORDER BY codigo;

-- 4) Veredicto rapido: ¿es la misma compra? Compara totales y cliente.
SELECT
  CASE
    WHEN p.cliente_id IS NOT DISTINCT FROM f.cliente_id
     AND ABS(COALESCE(p.monto_total, 0) - COALESCE(f.total, 0)) < 0.01
    THEN '✓ ALTA PROBABILIDAD: mismo cliente y mismo total'
    WHEN p.cliente_id IS NOT DISTINCT FROM f.cliente_id
    THEN '⚠ mismo cliente pero totales distintos (' || p.monto_total || ' vs ' || f.total || ')'
    ELSE '✗ clientes distintos'
  END AS veredicto,
  p.monto_total AS pedido_91_total,
  f.total AS factura_2331_total,
  p.estado AS pedido_91_estado_actual
FROM public.pedidos p, public.facturas f
WHERE p.numero = 91 AND f.numero = 2331;
