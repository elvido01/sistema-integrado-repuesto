-- ============================================================
-- ODALYS E INVERSIONES: EL INTERÉS DESPUÉS DE MIGRAR (28/09/2026)
-- ============================================================
-- El 28/09 se actualizaron MOTO PRESTAMOS ODALYS e INVERSIONES LOS NARANJOS
-- desde el respaldo del SiiF de ese día (fase-financiera-cxc.mjs --commit,
-- SIN --force: ninguna de las dos tiene cobros en MotoFlow; siguen cobrando
-- en el SiiF). Quedaron cuadradas al centavo con el SiiF en cuotas
-- (Odalys 3,388,665.86 · Inversiones 1,479,683.95), con 219 y 213 cobros
-- nuevos del 21/07 al 28/09.
--
-- La migración no toca dos cosas que deciden el INTERÉS de los préstamos a
-- solo interés, y aquí se ponen al día con las MISMAS reglas que el dueño ya
-- aprobó (decisión del 28/09: "Sí, las dos"):
--
-- 1) ADELANTAR EL ANCLA de los que pagaron en el SiiF después de ella.
--    `interes_cobrado_hasta` solo avanza cuando el interés se cobra EN
--    MotoFlow (sql/interes_no_desaparece_sin_pago.sql, 17/08). Estas dos
--    empresas cobran en el SiiF, así que el ancla se quedó en julio y
--    MotoFlow volvía a cobrar agosto y septiembre, ya pagados allá
--    (~RD$ 47,225 en Odalys y ~RD$ 26,734 en Inversiones, aproximado).
--    Se adelanta al último pago del cliente SOLO si el cliente tiene UN
--    préstamo activo: con varios, ese pago puede ser de otro préstamo, y
--    usarlo borraría interés real — justo el error del 17/08 (ALTAGRACIA
--    SUERO). Esos quedan APARTE para revisarlos contra el SiiF.
--
-- 2) MARCAR COMO SOLO INTERÉS los préstamos nuevos con esa forma. Criterio
--    del 21/07 (sql/interes_corriente_prestamos_a_interes.sql): activo, UNA
--    sola cuota, que vence al final del plazo (±3 días). Sin la marca no les
--    corre interés y muestran menos de lo que deben. El ancla inicial, con la
--    regla del 17/08 para fijarla por primera vez: la última cuota de interés
--    si la hubo; si no, el último pago del cliente, nunca antes del inicio.
--
-- NO se vuelve a correr interes_corriente_prestamos_a_interes.sql: redefine
-- get_prestamos_cliente con su versión de julio y degradaría la canónica
-- (sql/mora_default_empresa.sql). De aquel archivo solo se reusa el criterio.
--
-- Solo toca estas dos empresas. Idempotente: al re-correrlo no queda nada
-- que adelantar ni que marcar.
-- ============================================================

-- ---------------------------------------------------------------------
-- 1) Adelantar el ancla (un solo préstamo activo por cliente)
-- ---------------------------------------------------------------------
WITH u AS (
  SELECT tenant_id, cliente_id, max(fecha) AS ult_pago
    FROM public.prestamo_pagos
   WHERE NOT coalesce(anulado, false)
   GROUP BY 1, 2
),
n AS (
  SELECT tenant_id, cliente_id, count(*) AS n_act
    FROM public.prestamos WHERE estado = 'activo' GROUP BY 1, 2
),
adelantar AS (
  SELECT p.id, u.ult_pago
    FROM public.prestamos p
    JOIN u ON u.tenant_id = p.tenant_id AND u.cliente_id = p.cliente_id
    JOIN n ON n.tenant_id = p.tenant_id AND n.cliente_id = p.cliente_id
   WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', 'c07a1d07-1e2f-4b3c-9d4a-107a10500007')
     AND p.estado = 'activo'
     AND p.es_solo_interes
     AND u.ult_pago > p.interes_cobrado_hasta
     AND n.n_act = 1
)
UPDATE public.prestamos p
   SET interes_cobrado_hasta = a.ult_pago
  FROM adelantar a
 WHERE a.id = p.id
   AND a.ult_pago > p.interes_cobrado_hasta;   -- el ancla nunca va hacia atrás

-- ---------------------------------------------------------------------
-- 2) Marcar los nuevos con forma de solo interés, y fijarles el ancla
-- ---------------------------------------------------------------------
WITH cand AS (
  SELECT p.id
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = p.tenant_id
   WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', 'c07a1d07-1e2f-4b3c-9d4a-107a10500007')
     AND p.estado = 'activo'
     AND NOT p.es_solo_interes
     AND coalesce(p.plazo_cuotas, 0) > 0
     AND p.fecha_inicio IS NOT NULL
   GROUP BY p.id, p.fecha_inicio, p.plazo_cuotas
  HAVING count(*) = 1
     AND abs(max(q.fecha_vencimiento)
             - (p.fecha_inicio + make_interval(months => p.plazo_cuotas))::date) <= 3
)
UPDATE public.prestamos p
   SET es_solo_interes = true
  FROM cand
 WHERE p.id = cand.id;

