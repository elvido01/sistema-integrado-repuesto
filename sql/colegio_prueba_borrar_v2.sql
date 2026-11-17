-- =====================================================================
-- Centenario: BORRAR TODOS LOS DATOS DE PRUEBA (17/11/2026)
-- ---------------------------------------------------------------------
-- Reemplaza a colegio_prueba_borrar.sql (08/11, nunca se corrió).
-- La VENTA de prueba va aparte: colegio_prueba_borrar_ventas.sql. Correr
-- ESE PRIMERO; si no, los 2 uniformes vendidos quedan desactivados (no
-- borrados) y el cliente de esa venta se queda.
--   1. Estudiantes y familias marcados notas = 'PRUEBA' (300 / 202) con sus
--      cobros, recibos (RC y RI), cargos, notas y los clientes que el cobro
--      creó (y su copia en el CENTENARIO 1). Los recibos RC/RI salen del
--      máximo que exista: vuelven a 1 solos.
--   2. Los 40 uniformes y libros (referencia = 'PRUEBA') con su inventario,
--      en los dos colegios (inventario compartido).
--   3. El cierre de caja de prueba del 08/11 (solo cobros de prueba).
--
-- NO SE TOCAN los 3 estudiantes escritos a mano (sin marca PRUEBA):
--   ANGEL EMMANUEL y SARAH ANNELIS CAMINERO HERRERA, SANDER ARIAS
--   (familias CAMINERO HERRERA y ARIAS CORREA), ni la configuración
--   (años, cursos, tarifas, conceptos).
-- Solo el COLEGIO CON INGLÉS NUEVO CENTENARIO (y las copias espejo en el
-- CENTENARIO 1). Todo o nada (una transacción).
-- =====================================================================

-- 1) Estudiantes, familias, cobros
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
  -- Clientes que el cobro creó para esas familias (y su copia en el
  -- CENTENARIO 1, clientes compartidos), si nada más los usa.
  CREATE TEMP TABLE _cli ON COMMIT DROP AS
    SELECT x.id FROM (SELECT cliente_id AS id FROM _fam UNION SELECT cliente_fiscal_id FROM _fam) x WHERE x.id IS NOT NULL;
  INSERT INTO _cli SELECT e.par_id FROM public.clientes_espejo e WHERE e.cliente_id IN (SELECT id FROM _cli);
  DELETE FROM public.clientes c
   WHERE c.id IN (SELECT id FROM _cli)
     AND NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.cliente_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso r WHERE r.cliente_id = c.id);
  GET DIAGNOSTICS v_cli = ROW_COUNT;
  RAISE NOTICE 'Borrados: % estudiantes, % familias, % cobros, % recibos de ingreso, % clientes', v_est, v_fam, v_pag, v_ri, v_cli;
END $borrar$;

-- 2) Uniformes y libros de prueba: los que no se vendieron se borran; los
-- vendidos (con factura real) se desactivan. Los tipos UNIFORMES y LIBROS se
-- quedan. Incluye sus gemelos del CENTENARIO 1 (inventario compartido).
DO $productos$
DECLARE v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb'; v_t2 uuid; v_b int; v_d int;
BEGIN
  SELECT inventario_compartido_con INTO v_t2 FROM public.config_empresa WHERE tenant_id = v_t;
  CREATE TEMP TABLE _prod ON COMMIT DROP AS
    -- Vendido en CUALQUIERA de los dos colegios = no se borra ninguno de los
    -- gemelos (borrar un movimiento copiado borra también el original).
    SELECT p.id, EXISTS (SELECT 1 FROM public.facturas_detalle fd
                          WHERE fd.producto_id = p.id
                             OR fd.producto_id IN (SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = p.id)) AS vendido
      FROM public.productos p WHERE p.tenant_id IN (v_t, v_t2) AND p.referencia = 'PRUEBA';
  DELETE FROM public.inventario_movimientos WHERE tenant_id IN (v_t, v_t2)
     AND producto_id IN (SELECT id FROM _prod WHERE NOT vendido);
  DELETE FROM public.presentaciones WHERE producto_id IN (SELECT id FROM _prod WHERE NOT vendido);
  DELETE FROM public.productos WHERE id IN (SELECT id FROM _prod WHERE NOT vendido);
  GET DIAGNOSTICS v_b = ROW_COUNT;
  UPDATE public.productos SET activo = false WHERE id IN (SELECT id FROM _prod WHERE vendido);
  GET DIAGNOSTICS v_d = ROW_COUNT;
  RAISE NOTICE 'Productos de prueba: % borrados, % desactivados (ya vendidos)', v_b, v_d;
END $productos$;

-- 3) Cierre de caja de prueba
DO $caja$
DECLARE v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb'; v_c int;
BEGIN
  DELETE FROM public.cierres_caja WHERE tenant_id = v_t AND fecha <= '2026-11-17';
  GET DIAGNOSTICS v_c = ROW_COUNT;
  RAISE NOTICE 'Cierres de caja de prueba borrados: %', v_c;
END $caja$;

-- Lo que queda (para ver el resultado):
SELECT
  (SELECT count(*) FROM public.edu_estudiantes WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS estudiantes,
  (SELECT count(*) FROM public.edu_familias    WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS familias,
  (SELECT count(*) FROM public.edu_pagos       WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS cobros,
  (SELECT count(*) FROM public.facturas        WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS facturas,
  (SELECT count(*) FROM public.productos       WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS productos,
  (SELECT count(*) FROM public.clientes        WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS clientes;

SELECT public.registrar_migracion('colegio_prueba_borrar_v2.sql');
