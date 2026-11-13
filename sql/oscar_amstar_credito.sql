-- 13/11/2026 — AMSTAR DMC (cliente de Oscar Aristy) a crédito.
-- Le retiene ITBIS e ISR: la factura no se puede cobrar de contado (la caja
-- contaría el total y entra el neto), va a crédito y se cobra el neto con un
-- Recibo de Ingreso. Tenía el crédito apagado y el botón «Crédito» salía gris.
UPDATE public.clientes
   SET autorizar_credito = true, dias_credito = 30
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23'
   AND regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') = '101894229';

SELECT registrar_migracion('oscar_amstar_credito.sql');
