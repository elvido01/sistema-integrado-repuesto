-- =====================================================================
-- Movimiento MANUAL en una cuenta bancaria: ingreso (alquiler, aporte…)
-- o retiro (uso personal)
-- ---------------------------------------------------------------------
-- Caso (2026-07-21): empresas como MotoPréstamos cobran ALQUILER de locales
-- comerciales y a veces meten ese dinero a la cuenta de la empresa, y otros
-- meses lo usan para gastos personales (retiro). Se quiere una forma simple
-- de registrar ENTRADAS y SALIDAS manuales en una cuenta, cuando ellos lo
-- decidan, sin pasar por venta/recibo.
--
-- Solo agrega dos orígenes al libro bancario:
--   'ingreso' → ENTRADA manual (alquiler, aporte de socio, otro ingreso)
--   'retiro'  → SALIDA manual  (uso personal, retiro de socio)
-- El registro usa el RPC que ya existe (registrar_movimiento_bancario) con
-- origen_id NULL (cada uno es un movimiento independiente). No toca la caja
-- ni el excedente: es puro banco.
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso',
                         'san','san_completado','ingreso','retiro','ajuste','transferencia_interna'));

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('movimiento_manual_cuenta.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'origen_tipo con ingreso/retiro' AS objeto,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conname = 'movimientos_bancarios_origen_tipo_check') AS definicion;
