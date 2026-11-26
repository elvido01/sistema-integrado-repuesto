-- ============================================================
-- APP: EDITAR LA FICHA DEL PRODUCTO (26/11/2026)
-- ============================================================
-- El dueño: en el catálogo de la app, al tocar un artículo salía una
-- pantalla en blanco (el detalle leía precio_venta_1 / existencia, que no
-- existen en productos) y pidió poder editar el formulario del producto.
--
-- El precio y el costo viven en la presentación principal (afecta_ft, o la
-- primera); productos.precio / costo son copia de ella. La web guarda las
-- dos cosas por separado desde el navegador; aquí va TODO en una función,
-- en una transacción, con las mismas fórmulas de la web (PresentationsTab):
--   margen_pct   = (precio1 / costo - 1) * 100       (0 si costo = 0)
--   precio2/3    = precio1 - % de la empresa, solo si están en automático
--                  (config_empresa.precio2/3_descuento_pct, 10 y 15 por omisión)
--   precio_final = precio1 - descuento_pct
-- La existencia NO se edita aquí (va por "Actualizar Existencia", que deja
-- su entrada/salida de ajuste); el código tampoco (cambiar_codigo_producto).
--
-- Permiso: admin/owner, super admin, o "editar" en Mercancías (la misma
-- llave que la web). Solo productos de la empresa activa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_producto_puede_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND (COALESCE(p.is_superadmin, false) OR lower(COALESCE(p.role, '')) IN ('admin', 'owner')))
      OR EXISTS (SELECT 1 FROM public.user_module_permissions m
                  WHERE m.user_id = auth.uid() AND m.module_key = 'mercancias' AND m.can_edit);
$$;

