-- (12/11/2026) Sello de la empresa en las facturas.
-- Hay empresas que firman y SELLAN sus facturas: la imagen del sello se sube
-- en Configuración del Sistema (debajo de la firma) y sale en la factura de
-- hoja carta / media carta junto a "Entregado por". Vacío = no sale nada.
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS sello_url text;

SELECT registrar_migracion('sello_empresa.sql');
