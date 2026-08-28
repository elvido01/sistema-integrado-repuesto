-- =====================================================================
-- Una "s" de más esconde la pieza
-- ---------------------------------------------------------------------
-- (2026-08-28) El dueño usó Sugerir, corrigió tres precios a mano y pidió
-- revisar si el aprendizaje funcionaba. Funcionaba. Lo que no funcionaba
-- era la búsqueda, y se vio siguiendo el rastro que dejó la sugerencia.
--
-- El cliente pidió "sellos de válvula del tv's 100". Hermes ofreció uno de
-- RD$60 que no le sirve. El bueno —RD$190, y con SPORT 100 enlazado como
-- modelo— NO SALIO EN LA BUSQUEDA. Probado contra producción:
--
--   mcp_buscar_piezas('sellos de valvula sport 100')  -> 003742 NO aparece
--   mcp_buscar_piezas('sello  de valvula sport 100')  -> 003742 sale PRIMERA
--
-- La única diferencia es una "s".
--
-- >>> POR QUE PASA <<<
-- El catálogo dice "SELLO VALVULA STRYKER125/...". La comparación es por
-- subcadena, así que:
--
--   buscar "sello"  encuentra "SELLO" y también "SELLOS"   ✓
--   buscar "sellos" NO encuentra "SELLO"                   ✗
--
-- El plural solo falla en UN sentido. Por eso la cura es quitarle la "s"
-- final a lo que se busca: la raíz sigue encontrando las dos formas. No
-- hace falta stemmer ni diccionario.
--
-- Se protege con length >= 5 para no tocar "tvs" (una marca), "gas" ni
-- "abs". Y aunque una palabra acabe en "s" sin ser plural, quitársela es
-- inofensivo: la raíz sigue siendo subcadena de la palabra completa.
--
-- >>> EL SEGUNDO CASO: CLOCHE NO ES CLUTCH <<<
-- Mismo día, misma conversación. El cliente pidió "discos de cloche" y el
-- centro bueno está catalogado como "CENTRO CLUTCH TVS 100/125 COMPLETO",
-- con SPORT 100 y STRYKER 125 enlazados. Tampoco salió:
--
--   mcp_buscar_piezas('discos de cloche tvs 100') -> 004022 NO aparece
--   mcp_buscar_piezas('discos de clutch tvs 100') -> 004022 SI aparece
--
-- Aquí la moto está bien, el modelo está bien y el precio está bien. Lo
-- que no coincide es la palabra: el cliente dice cloche, el catálogo dice
-- clutch. Eso no se arregla con reglas, se arregla con una lista que
-- crezca — y de dónde sacar candidatos ya existe: busquedas_catalogo
-- guarda las búsquedas que dieron CERO.
--
-- Lo mismo con "pitón", que aquí es el pistón. El producto que el dueño
-- trajo hoy de Morla Vieja se llama "PISTON Y ANILLA SPORT 100 STD": si un
-- cliente escribe pitón, sin esta lista no lo encuentra nunca.
--
-- >>> LO QUE ESTO NO ARREGLA <<<
-- Que Hermes no vea el catálogo de Morla Vieja. Eso va aparte.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La raíz: fuera la "s" del final
-- ---------------------------------------------------------------------
-- Las palabras vacías se filtran ANTES de cortar. Si se cortara primero,
-- "dias" se volvería "dia" y se escaparía de la lista de descarte.
CREATE OR REPLACE FUNCTION public._hermes_palabras(p_texto text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(array_agg(DISTINCT raiz), '{}')
  FROM (
    SELECT CASE
             WHEN length(p) >= 5 AND p LIKE '%s' THEN left(p, -1)
             ELSE p
           END AS raiz
    FROM (
      SELECT DISTINCT public._sin_tildes(unnest) AS p
      FROM unnest(regexp_split_to_array(COALESCE(p_texto, ''), '[^[:alnum:]]+'))
      WHERE (
          length(unnest) >= 3
          -- modelos cortos: g2, r6, x1. Dos caracteres, pero solo si mezclan
          -- letra y numero — asi entran los modelos y no entran "la" ni "el".
          OR (length(unnest) = 2 AND unnest ~ '[0-9]' AND unnest ~ '[[:alpha:]]')
        )
        AND public._sin_tildes(unnest) NOT IN (
          'hola','buenas','buenos','dias','tardes','noches','saludo','saludos',
          'que','como','para','por','con','del','las','los','una','uno',
          'tiene','tienen','tienes','hay','esta','este','esa','ese','eso','esto',
          'precio','cuanto','cuesta','vale','favor','gracias','usted','ustedes',
          'mande','manda','dime','decir','saber','quiero','necesito','busco','tengo',
          'ahi','alla','aqui','senor','amigo','hermano','lider',
          'okay','bien','claro','ver','tambien','pero','porque','cual','disponible'
        )
    ) x
  ) y;
$fn$;

-- ---------------------------------------------------------------------
-- 2) Cómo se dice aquí
-- ---------------------------------------------------------------------
-- tenant_id NULL = vale para todas las empresas. El dominicano de taller
-- es el mismo en Higüey que en Caminero; lo propio de una empresa se
-- guarda con su tenant.
CREATE TABLE IF NOT EXISTS public.busqueda_sinonimos (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid,
  palabra    text NOT NULL,
  equivale_a text NOT NULL,
  nota       text,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS busqueda_sinonimos_par_uq
  ON public.busqueda_sinonimos (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), palabra, equivale_a);

