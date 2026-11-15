-- =====================================================================
-- ELITE SOLUTIONS: las 2 notas de crédito (E34) de Royal Prestige (15/11/2026)
-- ---------------------------------------------------------------------
-- La importación (elite_royal_prestige_compras.sql) las cargó como compras
-- normales: el lector no miró el tipo de comprobante. Según sus PDF:
--   · OC-0031  E340000023055 (24/07/2026) modifica E310000087006 (15/07/2026)
--     "Crédito de Mercancía": INNOVE 316L 2QT SAUCEPAN, RD$ 5,825.06.
--   · OC-0042  E340000025838 (08/10/2026) modifica E310000089197 (17/08/2026)
--     "Crédito de Mercancías": 3.5QT ER SAUTE, RD$ 13,899.34, ITBIS 0 (pasados
--     30 días la nota no rebaja el ITBIS).
-- Se les pone el NCF que modifican (606 col. 5) y quedan SIN pago: una nota
-- de crédito no es dinero que salió. En el 606 van en positivo (la DGII lo
-- pide así); la Hoja del IT-1 las RESTA (signo de _contab_compras_606).
-- Solo la empresa Elite. Idempotente.
-- =====================================================================

UPDATE public.compras
   SET ncf_modificado = 'E310000087006', monto_pagado = 0, monto_pendiente = 0,
       notas = 'Nota de crédito de Royal Prestige (Crédito de Mercancía) que modifica E310000087006. Importada del PDF (15/11/2026). Sin entrada a inventario.'
 WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E340000023055';

UPDATE public.compras
   SET ncf_modificado = 'E310000089197', monto_pagado = 0, monto_pendiente = 0,
       notas = 'Nota de crédito de Royal Prestige (Crédito de Mercancías) que modifica E310000089197. Importada del PDF (15/11/2026). Sin entrada a inventario.'
 WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E340000025838';

SELECT registrar_migracion('elite_notas_credito_royal.sql');
