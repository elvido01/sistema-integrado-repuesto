-- =====================================================================
-- Nómina semanal: el sueldo se divide entre 4, no entre 4.333
-- ---------------------------------------------------------------------
-- (2026-07-28) El factor semanal era 12/52 (= mes ÷ 4.333), que hace que el
-- año cierre en 12 sueldos exactos. Pero así NO es como se paga aquí.
--
-- La práctica de la empresa, confirmada por el dueño:
--   "si son 20,000 le pagamos 5,000 todos los sábados"
--
-- O sea: el sueldo mensual se parte en 4 y se paga cada sábado. Ahora el
-- sistema calcula igual que la calle.
--
--   EUCEBIO CAMINERO   12,000/mes  ->  3,000 por sábado  (antes 2,769.23)
--   JUAN CAMINERO RIO  20,000/mes  ->  5,000 por sábado  (antes 4,615.38)
--
-- >>> LO QUE HAY QUE SABER <<<
-- Un año tiene 52 sábados, no 48. Pagando mes÷4 cada sábado se entregan 13
-- sueldos al año, no 12:
--
--   3,000 x 52 = RD$156,000/año  sobre un sueldo anual de 144,000
--   5,000 x 52 = RD$260,000/año  sobre un sueldo anual de 240,000
--
-- Son ~RD$32,000 al año de más entre los dos. NO es un error del sistema:
-- es lo que cuesta pagar semanal en múltiplos redondos, y está decidido a
-- propósito. Se deja escrito para que dentro de un año, cuando alguien
-- compare el gasto de nómina contra los sueldos, sepa de dónde sale.
--
-- No hay ninguna nómina semanal corrida todavía, así que no hay nada que
-- recalcular. Las quincenales (÷2) y mensuales (×1) no se tocan.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.nomina_factor(p_frecuencia text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_frecuencia
           WHEN 'quincenal' THEN 0.5
           -- Mes entre 4: se paga en múltiplos redondos cada semana.
           -- (Antes 12/52 = 0.230769, que reparte el año en 12 sueldos
           --  exactos pero da montos con centavos.)
           WHEN 'semanal'   THEN 0.25
           ELSE 1
         END
$$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_semanal_dividir_entre_4.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los tres factores
SELECT public.nomina_factor('mensual')   AS mensual,
       public.nomina_factor('quincenal') AS quincenal,
       public.nomina_factor('semanal')   AS semanal;
-- esperado: 1 | 0.5 | 0.25

-- 2) Lo que va a cobrar cada empleado semanal
SELECT e.nombre, e.puesto, e.sueldo_mensual,
       round(e.sueldo_mensual * public.nomina_factor(e.frecuencia_pago), 2) AS por_pago,
       e.frecuencia_pago
FROM public.empleados e
WHERE e.frecuencia_pago = 'semanal' AND e.activo
ORDER BY e.nombre;
-- esperado: EUCEBIO 12,000 -> 3,000   |   JUAN 20,000 -> 5,000

-- 3) Control: los quincenales NO deben haberse movido
SELECT e.nombre, e.sueldo_mensual,
       round(e.sueldo_mensual * public.nomina_factor(e.frecuencia_pago), 2) AS por_pago
FROM public.empleados e
WHERE e.frecuencia_pago = 'quincenal' AND e.activo
ORDER BY e.sueldo_mensual DESC;
-- esperado: la mitad del sueldo, como siempre (30,000 -> 15,000)