ALTER TABLE public.busqueda_sinonimos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS busqueda_sinonimos_lee ON public.busqueda_sinonimos;
CREATE POLICY busqueda_sinonimos_lee ON public.busqueda_sinonimos
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_user_tenant());

-- Solo lo que se puede demostrar con un caso real de hoy. Inventar
-- sinónimos "por si acaso" ensucia todas las búsquedas a cambio de nada;
-- los que faltan salen solos de busquedas_catalogo con cero resultados.
INSERT INTO public.busqueda_sinonimos (tenant_id, palabra, equivale_a, nota) VALUES
  (NULL, 'cloche',   'clutch', 'El cliente dice cloche; el catalogo dice CLUTCH. Caso 28/08: CENTRO CLUTCH TVS 100/125 no salia.'),
  (NULL, 'embrague', 'clutch', 'La otra forma de decirlo.'),
  (NULL, 'piton',    'piston', 'Pitón aqui es el piston. Caso 28/08: PISTON Y ANILLA SPORT 100 STD.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3) La búsqueda mira también los sinónimos
-- ---------------------------------------------------------------------
-- Lo unico que cambia respecto a la version anterior es el CTE `pal`: en
-- vez de las palabras peladas, las palabras MAS sus equivalencias, en los
-- dos sentidos (quien busca "clutch" tambien debe encontrar "CLOCHE").
CREATE OR REPLACE FUNCTION public.mcp_buscar_piezas(p_texto text, p_limite integer DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pal    text[];
  v_out    json;
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  v_pal := public._hermes_palabras(p_texto);
  IF array_length(v_pal, 1) IS NULL THEN
    RETURN json_build_object('busqueda', p_texto, 'palabras', '[]'::json, 'piezas', '[]'::json,
      'nota', 'No quedó ninguna palabra útil para buscar. Pide la pieza y el modelo de la motocicleta.');
  END IF;

  WITH pal_base AS (
    SELECT unnest(v_pal) AS palabra
  ), pal AS (
    SELECT palabra FROM pal_base
    UNION
    SELECT s.equivale_a FROM pal_base b
      JOIN public.busqueda_sinonimos s ON s.palabra = b.palabra
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
    UNION
    SELECT s.palabra FROM pal_base b
      JOIN public.busqueda_sinonimos s ON s.equivale_a = b.palabra
     WHERE s.tenant_id IS NULL OR s.tenant_id = v_tenant
  ), mod_hit AS (
    -- Qué modelos responden a cada palabra. Se resuelve UNA vez contra la
    -- tabla de modelos, que es chica, en vez de preguntárselo a los 5,369
    -- productos uno por uno.
    SELECT pal.palabra, mo.id
    FROM pal
    JOIN public.modelos mo
      ON public._sin_tildes(mo.nombre) LIKE '%' || pal.palabra || '%'
    WHERE mo.tenant_id = v_tenant
  ), cand AS (
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.ubicacion,
           p.modelo_id, p.modelos_ids, ma.nombre AS marca,
           public._sin_tildes(concat_ws(' ', p.descripcion, p.codigo, ma.nombre)) AS texto
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
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
  SELECT COALESCE(json_agg(y), '[]'::json) INTO v_out
  FROM (
    SELECT e.codigo, e.descripcion,
           round(COALESCE(e.precio, 0), 2) AS precio,
           e.existencia,
           NULLIF(btrim(COALESCE(e.ubicacion, '')), '') AS ubicacion,
           e.marca,
           NULLIF(public.get_nombres_modelos(e.modelos_ids), '') AS modelos
    FROM elegidas e
    ORDER BY e.puntos DESC, e.existencia DESC, e.descripcion
  ) y;

  v_n := COALESCE(json_array_length(v_out), 0);

  PERFORM public.registrar_busqueda('jarvis', p_texto, v_n);

  RETURN json_build_object('busqueda', p_texto, 'palabras', to_json(v_pal),
                           'encontradas', v_n, 'piezas', v_out);
END
$fn$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('una_s_de_mas_esconde_la_pieza.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Los dos casos de hoy, con las palabras EXACTAS que escribio el cliente.
-- Antes de esto ninguna de las dos piezas salia.
SELECT public._hermes_palabras('sellos de válvula del tv''s 100') AS raices_del_plural,
       public._hermes_palabras('discos de cloche')                AS raices_del_cloche;
