-- =====================================================================
-- VENTANAS Y ALUMINIO · Vidrio por cuartos de plancha (09/11/2026)
-- ---------------------------------------------------------------------
-- SOLO empresas tipo 'aluminio' (las funciones lo exigen; la columna queda
-- en false en las demás y nada cambia).
-- · productos.vende_cuartos: la plancha de vidrio se puede vender en ¼, ½
--   y ¾. Al facturar/cotizar la cantidad es la fracción (0.75) y la línea
--   dice "(3/4 PLANCHA)"; descuenta esa fracción del inventario.
-- · vent_crear_variantes copia vende_cuartos a los colores y vent_variantes
--   lo devuelve (del producto y de cada color). Mismas firmas.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS vende_cuartos boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.vent_crear_variantes(p_producto uuid, p_colores text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  b public.productos;
  c text;
  v_cod text;
  v_id uuid;
  v_n integer := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = v_t AND tipo_negocio = 'aluminio') THEN
    RAISE EXCEPTION 'Los colores de producto son solo para empresas de ventanas y aluminio';
  END IF;
  SELECT * INTO b FROM public.productos WHERE id = p_producto AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF b.variante_de IS NOT NULL THEN RAISE EXCEPTION 'Ese producto ya es un color de otro: abre el producto principal'; END IF;

  FOREACH c IN ARRAY coalesce(p_colores, ARRAY[]::text[]) LOOP
    c := initcap(trim(c));
    CONTINUE WHEN c IS NULL OR c = '';
    -- Ya existe: activo se deja; desactivado se vuelve a activar (cuenta como creado).
    UPDATE public.productos SET activo = true WHERE variante_de = b.id AND lower(color) = lower(c) AND NOT activo;
    IF FOUND THEN v_n := v_n + 1; CONTINUE; END IF;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.productos WHERE variante_de = b.id AND lower(color) = lower(c));
    v_cod := b.codigo || '-' || private.vent_sufijo_color(c);
    IF EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = v_t AND codigo = v_cod) THEN
      RAISE EXCEPTION 'Ya existe otro producto con el código % (color %)', v_cod, c;
    END IF;

    INSERT INTO public.productos (
      tenant_id, codigo, descripcion, tipo_id, marca_id, modelo_id, suplidor_id, garantia_meses, itbis_pct,
      min_stock, max_stock, imagen_url, activo, ubicacion, precio, costo, stock_mode, modelos_ids,
      color, medida, naturaleza, largo_pies, vende_cuartos, variante_de)
    VALUES (
      v_t, v_cod, trim(b.descripcion) || ' ' || upper(c), b.tipo_id, b.marca_id, b.modelo_id, b.suplidor_id, b.garantia_meses, b.itbis_pct,
      b.min_stock, b.max_stock, b.imagen_url, true, b.ubicacion, b.precio, b.costo, b.stock_mode, b.modelos_ids,
      c, b.medida, b.naturaleza, b.largo_pies, b.vende_cuartos, b.id)
    RETURNING id INTO v_id;

    INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
                                       afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id)
    SELECT v_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
           afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, v_t
      FROM public.presentaciones WHERE producto_id = b.id;

    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.vent_crear_variantes(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_crear_variantes(uuid, text[]) TO authenticated;

-- Para facturar: el largo de barra del producto y sus colores (o los de su
-- principal, si es un color) con su existencia. El precio es el de la
-- presentación que factura (precio1), el mismo con el que entra la línea.
-- Devuelve { largo_pies, vende_cuartos, variantes: [...] }. Una sola llamada por producto.
CREATE OR REPLACE FUNCTION public.vent_variantes(p_producto uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH yo AS (
    SELECT p.id, p.largo_pies, p.vende_cuartos, coalesce(p.variante_de, p.id) AS base_id
      FROM public.productos p
     WHERE p.id = p_producto AND p.tenant_id = public.get_user_tenant()
  )
  SELECT jsonb_build_object(
    'largo_pies', (SELECT largo_pies FROM yo),
    'vende_cuartos', coalesce((SELECT vende_cuartos FROM yo), false),
    'variantes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', v.id, 'codigo', v.codigo, 'descripcion', v.descripcion, 'color', v.color,
               'precio', coalesce((SELECT pr.precio1 FROM public.presentaciones pr WHERE pr.producto_id = v.id
                                    ORDER BY pr.afecta_ft DESC NULLS LAST, pr.created_at LIMIT 1), v.precio),
               'itbis_pct', v.itbis_pct, 'largo_pies', v.largo_pies, 'vende_cuartos', v.vende_cuartos,
               'existencia', public.get_stock_actual(v.id))
             ORDER BY v.color)
        FROM public.productos v JOIN yo ON v.variante_de = yo.base_id
       WHERE v.activo AND v.tenant_id = public.get_user_tenant()), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.vent_variantes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_variantes(uuid) TO authenticated;

SELECT public.registrar_migracion('ventanas_planchas.sql');
