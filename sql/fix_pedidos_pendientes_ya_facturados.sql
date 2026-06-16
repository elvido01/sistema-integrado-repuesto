-- ============================================================
-- Limpieza: pedidos Pendiente que YA fueron facturados
-- ============================================================
-- READ ONLY las primeras 2 queries. La 3ra es el UPDATE (comentado).
--
-- El bug: useVentas.handleSave nunca marcaba el pedido como Facturado
-- al cargar y procesar la venta. Solo cotizaciones. Por eso varios
-- pedidos quedan visibles en "Gestion de Pedidos" como Pendiente
-- aunque ya tienen su factura emitida.
--
-- Heuristica de match (como facturas NO tiene pedido_id):
--   1) Mismo tenant
--   2) Mismo cliente_id (o ambos generic / ambos null)
--   3) Mismo monto total (tolerancia 0.01)
--   4) Fecha factura >= fecha pedido y dentro de 60 dias
--   5) Pedido en estado Pendiente
--   6) Factura no Anulada
--
-- Esta heuristica es conservadora; puede dejar pasar algunos pedidos
-- ambiguos (mismo cliente, mismo monto, dos fechas distintas).
-- Si te encuentras un caso raro, revisar manualmente.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Detectar matches probables
-- ────────────────────────────────────────────────────────────
WITH matches AS (
  SELECT
    p.id           AS pedido_id,
    p.numero       AS pedido_numero,
    p.fecha        AS pedido_fecha,
    p.monto_total  AS pedido_monto,
    p.cliente_id   AS pedido_cliente_id,
    COALESCE(cp.nombre, p.manual_cliente_nombre, 'GENERICO') AS pedido_cliente_nombre,
    f.id           AS factura_id,
    f.numero       AS factura_numero,
    f.fecha        AS factura_fecha,
    f.total        AS factura_total,
    f.estado       AS factura_estado,
    -- score: cuanto menor, mas confiable
    ABS(p.monto_total - f.total) AS diff_monto,
    (f.fecha::date - p.fecha::date) AS dias_diferencia
  FROM public.pedidos p
  LEFT JOIN public.clientes cp ON cp.id = p.cliente_id
  JOIN public.facturas f
    ON f.tenant_id = p.tenant_id
   AND (
     -- mismo cliente concreto
     (p.cliente_id IS NOT NULL AND f.cliente_id = p.cliente_id)
     OR
     -- ambos generico/null
     (p.cliente_id IS NULL AND f.cliente_id IS NULL)
   )
   AND ABS(COALESCE(p.monto_total, 0) - COALESCE(f.total, 0)) < 0.01
   AND f.fecha >= p.fecha
   AND f.fecha <= p.fecha + INTERVAL '60 days'
   AND COALESCE(f.estado, '') <> 'Anulada'
  WHERE p.estado = 'Pendiente'
)
SELECT *
FROM matches
ORDER BY pedido_fecha DESC, pedido_numero;

-- ────────────────────────────────────────────────────────────
-- 2) Resumen: cuantos pedidos se marcarian Facturado
-- ────────────────────────────────────────────────────────────
WITH matches AS (
  SELECT p.id AS pedido_id
  FROM public.pedidos p
  JOIN public.facturas f
    ON f.tenant_id = p.tenant_id
   AND (
     (p.cliente_id IS NOT NULL AND f.cliente_id = p.cliente_id)
     OR (p.cliente_id IS NULL AND f.cliente_id IS NULL)
   )
   AND ABS(COALESCE(p.monto_total, 0) - COALESCE(f.total, 0)) < 0.01
   AND f.fecha >= p.fecha
   AND f.fecha <= p.fecha + INTERVAL '60 days'
   AND COALESCE(f.estado, '') <> 'Anulada'
  WHERE p.estado = 'Pendiente'
)
SELECT COUNT(DISTINCT pedido_id) AS pedidos_a_actualizar FROM matches;

-- ────────────────────────────────────────────────────────────
-- 3) UPDATE — descomentar despues de revisar querys 1 y 2
-- ────────────────────────────────────────────────────────────
-- UPDATE public.pedidos
--    SET estado = 'Facturado',
--        updated_at = NOW()
--  WHERE id IN (
--    SELECT DISTINCT p.id
--    FROM public.pedidos p
--    JOIN public.facturas f
--      ON f.tenant_id = p.tenant_id
--     AND (
--       (p.cliente_id IS NOT NULL AND f.cliente_id = p.cliente_id)
--       OR (p.cliente_id IS NULL AND f.cliente_id IS NULL)
--     )
--     AND ABS(COALESCE(p.monto_total, 0) - COALESCE(f.total, 0)) < 0.01
--     AND f.fecha >= p.fecha
--     AND f.fecha <= p.fecha + INTERVAL '60 days'
--     AND COALESCE(f.estado, '') <> 'Anulada'
--    WHERE p.estado = 'Pendiente'
--  );

SELECT 'Diagnostico listo. Revisa filas y descomenta el UPDATE.' AS status;
