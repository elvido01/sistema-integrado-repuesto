-- =====================================================================
-- Hermes ve el almacén viejo
-- ---------------------------------------------------------------------
-- (2026-08-28) Un cliente pidió el pitón del TVS 100. Hermes contestó "no
-- encontré específicamente para el TVS 100". El dueño fue a Morla Vieja,
-- lo trajo a las 11:14 y lo cotizó a mano cuatro minutos después.
--
-- Hermes no se equivocó: cuando contestó, la pieza no existía en el único
-- catálogo que puede ver. El problema es el tamaño del punto ciego:
--
--   REPUESTOS MORLA (nueva)   5,393 piezas   <- lo unico que Hermes ve
--   REPUESTOS MORLA VIEJA     6,328 piezas   <- invisible
--
-- Hay MÁS inventario fuera de su vista que dentro. Cada "no tengo" sobre
-- una de esas 6,328 es una venta que se va, y solo se salva si hay alguien
-- delante que, como el dueño, se acuerde de ir a mirar.
--
-- >>> POR QUE NO SE MEZCLAN LOS DOS CATALOGOS <<<
-- Porque no son lo mismo y decir que sí sería peor que el punto ciego. Una
-- pieza de la vieja NO se puede facturar donde está: hay que traerla
-- primero (mover_producto_de_vieja, que ya existe). Si viniera revuelta
-- con las demás, Hermes prometería piezas que el vendedor no puede cobrar,
-- y eso quema al cliente dos veces: primero le dices que sí y luego que no.
--
-- Van en `piezas_en_la_vieja`, aparte y con nota, para que el agente diga
-- "esa la tengo en el almacén viejo, deja que te la busco".
--
-- >>> LA PARTE DELICADA <<<
-- Buscar en OTRO tenant es exactamente lo que RLS existe para impedir. Por
-- eso _hermes_buscar_en queda REVOCADA para authenticated: solo la puede
-- llamar mcp_buscar_piezas, que es SECURITY DEFINER y que resuelve la
-- pareja desde config_empresa. Nadie puede pedirle "búscame en el tenant
-- que yo te diga".
--
-- De paso se quita la duplicación: la búsqueda estaba escrita una vez y
-- ahora hacía falta dos veces. Dos copias del mismo puntaje terminan
-- puntuando distinto.
--
-- Idempotente. Requiere una_s_de_mas_esconde_la_pieza.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El motor de búsqueda, una sola vez, para cualquier catálogo
-- ---------------------------------------------------------------------
-- PRIVADA A PROPOSITO: recibe un tenant y devuelve sus productos. Si
-- estuviera abierta, cualquiera con sesión leería el catálogo de cualquier
-- empresa del sistema. Ver el REVOKE del final.
CREATE OR REPLACE FUNCTION public._hermes_buscar_en(
  p_tenant uuid,
  p_pal    text[],
  p_limite integer
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH pal AS (
    SELECT unnest(p_pal) AS palabra
  ), mod_hit AS (
    -- Qué modelos responden a cada palabra. Se resuelve UNA vez contra la
    -- tabla de modelos, que es chica, en vez de preguntárselo a los miles
    -- de productos uno por uno.
    SELECT pal.palabra, mo.id
    FROM pal
    JOIN public.modelos mo
      ON public._sin_tildes(mo.nombre) LIKE '%' || pal.palabra || '%'
    WHERE mo.tenant_id = p_tenant
  ), cand AS (
    -- El texto contra el que se compara se arma UNA vez por producto.
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.ubicacion,
           p.modelo_id, p.modelos_ids, ma.nombre AS marca,
           public._sin_tildes(concat_ws(' ', p.descripcion, p.codigo, ma.nombre)) AS texto
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant
      AND COALESCE(p.activo, true) = true
  ), hit AS (
    SELECT c.id, pal.palabra
    FROM cand c CROSS JOIN pal
    WHERE c.texto LIKE '%' || pal.palabra || '%'
       OR EXISTS (SELECT 1 FROM mod_hit mh
                   WHERE mh.palabra = pal.palabra
                     AND (mh.id = c.modelo_id
                       OR mh.id = ANY(COALESCE(c.modelos_ids, '{}'::uuid[]))))
  ), df AS (
    SELECT palabra, count(*)::numeric AS piezas FROM hit GROUP BY palabra
  ), total AS (
    SELECT GREATEST(count(*), 1)::numeric AS piezas FROM cand
  ), puntuado AS (
    SELECT h.id,
           count(*) AS aciertos,
           sum(GREATEST(ln((SELECT piezas FROM total) / (1 + d.piezas)), 0.05)) AS puntos
    FROM hit h JOIN df d ON d.palabra = h.palabra
    GROUP BY h.id
  ), con_stock AS (
    SELECT c.*, pu.aciertos, pu.puntos,
           COALESCE(public.get_stock_actual(c.id), 0) AS existencia
    FROM cand c JOIN puntuado pu ON pu.id = c.id
  ), elegidas AS (
    -- La existencia entra en el ORDEN, no solo en el resultado: entre dos
    -- piezas que puntúan igual, la que está en el almacén gana el puesto.
    SELECT * FROM con_stock
    ORDER BY puntos DESC, existencia DESC, descripcion
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 8), 25))
  )
  SELECT COALESCE(json_agg(y), '[]'::json)
  FROM (
    SELECT e.codigo, e.descripcion,
           round(COALESCE(e.precio, 0), 2) AS precio,
           e.existencia,
           NULLIF(btrim(COALESCE(e.ubicacion, '')), '') AS ubicacion,
           -- Marca y modelos VIAJAN en la respuesta. Sin esto el agente
           -- encuentra la pieza pero no puede confirmar para qué moto es.
           e.marca,
           NULLIF(public.get_nombres_modelos(e.modelos_ids), '') AS modelos
    FROM elegidas e
    ORDER BY e.puntos DESC, e.existencia DESC, e.descripcion
  ) y;
