-- =====================================================================
-- MAGNA MOTORS: dirección y teléfono
-- ---------------------------------------------------------------------
-- (2026-07-29) La factura salía con "Dirección: N/A" y "Teléfono: N/A"
-- porque el cliente se creó solo con nombre y RNC. Los datos salen de la
-- propia orden de compra de Magna (OC 3500037901):
--
--   MAGNA MOTORS, S. A.        RNC 101055571
--   Av. J.F. Kennedy Esq. Abraham Lincoln, Santo Domingo
--   Tel 809-544-1500   Fax 809-544-1515
--
-- Una factura de crédito fiscal a una empresa sin su dirección se ve
-- incompleta al lado del documento de ellos, que sí trae la nuestra.
--
-- Idempotente / re-ejecutable. Solo llena lo que esté vacío: si alguien ya
-- puso una dirección distinta (una sucursal, por ejemplo), su versión manda.
-- =====================================================================

UPDATE public.clientes
   SET direccion = COALESCE(NULLIF(btrim(COALESCE(direccion, '')), ''),
                            'Av. J.F. Kennedy Esq. Abraham Lincoln, Santo Domingo'),
       telefono  = COALESCE(NULLIF(btrim(COALESCE(telefono, '')), ''),
                            '809-544-1500')
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND rnc = '101055571';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('magna_direccion_telefono.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT codigo, nombre, rnc, direccion, telefono, tipo_ncf
FROM public.clientes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND rnc = '101055571';
-- esperado: MAGNA MOTORS, S. A. | 101055571 |
--           Av. J.F. Kennedy Esq. Abraham Lincoln, Santo Domingo | 809-544-1500 | 01
