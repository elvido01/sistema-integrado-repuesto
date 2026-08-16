-- =====================================================================
-- LA TARIFA SEMANAL SE GUARDA, NO SE CALCULA
-- ---------------------------------------------------------------------
-- (2026-08-15) Dos pruebas de nómina llevaban tiempo en rojo y no eran un
-- fallo de código: eran una pregunta de negocio sin contestar.
--
-- Con sueldo mensual de RD$26,000 pagado por semana:
--
--     sueldo / 4        →  RD$6,500 por sábado  →  RD$338,000 al año
--     sueldo * 12 / 52  →  RD$6,000 por sábado  →  RD$312,000 al año
--
-- La diferencia es un sueldo mensual entero por empleado, cada año. No hay
-- una respuesta correcta en abstracto: el dueño dijo que depende de cada
-- persona — unos cobran el mensual repartido y otros tienen su propia
-- tarifa semanal.
--
-- Así que se guarda. Cuando está puesta manda ella y no se calcula nada;
-- cuando no, se divide entre 4 como se venía haciendo (el sábado sale
-- redondo y el mes es múltiplo exacto de él).
--
-- `sueldo_mensual` se queda como está y sigue siendo la base de TSS, ISR y
-- reportes: eso la ley lo mide por mes, no por sábado.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS sueldo_semanal numeric;

ALTER TABLE public.empleados
  DROP CONSTRAINT IF EXISTS empleados_sueldo_semanal_check;
-- NULL significa "no tiene tarifa propia, calcúlalo". Cero no significa
-- nada bueno: sería un empleado que cobra cero, y eso se dice de otra
-- forma (dándolo de baja), no dejándole un cero en la tarifa.
ALTER TABLE public.empleados
  ADD CONSTRAINT empleados_sueldo_semanal_check
  CHECK (sueldo_semanal IS NULL OR sueldo_semanal > 0);

COMMENT ON COLUMN public.empleados.sueldo_semanal IS
  'Lo que cobra CADA sábado, cuando tiene tarifa propia. NULL = se calcula '
  'como sueldo_mensual/4. No se deriva del mensual porque la diferencia '
  'entre /4 y *12/52 es un sueldo entero al año.';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_tarifa_semanal_propia.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación:
SELECT count(*) AS empleados_con_tarifa_propia
FROM public.empleados WHERE sueldo_semanal IS NOT NULL;
