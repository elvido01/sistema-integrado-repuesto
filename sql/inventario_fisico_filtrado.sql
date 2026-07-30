-- =====================================================================
-- Inventario Físico: filtrar en el servidor para que no se corte en 1000
-- ---------------------------------------------------------------------
-- (2026-07-30) "Gestión Empresarial dice 78 motos y el Inventario Físico
-- dice 20."
--
-- >>> POR QUÉ DECÍA 20 <<<
-- Caminero tiene 3,535 productos. La API corta cualquier respuesta en 1,000
-- filas —por eso el pie decía justo "TOTAL ARTÍCULOS: 1000"—, así que la
-- pantalla solo miraba los primeros 1,000 del catálogo y contaba los que
-- tenían existencia DENTRO de ese pedazo: 20.
--
-- La verdad, sumando el kardex completo: 117 productos con existencia, 125
-- unidades. Ninguna de las dos pantallas lo estaba diciendo.
--
-- >>> LA SOLUCIÓN <<<
-- Filtrar ANTES de devolver, no después. Con "solo con existencia" la
-- consulta trae 117 filas en vez de 3,535, así que ya no se corta y el
-- conteo es el real.
--
-- No se toca get_inventario_fisico: se envuelve. Así el resto del sistema
-- que la usa sigue igual, y esta función hereda cualquier cambio que se le
-- haga a la original — incluidas sus columnas, que se copian con
-- pg_get_function_result en vez de escribirlas a mano.
--
-- >>> LO QUE SIGUE SIN CUADRAR, Y NO ES DE ESTE ARREGLO <<<
-- Gestión Empresarial cuenta 78 de esos 117 porque pide `chasis` lleno y
-- producto activo:
--
--   78  con chasis y activos      ← los que cuenta el panel (RD$ 6,290,358)
--   32  con el CHASIS VACÍO       ← son motos igual: su código ES el VIN
--                                   (LLCLHMP04TP020064, LLCLT1503TCK02513…)
--    7  inactivos con existencia  ← motos viejas dadas de baja pero con stock
--  ───
--  117
--
-- Los 32 entraron sin llenar el campo `chasis`. Llenarlo con el código
-- cuando el código es un VIN de 17 caracteres arreglaría el conteo, pero eso
-- toca datos de mercancía y va aparte — dime y lo preparo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_ret text;
BEGIN
  -- El tipo de retorno se copia de la original: si mañana le agregan una
  -- columna, esta lo hereda sin tener que tocarla.
  SELECT pg_get_function_result(p.oid) INTO v_ret
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_inventario_fisico'
  LIMIT 1;

  IF v_ret IS NULL THEN
    RAISE EXCEPTION 'No existe get_inventario_fisico';
  END IF;

  IF position('existencia' in lower(v_ret)) = 0 THEN
    RAISE EXCEPTION 'get_inventario_fisico no devuelve una columna existencia: %', v_ret;
  END IF;

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.get_inventario_fisico_filtrado(
      p_ubicacion       text,
      p_search          text,
      p_solo_existencia boolean DEFAULT false
    )
    RETURNS %s
    LANGUAGE sql
    STABLE
    SET search_path TO 'public'
    AS $q$
      SELECT t.*
      FROM public.get_inventario_fisico(p_ubicacion, p_search) t
      WHERE NOT p_solo_existencia OR COALESCE(t.existencia, 0) > 0;
    $q$;
  $f$, v_ret);

  RAISE NOTICE 'get_inventario_fisico_filtrado lista.';
END $$;

REVOKE EXECUTE ON FUNCTION public.get_inventario_fisico_filtrado(text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_inventario_fisico_filtrado(text, text, boolean) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('inventario_fisico_filtrado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- OJO: get_inventario_fisico usa la sesión del usuario, así que no se llama
-- desde el editor SQL. Se cuenta directo del kardex, que es la misma fuente.

-- 1) LA VERDAD DEL INVENTARIO DE CAMINERO
WITH stock AS (
  SELECT m.producto_id, SUM(m.cantidad) AS existencia
  FROM public.inventario_movimientos m
  WHERE m.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  GROUP BY m.producto_id
  HAVING SUM(m.cantidad) > 0
)
SELECT COUNT(*) AS productos_con_existencia,
       SUM(s.existencia) AS unidades,
       COUNT(*) FILTER (WHERE p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
                          AND COALESCE(p.activo, true))         AS cuenta_gestion_empresarial,
       COUNT(*) FILTER (WHERE p.chasis IS NULL OR btrim(p.chasis) = '') AS sin_chasis,
       COUNT(*) FILTER (WHERE p.activo = false)                 AS inactivos
FROM stock s JOIN public.productos p ON p.id = s.producto_id;
-- esperado: 117 productos · 125 unidades · 78 los del panel · 32 sin chasis
--           · 7 inactivos.  El Inventario Físico decía 20 porque solo miraba
--           los primeros 1,000 productos de 3,535.

-- 2) LOS 32 SIN CHASIS: el código ES el VIN
WITH stock AS (
  SELECT m.producto_id, SUM(m.cantidad) AS existencia
  FROM public.inventario_movimientos m
  WHERE m.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  GROUP BY m.producto_id HAVING SUM(m.cantidad) > 0
)
SELECT p.codigo, p.descripcion, p.ubicacion, s.existencia,
       length(btrim(p.codigo)) AS largo_codigo
FROM stock s JOIN public.productos p ON p.id = s.producto_id
WHERE (p.chasis IS NULL OR btrim(p.chasis) = '')
  AND COALESCE(p.activo, true)
ORDER BY p.codigo;
-- esperado: 32 motos con el código de 17 caracteres (un VIN) y el campo
-- chasis vacío. Son las que a Gestión Empresarial le faltan.
