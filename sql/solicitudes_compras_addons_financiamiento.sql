-- ============================================================
-- Add-ons (GPS/Casco/Seguro/Placa) + Tipo de financiamiento
-- Fase 1 y 2:
--   - Precios de add-ons en config_empresa
--   - Booleanos + montos congelados por solicitud
--   - Selector de tipo de financiamiento
-- ============================================================

-- 1. Precios de add-ons por tenant (se configuran en Perfil de Empresa)
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS precio_placa NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS precio_gps NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS precio_casco NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS precio_seguro NUMERIC(12,2) DEFAULT 0;

-- 2. Columnas en la solicitud: booleanos de aplicación
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS incluye_gps BOOLEAN DEFAULT false;
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS incluye_casco BOOLEAN DEFAULT false;
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS incluye_seguro BOOLEAN DEFAULT false;

-- 3. Snapshots de monto al momento de crear la solicitud
--    (así los cambios futuros en los precios no alteran solicitudes ya creadas)
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS monto_placa NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS monto_gps NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS monto_casco NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.solicitudes_compras ADD COLUMN IF NOT EXISTS monto_seguro NUMERIC(12,2) DEFAULT 0;

-- 4. Tipo de financiamiento
--    'frances'  = PMT clásica (cuotas fijas, interés sobre saldo decreciente)
--    'simple'   = capital + (capital*tasa*meses), cuotas iguales
--    'diario'   = interés diario sobre saldo (pendiente - Fase 3)
ALTER TABLE public.solicitudes_compras
  ADD COLUMN IF NOT EXISTS tipo_financiamiento TEXT DEFAULT 'simple';

-- Si la columna ya existe, cambiar el default a 'simple'
ALTER TABLE public.solicitudes_compras
  ALTER COLUMN tipo_financiamiento SET DEFAULT 'simple';

ALTER TABLE public.solicitudes_compras
  DROP CONSTRAINT IF EXISTS solicitudes_compras_tipo_financiamiento_check;
ALTER TABLE public.solicitudes_compras
  ADD CONSTRAINT solicitudes_compras_tipo_financiamiento_check
  CHECK (tipo_financiamiento IN ('frances', 'simple', 'diario'));

NOTIFY pgrst, 'reload schema';
