-- ============================================================
-- LOS EQUIVALENTES SE PROPONEN SOLOS
-- ============================================================
-- 3,803 articulos activos y 14 grupos hechos a mano en mas de un ano: el 1.3%
-- del catalogo. A ese ritmo no se termina nunca, y agrupar a mano es "demasiado
-- trabajo" — palabras del dueno.
--
-- >>> POR QUE EL SUGERIDOR VIEJO NO SIRVE <<<
-- `sugerir_grupos_por_similitud` compara la descripcion COMPLETA de cada
-- producto contra la de todos los demas: 3,803 x 3,803 = 14 millones de
-- comparaciones que `similarity()` no puede resolver por indice. Pedirle la
-- lista entera termina en `statement timeout` — comprobado. Y ademas:
--   · propone PAREJAS, no grupos: una goma en 6 marcas son 15 parejas y 15
--     grupitos de 2 en vez de uno de 6;
--   · compara CON la marca dentro, que es justo lo que hay que ignorar;
--   · descarta todo producto que ya este en un grupo, asi que no puede hacer
--     crecer los que ya existen;
--   · no recuerda nada: lo que se rechaza hoy vuelve manana.
--
-- >>> LA REGLA SALE DE SUS PROPIOS 14 GRUPOS <<<
--   428x118l              -> CADENA + 428 + 118, cinco marcas distintas
--   bateria 5 bajita      -> BATERIA + 5 + BAJITA, cinco marcas
--   TAPA LATERALES        -> la misma tapa en azul, verde y azul oscuro
--   120/70-12 GGMOTORS    -> la medida, escrita 120/70-12 y 120/70X12
-- Siempre lo mismo: MISMA PIEZA + MISMA MEDIDA; la marca y el color no cuentan.
--
-- >>> LAS DOS SENALES <<<
-- A) DESCRIPCION LIMPIA. Se le quita la marca (sacada de la tabla `marcas` del
--    propio tenant, no de una lista inventada), el color y el relleno
--    (COMPLETO, ORIGINAL, UND...), y se normalizan las medidas: 100/90-10,
--    100-90-10 y 100/90X10 son la misma. Lo que queda es la clave.
-- B) REFERENCIA NORMALIZADA. 428HX118L-E y 428HX118L-VI son la misma pieza con
--    sufijo de marca. Sola es sucia (hay 13 productos distintos cuya
--    referencia es literalmente "AX100"), asi que solo vale si TAMBIEN coincide
--    el nombre de la pieza.
--
-- >>> EL GUARDIAN <<<
-- Hay palabras que NIEGAN la equivalencia: delantero/trasero, izquierdo/
-- derecho, alta/bajita, corto/largo, macho/hembra. Si una pieza dice una y la
-- otra dice su contraria, no se proponen aunque todo lo demas cuadre. Eso es lo
-- que evita el par "PLACA TRASERA NAVI + PLACA DELANTERA NAVI" que salio en las
-- pruebas.
--
-- >>> LO QUE ESTE ARCHIVO DEJA PUESTO <<<
--   FASE 1  El motor (recalcular_sugerencias_equivalentes) y las propuestas,
--           con la senal, la confianza y lo que mueve cada grupo.
--   FASE 2  Memoria: lo rechazado no vuelve, y un producto se puede sumar a un
--           grupo que YA existe (el sugeridor viejo ni lo intentaba).
--   FASE 3  Se mantiene solo: recalculo nocturno para todas las empresas.
--
-- NADA SE AGRUPA SOLO. Esto propone; el dueno confirma, edita o rechaza.
-- ============================================================

SELECT public.registrar_migracion('los_equivalentes_se_proponen_solos.sql');

