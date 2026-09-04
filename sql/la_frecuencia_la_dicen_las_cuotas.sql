-- ============================================================
-- LA FRECUENCIA LA DICEN LAS CUOTAS, NO LA ETIQUETA
-- ============================================================
-- La carga del SiiF puso `frecuencia = 'mensual'` a TODO. Pero muchos de esos
-- préstamos se cobran a diario o por semana, y sus cuotas lo demuestran: están
-- puestas de un día para otro, o de siete en siete. Quedaron préstamos que
-- dicen "550 cuotas mensuales" — 45 años.
--
-- >>> NO SE TOCA UN SOLO PESO <<<
-- Se cambia UNA columna de texto. Comprobado antes de correrlo:
--   · la mora, los saldos y la cobranza salen de `prestamo_cuotas.
--     fecha_vencimiento`, que ya está bien; `registrar_pago_prestamo` y las
--     funciones de mora ni siquiera leen `frecuencia`.
--   · ninguna vista la usa para calcular.
--   · solo se usa al CREAR un préstamo, y no hay pantalla que reconstruya el
--     calendario de uno existente.
-- Lo que sí cambia es lo que se LEE: la pantalla, el informe impreso
-- ("Forma de Pago") y lo que Hermes contesta cuando le preguntan cada cuánto
-- paga un cliente. Antes de esto se corrigió el rótulo de la tasa, que colgaba
-- de la misma columna y habría impreso "3.00% Diario" (commit fbf1ecdf).
--
-- >>> CADA PRÉSTAMO TOMA SU VALOR DE SUS PROPIAS CUOTAS <<<
-- Nada de listas escritas a mano. Se mira la mediana de días entre
-- vencimientos, y SOLO se toca el que tiene un calendario PAREJO: todos los
-- saltos hacia adelante y ninguno a más de 3 días de la mediana. Eso deja
-- fuera a propósito los préstamos irregulares (PT-0026518, PT-0026520: saltos
-- de -1.032 a +1.035 días, 4 y 6 cuotas para un plazo de 36) y los de solo
-- interés, cuya "cuota" es un globo al vencimiento. De esos no se puede
-- deducir nada, así que se quedan como están.
--
-- Alcance: las TRES financieras del grupo. Se corrió primero MotoPréstamos
-- (86 préstamos) el 04/09/2026 y, autorizado el mismo día, se amplió a
-- INVERSIONES LOS NARANJOS (7) y MOTO PRESTAMOS ODALYS (7) — esas catorce,
-- todas ACTIVAS. Volver a correrlo entero no repite nada: el UPDATE solo
-- alcanza a los que siguen diciendo 'mensual'.
--
-- >>> LA COMPROBACIÓN NO SE LEVANTA EN VERDE <<<
-- Al revés que en las migraciones de estructura de este repo, aquí el bloque
-- final NO lanza excepción cuando todo sale bien: esto cambia DATOS, y si
-- alguien corriera el archivo dentro de una sola transacción, la excepción
-- desharía el UPDATE. Solo revienta si algo quedó mal.
--
-- Idempotente: al segundo pase no queda ninguno en 'mensual' que cumpla.
-- ============================================================

WITH saltos AS (
  SELECT c.prestamo_id,
         c.fecha_vencimiento - lag(c.fecha_vencimiento)
           OVER (PARTITION BY c.prestamo_id ORDER BY c.numero_cuota) AS d
  FROM public.prestamo_cuotas c
  WHERE c.tenant_id IN (
      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',   -- MotoPréstamos Los Naranjos
      'c07a1d07-1e2f-4b3c-9d4a-107a10500007',   -- INVERSIONES LOS NARANJOS
      'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'    -- MOTO PRESTAMOS ODALYS
    )
),
ritmo AS (
  SELECT prestamo_id,
         percentile_disc(0.5) WITHIN GROUP (ORDER BY d) AS mediana,
         min(d) AS minimo, max(d) AS maximo
  FROM saltos WHERE d IS NOT NULL GROUP BY prestamo_id
),
plan AS (
  SELECT r.prestamo_id,
         CASE r.mediana WHEN 1 THEN 'diario' WHEN 7 THEN 'semanal'
                        ELSE 'quincenal' END AS nueva
  FROM ritmo r
  WHERE r.minimo > 0                    -- ningún vencimiento hacia atrás
    AND r.maximo <= r.mediana + 3       -- calendario parejo
    AND r.mediana IN (1, 7, 14, 15)
)
UPDATE public.prestamos p
   SET frecuencia = plan.nueva
  FROM plan
 WHERE p.id = plan.prestamo_id
   AND p.tenant_id IN (
      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',   -- MotoPréstamos Los Naranjos
      'c07a1d07-1e2f-4b3c-9d4a-107a10500007',   -- INVERSIONES LOS NARANJOS
      'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'    -- MOTO PRESTAMOS ODALYS
    )
   AND p.frecuencia = 'mensual'
   AND NOT COALESCE(p.es_solo_interes, false);

SELECT public.registrar_migracion('la_frecuencia_la_dicen_las_cuotas.sql');
