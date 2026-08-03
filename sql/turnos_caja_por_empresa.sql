-- =====================================================================
-- Turnos de caja por empresa, y se acabó cerrar sin contar
-- ---------------------------------------------------------------------
-- (2026-08-03) "En configuraciones del sistema hay que poner la cantidad de
-- turnos que tiene una empresa... las empresas con un solo turno no
-- necesitan el botón cerrar turno."
--
-- >>> LO QUE HACÍA ESE BOTÓN <<<
-- "Cerrar el Turno" grababa el cierre SIN pasar por el conteo: el desglose
-- quedaba en cero y toda la caja salía como faltante. Así quedó el cierre
-- del 28/07 de MotoPréstamos:
--
--   efectivo en caja  41,205.01
--   total desglose         0.00
--   diferencia       -41,205.01   ← nadie contó nada
--
-- Un cierre así no dice si sobró o faltó dinero: dice que no se contó. Se
-- quita para todas las empresas, no solo para las de un turno. Cerrar pasa
-- siempre por contar el efectivo.
--
-- >>> LA CONFIGURACIÓN <<<
-- turnos_caja_dia: cuántas veces al día cierra caja la empresa. Con 1 —el
-- caso normal— el campo Turno desaparece de la pantalla y siempre graba 1;
-- nadie tiene que entender qué es un turno para cerrar su caja.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS turnos_caja_dia integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.config_empresa.turnos_caja_dia IS
  'Veces que la empresa cierra caja en un día. Con 1 no se pregunta el turno.';

-- Guarda contra un 0 o un negativo tecleado por error, que dejaría la
-- pantalla sin forma de cerrar.
DO $$ BEGIN
  ALTER TABLE public.config_empresa
    ADD CONSTRAINT config_empresa_turnos_caja_dia_check CHECK (turnos_caja_dia BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.config_empresa SET turnos_caja_dia = 1 WHERE turnos_caja_dia IS NULL OR turnos_caja_dia < 1;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('turnos_caja_por_empresa.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) CADA EMPRESA CON SU CANTIDAD DE TURNOS
SELECT nombre, turnos_caja_dia FROM public.config_empresa ORDER BY nombre;
-- esperado: todas en 1. Se cambia desde Configuración del Sistema.

-- 2) CIERRES QUE SE GRABARON SIN CONTAR (los que ya no podrán repetirse)
SELECT ce.nombre, c.fecha, c.turno, c.efectivo_en_caja, c.total_desglose, c.diferencia
FROM public.cierres_caja c
JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id
WHERE COALESCE(c.total_desglose, 0) = 0 AND COALESCE(c.efectivo_en_caja, 0) <> 0
ORDER BY c.fecha DESC;
-- Son los que se cerraron con el botón viejo. Quedan como están —es su
-- historia— pero de aquí en adelante no se puede grabar uno así.
