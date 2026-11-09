-- =====================================================================
-- VENTANAS Y ALUMINIO · Colores de un producto y venta por pies (09/11/2026)
-- ---------------------------------------------------------------------
-- SOLO empresas tipo 'aluminio' (regla del dueño). En las demás estas
-- columnas quedan NULL y nada cambia.
--
-- · productos.variante_de: el color es un PRODUCTO NORMAL (su código, su
--   existencia, su precio, su kardex, su e-CF) que apunta al producto
--   "modelo". Ej.: CABEZAL HOJA P40 → CABEZAL HOJA P40 BLANCO (P40-BL),
--   … NEGRO (P40-NE). Ventas, compras e inventario no cambian: venden y
--   compran el color como cualquier producto.
-- · productos.largo_pies: largo de la barra en pies (20). Si lo tiene, al
--   facturar se puede vender por PIES: la cantidad es la fracción de barra
--   (5 pies de 20 = 0.25) y el importe sale proporcional.
-- · vent_crear_variantes(producto, colores[]): crea los colores que falten
--   (copia precio, costo, ITBIS, presentación, largo). No toca existencias.
-- · vent_variantes(producto): los colores con su existencia (para escoger
--   el color al facturar).
-- Idempotente.
-- =====================================================================

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS variante_de uuid REFERENCES public.productos(id) ON DELETE SET NULL;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS largo_pies numeric;
CREATE INDEX IF NOT EXISTS idx_productos_variante_de ON public.productos (variante_de) WHERE variante_de IS NOT NULL;

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_largo_pies_check;
ALTER TABLE public.productos ADD CONSTRAINT productos_largo_pies_check CHECK (largo_pies IS NULL OR (largo_pies > 0 AND largo_pies <= 100));

-- Sufijo del código por color: BL, NE, IN, PL, BR, CA (otro: 3 letras).
CREATE OR REPLACE FUNCTION private.vent_sufijo_color(p_color text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog' AS $$
  SELECT CASE lower(trim(p_color))
    WHEN 'blanco' THEN 'BL' WHEN 'negro' THEN 'NE' WHEN 'inox' THEN 'IN'
    WHEN 'plata' THEN 'PL' WHEN 'bronce' THEN 'BR' WHEN 'caoba' THEN 'CA'
    ELSE upper(left(regexp_replace(trim(p_color), '\s+', '', 'g'), 3)) END;
$$;

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
      color, medida, naturaleza, largo_pies, variante_de)
    VALUES (
      v_t, v_cod, trim(b.descripcion) || ' ' || upper(c), b.tipo_id, b.marca_id, b.modelo_id, b.suplidor_id, b.garantia_meses, b.itbis_pct,
      b.min_stock, b.max_stock, b.imagen_url, true, b.ubicacion, b.precio, b.costo, b.stock_mode, b.modelos_ids,
      c, b.medida, b.naturaleza, b.largo_pies, b.id)
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
-- Devuelve { largo_pies, variantes: [...] }. Una sola llamada por producto.
DROP FUNCTION IF EXISTS public.vent_variantes(uuid);
CREATE OR REPLACE FUNCTION public.vent_variantes(p_producto uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH yo AS (
    SELECT p.id, p.largo_pies, coalesce(p.variante_de, p.id) AS base_id
      FROM public.productos p
     WHERE p.id = p_producto AND p.tenant_id = public.get_user_tenant()
  )
  SELECT jsonb_build_object(
    'largo_pies', (SELECT largo_pies FROM yo),
    'variantes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', v.id, 'codigo', v.codigo, 'descripcion', v.descripcion, 'color', v.color,
               'precio', coalesce((SELECT pr.precio1 FROM public.presentaciones pr WHERE pr.producto_id = v.id
                                    ORDER BY pr.afecta_ft DESC NULLS LAST, pr.created_at LIMIT 1), v.precio),
               'itbis_pct', v.itbis_pct, 'largo_pies', v.largo_pies,
               'existencia', public.get_stock_actual(v.id))
             ORDER BY v.color)
        FROM public.productos v JOIN yo ON v.variante_de = yo.base_id
       WHERE v.activo AND v.tenant_id = public.get_user_tenant()), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.vent_variantes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_variantes(uuid) TO authenticated;

SELECT public.registrar_migracion('ventanas_variantes.sql');
