-- =====================================================================
-- REPUESTOS MORLA VIEJA (tenant 00000000-...-0002): empresa SOLO CONSULTA.
--   1) Candado: no puede vender, hacer pedidos ni cotizar. Trigger que
--      bloquea INSERT en facturas/pedidos/cotizaciones para cualquier
--      empresa marcada solo_consulta (a prueba de "me quedé en la vieja").
--   2) mover_producto_a_morla_nuevo(): copia un producto de la vieja al
--      REPUESTOS MORLA nuevo (tenant ...0001). Si el código ya existe en
--      el nuevo, antepone 'm' (marca que viene de la vieja).
-- Idempotente.
-- =====================================================================

-- 1) Flag solo_consulta -----------------------------------------------
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS solo_consulta boolean NOT NULL DEFAULT false;

UPDATE public.config_empresa
   SET solo_consulta = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002';

-- 2) Trigger de bloqueo ------------------------------------------------
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
    RAISE EXCEPTION 'REPUESTOS MORLA VIEJA es solo para consulta: no se puede vender, hacer pedidos ni cotizar desde esta empresa. Cambia a la empresa activa en el menú de la izquierda.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solo_consulta_facturas ON public.facturas;
CREATE TRIGGER trg_solo_consulta_facturas
  BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_si_solo_consulta();

DROP TRIGGER IF EXISTS trg_solo_consulta_pedidos ON public.pedidos;
CREATE TRIGGER trg_solo_consulta_pedidos
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_si_solo_consulta();

DROP TRIGGER IF EXISTS trg_solo_consulta_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_solo_consulta_cotizaciones
  BEFORE INSERT ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_si_solo_consulta();

-- 3) Mover producto de la vieja al nuevo -------------------------------
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
  -- Solo desde la empresa vieja (evita usarlo por error desde otra)
  IF public.get_user_tenant() <> v_origen THEN
    RAISE EXCEPTION 'Esta acción solo está disponible en REPUESTOS MORLA VIEJA';
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
    PERFORM public.registrar_migracion('morla_vieja_candado_y_mover.sql');
  END IF;
END $$;

SELECT 'Morla Vieja: candado solo-consulta + mover a Morla nuevo listos' AS status;
