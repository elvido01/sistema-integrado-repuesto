-- ============================================================
-- LA CARGA MASIVA DE EXISTENCIAS VUELVE A FUNCIONAR (Y DICE QUE HIZO)
-- ============================================================
-- El dueno pregunto que tipo de archivo coge la carga masiva del Maestro de
-- Articulos. Al ir a mirarlo aparecio algo peor: no coge ninguno, porque la
-- funcion revienta antes de tocar nada.
--
-- Probado contra produccion, con un producto real, dentro de una transaccion
-- deshecha:
--     resultado: function uuid_generate_v4() does not exist
--
-- La funcion armaba cada movimiento asi:
--     ROW(uuid_generate_v4(), producto_id, now(), 'AJUSTE', ...)::inventario_movimientos
-- y tenia DOS problemas encima del mismo renglon:
--   1) `uuid_generate_v4()` ya no se alcanza con el search_path de la funcion
--      (la extension uuid-ossp no vive en `public`).
--   2) El ROW tiene 9 campos y la tabla ya tiene 11 (le crecieron `tenant_id`
--      y `legacy_id`), asi que el cast a `inventario_movimientos` tampoco
--      cuadraria aunque el uuid se resolviera.
-- Ninguno de los dos avisa hasta que alguien intenta importar.
--
-- >>> DESDE CUANDO <<<
-- El ultimo movimiento con referencia 'IMPORTACION_CSV' es del 12/07/2025.
-- En los ultimos 400 dias: CERO. Lleva mas de un ano sin poder usarse.
--
-- >>> QUE CAMBIA <<<
-- · Se arma el INSERT de una sola vez, sin ROW ni cast: la columna `id` ya
--   tiene DEFAULT gen_random_uuid() y `tenant_id` tiene DEFAULT
--   get_user_tenant(), asi que no hay que inventarlos.
-- · DEVUELVE lo que hizo. Antes era `void`: la pantalla decia "120 existencias
--   actualizadas" contando las lineas del archivo, aunque no hubiera casado
--   NINGUN codigo. Ahora dice cuantas movio, cuantas ya estaban igual, y CUALES
--   codigos no existen — que es lo unico que uno necesita para arreglar el
--   archivo.
-- · Un codigo repetido en el archivo ya no genera dos ajustes peleados: manda
--   la ultima linea.
-- · El codigo casa exacto primero y, si no, sin importar mayusculas. El unico
--   es (codigo, tenant_id) tal cual, asi que el exacto SIEMPRE tiene prioridad.
--
-- Lo que NO cambia: sigue siendo un AJUSTE por diferencia contra la existencia
-- actual, con referencia 'IMPORTACION_CSV', y sigue sin crear articulos. Es una
-- carga de EXISTENCIAS, no de productos.
-- ============================================================

SELECT public.registrar_migracion('la_carga_de_existencias_vuelve_a_funcionar.sql');

-- Pasa de void a jsonb: hay que soltarla, CREATE OR REPLACE no cambia el tipo
-- de retorno.
DROP FUNCTION IF EXISTS public.ajustar_inventario_batch(jsonb);

