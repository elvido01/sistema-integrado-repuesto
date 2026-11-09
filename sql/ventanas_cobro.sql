-- =====================================================================
-- VENTANAS Y ALUMINIO · Más formas de cobrar y fracciones (09/11/2026)
-- ---------------------------------------------------------------------
-- SOLO empresas tipo 'aluminio' (son tablas vent_*: otras empresas no las usan).
--
-- vent_precios.modo, además de 'pie2' y 'unidad':
-- · 'm2'          ancho × alto en metros cuadrados × precio (con mínimo).
-- · 'pie_lineal'  perímetro (2 × (ancho + alto)) en pies × precio (con mínimo).
-- · 'material_mo' material + mano de obra, por ventana:
--                 pies de perfil del desglose × precio_perfil_pie
--               + pie² de vidrio del desglose × precio_vidrio_pie2
--               + mano_obra.
--   El mínimo (minimo_pie2) vale en la unidad de cada modo.
-- vent_config: mostrar_fraccion (última barra y planchas en ¼ ½ ¾) y el
-- tamaño de la plancha de vidrio (pulgadas) para contar planchas.
-- vent_crear_cotizacion se reemplaza (misma firma) para los modos nuevos.
-- La misma cuenta está en src/lib/ventanas.js (presupuestoProyecto).
-- Idempotente.
-- =====================================================================

ALTER TABLE public.vent_precios DROP CONSTRAINT IF EXISTS vent_precios_modo_check;
ALTER TABLE public.vent_precios ADD CONSTRAINT vent_precios_modo_check
  CHECK (modo IN ('pie2', 'unidad', 'm2', 'pie_lineal', 'material_mo'));
ALTER TABLE public.vent_precios ADD COLUMN IF NOT EXISTS precio_perfil_pie  numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_perfil_pie >= 0);
ALTER TABLE public.vent_precios ADD COLUMN IF NOT EXISTS precio_vidrio_pie2 numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_vidrio_pie2 >= 0);
ALTER TABLE public.vent_precios ADD COLUMN IF NOT EXISTS mano_obra          numeric(12,2) NOT NULL DEFAULT 0 CHECK (mano_obra >= 0);

ALTER TABLE public.vent_config ADD COLUMN IF NOT EXISTS mostrar_fraccion boolean NOT NULL DEFAULT false;
ALTER TABLE public.vent_config ADD COLUMN IF NOT EXISTS plancha_ancho numeric(8,2) NOT NULL DEFAULT 96 CHECK (plancha_ancho > 0);
ALTER TABLE public.vent_config ADD COLUMN IF NOT EXISTS plancha_alto  numeric(8,2) NOT NULL DEFAULT 72 CHECK (plancha_alto > 0);