$fn$;

-- ---------------------------------------------------------------------
-- La búsqueda que usa el agente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_buscar_piezas(p_texto text, p_limite integer DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_vieja  uuid;
  v_pal    text[];
  v_exp    text[];
  v_out    json;
  v_old    json := '[]'::json;
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  v_pal := public._hermes_palabras(p_texto);
  IF array_length(v_pal, 1) IS NULL THEN
    RETURN json_build_object('busqueda', p_texto, 'palabras', '[]'::json, 'piezas', '[]'::json,
      'nota', 'No quedó ninguna palabra útil para buscar. Pide la pieza y el modelo de la motocicleta.');
  END IF;

  -- Las palabras MÁS sus equivalencias, en los dos sentidos: quien escribe
  -- "clutch" tiene que encontrar también las que dicen CLOCHE.
  SELECT array_agg(DISTINCT w) INTO v_exp FROM (
    SELECT unnest(v_pal) AS w
    UNION
    SELECT s.equivale_a FROM unnest(v_pal) b(w)
      JOIN public.busqueda_sinonimos s ON s.palabra = b.w
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
    UNION
    SELECT s.palabra FROM unnest(v_pal) b(w)
      JOIN public.busqueda_sinonimos s ON s.equivale_a = b.w
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
  ) z;

  v_out := public._hermes_buscar_en(v_tenant, v_exp, p_limite);

  -- El almacén viejo, si esta empresa tiene uno. Pocas y aparte: son una
  -- pista para el vendedor, no mercancía que se pueda facturar hoy.
  SELECT empresa_vieja_tenant_id INTO v_vieja
  FROM public.config_empresa WHERE tenant_id = v_tenant;

  IF v_vieja IS NOT NULL THEN
    v_old := public._hermes_buscar_en(v_vieja, v_exp, 4);
  END IF;

  v_n := COALESCE(json_array_length(v_out), 0);

  -- Lo que se buscó queda anotado, encuentre o no. Los ceros son los que
  -- enseñan: son las palabras que la gente usa y el catálogo no conoce.
  PERFORM public.registrar_busqueda('jarvis', p_texto, v_n);

  RETURN json_build_object(
    'busqueda',   p_texto,
    'palabras',   to_json(v_exp),
    'encontradas', v_n,
    'piezas',     v_out,
    'piezas_en_la_vieja', v_old,
    'nota_vieja', CASE
      WHEN COALESCE(json_array_length(v_old), 0) > 0
        THEN 'Estas estan en el almacen VIEJO. No se pueden facturar ahi: hay que traerlas primero. Ofrecelas diciendo que las tienes en el almacen viejo y que las buscas, nunca como disponibles en el mostrador.'
      ELSE NULL END
  );
END
$fn$;

-- El motor no se le presta a nadie: solo lo llama mcp_buscar_piezas, que
-- resuelve la pareja de empresas por su cuenta. Abrirlo sería dejar leer
-- el catálogo de cualquier empresa del sistema con solo pasar su uuid.
REVOKE EXECUTE ON FUNCTION public._hermes_buscar_en(uuid, text[], integer) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_ve_el_almacen_viejo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que el motor NO se pueda llamar a mano (si esto dijera OK, seria una
-- fuga de datos entre empresas).
SELECT CASE WHEN has_function_privilege('authenticated',
              'public._hermes_buscar_en(uuid, text[], integer)', 'EXECUTE')
            THEN 'FALLO: cualquiera puede leer el catalogo de otra empresa'
            ELSE 'OK  el motor es privado' END AS seguridad,
       (SELECT count(*) FROM public.config_empresa WHERE empresa_vieja_tenant_id IS NOT NULL) AS empresas_con_almacen_viejo;