CREATE FUNCTION public.ajustar_inventario_batch(p_ajustes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant     UUID := public.get_user_tenant();
  v_recibidas  INT;
  v_movidas    INT := 0;
  v_igual      INT := 0;
  v_faltan     TEXT[];
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No hay empresa activa.';
  END IF;

  CREATE TEMP TABLE _carga ON COMMIT DROP AS
  WITH crudo AS (
    SELECT trim(x.codigo) AS codigo, x.existencia,
           row_number() OVER () AS orden
    FROM jsonb_to_recordset(p_ajustes) AS x(codigo text, existencia numeric)
    WHERE COALESCE(trim(x.codigo), '') <> ''
      AND x.existencia IS NOT NULL
  )
  -- Un mismo codigo dos veces en el archivo: vale la ultima linea, que es la
  -- que la persona escribio despues.
  SELECT DISTINCT ON (upper(codigo)) codigo, existencia
  FROM crudo
  ORDER BY upper(codigo), orden DESC;

  SELECT count(*) INTO v_recibidas FROM _carga;

  CREATE TEMP TABLE _casado ON COMMIT DROP AS
  SELECT c.codigo,
         c.existencia,
         p.id AS producto_id,
         COALESCE(public.get_stock_actual(p.id), 0) AS actual
  FROM _carga c
  LEFT JOIN LATERAL (
    SELECT pr.id
    FROM public.productos pr
    WHERE pr.tenant_id = v_tenant
      AND (pr.codigo = c.codigo OR upper(pr.codigo) = upper(c.codigo))
    ORDER BY (pr.codigo = c.codigo) DESC   -- el exacto manda sobre el parecido
    LIMIT 1
  ) p ON true;

  SELECT array_agg(codigo ORDER BY codigo) INTO v_faltan
  FROM _casado WHERE producto_id IS NULL;

  SELECT count(*) INTO v_igual
  FROM _casado
  WHERE producto_id IS NOT NULL AND abs(existencia - actual) <= 0.001;

  WITH movidos AS (
    INSERT INTO public.inventario_movimientos
      (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id)
    SELECT c.producto_id, now(), 'AJUSTE'::movimiento_tipo,
           c.existencia - c.actual, NULL, 'IMPORTACION_CSV', auth.uid()
    FROM _casado c
    WHERE c.producto_id IS NOT NULL
      AND abs(c.existencia - c.actual) > 0.001
    RETURNING 1
  )
  SELECT count(*) INTO v_movidas FROM movidos;

  RETURN jsonb_build_object(
    'recibidas',    v_recibidas,
    'actualizadas', v_movidas,
    'sin_cambio',   v_igual,
    'no_encontrados', COALESCE(array_length(v_faltan, 1), 0),
    -- Solo los primeros 20: la idea es que quepan en el aviso de la pantalla,
    -- no volcar el archivo entero.
    'codigos_no_encontrados', to_jsonb(COALESCE(v_faltan[1:20], ARRAY[]::text[]))
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ajustar_inventario_batch(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — importar de verdad y deshacerlo
-- ============================================================
-- Con un producto real de Repuestos Morla y un codigo inventado, para ver las
-- dos mitades: la que se mueve y la que se avisa. Solo revienta si falla.
DO $prueba$
DECLARE
  v_t     UUID := '00000000-0000-0000-0000-000000000001';
  v_u     UUID;
  v_cod   TEXT;
  v_id    UUID;
  v_stock NUMERIC;
  v_res   JSONB;
  v_movs  INT;
BEGIN
  SELECT a.user_id INTO v_u FROM public.usuario_tenant_activo a WHERE a.tenant_id = v_t LIMIT 1;
  SELECT p.id, p.codigo, COALESCE(public.get_stock_actual(p.id), 0)
    INTO v_id, v_cod, v_stock
  FROM public.productos p
  WHERE p.tenant_id = v_t AND COALESCE(p.activo, true) LIMIT 1;

  IF v_u IS NULL OR v_id IS NULL THEN
    RAISE NOTICE 'Faltan datos para la prueba. Funcion creada igual.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    v_res := public.ajustar_inventario_batch(jsonb_build_array(
      jsonb_build_object('codigo', v_cod,              'existencia', v_stock + 7),
      jsonb_build_object('codigo', 'NO-EXISTE-JAMAS',  'existencia', 5),
      jsonb_build_object('codigo', v_cod,              'existencia', v_stock + 7)  -- repetido
    ));
    SELECT count(*) INTO v_movs
    FROM public.inventario_movimientos
    WHERE producto_id = v_id AND referencia_doc = 'IMPORTACION_CSV'
      AND fecha > now() - interval '1 minute';
    RAISE EXCEPTION 'DESHACER LA PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER LA PRUEBA' THEN
      RESET ROLE;
      RAISE EXCEPTION 'La carga de prueba fallo: %', SQLERRM;
    END IF;
  END;

  RESET ROLE;

  IF (v_res->>'recibidas')::int <> 2 THEN
    RAISE EXCEPTION 'El codigo repetido no se unifico: recibidas = %', v_res->>'recibidas';
  END IF;
  IF (v_res->>'actualizadas')::int <> 1 THEN
    RAISE EXCEPTION 'Tenia que mover 1 existencia y movio %', v_res->>'actualizadas';
  END IF;
  IF (v_res->>'no_encontrados')::int <> 1 THEN
    RAISE EXCEPTION 'Tenia que avisar 1 codigo inexistente y aviso %', v_res->>'no_encontrados';
  END IF;
  IF v_movs <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 movimiento de ajuste y quedaron %', v_movs;
  END IF;

  RAISE NOTICE 'Carga probada y deshecha: %', v_res::text;
END $prueba$;
