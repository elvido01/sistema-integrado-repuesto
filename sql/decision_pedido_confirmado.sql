-- ============================================================
-- Decision "Pedido ✓" (confirmado con el suplidor) por linea de OC
-- ============================================================
-- Fase 2 del plan de Orden de Compra (2026-07-07): el dueño va linea
-- por linea cantandole el pedido al suplidor en el mostrador. El
-- default 'pedir_hoy' no confirma nada; la nueva decision 'pedido'
-- marca la linea como CONFIRMADA con el suplidor. La UI muestra
-- cuantas faltan por confirmar. Re-ejecutable.
-- ============================================================

ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_decision_estado;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_decision_estado
  CHECK (decision_estado IN (
    'pedir_hoy',
    'pedido',
    'no_disponible',
    'pospuesto_presupuesto',
    'poca_rotacion',
    'sustituido'
  ));

COMMENT ON COLUMN public.ordenes_compra_detalle.decision_estado IS
  'Decision del operador: pedir_hoy (default, sin confirmar), pedido (confirmado con el suplidor), no_disponible, pospuesto_presupuesto, poca_rotacion, sustituido.';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('decision_pedido_confirmado.sql');
  END IF;
END $$;

SELECT 'decision Pedido confirmado lista' AS status;
