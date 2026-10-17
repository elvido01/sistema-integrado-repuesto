-- =====================================================================
-- INVENTARIO COMPARTIDO: Caminero Motors ↔ MotoPréstamos Los Naranjos
-- ---------------------------------------------------------------------
-- (17/10/2026) Las dos empresas se separan por la facturación fiscal, pero
-- venden del MISMO inventario: lo que entra o sale en una se ve al instante
-- en la otra, existencia y todo.
--
-- Por qué un espejo y no una sola lista de productos: cada factura exige
-- que sus productos sean de su misma empresa (FK facturas_detalle
-- (tenant_id, producto_id)) y todas las pantallas, búsquedas y RPC filtran
-- por la empresa activa. En vez de tocar decenas de sitios, cada empresa
-- tiene su copia del producto y la base las mantiene iguales:
--
--   · productos_espejo        une cada producto con su gemelo (dos filas
--                             por pareja, una en cada sentido).
--   · producto nuevo          en una empresa → se crea en la otra (o se une
--                             al que ya tenga el mismo código).
--   · producto editado        → mismos datos en el gemelo (marca, tipo y
--                             modelos se buscan por nombre en la otra
--                             empresa y se crean si faltan). El suplidor
--                             no se copia: compras siguen siendo de cada una.
--   · movimiento de inventario → su copia en el gemelo, marcada con
--                             espejo_de y con la referencia precedida por el
--                             nombre de la empresa de origen ("CAMINERO
--                             MOTORS · FT-120"), para que anular la FT-120
--                             de una no toque la FT-120 de la otra.
--     Editar o borrar uno (o su copia) hace lo mismo con la pareja. Un
--     movimiento de antes de compartir (no tiene copia) se compensa con un
--     AJUSTE por la diferencia.
--   · presentaciones          igual que los movimientos (espejo_de).
--
-- Si la copia de un movimiento falla, falla el movimiento original: el
-- dueño pidió existencia SIEMPRE igual. Borrar un PRODUCTO no se copia (no
-- se tocan los movimientos del gemelo).
--
-- Carga inicial: cada producto de Caminero se une al de MotoPréstamos con
-- el mismo código (las 4 motos que ya estaban) o se crea; el que solo está
-- en MotoPréstamos se crea en Caminero. La existencia del gemelo se iguala
-- con un AJUSTE "SALDO INICIAL INVENTARIO COMPARTIDO" (Caminero manda en lo
-- suyo, MotoPréstamos en lo suyo). La FT-1 de MotoPréstamos no se toca
-- (sus 3 salidas apuntan a productos de Caminero; ver memoria del dueño).
--
-- Genérico: config_empresa.inventario_compartido_con (las dos empresas se
-- apuntan una a la otra).
-- =====================================================================

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS inventario_compartido_con uuid;
ALTER TABLE public.inventario_movimientos ADD COLUMN IF NOT EXISTS espejo_de uuid;
ALTER TABLE public.presentaciones ADD COLUMN IF NOT EXISTS espejo_de uuid;
CREATE INDEX IF NOT EXISTS idx_inv_mov_espejo_de ON public.inventario_movimientos (espejo_de) WHERE espejo_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_presentaciones_espejo_de ON public.presentaciones (espejo_de) WHERE espejo_de IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.productos_espejo (
  producto_id uuid PRIMARY KEY REFERENCES public.productos(id) ON DELETE CASCADE,
  par_id      uuid NOT NULL UNIQUE REFERENCES public.productos(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.productos_espejo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.productos_espejo FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------
-- Mientras se escribe una copia, sus propios triggers no vuelven a copiar.
CREATE OR REPLACE FUNCTION public._espejo_activo() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('motoflow.espejo', true), '') = '1' $$;

CREATE OR REPLACE FUNCTION public._espejo_destino(p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT inventario_compartido_con FROM public.config_empresa WHERE tenant_id = p_tenant
$$;

-- El gemelo de un producto, solo si el producto es de esa empresa.
CREATE OR REPLACE FUNCTION public._espejo_par(p_producto uuid, p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.par_id FROM public.productos_espejo e
  JOIN public.productos p ON p.id = e.producto_id AND p.tenant_id = p_tenant
  WHERE e.producto_id = p_producto
$$;

CREATE OR REPLACE FUNCTION public._espejo_etiqueta(p_tenant uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT upper(COALESCE(NULLIF(btrim(nombre), ''), 'OTRA EMPRESA')) || ' · ' FROM public.config_empresa WHERE tenant_id = p_tenant
$$;

CREATE OR REPLACE FUNCTION public._espejo_marca(p_id uuid, p_dest uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nombre text; v_activo boolean; v_id uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  SELECT nombre, activo INTO v_nombre, v_activo FROM public.marcas WHERE id = p_id;
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.marcas WHERE tenant_id = p_dest AND nombre = v_nombre;
  IF v_id IS NULL THEN
    INSERT INTO public.marcas (nombre, activo, tenant_id) VALUES (v_nombre, COALESCE(v_activo, true), p_dest) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public._espejo_tipo(p_id uuid, p_dest uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nombre text; v_activo boolean; v_id uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  SELECT nombre, activo INTO v_nombre, v_activo FROM public.tipos_producto WHERE id = p_id;
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.tipos_producto WHERE tenant_id = p_dest AND nombre = v_nombre;
  IF v_id IS NULL THEN
    INSERT INTO public.tipos_producto (nombre, activo, tenant_id) VALUES (v_nombre, COALESCE(v_activo, true), p_dest) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public._espejo_modelo(p_id uuid, p_dest uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nombre text; v_activo boolean; v_marca uuid; v_id uuid;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  SELECT nombre, activo, marca_id INTO v_nombre, v_activo, v_marca FROM public.modelos WHERE id = p_id;
  IF v_nombre IS NULL THEN RETURN NULL; END IF;
  v_marca := public._espejo_marca(v_marca, p_dest);
  SELECT id INTO v_id FROM public.modelos
   WHERE tenant_id = p_dest AND nombre = v_nombre AND marca_id IS NOT DISTINCT FROM v_marca;
  IF v_id IS NULL THEN
    INSERT INTO public.modelos (nombre, activo, marca_id, tenant_id) VALUES (v_nombre, COALESCE(v_activo, true), v_marca, p_dest) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Copia los datos de un producto en su gemelo (lo crea si p_par es NULL:
-- primero busca uno con el mismo código en la otra empresa y lo une).
-- Devuelve el id del gemelo. Hay que llamarla con motoflow.espejo = '1'.
CREATE OR REPLACE FUNCTION public._espejo_producto(p_src uuid, p_dest uuid, p_par uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.productos; v_par uuid := p_par; v_modelos uuid[];
BEGIN
  SELECT * INTO s FROM public.productos WHERE id = p_src;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(public._espejo_modelo(m, p_dest)) INTO v_modelos FROM unnest(s.modelos_ids) m;

  IF v_par IS NULL THEN
    SELECT p.id INTO v_par FROM public.productos p
     WHERE p.tenant_id = p_dest AND p.codigo = s.codigo
       AND NOT EXISTS (SELECT 1 FROM public.productos_espejo e WHERE e.producto_id = p.id);
    IF v_par IS NULL THEN
      -- Con la foto desde el principio: poner una foto donde no había la
      -- anota en "fotos del día" (equipo_foto_anotar) y una copia no lo es.
      INSERT INTO public.productos (codigo, tenant_id, descripcion, imagen_url) VALUES (s.codigo, p_dest, s.descripcion, s.imagen_url)
      RETURNING id INTO v_par;
    END IF;
    INSERT INTO public.productos_espejo (producto_id, par_id) VALUES (s.id, v_par), (v_par, s.id);
  END IF;

  UPDATE public.productos d SET
    codigo = s.codigo, referencia = s.referencia, descripcion = s.descripcion,
    tipo_id = public._espejo_tipo(s.tipo_id, p_dest),
    marca_id = public._espejo_marca(s.marca_id, p_dest),
    modelo_id = public._espejo_modelo(s.modelo_id, p_dest),
    modelos_ids = v_modelos,
    garantia_meses = s.garantia_meses, itbis_pct = s.itbis_pct,
    min_stock = s.min_stock, max_stock = s.max_stock, imagen_url = s.imagen_url,
    activo = s.activo, ubicacion = s.ubicacion, precio = s.precio, costo = s.costo,
    stock_mode = s.stock_mode, chasis = s.chasis, motor = s.motor, color = s.color,
    anio = s.anio, condicion = s.condicion, placa = s.placa, matricula = s.matricula,
    kilometraje = s.kilometraje, ecommerce_visible = s.ecommerce_visible,
    ecommerce_slug = s.ecommerce_slug, ecommerce_descripcion = s.ecommerce_descripcion,
    ecommerce_orden = s.ecommerce_orden,
    reemplazado_por = (SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = s.reemplazado_por)
  WHERE d.id = v_par
    -- Sin cambios, sin escribir (no despierta triggers ni updated_at).
    AND (d.codigo, d.referencia, d.descripcion, d.itbis_pct, d.precio, d.costo, d.activo, d.imagen_url,
         d.ubicacion, d.chasis, d.motor, d.color, d.anio, d.condicion, d.placa, d.matricula, d.kilometraje,
         d.min_stock, d.max_stock, d.garantia_meses, d.stock_mode, d.ecommerce_visible, d.ecommerce_slug,
         d.ecommerce_descripcion, d.ecommerce_orden, d.modelos_ids, d.tipo_id, d.marca_id, d.modelo_id, d.reemplazado_por)
     IS DISTINCT FROM
        (s.codigo, s.referencia, s.descripcion, s.itbis_pct, s.precio, s.costo, s.activo, s.imagen_url,
         s.ubicacion, s.chasis, s.motor, s.color, s.anio, s.condicion, s.placa, s.matricula, s.kilometraje,
         s.min_stock, s.max_stock, s.garantia_meses, s.stock_mode, s.ecommerce_visible, s.ecommerce_slug,
         s.ecommerce_descripcion, s.ecommerce_orden, v_modelos, public._espejo_tipo(s.tipo_id, p_dest),
         public._espejo_marca(s.marca_id, p_dest), public._espejo_modelo(s.modelo_id, p_dest),
         (SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = s.reemplazado_por));
  RETURN v_par;
END $$;

-- Un AJUSTE en el gemelo (para lo que no tiene copia fila a fila).
CREATE OR REPLACE FUNCTION public._espejo_ajuste(p_producto uuid, p_tenant uuid, p_cantidad numeric, p_costo numeric, p_ref text, p_usuario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dest uuid := public._espejo_destino(p_tenant); v_par uuid := public._espejo_par(p_producto, p_tenant);
BEGIN
  IF v_dest IS NULL OR v_par IS NULL OR COALESCE(p_cantidad, 0) = 0 THEN RETURN; END IF;
  INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, tenant_id)
  VALUES (v_par, now(), 'AJUSTE', p_cantidad, p_costo, public._espejo_etiqueta(p_tenant) || COALESCE(p_ref, 'ajuste'), p_usuario, v_dest);
END $$;

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_productos_espejo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dest uuid; v_par uuid;
BEGIN
  IF public._espejo_activo() THEN RETURN NULL; END IF;
  v_dest := public._espejo_destino(NEW.tenant_id);
  IF v_dest IS NULL THEN RETURN NULL; END IF;
  SELECT par_id INTO v_par FROM public.productos_espejo WHERE producto_id = NEW.id;
  IF TG_OP = 'UPDATE' AND v_par IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('motoflow.espejo', '1', true);
  PERFORM public._espejo_producto(NEW.id, v_dest, v_par);
  PERFORM set_config('motoflow.espejo', '', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_productos_espejo ON public.productos;
CREATE TRIGGER trg_productos_espejo AFTER INSERT OR UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.trg_productos_espejo();

-- ---------------------------------------------------------------------
-- Movimientos de inventario
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_inventario_espejo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dest uuid; v_par uuid; v_par_viejo uuid; v_tenant uuid; v_n int;
BEGIN
  IF public._espejo_activo() THEN RETURN NULL; END IF;
  v_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_dest := public._espejo_destino(v_tenant);
  IF v_dest IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('motoflow.espejo', '1', true);

  IF TG_OP = 'INSERT' THEN
    v_par := public._espejo_par(NEW.producto_id, NEW.tenant_id);
    IF v_par IS NOT NULL THEN
      INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, tenant_id, legacy_id, espejo_de)
      VALUES (v_par, NEW.fecha, NEW.tipo, NEW.cantidad, NEW.costo_unitario,
              public._espejo_etiqueta(NEW.tenant_id) || COALESCE(NEW.referencia_doc, ''), NEW.usuario_id, v_dest, NEW.legacy_id, NEW.id);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_par := public._espejo_par(NEW.producto_id, NEW.tenant_id);
    -- 1) Es un original con copia: la copia queda igual.
    UPDATE public.inventario_movimientos c SET
      producto_id = COALESCE(v_par, c.producto_id), fecha = NEW.fecha, tipo = NEW.tipo, cantidad = NEW.cantidad,
      costo_unitario = NEW.costo_unitario, usuario_id = NEW.usuario_id, legacy_id = NEW.legacy_id,
      referencia_doc = public._espejo_etiqueta(NEW.tenant_id) || COALESCE(NEW.referencia_doc, '')
    WHERE c.espejo_de = NEW.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 AND NEW.espejo_de IS NOT NULL THEN
      -- 2) Es una copia editada en esta empresa: el original queda igual
      -- (la referencia del original no se toca).
      UPDATE public.inventario_movimientos o SET
        producto_id = COALESCE(v_par, o.producto_id), fecha = NEW.fecha, tipo = NEW.tipo, cantidad = NEW.cantidad,
        costo_unitario = NEW.costo_unitario
      WHERE o.id = NEW.espejo_de;
    ELSIF v_n = 0 AND (OLD.producto_id IS DISTINCT FROM NEW.producto_id OR OLD.cantidad IS DISTINCT FROM NEW.cantidad) THEN
      -- 3) De antes de compartir: se compensa la diferencia.
      IF OLD.producto_id IS NOT DISTINCT FROM NEW.producto_id THEN
        PERFORM public._espejo_ajuste(NEW.producto_id, NEW.tenant_id, COALESCE(NEW.cantidad, 0) - COALESCE(OLD.cantidad, 0), NEW.costo_unitario, NEW.referencia_doc, NEW.usuario_id);
      ELSE
        PERFORM public._espejo_ajuste(OLD.producto_id, OLD.tenant_id, -COALESCE(OLD.cantidad, 0), OLD.costo_unitario, OLD.referencia_doc, NEW.usuario_id);
        PERFORM public._espejo_ajuste(NEW.producto_id, NEW.tenant_id, COALESCE(NEW.cantidad, 0), NEW.costo_unitario, NEW.referencia_doc, NEW.usuario_id);
      END IF;
    END IF;

  ELSE -- DELETE
    -- Si se está borrando el PRODUCTO (cascada), no se toca la otra empresa.
    IF EXISTS (SELECT 1 FROM public.productos WHERE id = OLD.producto_id) THEN
      DELETE FROM public.inventario_movimientos WHERE espejo_de = OLD.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 AND OLD.espejo_de IS NOT NULL THEN
        DELETE FROM public.inventario_movimientos WHERE id = OLD.espejo_de;
      ELSIF v_n = 0 THEN
        PERFORM public._espejo_ajuste(OLD.producto_id, OLD.tenant_id, -COALESCE(OLD.cantidad, 0), OLD.costo_unitario,
                                      'anulado ' || COALESCE(OLD.referencia_doc, ''), OLD.usuario_id);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('motoflow.espejo', '', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_inventario_espejo ON public.inventario_movimientos;
CREATE TRIGGER trg_inventario_espejo AFTER INSERT OR UPDATE OR DELETE ON public.inventario_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario_espejo();

-- ---------------------------------------------------------------------
-- Presentaciones
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_presentaciones_espejo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dest uuid; v_par uuid; v_tenant uuid; v_prod uuid;
BEGIN
  IF public._espejo_activo() THEN RETURN NULL; END IF;
  v_prod := CASE WHEN TG_OP = 'DELETE' THEN OLD.producto_id ELSE NEW.producto_id END;
  SELECT tenant_id INTO v_tenant FROM public.productos WHERE id = v_prod;
  IF v_tenant IS NULL THEN RETURN NULL; END IF; -- producto borrándose
  v_dest := public._espejo_destino(v_tenant);
  IF v_dest IS NULL THEN RETURN NULL; END IF;
  v_par := public._espejo_par(v_prod, v_tenant);
  PERFORM set_config('motoflow.espejo', '1', true);

  IF TG_OP = 'INSERT' THEN
    IF v_par IS NOT NULL THEN
      INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
        afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id, espejo_de)
      VALUES (v_par, NEW.cantidad, NEW.costo, NEW.margen_pct, NEW.precio1, NEW.precio2, NEW.precio3, NEW.descuento_pct,
        NEW.afecta_ft, NEW.afecta_inv, NEW.tipo, NEW.precio_final, NEW.auto_precio2, NEW.auto_precio3, v_dest, NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.presentaciones c SET
      producto_id = COALESCE(v_par, c.producto_id), cantidad = NEW.cantidad, costo = NEW.costo, margen_pct = NEW.margen_pct,
      precio1 = NEW.precio1, precio2 = NEW.precio2, precio3 = NEW.precio3, descuento_pct = NEW.descuento_pct,
      afecta_ft = NEW.afecta_ft, afecta_inv = NEW.afecta_inv, tipo = NEW.tipo, precio_final = NEW.precio_final,
      auto_precio2 = NEW.auto_precio2, auto_precio3 = NEW.auto_precio3
    WHERE c.espejo_de = NEW.id OR c.id = NEW.espejo_de;
  ELSE
    DELETE FROM public.presentaciones WHERE espejo_de = OLD.id OR id = OLD.espejo_de;
  END IF;

  PERFORM set_config('motoflow.espejo', '', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_presentaciones_espejo ON public.presentaciones;
CREATE TRIGGER trg_presentaciones_espejo AFTER INSERT OR UPDATE OR DELETE ON public.presentaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_presentaciones_espejo();

-- ---------------------------------------------------------------------
-- Encender y cargar: Caminero Motors ↔ MotoPréstamos Los Naranjos
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  c_mp  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  r record; v_par uuid; v_dif numeric;
  v_de_mp uuid[] := '{}';  -- productos que solo estaban en MotoPréstamos
BEGIN
  UPDATE public.config_empresa SET inventario_compartido_con = c_mp  WHERE tenant_id = c_cam;
  UPDATE public.config_empresa SET inventario_compartido_con = c_cam WHERE tenant_id = c_mp;

  PERFORM set_config('motoflow.espejo', '1', true);

  -- 1) Productos. Caminero primero: sus códigos se unen a los iguales de
  -- MotoPréstamos; lo que quede suelto en MotoPréstamos se crea en Caminero.
  FOR r IN SELECT p.id, p.tenant_id FROM public.productos p
            WHERE p.tenant_id IN (c_cam, c_mp)
            ORDER BY (p.tenant_id = c_mp), p.created_at
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.productos_espejo e WHERE e.producto_id = r.id);
    IF r.tenant_id = c_mp THEN v_de_mp := v_de_mp || r.id; END IF;
    v_par := public._espejo_producto(r.id, CASE WHEN r.tenant_id = c_cam THEN c_mp ELSE c_cam END, NULL);
  END LOOP;

  -- 2) Existencia del gemelo = la del dueño: Caminero manda en lo suyo y
  -- MotoPréstamos en lo que solo estaba allí.
  FOR r IN
    SELECT e.producto_id AS dueno, e.par_id AS gemelo, p.tenant_id AS t_dueno, g.tenant_id AS t_gemelo, p.costo
      FROM public.productos_espejo e
      JOIN public.productos p ON p.id = e.producto_id
      JOIN public.productos g ON g.id = e.par_id
     WHERE (p.tenant_id = c_cam AND NOT (e.par_id = ANY (v_de_mp)))
        OR e.producto_id = ANY (v_de_mp)
  LOOP
    SELECT COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = r.t_dueno AND producto_id = r.dueno), 0)
         - COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = r.t_gemelo AND producto_id = r.gemelo), 0)
      INTO v_dif;
    IF v_dif <> 0 THEN
      INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
      VALUES (r.gemelo, now(), 'AJUSTE', v_dif, r.costo, 'SALDO INICIAL INVENTARIO COMPARTIDO', r.t_gemelo);
    END IF;
  END LOOP;

  -- 3) Presentaciones que el gemelo no tiene.
  INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
    afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id, espejo_de)
  SELECT e.par_id, pr.cantidad, pr.costo, pr.margen_pct, pr.precio1, pr.precio2, pr.precio3, pr.descuento_pct,
    pr.afecta_ft, pr.afecta_inv, pr.tipo, pr.precio_final, pr.auto_precio2, pr.auto_precio3, g.tenant_id, pr.id
  FROM public.presentaciones pr
  JOIN public.productos p ON p.id = pr.producto_id AND p.tenant_id IN (c_cam, c_mp)
  JOIN public.productos_espejo e ON e.producto_id = pr.producto_id
  JOIN public.productos g ON g.id = e.par_id
  WHERE pr.espejo_de IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = e.par_id);

  PERFORM set_config('motoflow.espejo', '', true);
END $$;

SELECT public.registrar_migracion('inventario_compartido_caminero_motoprestamos.sql');

-- =====================================================================
-- VERIFICACIÓN: productos y existencia iguales en las dos empresas
-- =====================================================================
WITH stk AS (
  SELECT producto_id, tenant_id, SUM(cantidad) s FROM public.inventario_movimientos
   WHERE tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113', '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
   GROUP BY 1, 2)
SELECT
  (SELECT count(*) FROM public.productos WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113') AS productos_caminero,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS productos_motoprestamos,
  (SELECT count(*) / 2 FROM public.productos_espejo) AS parejas,
  (SELECT count(*) FROM public.productos_espejo e
     JOIN public.productos p ON p.id = e.producto_id AND p.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
     LEFT JOIN stk a ON a.producto_id = e.producto_id AND a.tenant_id = p.tenant_id
     LEFT JOIN stk b ON b.producto_id = e.par_id AND b.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
    WHERE COALESCE(a.s, 0) <> COALESCE(b.s, 0)) AS existencias_distintas;
