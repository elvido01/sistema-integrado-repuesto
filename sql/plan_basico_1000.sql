-- =====================================================================
-- PLAN BÁSICO: 1,000 PRODUCTOS Y 1,000 FACTURAS AL MES (27/10/2026)
-- ---------------------------------------------------------------------
-- Un repuestos tiene inventario extenso (muchas piezas parecidas) y
-- facturas de montos bajos: 500 se quedaba corto y el plan no atraía.
-- Solo sube los dos límites del BÁSICO; precio y lo demás igual.
-- Idempotente.
-- =====================================================================
UPDATE public.planes
   SET limite_productos = 1000,
       limite_facturas  = 1000,
       updated_at = now()
 WHERE id = 'b32ac0cc-b44c-4ae4-8894-3fea48ad2dc5'   -- BASICO
   AND (limite_productos IS DISTINCT FROM 1000 OR limite_facturas IS DISTINCT FROM 1000);

SELECT public.registrar_migracion('plan_basico_1000.sql');
