-- =====================================================================
-- Centenario: BORRAR los estudiantes y familias DE PRUEBA (08/11/2026)
-- ---------------------------------------------------------------------
-- Borra solo lo marcado con notas = 'PRUEBA' (lo que creó
-- colegio_prueba_300_estudiantes.sql) en el COLEGIO CON INGLÉS NUEVO
-- CENTENARIO, más lo que se haya hecho con ellos en las pruebas:
--   cobros de la Caja del Colegio (líneas, recibos del colegio y su recibo de
--   ingreso), cargos, notas, y los clientes que el cobro creó para esas
--   familias.
-- Las FACTURAS con crédito fiscal NO se borran (gastaron un NCF de la DGII):
-- si hay alguna, se listan al final y su cliente se queda.
-- Correr SOLO cuando se terminen las pruebas. Todo o nada (una transacción).
-- =====================================================================

DO $borrar$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  v_est int; v_fam int; v_pag int; v_ri int; v_cli int;
BEGIN
  CREATE TEMP TABLE _fam ON COMMIT DROP AS
    SELECT id, cliente_id, cliente_fiscal_id FROM public.edu_familias WHERE tenant_id = v_t AND notas = 'PRUEBA';
  CREATE TEMP TABLE _est ON COMMIT DROP AS
    SELECT id FROM public.edu_estudiantes WHERE tenant_id = v_t AND notas = 'PRUEBA';
  CREATE TEMP TABLE _pag ON COMMIT DROP AS
    SELECT id, recibo_ingreso_id FROM public.edu_pagos WHERE tenant_id = v_t AND familia_id IN (SELECT id FROM _fam);

  DELETE FROM public.edu_pago_lineas WHERE pago_id IN (SELECT id FROM _pag) OR estudiante_id IN (SELECT id FROM _est);
  DELETE FROM public.edu_pagos WHERE id IN (SELECT id FROM _pag);
  GET DIAGNOSTICS v_pag = ROW_COUNT;
  DELETE FROM public.recibos_ingreso WHERE tenant_id = v_t AND origen = 'colegio' AND id IN (SELECT recibo_ingreso_id FROM _pag);
  GET DIAGNOSTICS v_ri = ROW_COUNT;
  UPDATE public.edu_cargos SET cargo_origen_id = NULL WHERE cargo_origen_id IN (SELECT id FROM public.edu_cargos WHERE estudiante_id IN (SELECT id FROM _est));
  DELETE FROM public.edu_cargos WHERE estudiante_id IN (SELECT id FROM _est);
  DELETE FROM public.edu_estudiantes WHERE id IN (SELECT id FROM _est);   -- las notas se van solas (cascade)
  GET DIAGNOSTICS v_est = ROW_COUNT;
  DELETE FROM public.edu_familias WHERE id IN (SELECT id FROM _fam);
  GET DIAGNOSTICS v_fam = ROW_COUNT;
  -- Clientes que el cobro creó para esas familias, si nada más los usa.
  DELETE FROM public.clientes c
   WHERE c.tenant_id = v_t
     AND c.id IN (SELECT cliente_id FROM _fam UNION SELECT cliente_fiscal_id FROM _fam)
     AND NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.cliente_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso r WHERE r.cliente_id = c.id);
  GET DIAGNOSTICS v_cli = ROW_COUNT;
  RAISE NOTICE 'Borrados: % estudiantes, % familias, % cobros, % recibos de ingreso, % clientes', v_est, v_fam, v_pag, v_ri, v_cli;
END $borrar$;

-- Uniformes y libros de prueba (colegio_prueba_uniformes_libros.sql):
-- los que no se vendieron se borran; los vendidos se desactivan (la factura
-- los necesita). Los tipos UNIFORMES y LIBROS se quedan.
DO $productos$
DECLARE v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb'; v_b int; v_d int;
BEGIN
  CREATE TEMP TABLE _prod ON COMMIT DROP AS
    SELECT p.id, EXISTS (SELECT 1 FROM public.facturas_detalle fd WHERE fd.producto_id = p.id) AS vendido
      FROM public.productos p WHERE p.tenant_id = v_t AND p.referencia = 'PRUEBA';
  DELETE FROM public.inventario_movimientos WHERE tenant_id = v_t AND referencia_doc = 'PRUEBA-INICIAL'
     AND producto_id IN (SELECT id FROM _prod WHERE NOT vendido);
  DELETE FROM public.presentaciones WHERE producto_id IN (SELECT id FROM _prod WHERE NOT vendido);
  DELETE FROM public.productos WHERE id IN (SELECT id FROM _prod WHERE NOT vendido);
  GET DIAGNOSTICS v_b = ROW_COUNT;
  UPDATE public.productos SET activo = false WHERE id IN (SELECT id FROM _prod WHERE vendido);
  GET DIAGNOSTICS v_d = ROW_COUNT;
  RAISE NOTICE 'Productos de prueba: % borrados, % desactivados (ya vendidos)', v_b, v_d;
END $productos$;

-- Facturas fiscales hechas a familias de prueba (no se borran):
SELECT f.ncf, f.fecha, c.nombre FROM public.facturas f JOIN public.clientes c ON c.id = f.cliente_id
 WHERE f.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb' AND f.forma_pago LIKE '% - RECIBO'
   AND NOT EXISTS (SELECT 1 FROM public.edu_familias fa WHERE fa.cliente_id = c.id OR fa.cliente_fiscal_id = c.id);

SELECT public.registrar_migracion('colegio_prueba_borrar.sql');