-- ============================================================
-- Vocabulario ajustable (sin desplegar codigo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equivalencia_vocabulario (
  id        BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,  -- NULL = para todas
  palabra   TEXT NOT NULL,
  clase     TEXT NOT NULL CHECK (clase IN ('relleno', 'color')),
  UNIQUE (tenant_id, palabra)
);

COMMENT ON TABLE public.equivalencia_vocabulario IS
  'Palabras que NO distinguen una pieza de otra: relleno (COMPLETO, ORIGINAL) y colores. Se descartan al armar la clave de equivalencia.';

CREATE TABLE IF NOT EXISTS public.equivalencia_opuestos (
  id        BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  familia   TEXT NOT NULL,
  lado      CHAR(1) NOT NULL CHECK (lado IN ('a', 'b')),
  palabra   TEXT NOT NULL,
  UNIQUE (tenant_id, familia, palabra)
);

COMMENT ON TABLE public.equivalencia_opuestos IS
  'Palabras que NIEGAN la equivalencia, agrupadas por familia y lado. Se guarda por LADO y no por parejas porque el cruce existe: una pieza dice DELANTERO y la otra TRASERA (masculino contra femenino) y esa pareja no estaria en una lista de duplas.';

INSERT INTO public.equivalencia_vocabulario (tenant_id, palabra, clase)
SELECT NULL, w, 'relleno' FROM unnest(ARRAY[
  'COMPLETO','COMPLETA','COMPLETOS','COMPLETAS','ORIGINAL','ORIGINALES','ORG','ORIG',
  'UNIDAD','UND','UNID','DEL','LOS','LAS','CON','SIN','PARA','POR','TIPO','MOD',
  'MODELO','ESTILO','NUEVO','NUEVA'
]) w
ON CONFLICT DO NOTHING;

INSERT INTO public.equivalencia_vocabulario (tenant_id, palabra, clase)
SELECT NULL, w, 'color' FROM unnest(ARRAY[
  'NEGRO','NEGRA','BLANCO','BLANCA','ROJO','ROJA','AZUL','VERDE','AMARILLO','AMARILLA',
  'DORADO','DORADA','GRIS','MARRON','MORADO','MORADA','NARANJA','PLATEADO','PLATEADA',
  'CROMADO','CROMADA','NIQUELADO','NIQUELADA','CLEAR','AHUMADO','AHUMADA','COLORES','COLOR'
]) w
ON CONFLICT DO NOTHING;

INSERT INTO public.equivalencia_opuestos (tenant_id, familia, lado, palabra)
SELECT NULL, v.familia, v.lado, w
FROM (VALUES
  ('posicion', 'a', ARRAY['DELANTERO','DELANTERA','DELANTEROS','DELANTERAS','DELT','DELANT']),
  ('posicion', 'b', ARRAY['TRASERO','TRASERA','TRASEROS','TRASERAS','TRAS','TRACERO','TRACERA']),
  ('lado',     'a', ARRAY['IZQUIERDO','IZQUIERDA','IZQ','LH']),
  ('lado',     'b', ARRAY['DERECHO','DERECHA','DER','RH']),
  ('altura',   'a', ARRAY['ALTA','ALTO']),
  ('altura',   'b', ARRAY['BAJITA','BAJITO','BAJA','BAJO']),
  ('sexo',     'a', ARRAY['MACHO']),
  ('sexo',     'b', ARRAY['HEMBRA']),
  ('largo',    'a', ARRAY['CORTO','CORTA']),
  ('largo',    'b', ARRAY['LARGO','LARGA']),
  ('flujo',    'a', ARRAY['ENTRADA','ADMISION']),
  ('flujo',    'b', ARRAY['SALIDA','ESCAPE']),
  ('cara',     'a', ARRAY['INTERNO','INTERNA','INTERIOR']),
  ('cara',     'b', ARRAY['EXTERNO','EXTERNA','EXTERIOR']),
  ('nivel',    'a', ARRAY['SUPERIOR','ARRIBA']),
  ('nivel',    'b', ARRAY['INFERIOR','ABAJO']),
  ('cuerpo',   'a', ARRAY['MACIZO','MACIZA']),
  ('cuerpo',   'b', ARRAY['TUBULAR','TUBELESS'])
) v(familia, lado, palabras)
CROSS JOIN LATERAL unnest(v.palabras) w
ON CONFLICT DO NOTHING;

ALTER TABLE public.equivalencia_vocabulario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equivalencia_opuestos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eq_voc_select ON public.equivalencia_vocabulario;
CREATE POLICY eq_voc_select ON public.equivalencia_vocabulario
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS eq_opu_select ON public.equivalencia_opuestos;
CREATE POLICY eq_opu_select ON public.equivalencia_opuestos
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_user_tenant());

-- ============================================================
-- FASE 2 — Lo que el dueno dijo que NO, no vuelve
-- ============================================================
CREATE TABLE IF NOT EXISTS public.producto_grupo_rechazos (
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_a UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  producto_b UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  motivo     TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, producto_a, producto_b),
  CONSTRAINT rechazo_ordenado CHECK (producto_a < producto_b)
);

COMMENT ON TABLE public.producto_grupo_rechazos IS
  'Parejas que el dueno dijo que NO son equivalentes. El motor no las vuelve a proponer nunca.';

