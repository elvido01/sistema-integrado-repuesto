-- =====================================================================
-- DESEMBOLSO de préstamo repartido entre CUENTAS BANCARIAS
-- ---------------------------------------------------------------------
-- Caso (2026-07-22, MotoPréstamos Los Naranjos): al originar un préstamo
-- por TRANSFERENCIA o CHEQUE el dinero sale de una cuenta del banco, y a
-- veces de VARIAS (ej. 50,000 de una y 50,000 de otra). Hasta ahora el
-- desembolso solo se guardaba como texto en prestamos.desembolso y restaba
-- del excedente, pero no salía de ninguna cuenta ni dejaba rastro.
--
-- Este script solo habilita el origen 'desembolso' en el libro bancario.
-- El registro lo hace la app: una SALIDA por cuenta, con
--   concepto  = 'Desembolso préstamo PT-XXXXXXX — NOMBRE DEL CLIENTE'
--   referencia= 'PT-XXXXXXX'
-- usando registrar_movimiento_bancario_compartido (permite tambien la
-- cuenta compartida de la financiera vinculada).
--
-- origen_id va NULL a propósito: un mismo préstamo puede generar VARIAS
-- salidas (una por cuenta) y el índice único (tenant, origen_tipo,
-- origen_id) solo admite una por documento. La trazabilidad queda por el
-- número de préstamo en concepto/referencia.
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso',
                         'san','san_completado','ingreso','retiro','desembolso',
                         'ajuste','transferencia_interna'));

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('desembolso_prestamo_cuentas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'origen_tipo con desembolso' AS objeto,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conname = 'movimientos_bancarios_origen_tipo_check') AS definicion;
