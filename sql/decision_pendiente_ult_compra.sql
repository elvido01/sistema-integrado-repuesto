-- =====================================================================
-- La base tiene que aceptar la decision nueva
-- ---------------------------------------------------------------------
-- (2026-08-23) `lo_que_no_trajo_entra_solo_al_borrador.sql` mete lineas en
-- el borrador con decision_estado = 'pendiente_ult_compra'. Pero la tabla
-- tiene un CHECK con la lista cerrada de decisiones validas, y ese valor
-- no estaba.
--
-- >>> ESTO SE ENCONTRO PORQUE SE PROBO ANTES DE PROMETERLO <<<
-- El error no aparece al instalar la funcion: aparece la primera vez que
-- se ejecuta, o sea el dia que el suplidor llega con la mercancia. Y como
-- la llamada esta dentro de un try/catch para no tumbar una compra ya
-- guardada, habria fallado con un aviso rojo y las lineas nunca habrian
-- vuelto al borrador. El simulacro (correrlo de verdad y revertirlo con
-- una excepcion) lo saco a la luz antes de que costara nada.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_decision_estado;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_decision_estado
  CHECK (decision_estado = ANY (ARRAY[
    'pedir_hoy'::text,
    'pedido'::text,
    'no_disponible'::text,
    'pospuesto_presupuesto'::text,
    'poca_rotacion'::text,
    'sustituido'::text,
    -- Lo que el suplidor quedo debiendo de la compra anterior y volvio
    -- solo al borrador. No lo pidio el calculo: lo debe el.
    'pendiente_ult_compra'::text
  ]));

SELECT public.registrar_migracion('decision_pendiente_ult_compra.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (pg_get_constraintdef(oid) LIKE '%pendiente_ult_compra%') AS acepta_la_decision_nueva,
  pg_get_constraintdef(oid)                                 AS definicion
FROM pg_constraint
WHERE conrelid = 'public.ordenes_compra_detalle'::regclass
  AND conname = 'chk_ordenes_compra_detalle_decision_estado';
