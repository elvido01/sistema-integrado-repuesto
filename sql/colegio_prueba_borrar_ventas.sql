-- =====================================================================
-- Centenario: BORRAR LAS VENTAS DE PRUEBA (17/11/2026)
-- ---------------------------------------------------------------------
-- Borra las facturas del COLEGIO CON INGLÉS NUEVO CENTENARIO que NUNCA
-- tuvieron comprobante: sin NCF y sin e-CF emitido ni enviado a la DGII.
-- Hoy es una sola: la #1 (08/11, CONTADO, RD$1,500, poloche talla 12 +
-- pantalón talla 10), cuyo documento fiscal quedó en 'error'.
-- Una factura con NCF o e-CF NO se toca (gastó un número de la DGII: esa
-- se anula con nota de crédito / 608, no se borra).
--
-- Con cada factura se van: su detalle, su documento fiscal fallido, sus
-- tiempos de venta y sus SALIDAS de inventario (referencia FT-<número>),
-- así la existencia vuelve sola —también en el CENTENARIO 1, el espejo
-- borra la copia—.
-- El contador de facturas vuelve a 0 si ya no queda ninguna: la primera
-- factura real sale #1.
--
-- Correr ANTES de colegio_prueba_borrar_v2.sql (así los dos uniformes
-- vendidos y el cliente de la venta también se pueden borrar allí).
-- Todo o nada (una transacción).
-- =====================================================================

DO $ventas$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  v_f int; v_m int;
BEGIN
  -- SEGUROS (code-review high 17/11/2026): SOLO la #1 de prueba. Si algo no
  -- cuadra, el script se detiene sin borrar nada.
  CREATE TEMP TABLE _fac ON COMMIT DROP AS
    SELECT f.id, f.numero FROM public.facturas f
     WHERE f.tenant_id = v_t
       AND f.numero = 1
       AND (f.ncf IS NULL OR f.ncf = '')
       AND NOT EXISTS (SELECT 1 FROM public.documentos_fiscales d
                        WHERE d.factura_id = f.id
                          AND (d.encf IS NOT NULL OR d.ncf IS NOT NULL OR d.estado = 'emitido'
                               OR NULLIF(d.track_id, '') IS NOT NULL
                               OR NULLIF(d.estado_dgii, '') IS NOT NULL
                               OR NULLIF(d.proveedor_number, '') IS NOT NULL))
       AND NOT EXISTS (SELECT 1 FROM public.edu_pagos p WHERE p.factura_id = f.id)
       AND NOT EXISTS (SELECT 1 FROM public.devoluciones dv WHERE dv.factura_id = f.id);

  SELECT count(*) INTO v_f FROM _fac;
  IF v_f <> 1 THEN
    RAISE EXCEPTION 'Se esperaba exactamente la factura #1 de prueba y salieron %. No se borra nada.', v_f;
  END IF;

  -- Lo que el borrado dejaria colgando o descuadrado: si existe, se para.
  IF EXISTS (SELECT 1 FROM public.recibos_ingreso_detalle r WHERE r.factura_id IN (SELECT id FROM _fac))
     OR EXISTS (SELECT 1 FROM public.pagos_comisiones_facturas c WHERE c.factura_id IN (SELECT id FROM _fac))
     OR EXISTS (SELECT 1 FROM public.movimientos_bancarios b WHERE b.origen_tipo = 'venta' AND b.origen_id IN (SELECT id FROM _fac))
     OR EXISTS (SELECT 1 FROM public.inmuebles_vendidos i WHERE i.factura_id IN (SELECT id FROM _fac))
     OR EXISTS (SELECT 1 FROM public.vent_proyectos v WHERE v.factura_id IN (SELECT id FROM _fac))
     OR EXISTS (SELECT 1 FROM public.inventario_movimientos m
                 WHERE m.tenant_id = v_t AND m.espejo_de IS NULL
                   AND m.referencia_doc LIKE ANY (ARRAY['%FT-EDIT-REV-1', '%TRASPASO%FT-1']))
  THEN
    RAISE EXCEPTION 'La factura #1 tiene recibos, comisiones, banco, inmueble/proyecto, edicion o traspaso. Revisar a mano; no se borra nada.';
  END IF;

  DELETE FROM public.inventario_movimientos
   WHERE tenant_id = v_t AND tipo = 'SALIDA' AND espejo_de IS NULL
     AND referencia_doc IN (SELECT 'FT-' || numero FROM _fac);
  GET DIAGNOSTICS v_m = ROW_COUNT;
  DELETE FROM public.documentos_fiscales WHERE factura_id IN (SELECT id FROM _fac);
  DELETE FROM public.facturas_detalle WHERE factura_id IN (SELECT id FROM _fac);
  DELETE FROM public.venta_tiempos WHERE tenant_id = v_t AND factura_numero IN (SELECT numero::text FROM _fac);
  DELETE FROM public.facturas WHERE id IN (SELECT id FROM _fac);
  GET DIAGNOSTICS v_f = ROW_COUNT;

  UPDATE public.tenant_factura_counters SET last_numero = 0
   WHERE tenant_id = v_t AND NOT EXISTS (SELECT 1 FROM public.facturas WHERE tenant_id = v_t);

  RAISE NOTICE 'Ventas de prueba borradas: % (salidas de inventario devueltas: %)', v_f, v_m;
END $ventas$;

-- Lo que queda:
SELECT
  (SELECT count(*) FROM public.facturas WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS facturas,
  (SELECT last_numero FROM public.tenant_factura_counters WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS contador;

SELECT public.registrar_migracion('colegio_prueba_borrar_ventas.sql');
