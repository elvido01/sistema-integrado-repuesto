-- ============================================================
-- EL COLOR NO ES OTRO REPUESTO, PERO TAMPOCO ES EL MISMO
-- ============================================================
-- El dueno abrio esta propuesta y vio el problema antes que nadie:
--     GAX046-NG  TANQUE AX100 Y TAPA NEGRO GTS      3 vend  3 exist
--     GAX046-AZ  TANQUE AX100 AZUL CON TAPA GTS     0 vend  0 exist
-- Y dijo: <<en esencia es el mismo producto pero de colores diferentes y es
-- algo comun. Pero si lo agrupo el sistema entendera que tengo existencia y no
-- me sugerira comprar el otro color.>>
--
-- Tiene toda la razon, y no era una sospecha: es lo que la orden automatica
-- hace hoy. `get_productos_para_orden_automatica` agrupa por BUCKET, y el
-- bucket es el grupo de equivalentes:
--     bucket_id    = COALESCE(grupo_id, producto_id)
--     stock_bucket = SUM(existencia de TODOS los miembros)
--     ... WHERE stock_bucket + en_camino <= punto_reorden
-- O sea: la existencia del NEGRO tapa al AZUL y el azul ni siquiera aparece en
-- la orden. Y despues la v2 remata: <<Grupo ya tiene N dias de stock>> -> 0.
--
-- >>> CUANTO PESA ESTO (Repuestos Morla, medido) <<<
--   144 grupos, de los cuales  30 mezclan colores  (122 piezas dentro)
--    28 piezas estan HOY en cero con un companero de otro color que si tiene
--    53 de las 202 propuestas pendientes son tambien mezcla de colores
-- Grupos ya confirmados que estan asi: PORTA PLACA RACING G376 (5 colores),
-- CONO DEL. MODERNO R3 (4), ESPEJOS FIRE RACING (4), ALFOMBRA ADDRESS (3)...
--
-- >>> LA IDEA <<<
-- El grupo de colores SI vale — para VENDER. Si no hay negro y hay azul, el
-- mostrador tiene que verlo. Lo que no vale es sumar la existencia para
-- COMPRAR: un tanque azul no repone un tanque negro, el cliente vino por el
-- suyo. Asi que el grupo pasa a tener dos comportamientos:
--
--   combina_stock = true   equivalentes de verdad (marcas distintas de la
--                          misma pieza). Se sirven uno por otro y la
--                          existencia se suma al comprar. Como hasta hoy.
--   combina_stock = false  variantes: mismo repuesto, otro color. Se ofrecen
--                          entre si al vender, pero CADA COLOR SE COMPRA POR
--                          SU CUENTA.
--
-- >>> UNA DECISION A PROPOSITO <<<
-- Cuando una pieza dice un color y la otra no (TANQUE ... NEGRO vs TANQUE
-- ...), el color MANDA sobre el parecido: se marca variante y no se propone
-- fusionar. Equivocarse hacia el otro lado apagaria un color entero del
-- catalogo, y eso no se deshace solo.
-- ============================================================

SELECT public.registrar_migracion('el_color_no_es_un_repuesto_distinto.sql');

-- ============================================================
-- La marca en el grupo
-- ============================================================
ALTER TABLE public.producto_grupos
  ADD COLUMN IF NOT EXISTS combina_stock BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.producto_grupos.combina_stock IS
  'true = equivalentes de verdad: la existencia de todo el grupo se suma al calcular la compra. false = variantes (mismo repuesto en otro color): sirven para ofrecerse al vender, pero cada uno se compra por su cuenta.';

