-- =====================================================================
-- PLAN SERVICIOS (29/10/2026)
-- ---------------------------------------------------------------------
-- Para empresas sin inventario (servicios e inmobiliaria) que solo emiten
-- facturas y sacan sus reportes 606/607/608. RD$ 1,000 al mes, 300 facturas,
-- 1 usuario. Solo lo ven las empresas de esos dos tipos (PlanesPage.jsx).
-- Idempotente: si ya existe, actualiza precio y límites.
-- =====================================================================
INSERT INTO public.planes (nombre, descripcion, precio, duracion_dias, activo,
  limite_usuarios, limite_productos, limite_facturas, limite_almacenes,
  feat_cobranzas, feat_api_access, feat_carta_ruta, feat_ocr_facturas,
  feat_cotizaciones_magna, feat_reportes_avanzados)
SELECT 'SERVICIOS', 'Solo facturación electrónica para empresas de servicios', 1000, 30, true,
  1, 100, 300, 1,
  false, false, false, false, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.planes WHERE nombre = 'SERVICIOS');

UPDATE public.planes
   SET precio = 1000, limite_usuarios = 1, limite_facturas = 300, limite_productos = 100,
       limite_almacenes = 1, activo = true, updated_at = now()
 WHERE nombre = 'SERVICIOS';

SELECT public.registrar_migracion('plan_servicios.sql');
