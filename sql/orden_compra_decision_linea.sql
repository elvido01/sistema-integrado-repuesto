-- Decision operativa por linea de orden de compra.
-- Mantiene separado el estado de recepcion (estado_linea) de la decision
-- previa del operador: pedir hoy, no disponible, pospuesto, etc.

ALTER TABLE public.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS decision_estado text NOT NULL DEFAULT 'pedir_hoy',
  ADD COLUMN IF NOT EXISTS decision_motivo text;

UPDATE public.ordenes_compra_detalle
SET decision_estado = 'pedir_hoy'
WHERE decision_estado IS NULL;

ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_decision_estado;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_decision_estado
  CHECK (decision_estado IN (
    'pedir_hoy',
    'no_disponible',
    'pospuesto_presupuesto',
    'poca_rotacion',
    'sustituido'
  ));

CREATE INDEX IF NOT EXISTS idx_ocd_decision_estado
  ON public.ordenes_compra_detalle(tenant_id, decision_estado);

COMMENT ON COLUMN public.ordenes_compra_detalle.decision_estado IS
  'Decision previa del operador para la linea: pedir_hoy, no_disponible, pospuesto_presupuesto, poca_rotacion, sustituido.';

COMMENT ON COLUMN public.ordenes_compra_detalle.decision_motivo IS
  'Texto descriptivo opcional de la decision del operador en la orden de compra.';

SELECT 'orden_compra_decision_linea listo' AS status;
