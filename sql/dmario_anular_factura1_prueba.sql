-- =====================================================================
-- D MARIO: anular la factura #1 (prueba de certificación del 15/05/2026)
-- =====================================================================
-- (10/10/2026) Decisión del dueño: FT-0000001 (RD$1,300, 1 x T0001 TUBO,
-- CONTADO, sin NCF) fue una PRUEBA durante la certificación DGII, no una
-- venta real. Se marca ANULADA: el cierre de caja, los reportes y el 607 ya
-- excluyen ese estado. No se hace devolución porque restaría RD$1,300 de la
-- caja de HOY por un dinero que nunca entró.
--
-- Inventario: la prueba descontó 1 T0001 en mayo. NO se toca aquí; si el
-- conteo físico tiene 1 más que el sistema, se ajusta en Inventario.
-- Solo toca esa factura, y solo si sigue PAGADA y sin NCF.
-- =====================================================================

UPDATE public.facturas
   SET estado = 'ANULADA'
 WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND numero = 1
   AND estado = 'PAGADA'
   AND ncf IS NULL;

SELECT numero, fecha, total, estado, ncf
  FROM public.facturas
 WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
 ORDER BY numero;

SELECT public.registrar_migracion('dmario_anular_factura1_prueba.sql');
