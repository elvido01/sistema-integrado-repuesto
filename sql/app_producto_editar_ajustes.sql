-- ============================================================
-- APP: EDITAR PRODUCTO · ajustes de la revisión (26/11/2026)
-- ============================================================
--  · Permiso por la EMPRESA ACTIVA (no por el rol global del perfil):
--    superadmin; dueño/admin en usuarios_empresas de la activa; admin cuya
--    empresa de perfil es la activa; o "editar" en Mercancías siendo de la
--    activa. (Mismo patrón que edu_anular_pago.)
--  · ITBIS: solo 0, 0.16 o 0.18 (la app manda el que tenía si no se tocó).
--  · Precio 2/3 automático que quedaría bajo el costo → se apaga el
--    automático y queda en 0, como la web (PresentationsTab, isAutoPriceAllowed).
--  · Costo: la presentación guarda más de 2 decimales; si el costo no cambió
--    (a 2 decimales) se deja el que tenía, sin redondearlo.
--  · tenant_id NULL no pasa el control de empresa (IS DISTINCT FROM).
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_producto_puede_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH a AS (SELECT public.get_user_tenant() AS t)
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_superadmin, false))
      OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue, a
                  WHERE ue.user_id = auth.uid() AND ue.tenant_id = a.t AND ue.rol IN ('owner', 'admin'))
      OR EXISTS (SELECT 1 FROM public.profiles p, a
                  WHERE p.id = auth.uid() AND p.tenant_id = a.t AND lower(COALESCE(p.role, '')) IN ('admin', 'owner'))
      OR (EXISTS (SELECT 1 FROM public.user_module_permissions m
                   WHERE m.user_id = auth.uid() AND m.module_key = 'mercancias' AND m.can_edit)
          AND (EXISTS (SELECT 1 FROM public.profiles p, a WHERE p.id = auth.uid() AND p.tenant_id = a.t)
               OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue, a WHERE ue.user_id = auth.uid() AND ue.tenant_id = a.t)));
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
  v_precio numeric := round(COALESCE(p_precio, 0), 2);
  v_costo numeric := COALESCE(p_costo, 0);
  v_costo_pres numeric;
  v_p2 numeric; v_p3 numeric; v_np2 numeric; v_np3 numeric;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT public.app_producto_puede_editar() THEN
    RAISE EXCEPTION 'No tienes permiso para editar productos en esta empresa (Mercancías → editar)';
  END IF;
  SELECT * INTO v_prod FROM public.productos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_prod.tenant_id IS DISTINCT FROM v_t THEN RAISE EXCEPTION 'Este producto es de otra empresa'; END IF;
  IF COALESCE(btrim(p_descripcion), '') = '' THEN RAISE EXCEPTION 'La descripción es requerida'; END IF;
  IF v_precio < 0 OR v_costo < 0 THEN RAISE EXCEPTION 'Precio y costo no pueden ser negativos'; END IF;
  IF p_itbis_pct IS NULL OR p_itbis_pct NOT IN (0, 0.16, 0.18) THEN
    RAISE EXCEPTION 'ITBIS no válido: 0, 0.16 o 0.18';
  END IF;

  SELECT COALESCE(precio2_descuento_pct, 10), COALESCE(precio3_descuento_pct, 15) INTO v_p2, v_p3
    FROM public.config_empresa WHERE tenant_id = v_t ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  v_p2 := LEAST(GREATEST(COALESCE(v_p2, 10), 0), 100);
  v_p3 := LEAST(GREATEST(COALESCE(v_p3, 15), 0), 100);

  SELECT * INTO v_pres FROM public.presentaciones
   WHERE producto_id = p_id
   ORDER BY afecta_ft DESC NULLS LAST, created_at, id LIMIT 1
   FOR UPDATE;

  -- Costo sin tocar (a 2 decimales) → se queda el de antes, con sus decimales.
  IF v_pres.id IS NOT NULL AND round(COALESCE(v_pres.costo, 0), 2) = round(v_costo, 2) THEN
    v_costo_pres := v_pres.costo;
  ELSIF v_pres.id IS NULL AND round(COALESCE(v_prod.costo, 0), 2) = round(v_costo, 2) THEN
    v_costo_pres := v_prod.costo;
  ELSE
    v_costo_pres := v_costo;
  END IF;

  UPDATE public.productos SET
    descripcion = btrim(p_descripcion),
    referencia  = NULLIF(btrim(COALESCE(p_referencia, '')), ''),
    ubicacion   = NULLIF(btrim(COALESCE(p_ubicacion, '')), ''),
    precio      = v_precio,
    costo       = v_costo_pres,
    itbis_pct   = p_itbis_pct,
    min_stock   = GREATEST(COALESCE(p_min_stock, 0), 0),
    max_stock   = GREATEST(COALESCE(p_max_stock, 0), 0),
    activo      = COALESCE(p_activo, true),
    updated_at  = now()
  WHERE id = p_id;

  v_np2 := round(v_precio * (1 - v_p2 / 100), 2);
  v_np3 := round(v_precio * (1 - v_p3 / 100), 2);

  IF v_pres.id IS NOT NULL THEN
    UPDATE public.presentaciones SET
      precio1      = v_precio,
      costo        = v_costo_pres,
      margen_pct   = CASE WHEN v_costo_pres > 0 THEN round((v_precio / v_costo_pres - 1) * 100, 2) ELSE 0 END,
      -- Automático bajo costo → se apaga y queda en 0 (como la web).
      auto_precio2 = CASE WHEN COALESCE(auto_precio2, false) AND v_precio > 0 AND v_np2 < v_costo_pres THEN false ELSE auto_precio2 END,
      precio2      = CASE WHEN NOT COALESCE(auto_precio2, false) THEN precio2
                          WHEN v_precio > 0 AND v_np2 < v_costo_pres THEN 0 ELSE v_np2 END,
      auto_precio3 = CASE WHEN COALESCE(auto_precio3, false) AND v_precio > 0 AND v_np3 < v_costo_pres THEN false ELSE auto_precio3 END,
      precio3      = CASE WHEN NOT COALESCE(auto_precio3, false) THEN precio3
                          WHEN v_precio > 0 AND v_np3 < v_costo_pres THEN 0 ELSE v_np3 END,
      precio_final = round(v_precio * (1 - COALESCE(descuento_pct, 0) / 100), 2)
    WHERE id = v_pres.id;
  ELSE
    INSERT INTO public.presentaciones (producto_id, tenant_id, tipo, cantidad, costo, margen_pct, precio1, precio2, precio3,
                                       descuento_pct, afecta_ft, afecta_inv, precio_final, auto_precio2, auto_precio3)
    VALUES (p_id, v_t, 'UND - Unidad', 1, v_costo_pres,
            CASE WHEN v_costo_pres > 0 THEN round((v_precio / v_costo_pres - 1) * 100, 2) ELSE 0 END,
            v_precio,
            CASE WHEN v_precio > 0 AND v_np2 < v_costo_pres THEN 0 ELSE v_np2 END,
            CASE WHEN v_precio > 0 AND v_np3 < v_costo_pres THEN 0 ELSE v_np3 END,
            0, true, true, v_precio,
            NOT (v_precio > 0 AND v_np2 < v_costo_pres), NOT (v_precio > 0 AND v_np3 < v_costo_pres));
  END IF;

  RETURN (SELECT to_jsonb(p) || jsonb_build_object('existencia', public.get_stock_actual(p.id))
            FROM public.productos p WHERE p.id = p_id);
