-- ============================================================
-- Fix: cotizaciones_list_view debe mostrar manual_cliente_nombre
-- ============================================================
-- Cuando una cotizacion se crea con "Cliente Generico" pero el usuario
-- escribe un nombre manual (ej. "APACHE CENTRO"), la lista de cotizaciones
-- mostraba "Cliente Generico" en vez del nombre real.
--
-- La vista pedidos_list_view ya hacia COALESCE(manual_cliente_nombre, c.nombre).
-- Esta migracion replica el mismo patron en cotizaciones_list_view.
--
-- Tambien expone la columna manual_cliente_nombre directamente para usos
-- futuros (filtro de busqueda en frontend, etc).
--
-- IDEMPOTENTE (CREATE OR REPLACE VIEW).
-- ============================================================

CREATE OR REPLACE VIEW public.cotizaciones_list_view AS
SELECT
  c.id,
  c.numero,
  c.fecha_cotizacion,
  c.fecha_vencimiento,
  c.cliente_id,
  c.vendedor_id,
  c.manual_cliente_nombre,
  COALESCE(NULLIF(TRIM(c.manual_cliente_nombre), ''), cl.nombre) AS cliente_nombre,
  v.nombre AS vendedor_nombre,
  c.total_cotizacion,
  c.estado,
  c.created_at,
  c.tenant_id
FROM public.cotizaciones c
LEFT JOIN public.clientes cl ON c.cliente_id = cl.id
LEFT JOIN public.vendedores v ON c.vendedor_id = v.id;

NOTIFY pgrst, 'reload schema';

SELECT 'cotizaciones_list_view actualizada con manual_cliente_nombre prioritario' AS status;
