-- =====================================================================
-- MotoPréstamos Los Naranjos vuelve a vender (17/10/2026)
-- ---------------------------------------------------------------------
-- Caminero Motors y MotoPréstamos se separan por la facturación fiscal:
-- Caminero ya financia con su financiamiento propio y MotoPréstamos vuelve
-- a tener su Punto de Venta, con Solicitudes de Compras y Carta de Ruta
-- (el mismo circuito de Caminero: solicitud → carta de ruta → venta).
--
-- · Se quita 'ventas' y 'solicitudes-compras' de modulos_deshabilitados
--   (lo puso sql/modulos_deshabilitados_por_empresa.sql; el trigger
--   bloquear_modulo_deshabilitado deja de frenar las facturas solo).
-- · Se agregan los módulos carta_ruta, solicitudes_compras y vehiculos
--   (chasis/motor/color en el producto y "Solicitudes" en el buscador del POS).
-- · Compras, Orden de Compra, Aprobaciones, Cotizaciones y Devoluciones
--   siguen apagados: no se pidieron.
-- · financiamiento_tipo ya es 'propio': la venta financiada crea el
--   préstamo en la misma empresa.
-- =====================================================================

UPDATE public.config_empresa
   SET modulos_deshabilitados = ARRAY(
         SELECT m FROM unnest(modulos_deshabilitados) m
          WHERE m NOT IN ('ventas', 'solicitudes-compras')),
       modulos = ARRAY(
         SELECT DISTINCT m FROM unnest(coalesce(modulos, '{}')
           || ARRAY['carta_ruta', 'solicitudes_compras', 'vehiculos']) m)
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

SELECT public.registrar_migracion('motoprestamos_punto_de_venta.sql');

-- Verificación
SELECT nombre, modulos, modulos_deshabilitados, financiamiento_tipo
  FROM public.config_empresa
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
