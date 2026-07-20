-- =====================================================================
-- "Traer de la vieja" GENÉRICO (cualquier par empresa nueva ↔ vieja)
-- ---------------------------------------------------------------------
-- Hasta ahora el mecanismo estaba hardcodeado a Morla (tenants ...0001 y
-- ...0002) en el SQL y en el frontend. Se generaliza con un puntero en
-- config_empresa: la empresa NUEVA apunta a su empresa VIEJA. Así sirve
-- para Morla, Caminero y cualquier futura pareja, sin tocar código.
--
--   config_empresa.empresa_vieja_tenant_id  →  la empresa "vieja" de esta
--   config_empresa.solo_consulta            →  la vieja no factura (candado)
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- 1) Puntero nueva → vieja --------------------------------------------
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS empresa_vieja_tenant_id uuid;

-- Parejas actuales
UPDATE public.config_empresa SET empresa_vieja_tenant_id = '00000000-0000-0000-0000-000000000002'
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001';               -- MORLA → MORLA VIEJA
UPDATE public.config_empresa SET empresa_vieja_tenant_id = '27ee3fdb-e950-4c9e-b5b1-91d3f0054fec'
  WHERE tenant_id = '91cc1e82-441e-4c22-8e30-9c8866294c00';               -- CAMINERO → CAMINERO VIEJO

-- La vieja de Caminero es SOLO CONSULTA (el trigger ya existe y es genérico)
UPDATE public.config_empresa SET solo_consulta = true
  WHERE tenant_id = '27ee3fdb-e950-4c9e-b5b1-91d3f0054fec';

-- Mensaje del candado, ahora genérico (no menciona "Morla")
CREATE OR REPLACE FUNCTION public.bloquear_si_solo_consulta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.config_empresa ce
    WHERE ce.tenant_id = NEW.tenant_id AND ce.solo_consulta = true
  ) THEN
    RAISE EXCEPTION 'Esta empresa es SOLO CONSULTA: no se puede vender, hacer pedidos ni cotizar desde aquí. Cambia a la empresa activa en el menú de la izquierda.';
  END IF;
  RETURN NEW;
END;
$$;

-- 2) buscar_productos_vieja(): busca el catálogo de la vieja desde la nueva
--    Resuelve la vieja desde el puntero de config. Solo devuelve algo si la
--    empresa actual TIENE una vieja configurada.
CREATE OR REPLACE FUNCTION public.buscar_productos_vieja(
  p_limit  integer,
  p_offset integer,
  p_search text DEFAULT NULL,
  p_marca  text DEFAULT NULL,
  p_modelo text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, codigo text, referencia text, descripcion text, ubicacion text,
  precio numeric, costo numeric, itbis_pct numeric,
  marca_nombre text, modelo_nombre text, existencia numeric, total_count bigint
) AS $$
DECLARE
  v_current uuid := public.get_user_tenant();
  v_vieja   uuid;
