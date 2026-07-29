-- =====================================================================
-- MAGNA: la orden de compra es OC3500037901 — sin la "A"
-- ---------------------------------------------------------------------
-- (2026-07-29) "La A no iba, era un error. Terminaba en 37901."
--
-- La factura FT-0003188 (NCF B0100000001, MAGNA MOTORS, S. A.) salió con la
-- A de más en la LÍNEA:
--
--   antes   Orden OC3500037901A · APOYO PROMOCIONAL
--   ahora   Orden OC3500037901 · APOYO PROMOCIONAL
--
-- Las notas ya decían OC3500037901 correcto; era la línea la que sobraba.
--
-- >>> QUÉ SE TOCA Y QUÉ NO <<<
-- Se corrige SOLO el texto de la descripción. NO se toca ningún valor
-- fiscal: el NCF, el RNC, las fechas y los montos quedan exactamente igual.
-- Una descripción con la referencia equivocada hace que Magna no encuentre
-- contra qué orden pagar, y ese es justamente el número por el que buscan.
--
-- La cotización #2 también se corrige, para que no vuelva a salir con la A
-- si hay que reimprimir o rehacer.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_malo  text := 'OC3500037901A';
  v_bueno text := 'OC3500037901';
  v_n     int;
BEGIN
  -- 1) La línea de la factura ya emitida
  UPDATE public.facturas_detalle d
     SET descripcion = replace(d.descripcion, v_malo, v_bueno)
    FROM public.facturas f
   WHERE f.id = d.factura_id
     AND f.tenant_id = v_morla
     AND d.descripcion LIKE '%' || v_malo || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Líneas de factura corregidas: %', v_n;

  -- 2) Las notas, por si alguna quedó con la A
  UPDATE public.facturas
     SET notas = replace(notas, v_malo, v_bueno)
   WHERE tenant_id = v_morla AND notas LIKE '%' || v_malo || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Notas de factura corregidas: %', v_n;

  -- 3) La cotización, para que no vuelva a salir mal
  UPDATE public.cotizaciones_magna_detalle
     SET numero_orden = v_bueno
   WHERE tenant_id = v_morla AND numero_orden = v_malo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Líneas de cotización corregidas: %', v_n;

  UPDATE public.cotizaciones_magna
     SET numero_orden = v_bueno, updated_at = now()
   WHERE tenant_id = v_morla AND numero_orden = v_malo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Cabeceras de cotización corregidas: %', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_oc_magna_sin_a.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) La factura emitida: la referencia correcta y los valores intactos
SELECT f.numero, f.ncf, f.total, f.notas,
       d.descripcion, d.precio, d.itbis, d.importe
FROM public.facturas f
JOIN public.facturas_detalle d ON d.factura_id = f.id
WHERE f.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND f.ncf = 'B0100000001';
-- esperado: NCF B0100000001 · total 20,791.60 (SIN CAMBIOS)
--           descripcion "Orden OC3500037901 · APOYO PROMOCIONAL"
--           notas "Cotización Magna #2 · Orden OC3500037901"

-- 2) No queda ni un rastro de la A en ningún lado
SELECT 'factura_detalle' AS donde, count(*) AS con_la_A
FROM public.facturas_detalle WHERE descripcion LIKE '%OC3500037901A%'
UNION ALL SELECT 'factura_notas', count(*)
FROM public.facturas WHERE notas LIKE '%OC3500037901A%'
UNION ALL SELECT 'cotizacion_detalle', count(*)
FROM public.cotizaciones_magna_detalle WHERE numero_orden LIKE '%OC3500037901A%'
UNION ALL SELECT 'cotizacion_cabecera', count(*)
FROM public.cotizaciones_magna WHERE numero_orden LIKE '%OC3500037901A%';
-- esperado: 0 en las cuatro
