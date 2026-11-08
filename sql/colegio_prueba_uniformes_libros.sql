-- =====================================================================
-- Centenario: 20 uniformes y 20 libros DE PRUEBA (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño para probar Ventas y la Caja del Colegio.
-- · 10 poloches y 10 pantalones (tallas 4 a 16 y S, M, L), ITBIS 18%.
-- · 20 libros por curso y materia, EXENTOS de ITBIS (libros: art. 344 CT).
-- · Tipos "UNIFORMES" y "LIBROS" (el colegio no tenía tipos).
-- · Precio en la presentación UND (como lo guarda la pantalla) y existencia
--   inicial con una ENTRADA "PRUEBA-INICIAL" (15 uniformes, 25 libros).
-- · Todo marcado: productos.referencia = 'PRUEBA' (se borra con
--   colegio_prueba_borrar.sql). Solo el COLEGIO CON INGLÉS NUEVO CENTENARIO.
-- =====================================================================

DO $prueba$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  v_tipo_uni uuid; v_tipo_lib uuid; v_p uuid;
  tallas text[] := ARRAY['4','6','8','10','12','14','16','S','M','L'];
  t text; i int;
  libros text[][] := ARRAY[
    ['LIB-LEN-1P', 'LENGUA ESPAÑOLA 1RO DE PRIMARIA', '950'],
    ['LIB-MAT-1P', 'MATEMÁTICA 1RO DE PRIMARIA', '950'],
    ['LIB-LEN-2P', 'LENGUA ESPAÑOLA 2DO DE PRIMARIA', '980'],
    ['LIB-MAT-2P', 'MATEMÁTICA 2DO DE PRIMARIA', '980'],
    ['LIB-LEN-3P', 'LENGUA ESPAÑOLA 3RO DE PRIMARIA', '1050'],
    ['LIB-MAT-3P', 'MATEMÁTICA 3RO DE PRIMARIA', '1050'],
    ['LIB-NAT-3P', 'CIENCIAS DE LA NATURALEZA 3RO DE PRIMARIA', '990'],
    ['LIB-SOC-3P', 'CIENCIAS SOCIALES 3RO DE PRIMARIA', '990'],
    ['LIB-LEN-4P', 'LENGUA ESPAÑOLA 4TO DE PRIMARIA', '1100'],
    ['LIB-MAT-4P', 'MATEMÁTICA 4TO DE PRIMARIA', '1100'],
    ['LIB-LEN-5P', 'LENGUA ESPAÑOLA 5TO DE PRIMARIA', '1150'],
    ['LIB-MAT-5P', 'MATEMÁTICA 5TO DE PRIMARIA', '1150'],
    ['LIB-LEN-6P', 'LENGUA ESPAÑOLA 6TO DE PRIMARIA', '1200'],
    ['LIB-MAT-6P', 'MATEMÁTICA 6TO DE PRIMARIA', '1200'],
    ['LIB-ING-INI', 'INGLÉS NIVEL INICIAL (CUADERNO DE TRABAJO)', '850'],
    ['LIB-ING-PRI', 'INGLÉS PRIMARIA (LIBRO DEL ESTUDIANTE)', '1250'],
    ['LIB-LEN-1S', 'LENGUA ESPAÑOLA 1RO DE SECUNDARIA', '1350'],
    ['LIB-MAT-1S', 'MATEMÁTICA 1RO DE SECUNDARIA', '1350'],
    ['LIB-NAT-1S', 'CIENCIAS DE LA NATURALEZA 1RO DE SECUNDARIA', '1300'],
    ['LIB-CAL-INI', 'CALIGRAFÍA Y TRAZOS NIVEL INICIAL', '650']];
  v_costo numeric; v_precio numeric;
BEGIN
  SELECT id INTO v_tipo_uni FROM public.tipos_producto WHERE tenant_id = v_t AND upper(nombre) = 'UNIFORMES';
  IF v_tipo_uni IS NULL THEN INSERT INTO public.tipos_producto (nombre, activo, tenant_id) VALUES ('UNIFORMES', true, v_t) RETURNING id INTO v_tipo_uni; END IF;
  SELECT id INTO v_tipo_lib FROM public.tipos_producto WHERE tenant_id = v_t AND upper(nombre) = 'LIBROS';
  IF v_tipo_lib IS NULL THEN INSERT INTO public.tipos_producto (nombre, activo, tenant_id) VALUES ('LIBROS', true, v_t) RETURNING id INTO v_tipo_lib; END IF;

  -- Uniformes: poloche 650 / pantalón 850 (las tallas de adulto un poco más).
  FOREACH t IN ARRAY tallas LOOP
    FOR i IN 1..2 LOOP
      v_costo := CASE WHEN i = 1 THEN 420 ELSE 560 END + CASE WHEN t IN ('S','M','L') THEN 60 ELSE 0 END;
      v_precio := CASE WHEN i = 1 THEN 650 ELSE 850 END + CASE WHEN t IN ('S','M','L') THEN 100 ELSE 0 END;
      INSERT INTO public.productos (codigo, referencia, descripcion, tipo_id, itbis_pct, costo, precio, medida, tenant_id, activo)
        VALUES (CASE WHEN i = 1 THEN 'UNI-POL-' ELSE 'UNI-PAN-' END || t, 'PRUEBA',
                CASE WHEN i = 1 THEN 'POLOCHE ESCOLAR CON LOGO TALLA ' ELSE 'PANTALÓN ESCOLAR AZUL MARINO TALLA ' END || t,
                v_tipo_uni, 0.18, v_costo, v_precio, 'TALLA ' || t, v_t, true)
        RETURNING id INTO v_p;
      INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio_final, tipo, tenant_id)
        VALUES (v_p, 1, v_costo, round((v_precio - v_costo) / v_costo * 100, 2), v_precio, v_precio, 'UND - Unidad', v_t);
      INSERT INTO public.inventario_movimientos (producto_id, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
        VALUES (v_p, 'ENTRADA', 15, v_costo, 'PRUEBA-INICIAL', v_t);
    END LOOP;
  END LOOP;

  -- Libros (exentos): costo ≈ 74% del precio.
  FOR i IN 1..array_length(libros, 1) LOOP
    v_precio := libros[i][3]::numeric;
    v_costo := round(v_precio * 0.74, 2);
    INSERT INTO public.productos (codigo, referencia, descripcion, tipo_id, itbis_pct, costo, precio, tenant_id, activo)
      VALUES (libros[i][1], 'PRUEBA', libros[i][2], v_tipo_lib, 0, v_costo, v_precio, v_t, true)
      RETURNING id INTO v_p;
    INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio_final, tipo, tenant_id)
      VALUES (v_p, 1, v_costo, round((v_precio - v_costo) / v_costo * 100, 2), v_precio, v_precio, 'UND - Unidad', v_t);
    INSERT INTO public.inventario_movimientos (producto_id, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
      VALUES (v_p, 'ENTRADA', 25, v_costo, 'PRUEBA-INICIAL', v_t);
  END LOOP;
  RAISE NOTICE 'Listo: 20 uniformes y 20 libros de prueba';
END $prueba$;

-- Lo que quedó:
SELECT p.codigo, p.descripcion, p.itbis_pct, pr.precio1 AS precio, p.costo
  FROM public.productos p JOIN public.presentaciones pr ON pr.producto_id = p.id
 WHERE p.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb' AND p.referencia = 'PRUEBA'
 ORDER BY p.codigo;

SELECT public.registrar_migracion('colegio_prueba_uniformes_libros.sql');
