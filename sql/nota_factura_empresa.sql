-- =====================================================================
-- Nota al pie de la factura, por empresa (11/11/2026)
-- ---------------------------------------------------------------------
-- La hoja carta/media imprimía SIEMPRE "Los precios incluyen instalación y
-- transporte, entrega de 1 a 4 días laborables..." — un texto de una tienda,
-- fijo en la plantilla, que salía también en las facturas de una constructora
-- (BRIMAR). Ahora cada empresa escribe la suya en Configuración del Sistema;
-- vacía = no sale nada.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS nota_factura text;

COMMENT ON COLUMN public.config_empresa.nota_factura IS
  'Texto al pie de la factura en hoja carta/media (condiciones, garantía...). Vacío = no se imprime.';

SELECT public.registrar_migracion('nota_factura_empresa.sql');