ALTER TABLE public.producto_grupo_rechazos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eq_rech_todo ON public.producto_grupo_rechazos;
CREATE POLICY eq_rech_todo ON public.producto_grupo_rechazos
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ============================================================
-- FASE 1 — Las propuestas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.producto_grupo_sugerencias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  senal         TEXT NOT NULL CHECK (senal IN ('descripcion', 'referencia', 'ambas')),
  confianza     INT  NOT NULL DEFAULT 0,
  grupo_id      UUID REFERENCES public.producto_grupos(id) ON DELETE CASCADE,
  vendidas_180d NUMERIC NOT NULL DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'confirmada', 'rechazada')),
  calculada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelta_at   TIMESTAMPTZ,
  resuelta_por  UUID
);

COMMENT ON COLUMN public.producto_grupo_sugerencias.grupo_id IS
  'Si viene lleno, la propuesta no es un grupo nuevo: es sumar piezas a este grupo que ya existe.';

CREATE TABLE IF NOT EXISTS public.producto_grupo_sugerencia_miembros (
  sugerencia_id UUID NOT NULL REFERENCES public.producto_grupo_sugerencias(id) ON DELETE CASCADE,
  producto_id   UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  ya_en_grupo   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (sugerencia_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_eq_sug_tenant_estado
  ON public.producto_grupo_sugerencias(tenant_id, estado, vendidas_180d DESC);

ALTER TABLE public.producto_grupo_sugerencias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_grupo_sugerencia_miembros   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eq_sug_todo ON public.producto_grupo_sugerencias;
CREATE POLICY eq_sug_todo ON public.producto_grupo_sugerencias
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS eq_sugm_todo ON public.producto_grupo_sugerencia_miembros;
CREATE POLICY eq_sugm_todo ON public.producto_grupo_sugerencia_miembros
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.producto_grupo_sugerencias s
                  WHERE s.id = sugerencia_id AND s.tenant_id = public.get_user_tenant()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.producto_grupo_sugerencias s
                       WHERE s.id = sugerencia_id AND s.tenant_id = public.get_user_tenant()));