-- ============================================================
-- Que colores dice una descripcion
-- ============================================================
-- El vocabulario de colores ya existe (se usa para BORRAR el color al armar la
-- clave de equivalencia — por eso NEGRO y AZUL se parecieron tanto). Aqui se
-- usa al reves: para saber en que se diferencian.
CREATE OR REPLACE FUNCTION public._eq_colores(p_texto TEXT, p_tenant UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT array_agg(DISTINCT v.w)
  FROM (
    SELECT DISTINCT upper(palabra) AS w
    FROM public.equivalencia_vocabulario
    WHERE clase = 'color'
      AND (tenant_id IS NULL OR tenant_id = p_tenant)
  ) v
  WHERE upper(public._sin_tildes(COALESCE(p_texto, ''))) ~ ('(^|[^A-Z])' || v.w || '([^A-Z]|$)');
$fn$;

COMMENT ON FUNCTION public._eq_colores(TEXT, UUID) IS
  'Los colores que nombra una descripcion, segun el vocabulario de la empresa. NULL si no nombra ninguno.';

CREATE OR REPLACE FUNCTION public.grupo_mezcla_colores(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT count(DISTINCT COALESCE(public._eq_colores(p.descripcion, g.tenant_id)::text, '-')) > 1
     AND bool_or(public._eq_colores(p.descripcion, g.tenant_id) IS NOT NULL)
  FROM public.producto_grupos g
  JOIN public.producto_grupo_miembros m ON m.grupo_id = g.id
  JOIN public.productos p ON p.id = m.producto_id
  WHERE g.id = p_grupo_id;
$fn$;

-- ============================================================
-- Los grupos que YA estaban armados asi
-- ============================================================
-- No hace falta esperar a que el dueno los rehaga: los que mezclan colores
-- dejan de sumar existencia ahora mismo.
UPDATE public.producto_grupos g
   SET combina_stock = false, updated_at = now()
 WHERE g.combina_stock
   AND public.grupo_mezcla_colores(g.id);

-- ============================================================
-- Las propuestas pendientes: un tipo nuevo
-- ============================================================
WITH calc AS (
  SELECT s.id,
         count(DISTINCT COALESCE(public._eq_colores(p.descripcion, s.tenant_id)::text, '-')) AS variantes,
         bool_or(public._eq_colores(p.descripcion, s.tenant_id) IS NOT NULL) AS hay_color
  FROM public.producto_grupo_sugerencias s
  JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = s.id
  JOIN public.productos p ON p.id = m.producto_id
  WHERE s.estado = 'pendiente'
  GROUP BY s.id
)
UPDATE public.producto_grupo_sugerencias s
   SET tipo = 'variante'
  FROM calc c
 WHERE c.id = s.id AND c.variantes > 1 AND c.hay_color;

COMMENT ON COLUMN public.producto_grupo_sugerencias.tipo IS
  'equivalente = piezas distintas que se sustituyen (marcas distintas): la existencia se suma al comprar. duplicado = LA MISMA pieza cargada dos veces por cambio de codigo: no se agrupa, se reemplaza. variante = mismo repuesto en otro color: se agrupa para vender, pero cada color se compra por su cuenta.';

-- ============================================================
-- LA ORDEN AUTOMATICA DEJA DE TAPAR UN COLOR CON OTRO
-- ============================================================
-- Se injerta sobre la definicion viva en vez de reescribirla: esta funcion
-- lleva encima el lead time por suplidor, la caducidad de lo que viene en
-- camino y el descuento de borradores. Reescribirla de memoria seria perder
-- algo sin enterarse.
DO $injerto_v1$
DECLARE
  v_def   text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_productos_para_orden_automatica';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe get_productos_para_orden_automatica.';
  END IF;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('combina_stock' IN v_def) > 0 THEN
    RAISE NOTICE 'La orden automatica ya respetaba las variantes de color.';
    RETURN;
  END IF;

  -- El bucket solo agrupa cuando el grupo de verdad comparte existencia. Si es
  -- un grupo de colores, cada pieza vuelve a ser su propio bucket y se repone
  -- sola.
  v_nuevo := replace(v_def,
    'LEFT JOIN public.producto_grupo_miembros gm ON gm.producto_id = p.id',
    'LEFT JOIN public.producto_grupo_miembros gm ON gm.producto_id = p.id'
      || E'\n      AND EXISTS (SELECT 1 FROM public.producto_grupos g0'
      || E'\n                   WHERE g0.id = gm.grupo_id AND g0.combina_stock)');

  v_nuevo := replace(v_nuevo,
    'LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id',
    'LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id'
      || E'\n      AND EXISTS (SELECT 1 FROM public.producto_grupos g1'
      || E'\n                   WHERE g1.id = gmx.grupo_id AND g1.combina_stock)');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontraron los dos JOIN del bucket: la funcion cambio de forma.';
  END IF;

  EXECUTE v_nuevo;
END $injerto_v1$;

-- La v2 ajusta cantidades por grupo (la baja al 30%, el <<ya tiene N dias>>).
-- Para un grupo de colores no hay nada que ajustar: cada color va por su lado.
DO $injerto_v2$
DECLARE
  v_def   text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_productos_para_orden_automatica_v2';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No existe get_productos_para_orden_automatica_v2.';
  END IF;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('combina_stock' IN v_def) > 0 THEN
    RAISE NOTICE 'La v2 ya respetaba las variantes de color.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def,
    'WHERE m.producto_id = v_row.id',
    'WHERE m.producto_id = v_row.id'
      || E'\n      AND g.combina_stock   -- un grupo de colores no ajusta nada');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro la busqueda del grupo en la v2.';
  END IF;

  EXECUTE v_nuevo;
END $injerto_v2$;

-- ============================================================
-- El motor aprende a ver el color
-- ============================================================
DO $injerto_motor$
DECLARE
  v_def   text;
  v_nuevo text;
  v_ancla text := '  RETURN jsonb_build_object(' || E'\n' ||
                  '    ''grupos'', v_grupos, ''productos'', v_prod, ''vueltas'', v_vueltas,';
  v_paso  text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalcular_sugerencias_equivalentes';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Falta correr los_equivalentes_se_proponen_solos.sql primero.';
  END IF;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('-- Variante de color' IN v_def) > 0 THEN
    RAISE NOTICE 'El motor ya veia el color.';
    RETURN;
  END IF;

  -- Va DESPUES de la clasificacion duplicado/equivalente a proposito: el color
  -- manda. Ver la nota del encabezado.
  v_paso :=
    '  -- Variante de color: mismo repuesto, otro color. Se agrupa para vender' || E'\n' ||
    '  -- pero NO se suma la existencia al comprar (el azul no repone al negro).' || E'\n' ||
    '  WITH calc_col AS (' || E'\n' ||
    '    SELECT s.id,' || E'\n' ||
    '           count(DISTINCT COALESCE(public._eq_colores(p.descripcion, v_tenant)::text, ''-'')) AS variantes,' || E'\n' ||
    '           bool_or(public._eq_colores(p.descripcion, v_tenant) IS NOT NULL) AS hay_color' || E'\n' ||
    '    FROM public.producto_grupo_sugerencias s' || E'\n' ||
    '    JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = s.id' || E'\n' ||
    '    JOIN public.productos p ON p.id = m.producto_id' || E'\n' ||
    '    WHERE s.tenant_id = v_tenant AND s.estado = ''pendiente''' || E'\n' ||
    '    GROUP BY s.id' || E'\n' ||
    '  )' || E'\n' ||
    '  UPDATE public.producto_grupo_sugerencias s' || E'\n' ||
    '     SET tipo = ''variante''' || E'\n' ||
    '    FROM calc_col c' || E'\n' ||
    '   WHERE c.id = s.id AND c.variantes > 1 AND c.hay_color;' || E'\n\n';

  v_nuevo := replace(v_def, v_ancla, v_paso || v_ancla);

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro donde injertar el paso del color.';
  END IF;

  EXECUTE v_nuevo;
END $injerto_motor$;

-- ============================================================
-- Al confirmar, el grupo nace sabiendo lo que es
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirmar_sugerencia_equivalentes(
  p_sugerencia_id UUID,
  p_producto_ids  UUID[] DEFAULT NULL,
  p_nombre        TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
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
  v_colores BOOLEAN := false;
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

  -- >>> LO NUEVO <<< Si lo que quedo dentro mezcla colores, el grupo sirve
  -- para VENDER pero no para sumar existencia al comprar. Se mira lo que
  -- REALMENTE quedo dentro (el dueno pudo destildar), y solo se APAGA: si el
  -- lo prendio a mano alguna vez, no se le pisa.
  v_colores := public.grupo_mezcla_colores(v_grupo);
  IF v_colores THEN
    UPDATE public.producto_grupos
       SET combina_stock = false, updated_at = now()
     WHERE id = v_grupo AND combina_stock;
  END IF;

  UPDATE public.producto_grupo_sugerencias
     SET estado = 'confirmada', resuelta_at = now(), resuelta_por = auth.uid()
   WHERE id = p_sugerencia_id;

  RETURN jsonb_build_object(
    'grupo_id',      v_grupo,
    'agregados',     v_puestos,
    'ya_en_otro',    v_ajenos,
    'nuevo',         (v_sug.grupo_id IS NULL),
    'combina_stock', NOT v_colores
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.confirmar_sugerencia_equivalentes(UUID, UUID[], TEXT) TO authenticated;

-- ============================================================
-- Y que se pueda cambiar de opinion a mano
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_grupo_combina_stock(p_grupo_id UUID, p_combina BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant UUID := public.get_user_tenant();
BEGIN
  UPDATE public.producto_grupos
     SET combina_stock = COALESCE(p_combina, true), updated_at = now()
   WHERE id = p_grupo_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese grupo no es de esta empresa.';
  END IF;

  RETURN COALESCE(p_combina, true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_grupo_combina_stock(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — que el color de verdad vuelva a la orden
-- ============================================================
-- No alcanza con que la columna exista: hay que ver una pieza que ANTES no
-- aparecia en la orden automatica y AHORA si. Se prueba prendiendo y apagando
-- `combina_stock` sobre un grupo real, dentro de una subtransaccion que se
-- revienta a proposito para no dejar nada tocado.
DO $prueba$
DECLARE
  v_marcados INT;
  v_cand     RECORD;
  v_antes    BOOLEAN;
  v_despues  BOOLEAN;
  v_probados INT := 0;
  v_gano     BOOLEAN := false;
  v_texto    TEXT := '';
BEGIN
  SELECT count(*) INTO v_marcados
    FROM public.producto_grupos WHERE NOT combina_stock;

  IF v_marcados = 0 THEN
    RAISE NOTICE 'Ningun grupo mezcla colores. Nada que probar.';
  END IF;

  -- Candidatas: piezas en cero, con venta reciente y con suplidor, cuyo grupo
  -- tiene existencia en OTRO color.
  FOR v_cand IN
    SELECT p.id AS producto_id, p.codigo, p.suplidor_id, m.grupo_id, g.nombre AS grupo
    FROM public.producto_grupo_miembros m
    JOIN public.producto_grupos g ON g.id = m.grupo_id AND NOT g.combina_stock
    JOIN public.productos p ON p.id = m.producto_id
    WHERE p.suplidor_id IS NOT NULL
      AND COALESCE(p.activo, true)
      AND public.get_stock_actual(p.id) <= 0
      AND EXISTS (SELECT 1 FROM public.producto_grupo_miembros m2
                   JOIN public.productos p2 ON p2.id = m2.producto_id
                  WHERE m2.grupo_id = m.grupo_id AND m2.producto_id <> m.producto_id
                    AND public.get_stock_actual(p2.id) > 0)
      AND EXISTS (SELECT 1 FROM public.facturas_detalle fd
                   JOIN public.facturas f ON f.id = fd.factura_id
                  WHERE fd.producto_id = p.id AND f.fecha >= current_date - 180
                    AND COALESCE(f.estado, '') <> 'Anulada')
    LIMIT 12
  LOOP
    v_probados := v_probados + 1;

    BEGIN
      -- Como estaba ANTES de este archivo: el grupo suma existencia.
      UPDATE public.producto_grupos SET combina_stock = true WHERE id = v_cand.grupo_id;
      SELECT EXISTS (SELECT 1 FROM public.get_productos_para_orden_automatica(v_cand.suplidor_id) o
                      WHERE o.id = v_cand.producto_id) INTO v_antes;

      -- Con el arreglo: cada color se repone solo.
      UPDATE public.producto_grupos SET combina_stock = false WHERE id = v_cand.grupo_id;
      SELECT EXISTS (SELECT 1 FROM public.get_productos_para_orden_automatica(v_cand.suplidor_id) o
                      WHERE o.id = v_cand.producto_id) INTO v_despues;

      RAISE EXCEPTION 'DESHACER LA PRUEBA';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DESHACER LA PRUEBA' THEN
        RAISE EXCEPTION 'La prueba de la orden automatica fallo: %', SQLERRM;
      END IF;
    END;

    IF v_despues AND NOT v_antes THEN
      v_gano := true;
      v_texto := format('%s (grupo %s)', v_cand.codigo, v_cand.grupo);
      EXIT;
    END IF;
  END LOOP;

  IF v_probados = 0 THEN
    RAISE NOTICE 'No hay ninguna pieza tapada por otro color con venta y suplidor. Cambios aplicados igual.';
    RETURN;
  END IF;

  IF NOT v_gano THEN
    RAISE EXCEPTION 'Se probaron % piezas tapadas por otro color y NINGUNA volvio a la orden automatica: el injerto no esta haciendo efecto.', v_probados;
  END IF;

  RAISE NOTICE 'Grupos que dejan de sumar existencia: %. Vuelve a la orden: %', v_marcados, v_texto;
END $prueba$;
