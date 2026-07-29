-- =====================================================================
-- MAGNA: la orden de compra OC3500037901A en la factura del patrocinio
-- ---------------------------------------------------------------------
-- (2026-07-29) "Tengo que ponerle este número de cotización OC3500037901A
-- a la factura del patrocinio, la de 20,791.60."
--
-- Es la ORDEN DE COMPRA de Magna. Magna paga contra su propio número: si la
-- factura no lo trae, del lado de ellos hay que conciliar a mano y el pago
-- se atrasa. Por eso el número tiene que salir en la factura, no quedarse
-- en un correo.
--
-- >>> DONDE QUEDA <<<
-- En los DOS sitios donde Magna la va a buscar:
--
--   1. En la LÍNEA de la factura, que es lo que se lee primero:
--        Orden OC3500037901A · APOYO PROMOCIONAL      20,791.60
--      (sale de cotizaciones_magna_detalle.numero_orden, que decía '01')
--
--   2. En las NOTAS de la factura, como referencia del documento completo:
--        Cotización Magna #2 · Orden OC3500037901A
--      (sale de la cabecera; el envío a facturación las arma solo)
--
-- La cotización #1 (9,369.20) NO se toca: esa es de taller y sus líneas ya
-- llevan la orden de trabajo y el chasis de cada motocicleta.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_oc    text := 'OC3500037901A';
  v_cot   uuid;
  v_n     int;
BEGIN
  -- La del patrocinio: se identifica por su detalle (APOYO PROMOCIONAL),
  -- no por el monto, que podría repetirse en otra cotización.
  SELECT c.id INTO v_cot
  FROM public.cotizaciones_magna c
  JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
  WHERE c.tenant_id = v_morla
    AND c.estado <> 'Anulada'
    AND d.chasis ILIKE '%APOYO PROMOCIONAL%'
  LIMIT 1;

  IF v_cot IS NULL THEN
    RAISE NOTICE 'No se encontró la cotización del apoyo promocional — nada que hacer.';
    RETURN;
  END IF;

  -- 1) La línea de la factura
  UPDATE public.cotizaciones_magna_detalle
     SET numero_orden = v_oc
   WHERE cotizacion_id = v_cot
     AND chasis ILIKE '%APOYO PROMOCIONAL%';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- 2) La referencia del documento
  UPDATE public.cotizaciones_magna
     SET numero_orden = v_oc, updated_at = now()
   WHERE id = v_cot;

  RAISE NOTICE 'Orden de compra % puesta en la cotización del patrocinio (% línea/s).', v_oc, v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cotizacion_magna_referencia_oc.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Cómo va a salir cada cotización al facturarla
SELECT c.numero AS cotizacion,
       c.total,
       'Cotización Magna #' || c.numero
         || COALESCE(' · Orden ' || c.numero_orden, '')
         || COALESCE(' · ' || c.chasis, '')             AS notas_de_la_factura,
       COALESCE('Orden ' || d.numero_orden, 'Servicio')
         || COALESCE(' · ' || d.chasis, '')             AS linea_de_la_factura,
       ROUND((d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS precio
FROM public.cotizaciones_magna c
JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND c.estado <> 'Anulada'
ORDER BY c.numero, d.created_at;
-- esperado en la del patrocinio (20,791.60):
--   notas : Cotización Magna #2 · Orden OC3500037901A
--   línea : Orden OC3500037901A · APOYO PROMOCIONAL   →  20,791.60
-- la de taller (9,369.20) sigue con sus 3 órdenes y sus chasis

-- 2) El total no se movió al tocar la referencia
SELECT c.numero, c.total AS total_cotizacion,
       ROUND(SUM(d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS total_factura,
       c.total - ROUND(SUM(d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS diferencia
FROM public.cotizaciones_magna c
JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND c.estado <> 'Anulada'
GROUP BY c.id, c.numero, c.total ORDER BY c.numero;
-- esperado: diferencia 0.00 en las dos
