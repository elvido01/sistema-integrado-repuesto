-- =====================================================================
-- ENTITY RESOLVER: el modelo NO escribe identificadores
-- ---------------------------------------------------------------------
-- (2026-08-17, Fase 7 del encargo)
--
-- >>> POR QUE HACE FALTA <<<
-- Ya pasó, y salió caro. No existía herramienta para buscar una cotización
-- por nombre de cliente, así que al pedirle "la cotización de Sander" el
-- modelo se sacó un número de la manga — y resultó existir. Cotizó al
-- cliente equivocado con total 11,800 mientras el sistema decía 10,000.
-- El fallo no fue del modelo: fue haberle dejado escribir un id.
--
-- La cura es que los identificadores SALGAN DE LA BASE, siempre:
--
--     el modelo dice un NOMBRE  ──►  resolver  ──►  id verificado  ──►  tool
--     el modelo dice un ID      ──►  verificar ──►  existe y es mio? ──► tool
--
-- >>> LAS TRES RESPUESTAS <<<
--   ninguno  → Jarvis dice que no lo encontró. No inventa.
--   unico    → sigue solo, sin preguntar.
--   varios   → devuelve las opciones para que PREGUNTE cuál.
--              Nunca se elige una coincidencia dudosa por él.
--
-- >>> MULTIEMPRESA <<<
-- Todo pasa por get_user_tenant(), que sale de la SESION del usuario y no
-- de nada que mande el navegador ni el modelo. Un id de otra empresa
-- devuelve "no existe", que es exactamente lo que debe ver quien pregunta.
--
-- Idempotente / re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Resolver: de un texto a UNA entidad, o a la duda honesta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_resolver_entidad(
  p_tipo   text,                    -- 'cliente' | 'cotizacion' | 'producto' | 'factura'
  p_texto  text,
  p_limite integer DEFAULT 6
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_q      text := btrim(COALESCE(p_texto, ''));
  v_lim    integer := LEAST(GREATEST(COALESCE(p_limite, 6), 1), 20);
  v_ops    json;
  v_n      integer;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;
  IF v_q = '' THEN
    RETURN json_build_object('tipo', p_tipo, 'buscado', p_texto,
      'cuantos', 0, 'veredicto', 'ninguno', 'opciones', '[]'::json,
      'que_hacer', 'No se dijo a quién o a qué buscar. Pregúntalo.');
  END IF;

  IF p_tipo = 'cliente' THEN
    SELECT json_agg(x), count(*) INTO v_ops, v_n FROM (
      SELECT c.id, c.nombre, c.codigo, c.rnc, c.telefono
      FROM public.clientes c
      WHERE c.tenant_id = v_tenant
        AND (c.nombre ILIKE '%' || v_q || '%'
          OR c.codigo = v_q
          -- El RNC solo si lo dicho TRAE dígitos suficientes. Sin este
          -- guardia, quitarle las letras a "Sander" deja cadena vacía, y
          -- c.rnc = '' iguala a todo cliente con el RNC en blanco: buscar
          -- cualquier disparate devolvía gente, con cara de acierto.
          -- Cédula 11, RNC 9.
          OR (length(regexp_replace(v_q, '\D', '', 'g')) >= 9
              AND NULLIF(c.rnc, '') = regexp_replace(v_q, '\D', '', 'g')))
      -- El que empieza por lo dicho va primero: quien dice "Sander" suele
      -- querer SANDER PEREZ, no "ALEXANDER".
      ORDER BY (c.nombre ILIKE v_q || '%') DESC, length(c.nombre), c.nombre
      LIMIT v_lim
    ) x;

  ELSIF p_tipo = 'cotizacion' THEN
    SELECT json_agg(x), count(*) INTO v_ops, v_n FROM (
      SELECT q.id, q.numero, q.fecha_cotizacion, q.total_cotizacion, q.estado,
             COALESCE(cl.nombre, q.manual_cliente_nombre) AS cliente,
             q.cliente_id
      FROM public.cotizaciones q
      LEFT JOIN public.clientes cl ON cl.id = q.cliente_id AND cl.tenant_id = v_tenant
      WHERE q.tenant_id = v_tenant
        AND COALESCE(q.estado, '') NOT IN ('facturada', 'anulada')
        AND (q.numero ILIKE '%' || v_q || '%'
          OR cl.nombre ILIKE '%' || v_q || '%'
          OR q.manual_cliente_nombre ILIKE '%' || v_q || '%')
      ORDER BY q.fecha_cotizacion DESC, q.numero DESC
      LIMIT v_lim
    ) x;

  ELSIF p_tipo = 'producto' THEN
    SELECT json_agg(x), count(*) INTO v_ops, v_n FROM (
      SELECT p.id, p.codigo, p.descripcion, p.precio, p.itbis_pct
      FROM public.productos p
      WHERE p.tenant_id = v_tenant
        AND COALESCE(p.activo, true)
        AND (p.codigo = v_q OR p.referencia = v_q OR p.descripcion ILIKE '%' || v_q || '%')
      ORDER BY (p.codigo = v_q) DESC, length(p.descripcion)
      LIMIT v_lim
    ) x;

  ELSIF p_tipo = 'factura' THEN
    SELECT json_agg(x), count(*) INTO v_ops, v_n FROM (
      SELECT f.id, f.numero, f.fecha, f.total, f.estado, f.ncf,
             COALESCE(cl.nombre, f.manual_cliente_nombre) AS cliente
      FROM public.facturas f
      LEFT JOIN public.clientes cl ON cl.id = f.cliente_id AND cl.tenant_id = v_tenant
      WHERE f.tenant_id = v_tenant
        AND (f.numero ILIKE '%' || v_q || '%' OR f.ncf ILIKE '%' || v_q || '%'
          OR cl.nombre ILIKE '%' || v_q || '%')
      ORDER BY f.fecha DESC, f.numero DESC
      LIMIT v_lim
    ) x;

  ELSE
    RAISE EXCEPTION 'Tipo no válido: %. Use cliente, cotizacion, producto o factura', p_tipo;
  END IF;

  v_n := COALESCE(v_n, 0);

  RETURN json_build_object(
    'tipo',     p_tipo,
    'buscado',  v_q,
    'cuantos',  v_n,
    'veredicto', CASE WHEN v_n = 0 THEN 'ninguno' WHEN v_n = 1 THEN 'unico' ELSE 'varios' END,
    -- Solo cuando hay UNA se entrega la entidad lista para usar. Con varias
    -- se entregan las opciones y nada más: elegir por el usuario es
    -- justamente lo que no se puede hacer.
    'entidad',  CASE WHEN v_n = 1 THEN (v_ops->0) ELSE NULL END,
    'opciones', COALESCE(v_ops, '[]'::json),
    'que_hacer', CASE
      WHEN v_n = 0 THEN 'No existe en esta empresa. Dilo tal cual y pide el dato correcto. NO inventes un identificador.'
      WHEN v_n = 1 THEN 'Es esta. Usa el id de "entidad" y sigue sin preguntar.'
      ELSE 'Hay varias. Enséñalas y pregunta cuál. NO elijas tú.'
    END
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Verificar: este id, ¿existe y es de esta empresa?
-- ---------------------------------------------------------------------
-- Es la red que impide que un id inventado —o el de otra empresa— llegue a
-- una herramienta que escribe.
CREATE OR REPLACE FUNCTION public.mcp_verificar_entidad(
  p_tipo text,
  p_id   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_uuid   uuid;
  v_fila   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;

  BEGIN
    v_uuid := p_id::uuid;
  EXCEPTION WHEN others THEN
    -- No es un uuid: puede ser un número de documento, que también vale.
    v_uuid := NULL;
  END;

  IF p_tipo = 'cliente' THEN
    SELECT json_build_object('id', c.id, 'nombre', c.nombre, 'codigo', c.codigo)
      INTO v_fila FROM public.clientes c
     WHERE c.tenant_id = v_tenant AND (c.id = v_uuid OR c.codigo = p_id) LIMIT 1;
  ELSIF p_tipo = 'cotizacion' THEN
    SELECT json_build_object('id', q.id, 'numero', q.numero, 'estado', q.estado,
                             'total', q.total_cotizacion, 'cliente_id', q.cliente_id)
      INTO v_fila FROM public.cotizaciones q
     WHERE q.tenant_id = v_tenant AND (q.id = v_uuid OR q.numero = p_id) LIMIT 1;
  ELSIF p_tipo = 'producto' THEN
    SELECT json_build_object('id', p.id, 'codigo', p.codigo, 'descripcion', p.descripcion,
                             'precio', p.precio)
      INTO v_fila FROM public.productos p
     WHERE p.tenant_id = v_tenant AND (p.id = v_uuid OR p.codigo = p_id) LIMIT 1;
  ELSIF p_tipo = 'factura' THEN
    SELECT json_build_object('id', f.id, 'numero', f.numero, 'estado', f.estado, 'total', f.total)
      INTO v_fila FROM public.facturas f
     WHERE f.tenant_id = v_tenant AND (f.id = v_uuid OR f.numero = p_id) LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Tipo no válido: %', p_tipo;
  END IF;

  RETURN json_build_object(
    'tipo', p_tipo,
    'id_dado', p_id,
    'existe', v_fila IS NOT NULL,
    'entidad', v_fila,
    -- El mensaje es el mismo tanto si el id no existe como si es de otra
    -- empresa. A propósito: distinguirlos le diría a quien pregunta que ese
    -- identificador existe en algún sitio, y eso ya es contar de más.
    'que_hacer', CASE WHEN v_fila IS NULL
      THEN 'Ese identificador no existe en esta empresa. NO lo uses. Búscalo por nombre con mcp_resolver_entidad.'
      ELSE 'Verificado. Puedes usarlo.' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mcp_resolver_entidad(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mcp_resolver_entidad(text, text, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_verificar_entidad(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mcp_verificar_entidad(text, text) TO authenticated, service_role;

DO $mig$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_entity_resolver.sql');
  END IF;
END $mig$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICACION — las 3 deben decir OK
-- =====================================================================
WITH chequeos AS (
  SELECT 1 AS n, 'mcp_resolver_entidad existe' AS chequeo,
         (to_regprocedure('public.mcp_resolver_entidad(text,text,integer)') IS NOT NULL)::text AS resultado, 'true' AS esperado
  UNION ALL
  SELECT 2, 'mcp_verificar_entidad existe',
         (to_regprocedure('public.mcp_verificar_entidad(text,text)') IS NOT NULL)::text, 'true'
  UNION ALL
  SELECT 3, 'anon no las puede ejecutar',
         (NOT has_function_privilege('anon', 'public.mcp_resolver_entidad(text,text,integer)', 'EXECUTE'))::text, 'true'
)
SELECT n, chequeo, resultado, esperado,
       CASE WHEN resultado = esperado THEN 'OK' ELSE '*** FALLO ***' END AS estado
FROM chequeos ORDER BY n;
