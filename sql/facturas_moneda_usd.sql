-- =====================================================================
-- FACTURAS EN DÓLARES (28/10/2026)
-- ---------------------------------------------------------------------
-- Grupo Ycast factura comisiones en US$. La factura guarda su MONEDA y su
-- TASA; los montos de siempre (subtotal, itbis, total, pendiente, líneas)
-- siguen en PESOS, porque así los pide la DGII en el 607 y así cuadran la
-- caja, las cuentas por cobrar y los reportes. Los dólares se sacan de
-- pesos ÷ tasa: en la pantalla, en el impreso y en el e-CF (sección
-- OtraMoneda: TipoMoneda USD + TipoCambio + montos en dólares, como define
-- el formato e-CF de la DGII). Idempotente.
-- =====================================================================
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'DOP';
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_moneda_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_moneda_check CHECK (moneda IN ('DOP', 'USD'));
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS tasa_cambio numeric(12,4);
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_tasa_cambio_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_tasa_cambio_check
  CHECK (moneda = 'DOP' OR COALESCE(tasa_cambio, 0) > 0);

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('facturas_moneda_usd.sql');
