-- ============================================================
-- UN COLOR SUELTO NO HACE UNA FAMILIA DE COLORES
-- ============================================================
-- La primera regla (el_color_no_es_un_repuesto_distinto.sql) decia: si los
-- miembros del grupo no nombran los mismos colores, no se suma la existencia.
-- Al probarla contra la orden automatica salio esto:
--
--   grupo "bateria 6.5":  G148, Y-8864, I-8319, 568   (no nombran color)
--                         100325  BATERIA 6.5 HOSUYA NEGRA
--
-- Y 100325 volvia a la orden como si fuera un color aparte. Pero no lo es: son
-- CUATRO MARCAS de la misma bateria y una de ellas se llama "NEGRA" porque si.
-- Todas las baterias son negras — nadie entra a pedir "la bateria azul". Ahi el
-- color no es una eleccion del cliente, es parte del nombre.
--
-- >>> LA REGLA AFINADA <<<
-- Hace falta que DOS piezas NOMBREN colores y que sean DISTINTOS. Una sola
-- pieza con color, entre otras que no lo nombran, es nombre incidental.
--
--   TANQUE AX100 NEGRO  +  TANQUE AX100 AZUL     -> dos colores nombrados: FAMILIA
--   PORTA PLACA ROJO/MORADA/PLATEADO/COLORES     -> familia de colores
--   BATERIA 6.5 (x4) + BATERIA 6.5 HOSUYA NEGRA  -> uno solo: NO es familia
--   JUNTA CLUTCH (x2) + JUNTA CLUTCH MARRON      -> uno solo: NO es familia
--
-- >>> POR QUE SE PUEDE RECALCULAR TODO SIN MIEDO <<<
-- `combina_stock` nacio hace minutos, en el archivo anterior, y nadie lo ha
-- tocado a mano todavia. Asi que aqui se recalcula en los DOS sentidos. De
-- ahora en adelante ya no: lo que el dueno prenda o apague a mano manda, y
-- por eso `confirmar_sugerencia_equivalentes` solo apaga, nunca prende.
--
-- Ademas la regla deja de estar injertada dentro del motor: vive en
-- `clasificar_variantes_color`, y el motor la llama. La proxima vez que haya
-- que afinarla se cambia en un solo sitio.
-- ============================================================

SELECT public.registrar_migracion('el_color_solo_cuenta_si_hay_dos.sql');

