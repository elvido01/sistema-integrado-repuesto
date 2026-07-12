-- ============================================================
-- Traer de Morla Vieja SIN cambiar de empresa
-- ============================================================
-- Problema: para mover una pieza de REPUESTOS MORLA VIEJA había que
-- cambiar de empresa, y el cambio recarga la app y borra la factura
-- en curso. Ahora el buscador de la empresa NUEVA puede:
--   1) buscar_productos_morla_vieja(): consultar el catálogo viejo
--      (con existencia calculada en una pasada).
--   2) mover_producto_a_morla_nuevo(): se actualiza el candado para
--      permitir ejecutarlo TAMBIÉN desde la empresa nueva (antes solo
--      desde la vieja). Supersede la versión de
--      morla_vieja_candado_y_mover.sql (conserva el cast a enum).
-- Idempotente.
-- ============================================================

-- 1) Buscar en el catálogo de la vieja desde la nueva ------------------
CREATE OR REPLACE FUNCTION public.buscar_productos_morla_vieja(
  p_limit  integer,
  p_offset integer,
  p_search text DEFAULT NULL,
  p_marca  text DEFAULT NULL,
  p_modelo text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  codigo text,
  referencia text,
  descripcion text,
  ubicacion text,
  precio numeric,
  costo numeric,
  itbis_pct numeric,
  marca_nombre text,
  modelo_nombre text,
  existencia numeric,
  total_count bigint
) AS $$
DECLARE
  v_vieja  uuid := '00000000-0000-0000-0000-000000000002'; -- MORLA VIEJA
  v_nueva  uuid := '00000000-0000-0000-0000-000000000001'; -- MORLA (nuevo)
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL OR v_tenant NOT IN (v_nueva, v_vieja) THEN
    RETURN; -- solo usuarios de las empresas Morla
  END IF;

  RETURN QUERY
  WITH stock AS (
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM inventario_movimientos im
    WHERE im.tenant_id = v_vieja
    GROUP BY im.producto_id
  ),
  filtered AS (
    SELECT
      p.id AS pid,
      p.codigo AS pcodigo,
      p.referencia AS pref,
      p.descripcion AS pdesc,
      p.ubicacion AS pubi,
      COALESCE(p.precio, 0) AS pprecio,
      COALESCE(p.costo, 0) AS pcosto,
      COALESCE(p.itbis_pct, 0.18) AS pitbis,
      ma.nombre AS pmarca,
      get_nombres_modelos(p.modelos_ids) AS pmodelo,
      COALESCE(s.stk, 0) AS pexist
    FROM productos p
    LEFT JOIN stock s ON s.producto_id = p.id
    LEFT JOIN marcas ma ON ma.id = p.marca_id
    WHERE p.tenant_id = v_vieja
      AND p.activo = true
      AND (
        p_search IS NULL OR p_search = '' OR
        p.codigo      ILIKE '%'||p_search||'%' OR
        p.referencia  ILIKE '%'||p_search||'%' OR
        p.descripcion ILIKE '%'||p_search||'%'
      )
      AND (p_marca IS NULL OR p_marca = '' OR ma.nombre ILIKE '%'||p_marca||'%')
      AND (
        p_modelo IS NULL OR p_modelo = '' OR
        EXISTS (
          SELECT 1 FROM unnest(p.modelos_ids) AS mid
          JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%'||p_modelo||'%'
        )
      )
  )
  SELECT
    f.pid, f.pcodigo::text, f.pref::text, f.pdesc::text, f.pubi::text,
    f.pprecio, f.pcosto, f.pitbis, f.pmarca::text, f.pmodelo,
    f.pexist, COUNT(*) OVER()::bigint
  FROM filtered f
  ORDER BY f.pdesc ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.buscar_productos_morla_vieja(integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_productos_morla_vieja(integer, integer, text, text, text) TO authenticated;

-- 2) mover_producto_a_morla_nuevo: permitir también desde la NUEVA -----
CREATE OR REPLACE FUNCTION public.mover_producto_a_morla_nuevo(p_producto_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_origen  uuid := '00000000-0000-0000-0000-000000000002'; -- MORLA VIEJA
  v_destino uuid := '00000000-0000-0000-0000-000000000001'; -- MORLA (nuevo)
  p           record;
  v_codigo    text;
  v_marca_nom text;
  v_modelo_nom text;
  v_marca_id  uuid;
  v_modelo_id uuid;
  v_new_id    uuid;
  v_renombrado boolean;
  v_stock     numeric;
BEGIN
  -- Desde la vieja (consulta) o desde la nueva (buscador "Traer de Morla Vieja")
  IF public.get_user_tenant() IS NULL OR public.get_user_tenant() NOT IN (v_origen, v_destino) THEN
    RAISE EXCEPTION 'Esta acción solo está disponible para REPUESTOS MORLA';
  END IF;

  SELECT * INTO p FROM public.productos WHERE id = p_producto_id AND tenant_id = v_origen;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado en Morla Vieja'; END IF;

  -- Código destino: si ya existe en el nuevo, anteponer 'm' (repetir si choca)
  v_codigo := p.codigo;
  WHILE EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = v_destino AND codigo = v_codigo) LOOP
    v_codigo := 'm' || v_codigo;
  END LOOP;
  v_renombrado := (v_codigo <> p.codigo);

  -- Marca: find-or-create por nombre en el destino
  SELECT nombre INTO v_marca_nom FROM public.marcas WHERE id = p.marca_id;
  IF v_marca_nom IS NOT NULL THEN
    SELECT id INTO v_marca_id FROM public.marcas
      WHERE tenant_id = v_destino AND upper(nombre) = upper(v_marca_nom) LIMIT 1;
    IF v_marca_id IS NULL THEN
      INSERT INTO public.marcas (id, tenant_id, nombre, activo)
        VALUES (gen_random_uuid(), v_destino, v_marca_nom, true) RETURNING id INTO v_marca_id;
    END IF;
  END IF;

  -- Modelo: toma modelo_id o el primero de modelos_ids; find-or-create bajo la marca
  SELECT nombre INTO v_modelo_nom FROM public.modelos
    WHERE id = COALESCE(p.modelo_id, p.modelos_ids[1]);
  IF v_modelo_nom IS NOT NULL AND v_marca_id IS NOT NULL THEN
    SELECT id INTO v_modelo_id FROM public.modelos
      WHERE tenant_id = v_destino AND marca_id = v_marca_id AND upper(nombre) = upper(v_modelo_nom) LIMIT 1;
    IF v_modelo_id IS NULL THEN
      INSERT INTO public.modelos (id, tenant_id, marca_id, nombre, activo)
        VALUES (gen_random_uuid(), v_destino, v_marca_id, v_modelo_nom, true) RETURNING id INTO v_modelo_id;
    END IF;
  END IF;

  -- Existencia actual del producto en la vieja (se traslada al nuevo)
  v_stock := COALESCE(public.get_stock_actual(p_producto_id), 0);

  -- Crear el producto en el nuevo
  v_new_id := gen_random_uuid();
  INSERT INTO public.productos (
    id, tenant_id, codigo, referencia, descripcion, marca_id, modelo_id, modelos_ids,
    costo, precio, itbis_pct, min_stock, max_stock, ubicacion, activo
  ) VALUES (
    v_new_id, v_destino, v_codigo, p.referencia, p.descripcion, v_marca_id, v_modelo_id,
    CASE WHEN v_modelo_id IS NOT NULL THEN ARRAY[v_modelo_id] ELSE '{}'::uuid[] END,
    p.costo, p.precio, p.itbis_pct, p.min_stock, p.max_stock, p.ubicacion, true
  );

  -- Trasladar la existencia como ENTRADA en el nuevo
  IF v_stock <> 0 THEN
    INSERT INTO public.inventario_movimientos (
      tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc
    ) VALUES (
      v_destino, v_new_id, current_date,
      -- la columna tipo es enum movimiento_tipo: el CASE debe castearse
      (CASE WHEN v_stock >= 0 THEN 'ENTRADA' ELSE 'SALIDA' END)::public.movimiento_tipo,
      v_stock, p.costo, 'TRASLADO DESDE MORLA VIEJA'
    );
  END IF;

  -- Quitarlo de la VIEJA (la idea es ir vaciando REPUESTOS MORLA VIEJA hasta
  -- eliminarla). Primero sus movimientos de existencia (FK), luego el producto.
  DELETE FROM public.inventario_movimientos WHERE producto_id = p_producto_id AND tenant_id = v_origen;
  DELETE FROM public.productos WHERE id = p_producto_id AND tenant_id = v_origen;

  RETURN json_build_object('ok', true, 'codigo', v_codigo, 'renombrado', v_renombrado, 'id', v_new_id, 'existencia', v_stock, 'eliminado_origen', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mover_producto_a_morla_nuevo(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mover_producto_a_morla_nuevo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('traer_de_morla_vieja.sql');
  END IF;
END $$;

SELECT 'Traer de Morla Vieja listo: buscador cross-empresa + mover desde la nueva' AS status;
