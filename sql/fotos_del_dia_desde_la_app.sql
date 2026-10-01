-- =====================================================================
-- FOTOS DEL DÍA: también cuentan las que se suben desde la APP MÓVIL
-- ---------------------------------------------------------------------
-- (2026-10-01) El dueño sube las fotos normalmente por la app móvil
-- (mobile/app/(tabs)/catalogo.tsx), que escribe productos.imagen_url
-- directo. fotos_del_dia.sql solo anotaba las subidas desde Equipo IA, así
-- que el contador "Hoy: N de 5" no se movía y la tarjeta no se enteraba.
--
-- Ahora la constancia la deja la BASE, venga la foto de donde venga (app,
-- formulario de producto o Equipo IA): un disparador en productos anota
-- cada pieza que pasa de SIN foto a CON foto. Cambiar una foto que ya
-- existía no cuenta: la meta es poner foto a las que no tienen.
--
-- El disparador NUNCA puede tumbar el guardado de un producto (el 01/10 un
-- disparador nuevo tumbó las facturas de todas las empresas): si la
-- constancia falla, el producto se guarda igual.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.equipo_foto_anotar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    INSERT INTO public.equipo_fotos_subidas (tenant_id, producto_id, imagen_url, subido_por)
    VALUES (NEW.tenant_id, NEW.id, NEW.imagen_url, auth.uid());
  EXCEPTION WHEN others THEN
    RAISE WARNING 'equipo_foto_anotar: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_equipo_foto_anotar ON public.productos;
CREATE TRIGGER trg_equipo_foto_anotar
  AFTER UPDATE OF imagen_url ON public.productos
  FOR EACH ROW
  WHEN (COALESCE(btrim(OLD.imagen_url), '') = ''
        AND COALESCE(btrim(NEW.imagen_url), '') <> ''
        AND NEW.tenant_id IS NOT NULL)
  EXECUTE FUNCTION public.equipo_foto_anotar();

-- Equipo IA ya no anota por su cuenta (lo hace el disparador; si no,
-- contaría doble).
CREATE OR REPLACE FUNCTION public.equipo_foto_guardar(p_producto_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  n int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  IF p_url IS NULL OR p_url !~ '/storage/v1/object/public/product-images/' THEN
    RAISE EXCEPTION 'La imagen tiene que estar subida a MotoFlow.';
  END IF;

  UPDATE public.productos
     SET imagen_url = p_url, updated_at = now()
   WHERE id = p_producto_id
     AND tenant_id = v_tenant;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Esa pieza no es de esta empresa.';
  END IF;
END $$;

-- La lista devuelve además las fotos de HOY (de donde sea), para que la
-- tarjeta las marque "Foto puesta" sin recargar la página.
CREATE OR REPLACE FUNCTION public.equipo_fotos_pendientes(p_limite integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_desde  timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Santo_Domingo')
                          AT TIME ZONE 'America/Santo_Domingo';
  v_lista  jsonb;
  v_hoy    jsonb;
  v_faltan int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  WITH ventas AS (
    SELECT fd.producto_id, SUM(fd.cantidad) AS u
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
     WHERE f.tenant_id = v_tenant
       AND f.fecha >= CURRENT_DATE - 60
       AND upper(COALESCE(f.estado, '')) <> 'ANULADA'
     GROUP BY 1
  ),
  stock AS (
    SELECT im.producto_id, SUM(im.cantidad) AS st
      FROM public.inventario_movimientos im
     WHERE im.tenant_id = v_tenant
     GROUP BY 1
  ),
  base AS (
    SELECT p.id, p.codigo, p.descripcion, p.precio,
           COALESCE(s.st, 0)   AS existencia,
           COALESCE(v.u, 0)    AS vendidos_60d,
           ROUND((COALESCE(s.st, 0) * COALESCE(p.costo, 0))::numeric, 2) AS capital,
           upper(split_part(btrim(p.descripcion), ' ', 1)) AS familia
      FROM public.productos p
      LEFT JOIN stock  s ON s.producto_id = p.id
      LEFT JOIN ventas v ON v.producto_id = p.id
     WHERE p.tenant_id = v_tenant
       AND COALESCE(p.activo, true)
       AND p.precio > 0
       AND COALESCE(btrim(p.imagen_url), '') = ''
       AND COALESCE(s.st, 0) >= 2
  ),
  ordenado AS (
    SELECT b.*,
           row_number() OVER (PARTITION BY b.familia
                              ORDER BY b.vendidos_60d DESC, b.capital DESC) AS vez_familia
      FROM base b
  )
  SELECT COUNT(*)::int,
         COALESCE(jsonb_agg(fila ORDER BY vez_familia, vendidos_60d DESC, capital DESC)
                  FILTER (WHERE n <= p_limite), '[]'::jsonb)
    INTO v_faltan, v_lista
    FROM (
      SELECT o.vez_familia, o.vendidos_60d, o.capital,
             row_number() OVER (ORDER BY o.vez_familia, o.vendidos_60d DESC, o.capital DESC) AS n,
             jsonb_build_object(
               'id', o.id, 'codigo', o.codigo, 'descripcion', o.descripcion,
               'precio', o.precio, 'existencia', o.existencia,
               'vendidos_60d', o.vendidos_60d, 'capital', o.capital,
               'razon', CASE
                 WHEN o.vendidos_60d > 0 THEN format(
                   'Se vende (%s en 60 días). Con foto entra a las promociones.', o.vendidos_60d)
                 ELSE format(
                   'Tienes %s en el estante (RD$%s parados). Con foto se puede promocionar.',
                   o.existencia, to_char(o.capital, 'FM999G999G990'))
               END) AS fila
        FROM ordenado o
    ) x;

  -- Una por pieza (si la subieron dos veces hoy, la última).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'producto_id', h.producto_id, 'imagen_url', p.imagen_url,
           'descripcion', p.descripcion, 'subido_en', h.subido_en)
           ORDER BY h.subido_en DESC), '[]'::jsonb)
    INTO v_hoy
    FROM (SELECT DISTINCT ON (producto_id) producto_id, subido_en
            FROM public.equipo_fotos_subidas
           WHERE tenant_id = v_tenant AND subido_en >= v_desde
           ORDER BY producto_id, subido_en DESC) h
    JOIN public.productos p ON p.id = h.producto_id
   WHERE COALESCE(btrim(p.imagen_url), '') <> '';

  RETURN jsonb_build_object('piezas', v_lista, 'hoy', jsonb_array_length(v_hoy),
                            'recientes', v_hoy, 'faltan', v_faltan);
END $$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('fotos_del_dia_desde_la_app.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_equipo_foto_anotar') AS disparador,
  (SELECT count(*) FROM public.equipo_fotos_subidas) AS anotadas;
