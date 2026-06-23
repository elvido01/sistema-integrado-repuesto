-- =====================================================================
-- Permitir el estado 'C/RUTA' en solicitudes_compras (pre-aprobacion)
-- ---------------------------------------------------------------------
-- Al enviar una solicitud a Carta de Ruta su estado pasa a 'C/RUTA'
-- (pre-aprobacion). El CHECK original no lo permitia, asi que el update
-- fallaba en silencio. Aqui se agrega 'C/RUTA' a los estados validos.
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.solicitudes_compras
  DROP CONSTRAINT IF EXISTS solicitudes_compras_estado_check;

ALTER TABLE public.solicitudes_compras
  ADD CONSTRAINT solicitudes_compras_estado_check
  CHECK (estado IN ('Pendiente', 'C/RUTA', 'Aprobada', 'Facturando', 'Completada', 'Anulada'));

NOTIFY pgrst, 'reload schema';

SELECT 'solicitudes_compras.estado ahora permite C/RUTA' AS status;
