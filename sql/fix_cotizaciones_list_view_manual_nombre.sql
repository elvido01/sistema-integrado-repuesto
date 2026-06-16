-- ============================================================
-- Fix: cotizaciones_list_view debe mostrar manual_cliente_nombre
-- ============================================================
-- Cuando una cotizacion se crea con "Cliente Generico" pero el usuario
-- escribe un nombre manual (ej. "APACHE CENTRO"), la lista de cotizaciones
-- mostraba "Cliente Generico" en vez del nombre real, y la busqueda
-- por nombre tampoco encontraba la cotizacion.
--
-- Igual que pedidos_list_view: COALESCE(manual_cliente_nombre, cl.nombre).
--
-- IMPORTANTE: PostgreSQL exige que CREATE OR REPLACE VIEW mantenga el
-- MISMO ORDEN y NOMBRES de columnas. Solo se pueden agregar columnas
-- al final. Por eso `manual_cliente_nombre` y `tenant_id` van al final.
--
-- IDEMPOTENTE.
-- ============================================================

CREATE OR REPLACE VIEW public.cotizaciones_list_view AS
SELECT
  c.id,
  c.numero,
  c.fecha_cotizacion,
  c.fecha_vencimiento,
  c.cliente_id,
  c.vendedor_id,
  COALESCE(NULLIF(TRIM(c.manual_cliente_nombre), ''), cl.nombre) AS cliente_nombre,
  v.nombre AS vendedor_nombre,
  c.total_cotizacion,
  c.estado,
  c.created_at,
  -- columnas nuevas (al final por restriccion de CREATE OR REPLACE VIEW)
  c.manual_cliente_nombre,
  c.tenant_id
FROM public.cotizaciones c
LEFT JOIN public.clientes cl ON c.cliente_id = cl.id
LEFT JOIN public.vendedores v ON c.vendedor_id = v.id;

NOTIFY pgrst, 'reload schema';

SELECT 'cotizaciones_list_view actualizada: COALESCE(manual_cliente_nombre, cl.nombre)' AS status;
