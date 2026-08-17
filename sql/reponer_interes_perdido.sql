-- =====================================================================
-- DEVOLVER EL INTERES QUE SE ESFUMO (los 7 casos verificados)
-- ---------------------------------------------------------------------
-- Segunda parte de sql/interes_no_desaparece_sin_pago.sql, que ya corrio
-- el 2026-08-17 16:12 y detuvo la fuga. Esto recupera parte de lo perdido.
--
-- EL CRITERIO (opcion C, elegida por el dueño el 2026-08-17)
--   Se repone solo donde la perdida ocurrio en el ULTIMO recibo del cliente.
--   Razon: se contradice un solo papel, el ultimo, y el proximo recibo sale
--   corregido. Donde el cliente siguio pagando, los recibos posteriores ya
--   confirmaron el balance bajo varias veces — esos se dejan quietos.
--
-- POR QUE SE PUEDE RECLAMAR
--   El recibo impreso lleva "Balance Anterior", y ese numero SI incluia el
--   interes. El papel no cuadra solo — la resta no da:
--     Recibo 0147707   Balance Anterior  108,594.17
--                      TOTAL PAGADO        6,000.00
--                      Balance Actual    102,241.07   <- imprimio esto
--                      la resta da       102,594.17   <- deberia decir esto
--   Esa diferencia es el interes que existia y desaparecio.
--
-- CADA MONTO ESTA VERIFICADO AL CENTAVO
--   Se reconstruyo, para cada recibo, el capital que tenia el prestamo ESE
--   dia, su tasa y los dias corridos desde el ancla anterior. Los 7 dan
--   exacto contra (balance_anterior - balance_actual - total_pagado).
--   Ej.: Altagracia, 10,000 al 5% desde el 10/07 hasta el 17/08
--        = 1 mes (500.00) + 7 dias (115.07) = 615.07  <- clavado.
--
-- DOS CASOS QUEDAN FUERA A PROPOSITO
--   0147707 TEODORA B. PEREZ GIL     353.10
--   0147780 DANNY SEVERINO GUERRERO  110.47
--   Ninguno tiene prestamos a solo interes activos, asi que lo que
--   desaparecio NO fue interes corriente: vino de otro lado. No se tocan
--   hasta saber de donde. Son 463.57 pendientes de investigar.
--
-- COMO SE DEVUELVE
--   Como cuota de interes real, sin abonar, con LA FECHA DEL DIA EN QUE SE
--   PERDIO — la regla del dueño: "deben quedar pendientes con la fecha de su
--   mes correspondiente". Aparece en el Recibo de Pago como cualquier otro
--   interes pendiente, y se cobra normal.
--
-- NO SE COBRA DOS VECES
--   La cuota repuesta lleva fecha pasada, pero el ancla del interes usa
--   GREATEST(cuota materializada, interes_cobrado_hasta): la fecha vieja no
--   hace retroceder el reloj. En los 7 casos ambas fechas coinciden (la
--   perdida fue en el ultimo pago), asi que el interes corriente sigue
--   corriendo igual que ahora. Solo se agrega lo perdido.
--
-- OJO: MORA
--   Al llevar fecha pasada, estas cuotas pueden generar mora por los dias
--   corridos si el cliente la tiene activada (unos 15 pesos en total entre
--   los 7, al 4% de la empresa). Si no se quiere, se apaga el cotejo de
--   mora del cliente antes de cobrar.
--
-- Idempotente: si ya se repuso, no vuelve a insertar.
-- Correr en PRODUCCION, DESPUES de interes_no_desaparece_sin_pago.sql.
-- =====================================================================

BEGIN;

-- No correr esto si el arreglo de fondo no entro: sin el, la cuota repuesta
-- se volveria a esfumar en el proximo pago.
DO $guardia$
BEGIN
  IF to_regclass('public.prestamos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'prestamos'
          AND column_name = 'interes_cobrado_hasta')
  THEN
    RAISE EXCEPTION 'Falta correr sql/interes_no_desaparece_sin_pago.sql primero';
  END IF;