-- Material de UNA ventana según el desglose de su sistema (igual que
-- desgloseVentana en lib/ventanas.js): pies de perfil y pie² de vidrio.
CREATE OR REPLACE FUNCTION private.vent_material_ventana(p_sistema uuid, p_hojas integer, p_ancho numeric, p_alto numeric)
RETURNS TABLE (pies_perfil numeric, pie2_vidrio numeric)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH c AS (
    SELECT pz.tipo, pz.base, pz.orden,
           round(((CASE pz.base WHEN 'alto' THEN p_alto ELSE p_ancho END)
                  / (CASE WHEN pz.por_hoja THEN greatest(coalesce(p_hojas, 1), 1) ELSE 1 END) - pz.descuento) * 16) / 16.0 AS largo,
           greatest(0, pz.cant_fija + pz.cant_por_hoja * greatest(coalesce(p_hojas, 1), 1)) AS cant
      FROM public.vent_piezas pz
     WHERE pz.sistema_id = p_sistema AND pz.activo
  ), v AS (SELECT * FROM c WHERE cant > 0 AND largo > 0)
  SELECT coalesce((SELECT sum(cant * largo) FROM v WHERE tipo = 'perfil'), 0) / 12.0,
         coalesce((SELECT a.largo * h.largo / 144.0 * least(a.cant, h.cant)
                     FROM (SELECT * FROM v WHERE tipo = 'cristal' AND base = 'ancho' ORDER BY orden LIMIT 1) a,
                          (SELECT * FROM v WHERE tipo = 'cristal' AND base = 'alto' ORDER BY orden LIMIT 1) h), 0);
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
         vp.modo, vp.precio, vp.minimo_pie2, vp.producto_id, vp.precio_perfil_pie, vp.precio_vidrio_pie2, vp.mano_obra,
         pr.codigo, COALESCE(pr.itbis_pct, 0.18) AS itbis,
         round(m.ancho * m.alto / 144.0, 2) AS pie2,
         round(m.ancho * m.alto * 0.00064516, 2) AS m2,
         round(2 * (m.ancho + m.alto) / 12.0, 2) AS pie_lineal,
         mat.pies_perfil, mat.pie2_vidrio
    FROM public.vent_medidas m
    JOIN public.vent_sistemas s ON s.id = m.sistema_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.vent_precios x
       WHERE x.tenant_id = v_t AND x.sistema_id = m.sistema_id AND x.color IN (COALESCE(m.color, ''), '')
       ORDER BY (x.color = COALESCE(m.color, '')) DESC LIMIT 1
    ) vp ON true
    LEFT JOIN LATERAL private.vent_material_ventana(m.sistema_id, m.hojas, m.ancho, m.alto) mat ON true
    LEFT JOIN public.productos pr ON pr.id = vp.producto_id AND pr.tenant_id = v_t
   WHERE m.proyecto_id = p.id;

  SELECT string_agg(DISTINCT sistema || COALESCE(' ' || color, ''), ', ') INTO v_faltan
    FROM _lin
   WHERE producto_id IS NULL OR codigo IS NULL OR modo IS NULL
      OR (modo = 'material_mo' AND COALESCE(precio_perfil_pie, 0) + COALESCE(precio_vidrio_pie2, 0) + COALESCE(mano_obra, 0) = 0)
      OR (modo <> 'material_mo' AND COALESCE(precio, 0) = 0);
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
      v_q numeric := CASE r.modo WHEN 'pie2' THEN GREATEST(r.pie2, r.minimo_pie2)
                                 WHEN 'm2' THEN GREATEST(r.m2, r.minimo_pie2)
                                 WHEN 'pie_lineal' THEN GREATEST(r.pie_lineal, r.minimo_pie2) END;
      v_pu numeric := CASE r.modo
                        WHEN 'unidad' THEN r.precio
                        WHEN 'material_mo' THEN round(r.pies_perfil * r.precio_perfil_pie + r.pie2_vidrio * r.precio_vidrio_pie2 + r.mano_obra, 2)
                        ELSE round(v_q * r.precio, 2) END;
      v_imp numeric := round(v_pu * r.cantidad, 2);
      v_base numeric := round(v_imp / (1 + r.itbis), 2);
    BEGIN
      INSERT INTO public.cotizaciones_detalle (cotizacion_id, producto_id, codigo, descripcion, cantidad, unidad, precio_unitario,
             descuento_pct, descuento_valor, itbis_valor, importe, tenant_id)
      VALUES (v_cot, r.producto_id, r.codigo,
              left(upper(r.sistema) || COALESCE(' ' || upper(r.color), '') || ' ' || private.vent_pulg_txt(r.ancho) || '" x ' || private.vent_pulg_txt(r.alto) || '"'
                   || CASE r.modo WHEN 'pie2' THEN ' (' || v_q || ' pie²)'
                                  WHEN 'm2' THEN ' (' || v_q || ' m²)'
                                  WHEN 'pie_lineal' THEN ' (' || v_q || ' pie lineal)'
                                  WHEN 'material_mo' THEN ' (material + mano de obra)'
                                  ELSE '' END
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

SELECT public.registrar_migracion('ventanas_cobro.sql');