END $$;

NOTIFY pgrst, 'reload schema';

-- PRUEBA (Morla, administrador): todo se deshace.
DO $prueba$
DECLARE v_p uuid; r jsonb; pr record; v_costo_antes numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '0a751661-5ec4-4136-a75c-b4d8493beae0', 'role', 'authenticated')::text, true);
  IF NOT public.app_producto_puede_editar() THEN RAISE EXCEPTION 'El admin de Morla no puede editar en Morla'; END IF;
  SELECT p.id INTO v_p FROM public.productos p
   WHERE p.tenant_id = public.get_user_tenant()
     AND EXISTS (SELECT 1 FROM public.presentaciones s WHERE s.producto_id = p.id AND s.afecta_ft AND s.auto_precio2)
   ORDER BY p.created_at LIMIT 1;

  -- Costo con más decimales en la presentación: si no se toca, no se redondea.
  UPDATE public.presentaciones SET costo = 123.4567 WHERE producto_id = v_p AND afecta_ft;
  r := public.app_producto_guardar(v_p, 'PRUEBA', NULL, NULL, 1000, 123.46, 0.16);
  SELECT * INTO pr FROM public.presentaciones WHERE producto_id = v_p AND afecta_ft ORDER BY created_at, id LIMIT 1;
  IF pr.costo <> 123.4567 THEN RAISE EXCEPTION 'Redondeó el costo sin tocarlo: %', pr.costo; END IF;
  IF (r->>'itbis_pct')::numeric <> 0.16 THEN RAISE EXCEPTION 'ITBIS 16 no se guardó: %', r->>'itbis_pct'; END IF;

  -- Precio 2 automático bajo costo → se apaga y queda en 0
  r := public.app_producto_guardar(v_p, 'PRUEBA', NULL, NULL, 1000, 990, 0.18);
  SELECT * INTO pr FROM public.presentaciones WHERE producto_id = v_p AND afecta_ft ORDER BY created_at, id LIMIT 1;
  IF pr.auto_precio2 OR pr.precio2 <> 0 OR pr.costo <> 990 THEN RAISE EXCEPTION 'Precio 2 bajo costo: %', row_to_json(pr); END IF;

  BEGIN PERFORM public.app_producto_guardar(v_p, 'X', NULL, NULL, 1, 1, 0.12); RAISE EXCEPTION 'Aceptó ITBIS 12';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Aceptó ITBIS 12' THEN RAISE; END IF; END;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('app_producto_editar_ajustes.sql');
