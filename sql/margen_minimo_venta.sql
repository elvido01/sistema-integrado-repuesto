-- =====================================================================
-- Control de venta bajo costo
-- ---------------------------------------------------------------------
-- Agrega config_empresa.margen_minimo_pct: porcentaje minimo de margen
-- (sobre el costo) que debe respetar cada linea de la factura.
--
--   margen_minimo_pct = 0  -> solo se prohibe vender POR DEBAJO del costo.
--   margen_minimo_pct = 5  -> el precio neto (sin ITBIS) debe ser al menos
--                             costo * 1.05, de lo contrario la venta se bloquea.
--
-- El bloqueo es total: se valida al agregar la linea y de nuevo al facturar
-- (src/hooks/useVentas.js). El precio comparado es el NETO sin ITBIS y ya con
-- el descuento de la linea aplicado.
--
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS margen_minimo_pct numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.config_empresa.margen_minimo_pct IS
  'Margen minimo (%) sobre costo exigido por linea de venta. 0 = solo prohibir vender bajo costo.';

NOTIFY pgrst, 'reload schema';

SELECT 'config_empresa.margen_minimo_pct creado (default 0)' AS status;