-- ============================================================
-- La regla, en un solo lugar
-- ============================================================
CREATE OR REPLACE FUNCTION public.grupo_mezcla_colores(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT count(DISTINCT public._eq_colores(p.descripcion, g.tenant_id)::text)
           FILTER (WHERE public._eq_colores(p.descripcion, g.tenant_id) IS NOT NULL) > 1
  FROM public.producto_grupos g
  JOIN public.producto_grupo_miembros m ON m.grupo_id = g.id
  JOIN public.productos p ON p.id = m.producto_id
  WHERE g.id = p_grupo_id;
$fn$;

COMMENT ON FUNCTION public.grupo_mezcla_colores(UUID) IS
  'true cuando el grupo es una FAMILIA DE COLORES: al menos dos piezas nombran colores y son distintos. Una sola pieza con color no cuenta (es nombre incidental, como BATERIA NEGRA).';

CREATE OR REPLACE FUNCTION public.sugerencia_mezcla_colores(p_sugerencia_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT count(DISTINCT public._eq_colores(p.descripcion, s.tenant_id)::text)
           FILTER (WHERE public._eq_colores(p.descripcion, s.tenant_id) IS NOT NULL) > 1
  FROM public.producto_grupo_sugerencias s
  JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = s.id
  JOIN public.productos p ON p.id = m.producto_id
  WHERE s.id = p_sugerencia_id;
$fn$;

COMMENT ON FUNCTION public.sugerencia_mezcla_colores(UUID) IS
  'La misma regla que grupo_mezcla_colores, pero sobre una propuesta que todavia no es grupo.';

CREATE OR REPLACE FUNCTION public.clasificar_variantes_color(p_tenant UUID)
RETURNS INT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  n INT;
BEGIN
  UPDATE public.producto_grupo_sugerencias s
     SET tipo = CASE WHEN public.sugerencia_mezcla_colores(s.id) THEN 'variante'
                     WHEN s.tipo = 'variante' THEN 'equivalente'
                     ELSE s.tipo END
   WHERE s.tenant_id = p_tenant
     AND s.estado = 'pendiente'
     AND (public.sugerencia_mezcla_colores(s.id) OR s.tipo = 'variante');

  SELECT count(*) INTO n FROM public.producto_grupo_sugerencias
   WHERE tenant_id = p_tenant AND estado = 'pendiente' AND tipo = 'variante';
  RETURN n;
END;
$fn$;

COMMENT ON FUNCTION public.clasificar_variantes_color(UUID) IS
  'Marca como variante las propuestas que son familia de colores (y desmarca las que dejaron de serlo). La llama el motor al final de cada recalculo.';

-- ============================================================
-- Recalcular lo que la regla vieja dejo marcado
-- ============================================================
UPDATE public.producto_grupos g
   SET combina_stock = NOT public.grupo_mezcla_colores(g.id),
       updated_at = now()
 WHERE g.combina_stock = public.grupo_mezcla_colores(g.id);

DO $reclasificar$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM public.producto_grupo_sugerencias WHERE estado = 'pendiente'
  LOOP
    PERFORM public.clasificar_variantes_color(t.tenant_id);
  END LOOP;
END $reclasificar$;

-- ============================================================
-- El motor deja de llevar la regla adentro
-- ============================================================
-- Se cambia el bloque injertado ayer por una llamada. El texto viejo se
-- reconstruye igual que se escribio, para poder reemplazarlo exacto.
DO $desinjertar$
DECLARE
  v_def   text;
  v_nuevo text;
  v_viejo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalcular_sugerencias_equivalentes';

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('clasificar_variantes_color' IN v_def) > 0 THEN
    RAISE NOTICE 'El motor ya llamaba a la regla.';
    RETURN;
  END IF;

  v_viejo :=
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

  IF position(v_viejo IN v_def) = 0 THEN
    RAISE EXCEPTION 'No se encontro el bloque injertado del color: el motor cambio de forma.';
  END IF;

  v_nuevo := replace(v_def, v_viejo,
    '  -- Variante de color: mismo repuesto, otro color. Se agrupa para vender' || E'\n' ||
    '  -- pero NO se suma la existencia al comprar (el azul no repone al negro).' || E'\n' ||
    '  -- La regla vive en la funcion, no aqui: ver clasificar_variantes_color.' || E'\n' ||
    '  PERFORM public.clasificar_variantes_color(v_tenant);' || E'\n\n');

  EXECUTE v_nuevo;
END $desinjertar$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — la bateria se queda, el tanque se va
-- ============================================================
-- Dos casos reales y opuestos, que es justo lo que la regla nueva separa.
DO $prueba$
DECLARE
  v_bat     BOOLEAN;
  v_tanque  TEXT;
  v_grupos  INT;
  v_var     INT;
BEGIN
  -- 1) La bateria: un solo color nombrado -> el grupo SIGUE sumando existencia
  SELECT g.combina_stock INTO v_bat
    FROM public.producto_grupos g
    JOIN public.producto_grupo_miembros m ON m.grupo_id = g.id
    JOIN public.productos p ON p.id = m.producto_id
   WHERE p.codigo = '100325'
   LIMIT 1;

  IF v_bat IS NULL THEN
    RAISE NOTICE 'La bateria 100325 ya no esta en un grupo; se salta ese caso.';
  ELSIF NOT v_bat THEN
    RAISE EXCEPTION 'El grupo de la bateria 6.5 sigue marcado como familia de colores: la regla nueva no se aplico.';
  END IF;

  -- 2) El tanque: dos colores nombrados -> propuesta de variante
  SELECT s.tipo INTO v_tanque
    FROM public.producto_grupo_sugerencias s
    JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = s.id
    JOIN public.productos p ON p.id = m.producto_id
   WHERE p.codigo = 'GAX046-AZ' AND s.estado = 'pendiente'
   LIMIT 1;

  IF v_tanque IS NULL THEN
    RAISE NOTICE 'La propuesta del tanque ya no esta pendiente; se salta ese caso.';
  ELSIF v_tanque <> 'variante' THEN
    RAISE EXCEPTION 'El tanque AX100 quedo como "%" y tenia que quedar como variante.', v_tanque;
  END IF;

  -- 3) Que el motor haya quedado llamando a la regla
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'recalcular_sugerencias_equivalentes'
       AND position('clasificar_variantes_color' IN pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'El motor no quedo llamando a clasificar_variantes_color.';
  END IF;

  SELECT count(*) INTO v_grupos FROM public.producto_grupos WHERE NOT combina_stock;
  SELECT count(*) INTO v_var FROM public.producto_grupo_sugerencias
   WHERE estado = 'pendiente' AND tipo = 'variante';

  RAISE NOTICE 'Familias de colores: % grupos, % propuestas.', v_grupos, v_var;
END $prueba$;