BEGIN
  IF v_current IS NULL THEN RETURN; END IF;
  SELECT empresa_vieja_tenant_id INTO v_vieja FROM public.config_empresa WHERE tenant_id = v_current;
  IF v_vieja IS NULL THEN RETURN; END IF;   -- esta empresa no tiene "vieja"

  RETURN QUERY
  WITH stock AS (
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM inventario_movimientos im
    WHERE im.tenant_id = v_vieja
    GROUP BY im.producto_id
  ),
  filtered AS (
    SELECT
      p.id AS pid, p.codigo AS pcodigo, p.referencia AS pref, p.descripcion AS pdesc,
      p.ubicacion AS pubi, COALESCE(p.precio, 0) AS pprecio, COALESCE(p.costo, 0) AS pcosto,
      COALESCE(p.itbis_pct, 0.18) AS pitbis, ma.nombre AS pmarca,
      get_nombres_modelos(p.modelos_ids) AS pmodelo, COALESCE(s.stk, 0) AS pexist
    FROM productos p
    LEFT JOIN stock s ON s.producto_id = p.id
    LEFT JOIN marcas ma ON ma.id = p.marca_id
    WHERE p.tenant_id = v_vieja
      AND p.activo = true
      AND (
        p_search IS NULL OR p_search = '' OR
        p.codigo ILIKE '%'||p_search||'%' OR p.referencia ILIKE '%'||p_search||'%' OR p.descripcion ILIKE '%'||p_search||'%'
      )
      AND (p_marca IS NULL OR p_marca = '' OR ma.nombre ILIKE '%'||p_marca||'%')
      AND (
        p_modelo IS NULL OR p_modelo = '' OR EXISTS (
          SELECT 1 FROM unnest(p.modelos_ids) AS mid JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%'||p_modelo||'%'
        )
      )
  )
  SELECT f.pid, f.pcodigo::text, f.pref::text, f.pdesc::text, f.pubi::text,
         f.pprecio, f.pcosto, f.pitbis, f.pmarca::text, f.pmodelo, f.pexist, COUNT(*) OVER()::bigint
  FROM filtered f
  ORDER BY f.pdesc ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.buscar_productos_vieja(integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_productos_vieja(integer, integer, text, text, text) TO authenticated;

-- 3) mover_producto_de_vieja(): mueve una pieza de la vieja a la nueva.
--    Bidireccional: sirve llamado desde la nueva (buscador "Traer de la
--    vieja") o desde la vieja (menú "mover al nuevo"). Resuelve la pareja
--    desde config y siempre mueve del tenant vieja → tenant nueva.
CREATE OR REPLACE FUNCTION public.mover_producto_de_vieja(p_producto_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current uuid := public.get_user_tenant();
  v_vieja   uuid;
  v_nueva   uuid;
  p            record;
  v_codigo     text;
  v_marca_nom  text;
  v_modelo_nom text;
  v_marca_id   uuid;
  v_modelo_id  uuid;
  v_new_id     uuid;
  v_renombrado boolean;
  v_stock      numeric;
BEGIN
  IF v_current IS NULL THEN RAISE EXCEPTION 'Sin sesión de empresa'; END IF;

  -- Resolver la pareja (nueva, vieja) desde cualquiera de los dos lados
  SELECT empresa_vieja_tenant_id INTO v_vieja FROM public.config_empresa WHERE tenant_id = v_current;
  IF v_vieja IS NOT NULL THEN
    v_nueva := v_current;                       -- llamado desde la NUEVA
  ELSE
    SELECT tenant_id INTO v_nueva FROM public.config_empresa WHERE empresa_vieja_tenant_id = v_current LIMIT 1;
    v_vieja := v_current;                        -- llamado desde la VIEJA
  END IF;
  IF v_nueva IS NULL OR v_vieja IS NULL THEN
    RAISE EXCEPTION 'Esta empresa no tiene una empresa vieja/nueva configurada';
  END IF;

  SELECT * INTO p FROM public.productos WHERE id = p_producto_id AND tenant_id = v_vieja;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado en la empresa vieja'; END IF;

  -- Código destino: si ya existe en la nueva, anteponer 'm' (viene de la vieja)
  v_codigo := p.codigo;
  WHILE EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = v_nueva AND codigo = v_codigo) LOOP
    v_codigo := 'm' || v_codigo;
  END LOOP;
  v_renombrado := (v_codigo <> p.codigo);

  -- Marca: find-or-create por nombre en la nueva
  SELECT nombre INTO v_marca_nom FROM public.marcas WHERE id = p.marca_id;
  IF v_marca_nom IS NOT NULL THEN
    SELECT id INTO v_marca_id FROM public.marcas WHERE tenant_id = v_nueva AND upper(nombre) = upper(v_marca_nom) LIMIT 1;
    IF v_marca_id IS NULL THEN
      INSERT INTO public.marcas (id, tenant_id, nombre, activo) VALUES (gen_random_uuid(), v_nueva, v_marca_nom, true) RETURNING id INTO v_marca_id;
    END IF;
  END IF;

  -- Modelo: find-or-create bajo la marca en la nueva
  SELECT nombre INTO v_modelo_nom FROM public.modelos WHERE id = COALESCE(p.modelo_id, p.modelos_ids[1]);
  IF v_modelo_nom IS NOT NULL AND v_marca_id IS NOT NULL THEN
    SELECT id INTO v_modelo_id FROM public.modelos WHERE tenant_id = v_nueva AND marca_id = v_marca_id AND upper(nombre) = upper(v_modelo_nom) LIMIT 1;
    IF v_modelo_id IS NULL THEN
      INSERT INTO public.modelos (id, tenant_id, marca_id, nombre, activo) VALUES (gen_random_uuid(), v_nueva, v_marca_id, v_modelo_nom, true) RETURNING id INTO v_modelo_id;
    END IF;
  END IF;

  v_stock := COALESCE(public.get_stock_actual(p_producto_id), 0);

  v_new_id := gen_random_uuid();
  INSERT INTO public.productos (
    id, tenant_id, codigo, referencia, descripcion, marca_id, modelo_id, modelos_ids,
    costo, precio, itbis_pct, min_stock, max_stock, ubicacion, activo
  ) VALUES (
    v_new_id, v_nueva, v_codigo, p.referencia, p.descripcion, v_marca_id, v_modelo_id,
    CASE WHEN v_modelo_id IS NOT NULL THEN ARRAY[v_modelo_id] ELSE '{}'::uuid[] END,
    p.costo, p.precio, p.itbis_pct, p.min_stock, p.max_stock, p.ubicacion, true
  );

  IF v_stock <> 0 THEN
    INSERT INTO public.inventario_movimientos (tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc)
    VALUES (v_nueva, v_new_id, current_date,
      (CASE WHEN v_stock >= 0 THEN 'ENTRADA' ELSE 'SALIDA' END)::public.movimiento_tipo,
      v_stock, p.costo, 'TRASLADO DESDE EMPRESA VIEJA');
  END IF;

  -- Vaciar de la vieja (primero sus movimientos por la FK, luego el producto)
  DELETE FROM public.inventario_movimientos WHERE producto_id = p_producto_id AND tenant_id = v_vieja;
  DELETE FROM public.productos WHERE id = p_producto_id AND tenant_id = v_vieja;

  RETURN json_build_object('ok', true, 'codigo', v_codigo, 'renombrado', v_renombrado, 'id', v_new_id, 'existencia', v_stock, 'eliminado_origen', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mover_producto_de_vieja(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mover_producto_de_vieja(uuid) TO authenticated;

-- 4) Compat: las RPC viejas de Morla pasan a ser wrappers de las genéricas,
--    para no romper nada que aún las llame.
CREATE OR REPLACE FUNCTION public.buscar_productos_morla_vieja(
  p_limit integer, p_offset integer, p_search text DEFAULT NULL, p_marca text DEFAULT NULL, p_modelo text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, codigo text, referencia text, descripcion text, ubicacion text,
  precio numeric, costo numeric, itbis_pct numeric,
  marca_nombre text, modelo_nombre text, existencia numeric, total_count bigint
) AS $$
  SELECT * FROM public.buscar_productos_vieja(p_limit, p_offset, p_search, p_marca, p_modelo);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.mover_producto_a_morla_nuevo(p_producto_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.mover_producto_de_vieja(p_producto_id); $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('empresa_vieja_generico.sql');
  END IF;
END $$;

-- Verificación
SELECT ce.nombre, ce.solo_consulta, v.nombre AS empresa_vieja
FROM public.config_empresa ce
LEFT JOIN public.config_empresa v ON v.tenant_id = ce.empresa_vieja_tenant_id
WHERE ce.empresa_vieja_tenant_id IS NOT NULL OR ce.solo_consulta = true
ORDER BY ce.nombre;
