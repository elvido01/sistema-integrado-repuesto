-- =====================================================================
-- HERMES — Estado de imagen de los productos (promocionables sin foto)
-- ---------------------------------------------------------------------
-- Hermes pide a diario ~5 productos promocionables SIN foto y necesita
-- confirmar desde MotoFlow si un producto ya tiene imagen.
--
-- En MotoFlow la imagen de catálogo es UNA por producto:
--   productos.imagen_url = URL pública del bucket 'product-images' de
--   Supabase Storage (la suben el formulario de producto y el Image
--   Studio; ambos escriben el MISMO campo). No hay tabla aparte de
--   imágenes de producto. has_image = imagen_url con contenido; no se
--   inventan placeholders.
--
-- Esta vista devuelve SOLO productos activos y NO expone costo ni margen.
--   stock_actual        = SUM(inventario_movimientos.cantidad)  (misma
--                         definición que get_stock_actual / paginados)
--   first_stock_entry_at= primera entrada (cantidad > 0) en el kardex
--   sales_30d           = unidades facturadas últimos 30 días (sin anuladas)
--   last_sale_at        = última fecha de factura no anulada
--
-- Acceso:
--   * PostgREST: GET /rest/v1/hermes_product_image_status (security_invoker:
--     un usuario web ve solo su empresa; service_role ve todo y DEBE
--     filtrar tenant_id).
--   * hermes_readonly (psycopg2): SELECT * FROM hermes.product_image_status
--     (ya filtrada al tenant de Morla). Solo lectura.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE VIEW public.hermes_product_image_status
WITH (security_invoker = true) AS
SELECT
  p.tenant_id,
  p.id                                          AS product_id,
  p.codigo,
  p.descripcion,
  p.activo,
  COALESCE(kar.stock_actual, 0)                 AS stock_actual,
  p.precio,
  NULLIF(trim(p.imagen_url), '')                AS imagen_url,
  (NULLIF(trim(p.imagen_url), '') IS NOT NULL)  AS has_image,
  (NULLIF(trim(p.imagen_url), '') IS NOT NULL)::int AS image_count,
  p.updated_at,
  COALESCE(ven.sales_30d, 0)                    AS sales_30d,
  ven.last_sale_at,
  kar.first_stock_entry_at
FROM public.productos p
LEFT JOIN LATERAL (
  SELECT SUM(im.cantidad)::numeric                        AS stock_actual,
         MIN(im.fecha) FILTER (WHERE im.cantidad > 0)     AS first_stock_entry_at
  FROM public.inventario_movimientos im
  WHERE im.tenant_id = p.tenant_id
    AND im.producto_id = p.id
) kar ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= current_date - 30), 0)::numeric AS sales_30d,
         MAX(f.fecha) AS last_sale_at
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE fd.tenant_id = p.tenant_id
    AND fd.producto_id = p.id
    AND upper(COALESCE(f.estado, '')) <> 'ANULADA'
) ven ON true
WHERE p.activo = true;

REVOKE ALL ON public.hermes_product_image_status FROM anon;
GRANT SELECT ON public.hermes_product_image_status TO authenticated, service_role;

-- Vista para el rol restringido hermes_readonly (hermes.product_image_status):
-- vive en sql/hermes_readonly_vistas.sql junto con las demás vistas del
-- schema hermes — correr ese archivo después de este. (No se define aquí
-- sobre la vista pública porque security_invoker chequearía los permisos
-- de hermes_readonly sobre las tablas base → permission denied.)

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_product_image_status.sql');
  END IF;
END $$;

SELECT 'hermes_product_image_status lista (estado de imagen por producto)' AS status;
