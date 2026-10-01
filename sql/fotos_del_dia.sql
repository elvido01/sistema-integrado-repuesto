-- =====================================================================
-- FOTOS DEL DÍA: 5 piezas sin imagen para fotografiar cada día
-- ---------------------------------------------------------------------
-- (2026-10-01) Pedido del dueño: «un cuadro similar a Qué promocionar hoy
-- para subirle 5 imágenes diarias a piezas que no tienen imagen».
--
-- Por qué importa: el Paso 1 (_equipo_candidatos_de) SOLO recomienda piezas
-- con productos.imagen_url. En Repuestos Morla, al 01/10, eran 72 de 3,867
-- activas. 650 piezas SIN foto tienen existencia y se vendieron en 90 días:
-- cada foto que se sube es una pieza más que el equipo puede promocionar.
--
-- Qué piezas salen primero (las que más rinden con foto):
--   1. Las que la gente compra (vendidos en 60 días), luego
--   2. las que tienen más dinero parado en el estante.
--   Mismo filtro que el Paso 1 (precio > 0, existencia >= 2) para que la
--   foto la convierta en candidata enseguida. Una familia (primera palabra)
--   por vez, para no dar cinco aceites seguidos.
--
-- La imagen es UNA por producto (productos.imagen_url, bucket público
-- product-images), igual que el formulario de producto. Guardar la foto
-- pasa por equipo_foto_guardar para dejar constancia (cuántas hoy).
-- Solo el dueño (equipo_ia_permitido), como el resto de Equipo IA.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_fotos_subidas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  producto_id uuid NOT NULL,
  imagen_url  text NOT NULL,
  subido_por  uuid DEFAULT auth.uid(),
  subido_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipo_fotos_subidas_dia
  ON public.equipo_fotos_subidas (tenant_id, subido_en DESC);
ALTER TABLE public.equipo_fotos_subidas ENABLE ROW LEVEL SECURITY;
-- Sin políticas: se lee y escribe solo por las funciones de abajo.

COMMENT ON TABLE public.equipo_fotos_subidas IS
  'Constancia de las fotos subidas desde "Fotos del día" (Equipo IA). La imagen vive en productos.imagen_url.';

-- ------------------------------------------------------------
-- La lista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_fotos_pendientes(p_limite integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_lista  jsonb;
  v_hoy    int;
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

  SELECT COUNT(*)::int INTO v_hoy
    FROM public.equipo_fotos_subidas
   WHERE tenant_id = v_tenant
     AND subido_en >= (date_trunc('day', now() AT TIME ZONE 'America/Santo_Domingo')
                       AT TIME ZONE 'America/Santo_Domingo');

  RETURN jsonb_build_object('piezas', v_lista, 'hoy', v_hoy, 'faltan', v_faltan);
END $$;

GRANT EXECUTE ON FUNCTION public.equipo_fotos_pendientes(integer) TO authenticated;

-- ------------------------------------------------------------
-- Guardar la foto
-- ------------------------------------------------------------
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
  -- Solo imágenes del almacén público de productos, nada de enlaces de fuera.
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

  INSERT INTO public.equipo_fotos_subidas (tenant_id, producto_id, imagen_url)
  VALUES (v_tenant, p_producto_id, p_url);
END $$;

GRANT EXECUTE ON FUNCTION public.equipo_foto_guardar(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('fotos_del_dia.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname IN ('equipo_fotos_pendientes', 'equipo_foto_guardar')) AS funciones,
  to_regclass('public.equipo_fotos_subidas') IS NOT NULL AS tabla;