CREATE OR REPLACE FUNCTION public.app_producto_guardar(
  p_id uuid,
  p_descripcion text,
  p_referencia text,
  p_ubicacion text,
  p_precio numeric,
  p_costo numeric,
  p_itbis_pct numeric,
  p_min_stock numeric DEFAULT 0,
  p_max_stock numeric DEFAULT 0,
  p_activo boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_prod public.productos%ROWTYPE;
  v_pres public.presentaciones%ROWTYPE;
  v_precio numeric(12,2) := round(COALESCE(p_precio, 0), 2);
  v_costo numeric(12,2) := round(COALESCE(p_costo, 0), 2);
  v_p2 numeric; v_p3 numeric;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT public.app_producto_puede_editar() THEN
    RAISE EXCEPTION 'No tienes permiso para editar productos (Mercancías → editar)';
  END IF;
  SELECT * INTO v_prod FROM public.productos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_prod.tenant_id <> v_t THEN RAISE EXCEPTION 'Este producto es de otra empresa'; END IF;
  IF COALESCE(btrim(p_descripcion), '') = '' THEN RAISE EXCEPTION 'La descripción es requerida'; END IF;
  IF v_precio < 0 OR v_costo < 0 THEN RAISE EXCEPTION 'Precio y costo no pueden ser negativos'; END IF;
  IF p_itbis_pct IS NULL OR p_itbis_pct < 0 OR p_itbis_pct > 0.18 THEN
    RAISE EXCEPTION 'ITBIS no válido (0 a 18%%, como decimal: 0.18)';
  END IF;

  SELECT COALESCE(precio2_descuento_pct, 10), COALESCE(precio3_descuento_pct, 15) INTO v_p2, v_p3
    FROM public.config_empresa WHERE tenant_id = v_t ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  v_p2 := LEAST(GREATEST(COALESCE(v_p2, 10), 0), 100);
  v_p3 := LEAST(GREATEST(COALESCE(v_p3, 15), 0), 100);

  UPDATE public.productos SET
    descripcion = btrim(p_descripcion),
    referencia  = NULLIF(btrim(COALESCE(p_referencia, '')), ''),
    ubicacion   = NULLIF(btrim(COALESCE(p_ubicacion, '')), ''),
    precio      = v_precio,
    costo       = v_costo,
    itbis_pct   = p_itbis_pct,
    min_stock   = GREATEST(COALESCE(p_min_stock, 0), 0),
    max_stock   = GREATEST(COALESCE(p_max_stock, 0), 0),
    activo      = COALESCE(p_activo, true),
    updated_at  = now()
  WHERE id = p_id;

  -- La presentación principal: la que afecta la factura, o la primera.
  SELECT * INTO v_pres FROM public.presentaciones
   WHERE producto_id = p_id
   ORDER BY afecta_ft DESC NULLS LAST, created_at, id LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    UPDATE public.presentaciones SET
      precio1      = v_precio,
      costo        = v_costo,
      margen_pct   = CASE WHEN v_costo > 0 THEN round((v_precio / v_costo - 1) * 100, 2) ELSE 0 END,
      precio2      = CASE WHEN COALESCE(auto_precio2, false) THEN round(v_precio * (1 - v_p2 / 100), 2) ELSE precio2 END,
      precio3      = CASE WHEN COALESCE(auto_precio3, false) THEN round(v_precio * (1 - v_p3 / 100), 2) ELSE precio3 END,
      precio_final = round(v_precio * (1 - COALESCE(descuento_pct, 0) / 100), 2)
    WHERE id = v_pres.id;
  ELSE
    INSERT INTO public.presentaciones (producto_id, tenant_id, tipo, cantidad, costo, margen_pct, precio1, precio2, precio3,
                                       descuento_pct, afecta_ft, afecta_inv, precio_final, auto_precio2, auto_precio3)
    VALUES (p_id, v_t, 'UND - Unidad', 1, v_costo,
            CASE WHEN v_costo > 0 THEN round((v_precio / v_costo - 1) * 100, 2) ELSE 0 END,
            v_precio, round(v_precio * (1 - v_p2 / 100), 2), round(v_precio * (1 - v_p3 / 100), 2),
            0, true, true, v_precio, true, true);
  END IF;

  RETURN (SELECT to_jsonb(p) || jsonb_build_object('existencia', public.get_stock_actual(p.id))
            FROM public.productos p WHERE p.id = p_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.app_producto_puede_editar(),
  public.app_producto_guardar(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_producto_puede_editar(),
  public.app_producto_guardar(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- PRUEBA (Morla, administrador): un producto con presentación; todo se deshace.
DO $prueba$
DECLARE v_p uuid; r jsonb; pr record; v_auto2 boolean; v_p2_antes numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '0a751661-5ec4-4136-a75c-b4d8493beae0', 'role', 'authenticated')::text, true);
  IF NOT public.app_producto_puede_editar() THEN RAISE EXCEPTION 'El admin no puede editar'; END IF;
  SELECT p.id INTO v_p FROM public.productos p
   WHERE p.tenant_id = public.get_user_tenant()
     AND EXISTS (SELECT 1 FROM public.presentaciones s WHERE s.producto_id = p.id AND s.afecta_ft)
   ORDER BY p.created_at LIMIT 1;

  r := public.app_producto_guardar(v_p, '  PRUEBA DESCRIPCION  ', 'REF-X', 'H-1', 1000, 800, 0.18, 2, 10, true);
  IF r->>'descripcion' <> 'PRUEBA DESCRIPCION' OR (r->>'precio')::numeric <> 1000 OR (r->>'costo')::numeric <> 800
     OR r->>'ubicacion' <> 'H-1' OR r->>'existencia' IS NULL THEN
    RAISE EXCEPTION 'Producto: %', r;
  END IF;
  SELECT * INTO pr FROM public.presentaciones WHERE producto_id = v_p ORDER BY afecta_ft DESC NULLS LAST, created_at, id LIMIT 1;
  IF pr.precio1 <> 1000 OR pr.costo <> 800 OR pr.margen_pct <> 25 OR pr.precio_final <> round(1000 * (1 - COALESCE(pr.descuento_pct, 0) / 100), 2) THEN
    RAISE EXCEPTION 'Presentación: %', row_to_json(pr);
  END IF;
  IF pr.auto_precio2 AND pr.precio2 >= 1000 THEN RAISE EXCEPTION 'Precio 2 automático no bajó: %', pr.precio2; END IF;

  -- Validaciones
  BEGIN PERFORM public.app_producto_guardar(v_p, '', NULL, NULL, 1, 1, 0.18); RAISE EXCEPTION 'Aceptó sin descripción';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Aceptó sin descripción' THEN RAISE; END IF; END;
  BEGIN PERFORM public.app_producto_guardar(v_p, 'X', NULL, NULL, 1, 1, 18); RAISE EXCEPTION 'Aceptó ITBIS 18';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Aceptó ITBIS 18' THEN RAISE; END IF; END;

  -- Un vendedor sin permiso de Mercancías no puede
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '6ddee59f-63a4-4839-9df6-97e7e47fd47b', 'role', 'authenticated')::text, true);
  IF NOT public.app_producto_puede_editar() THEN
    BEGIN PERFORM public.app_producto_guardar(v_p, 'X', NULL, NULL, 1, 1, 0.18); RAISE EXCEPTION 'Editó sin permiso';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Editó sin permiso' THEN RAISE; END IF; END;
  END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('app_producto_editar.sql');