-- ============================================================
-- EL MOTOR
-- ============================================================
-- Todo pasa por tablas TEMPORALES con indice. Es la diferencia entre correr en
-- segundos y morir por timeout como el sugeridor viejo: los tokens se calculan
-- UNA vez, no una vez por cada comparacion.
CREATE OR REPLACE FUNCTION public.recalcular_sugerencias_equivalentes(
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  UUID := COALESCE(p_tenant_id, public.get_user_tenant());
  v_vueltas INT := 0;
  v_cambios INT;
  v_grupos  INT := 0;
  v_prod    INT := 0;
  v_comp    RECORD;
  v_sug_id  UUID;
  v_descartados INT := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'sin empresa');
  END IF;

  -- ── 1. Los tokens de cada descripcion, ya limpios ──
  CREATE TEMP TABLE _eq_tok ON COMMIT DROP AS
  WITH marcas_voc AS (
    SELECT DISTINCT upper(public._sin_tildes(w)) w
    FROM public.marcas m
    CROSS JOIN LATERAL unnest(regexp_split_to_array(m.nombre, '[^A-Za-z0-9]+')) w
    WHERE m.tenant_id = v_tenant AND length(w) >= 2
  ),
  fuera AS (
    SELECT upper(public._sin_tildes(palabra)) w
    FROM public.equivalencia_vocabulario
    WHERE tenant_id IS NULL OR tenant_id = v_tenant
  ),
  -- INTOCABLES. Sale de un caso real: en la tabla de marcas hay nombres que
  -- contienen "DELANTERA" y "TRASERA", asi que el vocabulario de marcas se
  -- comia esas dos palabras, las dos placas quedaban con la misma clave y el
  -- guardian ya no tenia que mirar. Una palabra que NIEGA la equivalencia no
  -- la borra nadie.
  intocables AS (
    SELECT upper(public._sin_tildes(palabra)) w
    FROM public.equivalencia_opuestos
    WHERE tenant_id IS NULL OR tenant_id = v_tenant
  ),
  base AS (
    SELECT p.id,
           regexp_replace(upper(public._sin_tildes(COALESCE(p.descripcion, ''))),
                          '(?<=[0-9])X(?=[0-9])', '/', 'g') d
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.activo
  )
  SELECT b.id AS producto_id, u.w, u.o
  FROM base b,
  LATERAL unnest(regexp_split_to_array(b.d, '[^A-Z0-9/.,-]+')) WITH ORDINALITY AS u(w, o)
  WHERE u.w <> ''
    AND (length(u.w) >= 2 OR u.w ~ '[0-9]')
    AND (
      EXISTS (SELECT 1 FROM intocables i WHERE i.w = u.w)
      OR (NOT EXISTS (SELECT 1 FROM marcas_voc mv WHERE mv.w = u.w)
      AND NOT EXISTS (SELECT 1 FROM fuera f WHERE f.w = u.w))
    );

  CREATE INDEX ON _eq_tok (producto_id);
  CREATE INDEX ON _eq_tok (w);

  -- ── 2. La clave de cada producto ──
  CREATE TEMP TABLE _eq_clave ON COMMIT DROP AS
  WITH agg AS (
    SELECT t.producto_id,
           string_agg(DISTINCT CASE WHEN t.w !~ '[0-9]' THEN t.w END, ' '
                      ORDER BY CASE WHEN t.w !~ '[0-9]' THEN t.w END) AS palabras,
           string_agg(DISTINCT CASE WHEN t.w ~ '[0-9]'
                                    THEN regexp_replace(t.w, '[^A-Z0-9]', '', 'g') END, '+'
                      ORDER BY CASE WHEN t.w ~ '[0-9]'
                                    THEN regexp_replace(t.w, '[^A-Z0-9]', '', 'g') END) AS specs
    FROM _eq_tok t GROUP BY t.producto_id
  ),
  cabeza AS (
    SELECT DISTINCT ON (producto_id) producto_id, w
    FROM _eq_tok WHERE w !~ '[0-9]' ORDER BY producto_id, o
  )
  SELECT p.id AS producto_id,
         COALESCE(a.palabras, '') || ' | ' || COALESCE(a.specs, '') AS k_desc,
         regexp_replace(
           regexp_replace(upper(public._sin_tildes(COALESCE(p.referencia, ''))), '-[A-Z]{1,3}$', ''),
           '[^A-Z0-9]', '', 'g') AS k_ref,
         c.w AS cabeza
  FROM public.productos p
  JOIN agg a ON a.producto_id = p.id
  LEFT JOIN cabeza c ON c.producto_id = p.id
  WHERE p.tenant_id = v_tenant AND p.activo
    AND COALESCE(a.palabras, '') <> '';

  CREATE INDEX ON _eq_clave (k_desc);
  CREATE INDEX ON _eq_clave (k_ref, cabeza);

  -- ── 3. Las parejas candidatas ──
  CREATE TEMP TABLE _eq_par ON COMMIT DROP AS
  SELECT a.producto_id AS ida, b.producto_id AS idb, 'descripcion'::text AS via
  FROM _eq_clave a JOIN _eq_clave b
    ON b.k_desc = a.k_desc AND a.producto_id < b.producto_id
  UNION
  SELECT a.producto_id, b.producto_id, 'referencia'
  FROM _eq_clave a JOIN _eq_clave b
    ON b.k_ref = a.k_ref AND b.cabeza = a.cabeza AND a.producto_id < b.producto_id
  -- Una referencia SIN NINGUN digito no es un codigo, es una palabra: "FORRO"
  -- juntaba el forro del tanque con el del asiento. Tiene que traer numero.
  WHERE length(a.k_ref) >= 4 AND a.k_ref ~ '[0-9]' AND a.cabeza IS NOT NULL;

  -- ── 4. El guardian: las palabras contrarias rompen la pareja ──
  DELETE FROM _eq_par p
  WHERE EXISTS (
    SELECT 1
    FROM public.equivalencia_opuestos oa
    JOIN public.equivalencia_opuestos ob
      ON ob.familia = oa.familia AND ob.lado <> oa.lado
     AND (ob.tenant_id IS NULL OR ob.tenant_id = v_tenant)
    JOIN _eq_tok ta ON ta.producto_id = p.ida AND ta.w = oa.palabra
    JOIN _eq_tok tb ON tb.producto_id = p.idb AND tb.w = ob.palabra
    WHERE (oa.tenant_id IS NULL OR oa.tenant_id = v_tenant)
  );

  -- ── 5. Lo ya dicho: rechazos y parejas que ya viven en el mismo grupo ──
  DELETE FROM _eq_par p
  WHERE EXISTS (
    SELECT 1 FROM public.producto_grupo_rechazos r
     WHERE r.tenant_id = v_tenant AND r.producto_a = p.ida AND r.producto_b = p.idb
  );

  DELETE FROM _eq_par p
  WHERE EXISTS (
    SELECT 1
    FROM public.producto_grupo_miembros ma
    JOIN public.producto_grupo_miembros mb ON mb.grupo_id = ma.grupo_id
    WHERE ma.producto_id = p.ida AND mb.producto_id = p.idb
  );

  -- ── 6. De parejas a GRUPOS: se propaga la etiqueta mas chica ──
  CREATE TEMP TABLE _eq_lider ON COMMIT DROP AS
  SELECT x.id AS nodo, x.id AS lider
  FROM (SELECT ida AS id FROM _eq_par UNION SELECT idb FROM _eq_par) x;

  CREATE INDEX ON _eq_lider (nodo);
  CREATE INDEX ON _eq_lider (lider);

  CREATE TEMP TABLE _eq_bi ON COMMIT DROP AS
  SELECT ida AS a, idb AS b FROM _eq_par UNION ALL SELECT idb, ida FROM _eq_par;
  CREATE INDEX ON _eq_bi (a);

  LOOP
    v_vueltas := v_vueltas + 1;
    WITH mejor AS (
      SELECT l.nodo,
             LEAST(l.lider::text, COALESCE(min(l2.lider::text), l.lider::text))::uuid AS nuevo
      FROM _eq_lider l
      LEFT JOIN _eq_bi ON _eq_bi.a = l.nodo
      LEFT JOIN _eq_lider l2 ON l2.nodo = _eq_bi.b
      GROUP BY l.nodo, l.lider
    )
    UPDATE _eq_lider l SET lider = m.nuevo
      FROM mejor m WHERE m.nodo = l.nodo AND m.nuevo <> l.lider;
    GET DIAGNOSTICS v_cambios = ROW_COUNT;
    EXIT WHEN v_cambios = 0 OR v_vueltas >= 30;
  END LOOP;

  -- ── 6b. El guardian, otra vez, pero mirando el GRUPO entero ──
  -- Cortar las parejas directas no basta: la propagacion puede unir una pieza
  -- delantera con una trasera a traves de una tercera que no dice ni una cosa
  -- ni la otra. Un grupo con esa contradiccion dentro no se propone — antes
  -- que soltar un disparate, se deja para la mano. (En Morla: 1 de 400.)
  CREATE TEMP TABLE _eq_malo ON COMMIT DROP AS
  SELECT DISTINCT la.lider
  FROM _eq_lider la
  JOIN _eq_lider lb ON lb.lider = la.lider AND lb.nodo <> la.nodo
  JOIN public.equivalencia_opuestos oa
    ON (oa.tenant_id IS NULL OR oa.tenant_id = v_tenant)
  JOIN public.equivalencia_opuestos ob
    ON ob.familia = oa.familia AND ob.lado <> oa.lado
   AND (ob.tenant_id IS NULL OR ob.tenant_id = v_tenant)
  JOIN _eq_tok ta ON ta.producto_id = la.nodo AND ta.w = oa.palabra
  JOIN _eq_tok tb ON tb.producto_id = lb.nodo AND tb.w = ob.palabra;

  SELECT count(*) INTO v_descartados FROM _eq_malo;

  DELETE FROM _eq_lider l
   WHERE EXISTS (SELECT 1 FROM _eq_malo m WHERE m.lider = l.lider);

  -- ── 7. Se borran las propuestas pendientes viejas y se escriben las nuevas ──
  -- Una por una a proposito: cada propuesta necesita saber EXACTAMENTE cuales
  -- son sus piezas, y casarlas despues por el nombre seria adivinar.
  DELETE FROM public.producto_grupo_sugerencias
   WHERE tenant_id = v_tenant AND estado = 'pendiente';

  FOR v_comp IN
    SELECT l.lider,
           count(*) AS n,
           (SELECT m.grupo_id
              FROM _eq_lider l2
              JOIN public.producto_grupo_miembros m ON m.producto_id = l2.nodo
             WHERE l2.lider = l.lider
             GROUP BY m.grupo_id ORDER BY count(*) DESC LIMIT 1) AS grupo_id,
           (SELECT p.descripcion
              FROM _eq_lider l3 JOIN public.productos p ON p.id = l3.nodo
             WHERE l3.lider = l.lider
             ORDER BY length(p.descripcion) LIMIT 1) AS nombre,
           (SELECT COALESCE(sum(fd.cantidad), 0)
              FROM _eq_lider l4
              JOIN public.facturas_detalle fd ON fd.producto_id = l4.nodo
              JOIN public.facturas f ON f.id = fd.factura_id
             WHERE l4.lider = l.lider
               AND f.fecha >= current_date - 180
               AND COALESCE(f.estado, '') <> 'Anulada') AS vendidas,
           (SELECT count(DISTINCT pa.via)
              FROM _eq_par pa JOIN _eq_lider l5 ON l5.nodo = pa.ida
             WHERE l5.lider = l.lider) AS vias,
           (SELECT bool_or(pa.via = 'descripcion')
              FROM _eq_par pa JOIN _eq_lider l6 ON l6.nodo = pa.ida
             WHERE l6.lider = l.lider) AS tiene_desc,
           (SELECT count(DISTINCT p.tipo_id)
              FROM _eq_lider l7 JOIN public.productos p ON p.id = l7.nodo
             WHERE l7.lider = l.lider) AS tipos
    FROM _eq_lider l
    GROUP BY l.lider
    HAVING count(*) > 1
  LOOP
    INSERT INTO public.producto_grupo_sugerencias
          (tenant_id, nombre, senal, confianza, grupo_id, vendidas_180d)
    VALUES (
      v_tenant,
      left(COALESCE(v_comp.nombre, 'Equivalentes'), 60),
      CASE WHEN v_comp.vias > 1 THEN 'ambas'
           WHEN v_comp.tiene_desc THEN 'descripcion'
           ELSE 'referencia' END,
      LEAST(99, GREATEST(10,
        CASE WHEN v_comp.vias > 1 THEN 95 WHEN v_comp.tiene_desc THEN 85 ELSE 65 END
        + CASE WHEN v_comp.tipos = 1 THEN 5 ELSE -10 END)),
      v_comp.grupo_id,
      v_comp.vendidas
    )
    RETURNING id INTO v_sug_id;

    INSERT INTO public.producto_grupo_sugerencia_miembros (sugerencia_id, producto_id, ya_en_grupo)
    SELECT v_sug_id, l.nodo,
           EXISTS (SELECT 1 FROM public.producto_grupo_miembros m WHERE m.producto_id = l.nodo)
      FROM _eq_lider l
     WHERE l.lider = v_comp.lider
    ON CONFLICT DO NOTHING;

    v_grupos := v_grupos + 1;
    v_prod := v_prod + v_comp.n;
  END LOOP;

  RETURN jsonb_build_object(
    'grupos', v_grupos, 'productos', v_prod, 'vueltas', v_vueltas,
    'descartados_por_contradiccion', v_descartados,
    'calculado_at', now()
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.recalcular_sugerencias_equivalentes(UUID) TO authenticated;

-- ============================================================
-- Leer las propuestas
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_sugerencias_equivalentes(p_limite INT DEFAULT 200)
RETURNS TABLE (
  id            UUID,
  nombre        TEXT,
  senal         TEXT,
  confianza     INT,
  grupo_id      UUID,
  grupo_nombre  TEXT,
  vendidas_180d NUMERIC,
  calculada_at  TIMESTAMPTZ,
  miembros      JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT s.id, s.nombre, s.senal, s.confianza, s.grupo_id, g.nombre,
         s.vendidas_180d, s.calculada_at,
         (SELECT jsonb_agg(jsonb_build_object(
                   'producto_id', p.id,
                   'codigo',      p.codigo,
                   'descripcion', p.descripcion,
                   'marca',       ma.nombre,
                   'referencia',  p.referencia,
                   'precio',      p.precio,
                   'costo',       p.costo,
                   'ya_en_grupo', m.ya_en_grupo
                 ) ORDER BY p.descripcion)
            FROM public.producto_grupo_sugerencia_miembros m
            JOIN public.productos p ON p.id = m.producto_id
            LEFT JOIN public.marcas ma ON ma.id = p.marca_id
           WHERE m.sugerencia_id = s.id) AS miembros
  FROM public.producto_grupo_sugerencias s
  LEFT JOIN public.producto_grupos g ON g.id = s.grupo_id
  WHERE s.tenant_id = public.get_user_tenant()
    AND s.estado = 'pendiente'
  ORDER BY s.vendidas_180d DESC, s.confianza DESC, s.nombre
  LIMIT COALESCE(p_limite, 200);
$fn$;

GRANT EXECUTE ON FUNCTION public.get_sugerencias_equivalentes(INT) TO authenticated;

-- ============================================================
-- Confirmar (con lo que el dueno haya destildado)
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirmar_sugerencia_equivalentes(
  p_sugerencia_id UUID,
  p_producto_ids  UUID[] DEFAULT NULL,   -- NULL = todos los propuestos
  p_nombre        TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  UUID := public.get_user_tenant();
  v_sug     public.producto_grupo_sugerencias%ROWTYPE;
  v_grupo   UUID;
  v_ids     UUID[];
  v_fuera   UUID[];
  v_puestos INT := 0;
  v_ajenos  INT := 0;
BEGIN
  SELECT * INTO v_sug FROM public.producto_grupo_sugerencias
   WHERE id = p_sugerencia_id AND tenant_id = v_tenant AND estado = 'pendiente';

  IF v_sug.id IS NULL THEN
    RAISE EXCEPTION 'Esa sugerencia ya no esta pendiente o no es de esta empresa.';
  END IF;

  SELECT COALESCE(p_producto_ids,
                  array_agg(m.producto_id))
    INTO v_ids
    FROM public.producto_grupo_sugerencia_miembros m
   WHERE m.sugerencia_id = p_sugerencia_id;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Un grupo necesita al menos 2 piezas.';
  END IF;

  -- Lo que se dejo fuera es una ENSENANZA, no un descarte silencioso: esas
  -- piezas no se vuelven a proponer con las que si quedaron dentro.
  SELECT array_agg(m.producto_id) INTO v_fuera
    FROM public.producto_grupo_sugerencia_miembros m
   WHERE m.sugerencia_id = p_sugerencia_id
     AND NOT (m.producto_id = ANY (v_ids));

  IF v_sug.grupo_id IS NOT NULL THEN
    v_grupo := v_sug.grupo_id;
  ELSE
    INSERT INTO public.producto_grupos (tenant_id, nombre, descripcion)
    VALUES (v_tenant, COALESCE(NULLIF(trim(p_nombre), ''), v_sug.nombre),
            format('Propuesto por el sistema (%s, %s%% de confianza)', v_sug.senal, v_sug.confianza))
    RETURNING id INTO v_grupo;
  END IF;

  -- `producto_grupo_miembros` tiene el producto como LLAVE: una pieza vive en
  -- un solo grupo. A la que ya esta en OTRO grupo no se le toca — mover cosas
  -- por detras vaciaria grupos que el dueno armo a mano. Se cuenta y se avisa.
  SELECT count(*) INTO v_ajenos
    FROM unnest(v_ids) x(id)
    JOIN public.producto_grupo_miembros m ON m.producto_id = x.id
   WHERE m.grupo_id <> v_grupo;

  WITH nuevos AS (
    INSERT INTO public.producto_grupo_miembros (grupo_id, producto_id, prioridad)
    SELECT v_grupo, x.id, 1 FROM unnest(v_ids) x(id)
    ON CONFLICT (producto_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_puestos FROM nuevos;

  IF v_fuera IS NOT NULL THEN
    INSERT INTO public.producto_grupo_rechazos (tenant_id, producto_a, producto_b, motivo, created_by)
    SELECT v_tenant, LEAST(a.id::text, b.id::text)::uuid, GREATEST(a.id::text, b.id::text)::uuid,
           'destildado al confirmar', auth.uid()
    FROM unnest(v_fuera) a(id), unnest(v_ids) b(id)
    WHERE a.id <> b.id
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.producto_grupo_sugerencias
     SET estado = 'confirmada', resuelta_at = now(), resuelta_por = auth.uid()
   WHERE id = p_sugerencia_id;

  RETURN jsonb_build_object(
    'grupo_id',   v_grupo,
    'agregados',  v_puestos,
    'ya_en_otro', v_ajenos,
    'nuevo',      (v_sug.grupo_id IS NULL)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.confirmar_sugerencia_equivalentes(UUID, UUID[], TEXT) TO authenticated;

-- ============================================================
-- Rechazar — y que no vuelva
-- ============================================================
CREATE OR REPLACE FUNCTION public.rechazar_sugerencia_equivalentes(p_sugerencia_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant UUID := public.get_user_tenant();
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.producto_grupo_sugerencias
                  WHERE id = p_sugerencia_id AND tenant_id = v_tenant AND estado = 'pendiente') THEN
    RAISE EXCEPTION 'Esa sugerencia ya no esta pendiente o no es de esta empresa.';
  END IF;

  INSERT INTO public.producto_grupo_rechazos (tenant_id, producto_a, producto_b, motivo, created_by)
  SELECT v_tenant,
         LEAST(a.producto_id::text, b.producto_id::text)::uuid,
         GREATEST(a.producto_id::text, b.producto_id::text)::uuid,
         'no son iguales', auth.uid()
  FROM public.producto_grupo_sugerencia_miembros a
  JOIN public.producto_grupo_sugerencia_miembros b
    ON b.sugerencia_id = a.sugerencia_id AND a.producto_id < b.producto_id
  WHERE a.sugerencia_id = p_sugerencia_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.producto_grupo_sugerencias
     SET estado = 'rechazada', resuelta_at = now(), resuelta_por = auth.uid()
   WHERE id = p_sugerencia_id;

  RETURN n;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rechazar_sugerencia_equivalentes(UUID) TO authenticated;

-- ============================================================
-- FASE 3 — Que se mantenga solo
-- ============================================================
-- Cada noche, para toda empresa con catalogo. Un producto nuevo que caiga en la
-- clave de un grupo existente sale como "sumar a este grupo", de un clic.
CREATE OR REPLACE FUNCTION public.cron_sugerencias_equivalentes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r      RECORD;
  res    JSONB;
  total  JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT t.id, t.nombre
    FROM public.tenants t
    WHERE EXISTS (SELECT 1 FROM public.productos p
                   WHERE p.tenant_id = t.id AND p.activo LIMIT 1)
      -- Las empresas VIEJAS son catalogo congelado de solo consulta: ahi no se
      -- compra nada, asi que agrupar equivalentes no le sirve a nadie.
      AND NOT EXISTS (SELECT 1 FROM public.config_empresa c
                       WHERE c.tenant_id = t.id AND c.solo_consulta)
  LOOP
    BEGIN
      res := public.recalcular_sugerencias_equivalentes(r.id);
      total := total || jsonb_build_object('empresa', r.nombre, 'resultado', res);
    EXCEPTION WHEN OTHERS THEN
      -- Que una empresa falle no puede dejar a las demas sin recalcular.
      total := total || jsonb_build_object('empresa', r.nombre, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN total;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.cron_sugerencias_equivalentes() TO service_role;

SELECT cron.schedule(
  'sugerencias-equivalentes',
  '20 7 * * *',
  $cron$SELECT public.cron_sugerencias_equivalentes();$cron$
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sugerencias-equivalentes');

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — contra el catalogo de verdad
-- ============================================================
-- Solo revienta si falla: este archivo crea tablas y datos.
DO $prueba$
DECLARE
  v_tenant  UUID;
  v_res     JSONB;
  v_grupos  INT;
  v_ruido   INT;
BEGIN
  -- La empresa con mas catalogo VIVO (la vieja es archivo de solo consulta).
  SELECT p.tenant_id INTO v_tenant
    FROM public.productos p
   WHERE p.activo
     AND NOT EXISTS (SELECT 1 FROM public.config_empresa c
                      WHERE c.tenant_id = p.tenant_id AND c.solo_consulta)
   GROUP BY p.tenant_id ORDER BY count(*) DESC LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'No hay catalogo en ninguna empresa. Motor instalado igual.';
    RETURN;
  END IF;

  v_res := public.recalcular_sugerencias_equivalentes(v_tenant);
  v_grupos := (v_res->>'grupos')::int;

  IF COALESCE(v_grupos, 0) = 0 THEN
    RAISE EXCEPTION 'El motor no propuso ni un grupo para la empresa % — algo quedo mal.', v_tenant;
  END IF;

  -- El guardian tiene que estar haciendo su trabajo: NINGUNA propuesta puede
  -- juntar una pieza delantera con una trasera.
  SELECT count(*) INTO v_ruido
  FROM public.producto_grupo_sugerencias s
  JOIN public.producto_grupo_sugerencia_miembros ma ON ma.sugerencia_id = s.id
  -- Dos piezas DISTINTAS: una sola descripcion puede decir "DELANTERO/TRASERO"
  -- (un farol que sirve para los dos) y eso no es ninguna contradiccion.
  JOIN public.producto_grupo_sugerencia_miembros mb
    ON mb.sugerencia_id = s.id AND mb.producto_id <> ma.producto_id
  JOIN public.productos pa ON pa.id = ma.producto_id
  JOIN public.productos pb ON pb.id = mb.producto_id
  WHERE s.tenant_id = v_tenant AND s.estado = 'pendiente'
    AND upper(public._sin_tildes(pa.descripcion)) ~ '\mDELANTER[AO]\M'
    AND upper(public._sin_tildes(pb.descripcion)) ~ '\mTRASER[AO]\M';

  IF v_ruido > 0 THEN
    RAISE EXCEPTION 'El guardian fallo: % propuestas juntan una pieza delantera con una trasera.', v_ruido;
  END IF;

  RAISE NOTICE 'Propuestas: % grupos, % productos, % vueltas. Guardian OK.',
    v_res->>'grupos', v_res->>'productos', v_res->>'vueltas';
END $prueba$;
