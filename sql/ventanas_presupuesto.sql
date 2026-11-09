-- =====================================================================
-- VENTANAS Y ALUMINIO · PARTE 3: presupuesto → cotización (09/11/2026)
-- ---------------------------------------------------------------------
-- D Mario vende la VENTANA TERMINADA (su catálogo: "VENTANA TRADICIONAL
-- BLANCO", "PUERTA P:40 BLANCO"…), no el perfil suelto. Así se cotiza:
--
-- · vent_precios: por sistema (y si hace falta por color) el precio de venta
--   ya con ITBIS: POR PIE² (ancho × alto ÷ 144, con un mínimo de pie² por
--   ventana) o FIJO POR UNIDAD, y el producto del catálogo que se factura.
--   Color vacío = cualquier color; el de su color manda.
-- · vent_proyecto_extras: lo que se agrega al proyecto del catálogo (mano de
--   obra, screen, llavines…), con cantidad y precio.
-- · vent_crear_cotizacion(proyecto, días): arma la cotización de siempre
--   (CT-…, la de Cotizaciones): una línea por ventana (cantidad = ventanas,
--   precio = pie² × precio, descripción con la medida) + los extras. El
--   precio incluye ITBIS (como la pantalla de cotizaciones). El proyecto pasa
--   a "cotizado" y guarda su cotización.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.vent_precios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  sistema_id   uuid NOT NULL REFERENCES public.vent_sistemas(id) ON DELETE CASCADE,
  color        text NOT NULL DEFAULT '',                 -- '' = cualquier color
  modo         text NOT NULL DEFAULT 'pie2' CHECK (modo IN ('pie2', 'unidad')),
  precio       numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),   -- con ITBIS
  minimo_pie2  numeric(8,2) NOT NULL DEFAULT 0 CHECK (minimo_pie2 >= 0),
  producto_id  uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sistema_id, color)
);
ALTER TABLE public.vent_precios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_precios_tenant ON public.vent_precios;
CREATE POLICY vent_precios_tenant ON public.vent_precios FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

