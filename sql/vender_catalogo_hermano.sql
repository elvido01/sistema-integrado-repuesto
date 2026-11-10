-- =====================================================================
-- Vender del catálogo de otra empresa del grupo (10/11/2026)
-- ---------------------------------------------------------------------
-- CAMINERO MOTORS (tiene e-CF) vende piezas de REPUESTOS CAMINERO (mismo
-- RNC, sin secuencias) para que salgan con comprobante fiscal.
-- · config_empresa.vende_catalogo_de: la empresa que vende apunta a la del
--   catálogo. Sin eso, nada cambia.
-- · buscar_catalogo_hermano: en Ventas, casilla "Buscar en <empresa>":
--   piezas con existencia de la otra empresa (por palabras, sin tildes).
-- · preparar_de_catalogo_hermano(producto): la pieza queda en la empresa
--   que vende (se crea la primera vez con el mismo código, o "R"+código si
--   ya hay otro con ese código aquí o en su espejo; productos.traido_de la
--   enlaza) con el costo y los precios de hoy de la otra. NO mueve
--   inventario: escoger la pieza y no venderla no cambia nada.
-- · trg_venta_trae_de_catalogo: al GRABAR la venta (la SALIDA de la
--   factura), si aquí no alcanza, pasa de la otra empresa lo que falte:
--   SALIDA allá "TRASPASO A <vendedora> · FT-x" y ENTRADA aquí "TRASPASO
--   DESDE <catálogo> · FT-x". Solo en ventas (referencia FT-): una salida
--   de mercancía, garantía o conduce NO trae nada. Vale también si la vende
--   su empresa espejo (MotoPréstamos comparte inventario con Caminero).
--   Si algo falla la venta se graba igual y queda anotado en
--   catalogo_hermano_fallos. Anular la factura devuelve la pieza a la que
--   vendió (no a la otra). La reposición la pide la empresa del catálogo.
-- No toca la emisión fiscal ni mezcla los catálogos. Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS vende_catalogo_de uuid;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS traido_de uuid;
CREATE TABLE IF NOT EXISTS public.catalogo_hermano_fallos (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid,
  producto_id uuid,
  referencia  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalogo_hermano_fallos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogo_hermano_fallos_leer ON public.catalogo_hermano_fallos;
CREATE POLICY catalogo_hermano_fallos_leer ON public.catalogo_hermano_fallos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_productos_traido_de ON public.productos (tenant_id, traido_de) WHERE traido_de IS NOT NULL;

-- ── Buscar en la otra empresa ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_catalogo_hermano(p_limit integer, p_offset integer, p_search text DEFAULT NULL,
                                                          p_marca text DEFAULT NULL, p_modelo text DEFAULT NULL)
RETURNS TABLE(id uuid, codigo text, referencia text, descripcion text, ubicacion text, precio numeric, costo numeric,
              itbis_pct numeric, marca_nombre text, existencia numeric, origen_nombre text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current uuid := public.get_user_tenant();
  v_origen  uuid;
  v_nombre  text;
  v_pal     text[];
BEGIN
  IF v_current IS NULL THEN RETURN; END IF;
  SELECT ce.vende_catalogo_de INTO v_origen FROM public.config_empresa ce WHERE ce.tenant_id = v_current;
  IF v_origen IS NULL THEN RETURN; END IF;
  SELECT coalesce(ce.nombre, 'la otra empresa') INTO v_nombre FROM public.config_empresa ce WHERE ce.tenant_id = v_origen;
  -- Cada palabra tiene que aparecer (código, referencia, descripción o marca); % y _ van literales.
  SELECT array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_'))
    INTO v_pal
    FROM regexp_split_to_table(public._sin_tildes(btrim(coalesce(p_search, ''))), '\s+') w
   WHERE w <> '';

  RETURN QUERY
  WITH f AS (
    SELECT p.id AS pid, p.codigo AS pcod, p.referencia AS pref, p.descripcion AS pdesc, p.ubicacion AS pubi,
           coalesce((SELECT pr.precio1 FROM public.presentaciones pr WHERE pr.producto_id = p.id
                      ORDER BY pr.afecta_ft DESC NULLS LAST, pr.created_at, pr.id LIMIT 1), p.precio, 0) AS pprecio,
           coalesce(p.costo, 0) AS pcosto, coalesce(p.itbis_pct, 0.18) AS pitbis, ma.nombre AS pmarca, s.stk AS pexist
      FROM public.productos p
      LEFT JOIN public.marcas ma ON ma.id = p.marca_id
      CROSS JOIN LATERAL (SELECT coalesce(sum(im.cantidad), 0)::numeric AS stk
                            FROM public.inventario_movimientos im
                           WHERE im.producto_id = p.id AND im.tenant_id = v_origen) s
     WHERE p.tenant_id = v_origen AND p.activo
       AND coalesce(p.naturaleza, 'bien') <> 'servicio'
       AND s.stk > 0
       AND (v_pal IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(v_pal) w
              WHERE public._sin_tildes(concat_ws(' ', p.codigo, p.referencia, p.descripcion, ma.nombre)) NOT LIKE '%' || w || '%'))
       AND (p_marca IS NULL OR p_marca = '' OR ma.nombre ILIKE '%' || p_marca || '%')
       AND (p_modelo IS NULL OR p_modelo = '' OR EXISTS (
             SELECT 1 FROM unnest(coalesce(p.modelos_ids, '{}'::uuid[]) || p.modelo_id) mid
               JOIN public.modelos mo ON mo.id = mid
              WHERE mo.nombre ILIKE '%' || p_modelo || '%'))
  )
  SELECT f.pid, f.pcod::text, f.pref::text, f.pdesc::text, f.pubi::text, f.pprecio, f.pcosto, f.pitbis,
         f.pmarca::text, f.pexist, v_nombre, count(*) OVER ()::bigint
    FROM f
   ORDER BY f.pdesc, f.pid
   LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.buscar_catalogo_hermano(integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_catalogo_hermano(integer, integer, text, text, text) TO authenticated;

-- ── Dejar la pieza lista en la empresa que vende (sin mover inventario) ─
CREATE OR REPLACE FUNCTION public.preparar_de_catalogo_hermano(p_producto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dest    uuid := public.get_user_tenant();
  v_espejo  uuid;
  v_origen  uuid;
  v_n_orig  text;
  p         public.productos;
  v_id      uuid;
  v_codigo  text;
  v_nuevo   boolean := false;
BEGIN
  IF v_dest IS NULL THEN RAISE EXCEPTION 'No hay empresa activa.'; END IF;
  SELECT ce.vende_catalogo_de INTO v_origen FROM public.config_empresa ce WHERE ce.tenant_id = v_dest;
  IF v_origen IS NULL THEN RAISE EXCEPTION 'Esta empresa no vende del catálogo de otra.'; END IF;
  SELECT coalesce(ce.nombre, 'la otra empresa') INTO v_n_orig FROM public.config_empresa ce WHERE ce.tenant_id = v_origen;

  SELECT * INTO p FROM public.productos WHERE id = p_producto_id AND tenant_id = v_origen AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esa pieza no está en el catálogo de %.', v_n_orig; END IF;
  IF coalesce(p.naturaleza, 'bien') = 'servicio' THEN RAISE EXCEPTION 'Los servicios no se traen de otra empresa.'; END IF;
  IF nullif(btrim(coalesce(p.chasis, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Las unidades con chasis no se traen así: se pasan con su papeleo.';
  END IF;

  -- Una sola a la vez por pieza (dos cajeros no la crean doble).
  PERFORM pg_advisory_xact_lock(hashtext('catalogo_hermano:' || v_dest || ':' || p.id));

  SELECT id, codigo INTO v_id, v_codigo FROM public.productos
   WHERE tenant_id = v_dest AND traido_de = p.id
   ORDER BY activo DESC, created_at, id LIMIT 1;

  IF v_id IS NULL THEN
    -- El código no puede chocar aquí ni en la empresa espejo (el espejo se
    -- pegaría a un producto ajeno con el mismo código).
    v_espejo := public._espejo_destino(v_dest);
    v_codigo := p.codigo;
    WHILE EXISTS (SELECT 1 FROM public.productos x
                   WHERE upper(x.codigo) = upper(v_codigo)
                     AND (x.tenant_id = v_dest OR (v_espejo IS NOT NULL AND x.tenant_id = v_espejo))) LOOP
      v_codigo := 'R' || v_codigo;
    END LOOP;

    INSERT INTO public.productos (tenant_id, codigo, referencia, descripcion, tipo_id, marca_id, modelo_id, modelos_ids,
                                  garantia_meses, itbis_pct, min_stock, max_stock, imagen_url, activo, ubicacion,
                                  precio, costo, stock_mode, medida, naturaleza, traido_de)
    VALUES (v_dest, v_codigo, p.referencia, p.descripcion,
            public._espejo_tipo(p.tipo_id, v_dest), public._espejo_marca(p.marca_id, v_dest),
            public._espejo_modelo(p.modelo_id, v_dest),
            (SELECT array_agg(public._espejo_modelo(m, v_dest)) FROM unnest(p.modelos_ids) m),
            p.garantia_meses, p.itbis_pct, 0, 0, p.imagen_url, true, p.ubicacion,
            p.precio, p.costo, p.stock_mode, p.medida, p.naturaleza, p.id)
    RETURNING id INTO v_id;
    v_nuevo := true;
  ELSE
    -- Ya enlazada: se pone al día con el costo y el precio de hoy de la otra.
    UPDATE public.productos SET activo = true, costo = p.costo, precio = p.precio, itbis_pct = p.itbis_pct
     WHERE id = v_id
       AND (activo, costo, precio, itbis_pct) IS DISTINCT FROM (true, p.costo, p.precio, p.itbis_pct);
    UPDATE public.presentaciones d
       SET costo = o.costo, margen_pct = o.margen_pct, precio1 = o.precio1, precio2 = o.precio2, precio3 = o.precio3,
           descuento_pct = o.descuento_pct, precio_final = o.precio_final,
           auto_precio2 = o.auto_precio2, auto_precio3 = o.auto_precio3
      FROM public.presentaciones o
     WHERE d.producto_id = v_id AND o.producto_id = p.id
       AND o.cantidad IS NOT DISTINCT FROM d.cantidad AND o.tipo IS NOT DISTINCT FROM d.tipo
       AND (d.costo, d.margen_pct, d.precio1, d.precio2, d.precio3, d.descuento_pct, d.precio_final, d.auto_precio2, d.auto_precio3)
           IS DISTINCT FROM
           (o.costo, o.margen_pct, o.precio1, o.precio2, o.precio3, o.descuento_pct, o.precio_final, o.auto_precio2, o.auto_precio3);
  END IF;

  -- Presentaciones que la otra tiene y aquí no.
  INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
                                     afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id)
  SELECT v_id, o.cantidad, o.costo, o.margen_pct, o.precio1, o.precio2, o.precio3, o.descuento_pct,
         o.afecta_ft, o.afecta_inv, o.tipo, o.precio_final, o.auto_precio2, o.auto_precio3, v_dest
    FROM public.presentaciones o
   WHERE o.producto_id = p.id
     AND NOT EXISTS (SELECT 1 FROM public.presentaciones d WHERE d.producto_id = v_id
                       AND d.cantidad IS NOT DISTINCT FROM o.cantidad AND d.tipo IS NOT DISTINCT FROM o.tipo);

  RETURN jsonb_build_object('id', v_id, 'codigo', v_codigo, 'nuevo', v_nuevo, 'origen', v_n_orig,
                            'existencia_aqui', public.get_stock_actual(v_id),
                            'existencia_origen', public.get_stock_actual(p.id));
END;
$function$;
REVOKE ALL ON FUNCTION public.preparar_de_catalogo_hermano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_de_catalogo_hermano(uuid) TO authenticated;

-- ── Al grabar la venta: traer lo que falte ─────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_venta_trae_de_catalogo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vende  uuid := NEW.tenant_id;     -- la empresa que tiene la pieza enlazada
  v_prod   uuid := NEW.producto_id;   -- la pieza enlazada (traido_de)
  v_espejo uuid;
  v_origen uuid;
  v_src    uuid;
  v_costo  numeric;
  v_tengo  numeric;
  v_falta  numeric;
  v_lleva  numeric;
  v_n_dest text;
  v_n_orig text;
BEGIN
  -- Solo ventas: la salida de una factura (FT-…), no un ajuste, garantía o conduce.
  IF NEW.tipo IS DISTINCT FROM 'SALIDA'::public.movimiento_tipo OR coalesce(NEW.cantidad, 0) >= 0
     OR NEW.producto_id IS NULL OR NEW.espejo_de IS NOT NULL OR public._espejo_activo()
     OR coalesce(NEW.referencia_doc, '') NOT LIKE 'FT-%' THEN
    RETURN NEW;
  END IF;

  SELECT ce.vende_catalogo_de INTO v_origen FROM public.config_empresa ce WHERE ce.tenant_id = v_vende;
  IF v_origen IS NULL THEN
    -- ¿La vende su empresa espejo (inventario compartido)? Se trae a la gemela.
    v_espejo := public._espejo_destino(NEW.tenant_id);
    IF v_espejo IS NULL THEN RETURN NEW; END IF;
    SELECT ce.vende_catalogo_de INTO v_origen FROM public.config_empresa ce WHERE ce.tenant_id = v_espejo;
    IF v_origen IS NULL THEN RETURN NEW; END IF;
    SELECT e.par_id INTO v_prod FROM public.productos_espejo e WHERE e.producto_id = NEW.producto_id;
    IF v_prod IS NULL THEN RETURN NEW; END IF;
    v_vende := v_espejo;
  END IF;
  SELECT pr.traido_de INTO v_src FROM public.productos pr WHERE pr.id = v_prod AND pr.tenant_id = v_vende;
  IF v_src IS NULL THEN RETURN NEW; END IF;

  BEGIN
    -- Bloquea la pieza de origen: dos ventas no se llevan la misma unidad.
    SELECT pr.costo INTO v_costo FROM public.productos pr WHERE pr.id = v_src AND pr.tenant_id = v_origen FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'la pieza de origen ya no existe';
    END IF;

    v_tengo := greatest(public.get_stock_actual(NEW.producto_id), 0);
    v_falta := abs(NEW.cantidad) - v_tengo;
    IF v_falta <= 0 THEN RETURN NEW; END IF;
    v_lleva := least(v_falta, greatest(public.get_stock_actual(v_src), 0));
    IF v_lleva <= 0 THEN RETURN NEW; END IF;

    SELECT coalesce(ce.nombre, 'esta empresa') INTO v_n_dest FROM public.config_empresa ce WHERE ce.tenant_id = NEW.tenant_id;
    SELECT coalesce(ce.nombre, 'la otra empresa') INTO v_n_orig FROM public.config_empresa ce WHERE ce.tenant_id = v_origen;
    INSERT INTO public.inventario_movimientos (tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id)
    VALUES (v_origen, v_src, now(), 'SALIDA', -v_lleva, v_costo,
            'TRASPASO A ' || upper(v_n_dest) || ' · ' || NEW.referencia_doc, coalesce(NEW.usuario_id, auth.uid()));
    -- Entra a la pieza enlazada; si vendió la espejo, el espejo la copia allá.
    INSERT INTO public.inventario_movimientos (tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id)
    VALUES (v_vende, v_prod, now(), 'ENTRADA', v_lleva, v_costo,
            'TRASPASO DESDE ' || upper(v_n_orig) || ' · ' || NEW.referencia_doc, coalesce(NEW.usuario_id, auth.uid()));
  EXCEPTION WHEN OTHERS THEN
    -- LA VENTA MANDA: la factura se graba igual, pero el fallo queda anotado.
    BEGIN
      INSERT INTO public.catalogo_hermano_fallos (tenant_id, producto_id, referencia, error)
      VALUES (NEW.tenant_id, NEW.producto_id, NEW.referencia_doc, SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_venta_trae_de_catalogo ON public.inventario_movimientos;
CREATE TRIGGER trg_venta_trae_de_catalogo
  BEFORE INSERT ON public.inventario_movimientos
  FOR EACH ROW
  WHEN (NEW.tipo = 'SALIDA'::public.movimiento_tipo AND NEW.cantidad < 0 AND NEW.espejo_de IS NULL
        AND NEW.referencia_doc LIKE 'FT-%')
  EXECUTE FUNCTION public.trg_venta_trae_de_catalogo();

-- CAMINERO MOTORS vende del catálogo de REPUESTOS CAMINERO.
UPDATE public.config_empresa SET vende_catalogo_de = '91cc1e82-441e-4c22-8e30-9c8866294c00'
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';

SELECT public.registrar_migracion('vender_catalogo_hermano.sql');
