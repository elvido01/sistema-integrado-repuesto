-- =====================================================================
-- Hermes necesita poder buscar un producto sin escribir SQL
-- ---------------------------------------------------------------------
-- (2026-08-11) Hermes ya está conectado al VPS y tiene herramientas, pero
-- ante "¿tienes una careta de Platina 125 Bajaj y a cuánto?" contestaba
-- que MotoFlow no le había enviado los datos. No era falta de manos: era
-- que la consulta es cara de escribir y el modelo tomaba el atajo.
--
-- Y con razón. Para responder eso hay que:
--   · buscar por descripción con las palabras en cualquier orden
--   · resolver marca_id y modelo_ids, que son ids, no texto
--   · sumar el kardex, porque productos NO tiene columna de existencia
--
-- Escribir eso bien, cada vez, no es razonable. Aquí queda resuelto una
-- sola vez y de la misma forma que lo hace get_productos_paginados, para
-- que Hermes y la pantalla nunca den números distintos.
--
-- >>> POR QUÉ SECURITY DEFINER <<<
-- hermes_readonly no tiene USAGE sobre public: solo ve el schema hermes.
-- Una función normal fallaría con "permission denied". Definer la ejecuta
-- con los permisos del dueño, y el tenant va fijo dentro — el rol no puede
-- pedir los datos de otra empresa ni cambiando los parámetros.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- Repuestos Morla. Todo el schema hermes es de esta empresa por diseño;
-- si algún día hay un Hermes por tenant, esto se parametriza y se crea un
-- schema por cada uno, no se abre este.
CREATE OR REPLACE FUNCTION hermes.buscar_producto(
  p_texto   text,
  p_limite  integer DEFAULT 10,
  p_incluir_inactivos boolean DEFAULT false
)
RETURNS TABLE (
  codigo       text,
  descripcion  text,
  marca        text,
  modelo       text,
  precio       numeric,
  existencia   numeric,
  ubicacion    text,
  itbis_pct    numeric,
  activo       boolean,
  coincidencias integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- Las palabras de la búsqueda, sueltas. Se descartan las de menos de 3
  -- letras: "de", "la", "un" no distinguen nada y ensucian el ranking.
  palabras AS (
    SELECT lower(w) AS w
    FROM unnest(regexp_split_to_array(btrim(coalesce(p_texto, '')), '\s+')) AS w
    WHERE length(w) >= 3
  ),
  -- El stock sale del kardex, igual que en get_productos_paginados. Una
  -- sola pasada por todo el tenant y luego se cruza.
  stock AS (
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM public.inventario_movimientos im
    WHERE im.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    GROUP BY im.producto_id
  ),
  base AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      ma.nombre AS marca,
      public.get_nombres_modelos(p.modelos_ids) AS modelo,
      p.precio,
      COALESCE(s.stk, 0)::numeric AS existencia,
      p.ubicacion,
      p.itbis_pct,
      p.activo,
      -- Todo lo buscable en un solo texto: así "careta platina bajaj"
      -- encuentra igual aunque la marca esté en otra columna.
      lower(concat_ws(' ',
        p.codigo, p.referencia, p.descripcion,
        ma.nombre, public.get_nombres_modelos(p.modelos_ids)
      )) AS buscable
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id
    LEFT JOIN stock s ON s.producto_id = p.id
    WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (p_incluir_inactivos OR p.activo IS TRUE)
  )
  SELECT
    b.codigo, b.descripcion, b.marca, b.modelo, b.precio,
    b.existencia, b.ubicacion, b.itbis_pct, b.activo,
    (SELECT count(*)::int FROM palabras pa WHERE b.buscable LIKE '%' || pa.w || '%')
  FROM base b
  -- Se puntúa por cuántas palabras encajan en vez de exigirlas todas:
  -- "marca baja" por "marca Bajaj" no debe devolver cero resultados.
  WHERE (SELECT count(*) FROM palabras pa WHERE b.buscable LIKE '%' || pa.w || '%') > 0
  ORDER BY
    (SELECT count(*) FROM palabras pa WHERE b.buscable LIKE '%' || pa.w || '%') DESC,
    -- A igualdad de coincidencias, primero lo que se puede vender hoy.
    (COALESCE(b.existencia, 0) > 0) DESC,
    b.descripcion
  LIMIT GREATEST(1, LEAST(coalesce(p_limite, 10), 50));
$$;

REVOKE ALL ON FUNCTION hermes.buscar_producto(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.buscar_producto(text, integer, boolean) TO hermes_readonly;

-- ------------------------------------------------------------
-- El resumen del catálogo, para que el número coincida con la pantalla
-- ------------------------------------------------------------
-- El panel enseña 3,723 y la tabla tiene 5,352: la diferencia son los
-- descontinuados. Si Hermes cuenta filas a secas contradice a la pantalla
-- y parece que uno de los dos miente.
CREATE OR REPLACE FUNCTION hermes.catalogo_resumen()
RETURNS TABLE (
  activos      integer,
  inactivos    integer,
  con_existencia integer,
  sin_existencia integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stock AS (
    SELECT im.producto_id, SUM(im.cantidad)::numeric AS stk
    FROM public.inventario_movimientos im
    WHERE im.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    GROUP BY im.producto_id
  )
  SELECT
    count(*) FILTER (WHERE p.activo IS TRUE)::int,
    count(*) FILTER (WHERE p.activo IS NOT TRUE)::int,
    count(*) FILTER (WHERE p.activo IS TRUE AND COALESCE(s.stk, 0) > 0)::int,
    count(*) FILTER (WHERE p.activo IS TRUE AND COALESCE(s.stk, 0) <= 0)::int
  FROM public.productos p
  LEFT JOIN stock s ON s.producto_id = p.id
  WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;
$$;

REVOKE ALL ON FUNCTION hermes.catalogo_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.catalogo_resumen() TO hermes_readonly;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_buscar_producto.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Debe devolver activos = 3723 (lo que enseña el panel):
SELECT * FROM hermes.catalogo_resumen();

-- Y esto debe encontrar la careta aunque diga "baja" en vez de "Bajaj":
SELECT codigo, descripcion, marca, precio, existencia, coincidencias
FROM hermes.buscar_producto('careta platina 125 baja', 5);