END $guardia$;

WITH reposicion(prestamo_numero, fecha, monto, recibo, cliente) AS (
  VALUES
    ('PT-0026576', DATE '2026-08-17', 615.07::numeric, '0147923', 'ALTAGRACIA SUERO GARCIA'),
    ('PT-0026532', DATE '2026-08-13', 588.60::numeric, '0147884', 'JULIO A. SOSA SILVERIO'),
    ('PT-0026561', DATE '2026-08-01', 221.92::numeric, '0147752', 'KATIANA PETION'),
    ('PT-0026564', DATE '2026-07-31', 170.30::numeric, '0147728', 'DESCOLLINES CHRONIQUE'),
    ('PT-0026002', DATE '2026-08-01', 120.75::numeric, '0147754', 'VALENTIN FERRERAS MESA'),
    ('PT-0026375', DATE '2026-08-12',  41.50::numeric, '0147877', 'ANDRES CARPIO'),
    ('PT-0026589', DATE '2026-08-15',  26.67::numeric, '0147909', 'JUAN NARCISO PADUA MIRIO')
)
INSERT INTO public.prestamo_cuotas
  (tenant_id, prestamo_id, numero_cuota, fecha_vencimiento,
   capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado)
SELECT
  p.tenant_id,
  p.id,
  COALESCE((SELECT MAX(q.numero_cuota) FROM public.prestamo_cuotas q
             WHERE q.prestamo_id = p.id), 0) + 1,
  r.fecha,
  0, r.monto, r.monto, 0, 0, 0, 'pendiente'
FROM reposicion r
JOIN public.prestamos p
  ON p.numero = r.prestamo_numero
 AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
WHERE NOT EXISTS (
  -- ya repuesta: misma cuota de solo interes, mismo monto, misma fecha
  SELECT 1 FROM public.prestamo_cuotas q
   WHERE q.prestamo_id = p.id
     AND q.capital = 0
     AND q.interes = r.monto
     AND q.fecha_vencimiento = r.fecha
);

DO $mig$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('reponer_interes_perdido.sql');
  END IF;
END $mig$;

COMMIT;

-- =====================================================================
-- VERIFICACION — las 7 lineas deben decir OK y sumar 1,784.81
-- =====================================================================

WITH esperado(prestamo_numero, fecha, monto, cliente) AS (
  VALUES
    ('PT-0026576', DATE '2026-08-17', 615.07::numeric, 'ALTAGRACIA SUERO GARCIA'),
    ('PT-0026532', DATE '2026-08-13', 588.60::numeric, 'JULIO A. SOSA SILVERIO'),
    ('PT-0026561', DATE '2026-08-01', 221.92::numeric, 'KATIANA PETION'),
    ('PT-0026564', DATE '2026-07-31', 170.30::numeric, 'DESCOLLINES CHRONIQUE'),
    ('PT-0026002', DATE '2026-08-01', 120.75::numeric, 'VALENTIN FERRERAS MESA'),
    ('PT-0026375', DATE '2026-08-12',  41.50::numeric, 'ANDRES CARPIO'),
    ('PT-0026589', DATE '2026-08-15',  26.67::numeric, 'JUAN NARCISO PADUA MIRIO')
)
SELECT
  e.prestamo_numero,
  e.cliente,
  e.fecha        AS fecha_repuesta,
  e.monto        AS interes_devuelto,
  q.numero_cuota,
  CASE WHEN q.id IS NULL THEN '*** NO SE REPUSO ***'
       WHEN q.interes_pagado > 0 THEN 'ya le abonaron'
       ELSE 'OK · pendiente de cobro' END AS estado
FROM esperado e
JOIN public.prestamos p
  ON p.numero = e.prestamo_numero
 AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
LEFT JOIN public.prestamo_cuotas q
  ON q.prestamo_id = p.id AND q.capital = 0
 AND q.interes = e.monto AND q.fecha_vencimiento = e.fecha
ORDER BY e.monto DESC;

-- Y el total devuelto:
--   esperado 1,784.81