WITH u AS (
  SELECT tenant_id, cliente_id, max(fecha) AS ult_pago
    FROM public.prestamo_pagos
   WHERE NOT coalesce(anulado, false)
   GROUP BY 1, 2
)
UPDATE public.prestamos p
   SET interes_cobrado_hasta = coalesce(
         (SELECT max(q.fecha_vencimiento) FROM public.prestamo_cuotas q
           WHERE q.prestamo_id = p.id AND q.tenant_id = p.tenant_id AND q.interes > 0),
         greatest(coalesce(u.ult_pago, p.fecha_inicio), p.fecha_inicio))
  FROM public.prestamos p2
  LEFT JOIN u ON u.tenant_id = p2.tenant_id AND u.cliente_id = p2.cliente_id
 WHERE p2.id = p.id
   AND p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', 'c07a1d07-1e2f-4b3c-9d4a-107a10500007')
   AND p.es_solo_interes
   AND p.interes_cobrado_hasta IS NULL;          -- solo los recién marcados

SELECT public.registrar_migracion('odalys_inversiones_interes_tras_migrar_28_09.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Tras aplicarlo no puede quedar NADA pendiente de las dos reglas: ningún
-- solo interés de un préstamo por cliente con el ancla detrás de su último
-- pago, ningún activo con forma de solo interés sin marcar, y ningún solo
-- interés activo sin ancla. Si queda algo, la regla no hizo lo que dice.
DO $prueba$
DECLARE
  v_atrasados int;
  v_sin_marcar int;
  v_sin_ancla int;
BEGIN
  WITH u AS (SELECT tenant_id, cliente_id, max(fecha) ult_pago FROM public.prestamo_pagos
              WHERE NOT coalesce(anulado,false) GROUP BY 1,2),
       n AS (SELECT tenant_id, cliente_id, count(*) n_act FROM public.prestamos WHERE estado='activo' GROUP BY 1,2)
  SELECT count(*) INTO v_atrasados
    FROM public.prestamos p
    JOIN u ON u.tenant_id=p.tenant_id AND u.cliente_id=p.cliente_id
    JOIN n ON n.tenant_id=p.tenant_id AND n.cliente_id=p.cliente_id
   WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005','c07a1d07-1e2f-4b3c-9d4a-107a10500007')
     AND p.estado='activo' AND p.es_solo_interes AND n.n_act=1 AND u.ult_pago > p.interes_cobrado_hasta;

  SELECT count(*) INTO v_sin_marcar
    FROM public.prestamos p
   WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005','c07a1d07-1e2f-4b3c-9d4a-107a10500007')
     AND p.estado='activo' AND NOT p.es_solo_interes AND coalesce(p.plazo_cuotas,0)>0 AND p.fecha_inicio IS NOT NULL
     AND (SELECT count(*) FROM public.prestamo_cuotas q WHERE q.prestamo_id=p.id)=1
     AND abs((SELECT max(q.fecha_vencimiento) FROM public.prestamo_cuotas q WHERE q.prestamo_id=p.id)
             - (p.fecha_inicio + make_interval(months => p.plazo_cuotas))::date) <= 3;

  SELECT count(*) INTO v_sin_ancla
    FROM public.prestamos p
   WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005','c07a1d07-1e2f-4b3c-9d4a-107a10500007')
     AND p.estado='activo' AND p.es_solo_interes AND p.interes_cobrado_hasta IS NULL;

  IF v_atrasados > 0 OR v_sin_marcar > 0 OR v_sin_ancla > 0 THEN
    RAISE EXCEPTION 'QUEDÓ PENDIENTE: % anclas atrasadas, % sin marcar, % sin ancla.', v_atrasados, v_sin_marcar, v_sin_ancla;
  END IF;
  RAISE NOTICE 'Ninguna ancla atrasada, ninguno sin marcar, ninguno sin ancla.';
END $prueba$;

SELECT t.nombre,
       count(*) FILTER (WHERE p.es_solo_interes AND p.estado='activo') AS solo_interes_activos,
       count(*) FILTER (WHERE p.es_solo_interes AND p.interes_cobrado_hasta >= '2026-07-21') AS anclas_desde_julio_21
  FROM public.prestamos p JOIN public.tenants t ON t.id = p.tenant_id
 WHERE p.tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005','c07a1d07-1e2f-4b3c-9d4a-107a10500007')
 GROUP BY 1;
