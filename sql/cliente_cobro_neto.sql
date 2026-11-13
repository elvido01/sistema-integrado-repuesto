-- 13/11/2026 — Clientes que pagan una cifra fija y piden la factura «hacia atrás».
-- AMSTAR le paga a Oscar Aristy RD$ 600 por el lavado y exige la factura con
-- ITBIS, propina legal y sus retenciones. Con este indicador la venta abre en
-- cada línea «El cliente paga: ___» y calcula el precio (src/lib/facturaNeto.js).
-- Los demás clientes siguen con su factura normal (crédito fiscal o consumo).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cobro_neto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clientes.cobro_neto IS 'La factura se calcula desde lo que paga el cliente (neto de retenciones, con propina legal)';

UPDATE public.clientes SET cobro_neto = true
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23'
   AND regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') = '101894229';

SELECT registrar_migracion('cliente_cobro_neto.sql');