CREATE TABLE IF NOT EXISTS public.vent_proyecto_extras (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  proyecto_id  uuid NOT NULL REFERENCES public.vent_proyectos(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES public.productos(id),
  descripcion  text,
  cantidad     numeric(12,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio       numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),   -- con ITBIS
  orden        integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vent_proyecto_extras_proyecto ON public.vent_proyecto_extras (proyecto_id);
ALTER TABLE public.vent_proyecto_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_proyecto_extras_tenant ON public.vent_proyecto_extras;
CREATE POLICY vent_proyecto_extras_tenant ON public.vent_proyecto_extras FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

-- 40.5 → '40 1/2' (a 1/16), como en la pantalla.
CREATE OR REPLACE FUNCTION private.vent_pulg_txt(p numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE v_ent integer := floor(p); v_n integer := round((p - floor(p)) * 16); v_d integer := 16;
BEGIN
  IF v_n = 16 THEN v_ent := v_ent + 1; v_n := 0; END IF;
  IF v_n = 0 THEN RETURN v_ent::text; END IF;
  WHILE v_n % 2 = 0 LOOP v_n := v_n / 2; v_d := v_d / 2; END LOOP;
  RETURN CASE WHEN v_ent = 0 THEN '' ELSE v_ent::text || ' ' END || v_n || '/' || v_d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vent_crear_cotizacion(p_proyecto uuid, p_dias_vigencia integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  p public.vent_proyectos%ROWTYPE;
  v_cli uuid; v_manual text; v_num text; v_cot uuid;
  v_faltan text; v_sub numeric := 0; v_itb numeric := 0; v_tot numeric := 0; v_n integer := 0;
  r record;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO p FROM public.vent_proyectos WHERE id = p_proyecto AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proyecto no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vent_medidas WHERE proyecto_id = p.id) THEN
    RAISE EXCEPTION 'El proyecto no tiene medidas';
  END IF;

  -- Líneas: cada ventana con su precio (el de su color manda sobre el general).
  DROP TABLE IF EXISTS _lin;
  CREATE TEMP TABLE _lin ON COMMIT DROP AS
  SELECT m.orden, m.created_at, s.nombre AS sistema, m.color, m.cantidad, m.ancho, m.alto, m.ubicacion,
         vp.modo, vp.precio, vp.minimo_pie2, vp.producto_id, pr.codigo, COALESCE(pr.itbis_pct, 0.18) AS itbis,
         round(m.ancho * m.alto / 144.0, 2) AS pie2
    FROM public.vent_medidas m
    JOIN public.vent_sistemas s ON s.id = m.sistema_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.vent_precios x
       WHERE x.tenant_id = v_t AND x.sistema_id = m.sistema_id AND x.color IN (COALESCE(m.color, ''), '')
       ORDER BY (x.color = COALESCE(m.color, '')) DESC LIMIT 1
    ) vp ON true
    LEFT JOIN public.productos pr ON pr.id = vp.producto_id AND pr.tenant_id = v_t
   WHERE m.proyecto_id = p.id;

  SELECT string_agg(DISTINCT sistema || COALESCE(' ' || color, ''), ', ') INTO v_faltan
    FROM _lin WHERE producto_id IS NULL OR codigo IS NULL OR precio IS NULL OR precio = 0;
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Falta el precio o el producto de: %. Ponlos en Ventanas → Precios.', v_faltan;
  END IF;

  IF p.cliente_id IS NOT NULL THEN v_cli := p.cliente_id;
  ELSE v_cli := '2749fa36-3d7c-4bdf-ad61-df88eda8365a'; v_manual := COALESCE(p.cliente_nombre, 'Cliente por defecto');
  END IF;
  v_num := public.get_next_cotizacion_numero();

  INSERT INTO public.cotizaciones (numero, fecha_cotizacion, fecha_vencimiento, cliente_id, manual_cliente_nombre, notas, usuario_id, estado, tenant_id)
  VALUES (v_num, (now() AT TIME ZONE 'America/Santo_Domingo')::date,
          (now() AT TIME ZONE 'America/Santo_Domingo')::date + GREATEST(COALESCE(p_dias_vigencia, 15), 1),
          v_cli, v_manual,
          left('Proyecto PRY-' || lpad(p.numero::text, 4, '0') || ' · ' || p.nombre || COALESCE(' · ' || p.direccion, ''), 500),
          auth.uid(), 'Pendiente', v_t)
  RETURNING id INTO v_cot;

  -- Ventanas
  FOR r IN SELECT * FROM _lin ORDER BY orden, created_at LOOP
    DECLARE
      v_pu numeric := CASE WHEN r.modo = 'unidad' THEN r.precio ELSE round(GREATEST(r.pie2, r.minimo_pie2) * r.precio, 2) END;
      v_imp numeric := round(v_pu * r.cantidad, 2);
      v_base numeric := round(v_imp / (1 + r.itbis), 2);
    BEGIN
      INSERT INTO public.cotizaciones_detalle (cotizacion_id, producto_id, codigo, descripcion, cantidad, unidad, precio_unitario,
             descuento_pct, descuento_valor, itbis_valor, importe, tenant_id)
      VALUES (v_cot, r.producto_id, r.codigo,
              left(upper(r.sistema) || COALESCE(' ' || upper(r.color), '') || ' ' || private.vent_pulg_txt(r.ancho) || '" x ' || private.vent_pulg_txt(r.alto) || '"'
                   || CASE WHEN r.modo = 'pie2' THEN ' (' || GREATEST(r.pie2, r.minimo_pie2) || ' pie²)' ELSE '' END
                   || COALESCE(' · ' || r.ubicacion, ''), 300),
              r.cantidad, 'UND', v_pu, 0, 0, v_imp - v_base, v_imp, v_t);
      v_sub := v_sub + v_base; v_itb := v_itb + (v_imp - v_base); v_tot := v_tot + v_imp; v_n := v_n + 1;
    END;
  END LOOP;

  -- Extras
  FOR r IN SELECT e.*, pr.codigo, pr.descripcion AS pdesc, COALESCE(pr.itbis_pct, 0.18) AS itbis
             FROM public.vent_proyecto_extras e JOIN public.productos pr ON pr.id = e.producto_id AND pr.tenant_id = v_t
            WHERE e.proyecto_id = p.id ORDER BY e.orden, e.created_at LOOP
    DECLARE
      v_imp numeric := round(r.precio * r.cantidad, 2);
      v_base numeric := round(v_imp / (1 + r.itbis), 2);
    BEGIN
      INSERT INTO public.cotizaciones_detalle (cotizacion_id, producto_id, codigo, descripcion, cantidad, unidad, precio_unitario,
             descuento_pct, descuento_valor, itbis_valor, importe, tenant_id)
      VALUES (v_cot, r.producto_id, r.codigo, left(COALESCE(NULLIF(btrim(r.descripcion), ''), r.pdesc), 300),
              r.cantidad, 'UND', r.precio, 0, 0, v_imp - v_base, v_imp, v_t);
      v_sub := v_sub + v_base; v_itb := v_itb + (v_imp - v_base); v_tot := v_tot + v_imp; v_n := v_n + 1;
    END;
  END LOOP;

  UPDATE public.cotizaciones SET subtotal = v_sub, itbis_total = v_itb, total_cotizacion = v_tot, descuento_total = 0 WHERE id = v_cot;
  UPDATE public.vent_proyectos SET cotizacion_id = v_cot,
         estado = CASE WHEN estado IN ('sin_medir', 'medido') THEN 'cotizado' ELSE estado END
   WHERE id = p.id;

  RETURN jsonb_build_object('id', v_cot, 'numero', v_num, 'total', v_tot, 'lineas', v_n);
END;
$function$;
REVOKE ALL ON FUNCTION public.vent_crear_cotizacion(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_crear_cotizacion(uuid, integer) TO authenticated;

SELECT public.registrar_migracion('ventanas_presupuesto.sql');
