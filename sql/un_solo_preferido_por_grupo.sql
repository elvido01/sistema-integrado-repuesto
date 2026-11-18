-- ============================================================
-- UN SOLO PREFERIDO POR GRUPO — Y LA ORDEN AUTOMATICA DEJA DE PEDIR DOBLE
-- ============================================================
-- Medido en produccion el 17/11/2026 (Repuestos Morla):
--   352 de 362 grupos de equivalentes tenian TODAS sus piezas de preferidas.
--   76 de ellos con dos preferidas del mismo suplidor.
--   La Orden Automatica pedia doble en 9 grupos (20 und, ~RD$21,700) y subia
--   al preferido sin contar lo que venia en camino (5 piezas, ~RD$10,600).
--
-- De donde salia:
--   1. `confirmar_sugerencia_equivalentes` metia cada pieza con prioridad 1.
--   2. El recalculo semanal del preferido NO corria desde el 12/06: el cron
--      llamaba a la funcion web con la clave de ejemplo '<SERVICE_ROLE_KEY>'.
--      Y aunque corriera, si el mejor era uno de los varios preferidos no
--      bajaba a los demas.
--   3. La v2 subia al preferido con ventas30d - existencia, sin restar lo
--      que viene en camino ni los borradores.
--   4. Los borradores solo descontaban el MISMO producto en el MISMO
--      suplidor: un borrador de Arias no frenaba el mismo grupo en HAO.
--
-- Regla del dueno (17/11/2026): el preferido es la pieza que MAS VENDE
-- (unidades, 90 dias). Empate: se queda el preferido actual; si no, la de
-- mas existencia. El preferido fijado a mano (prioridad_manual) se respeta.
-- ============================================================

SELECT public.registrar_migracion('un_solo_preferido_por_grupo.sql');

-- ============================================================
-- 1. La regla, en UN solo lugar
-- ============================================================
CREATE OR REPLACE FUNCTION public._elegir_preferido_por_ventas(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_anterior uuid;
  v_mejor    uuid;
  v_ventas   numeric;
  v_filas    int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.producto_grupo_miembros
              WHERE grupo_id = p_grupo_id AND prioridad_manual) THEN
    RETURN jsonb_build_object('cambio', false, 'razon', 'preferido_manual');
  END IF;

  -- El preferido actual solo cuenta como "actual" si era UNO solo.
  SELECT CASE WHEN count(*) = 1 THEN min(producto_id::text)::uuid END
    INTO v_anterior
    FROM public.producto_grupo_miembros
   WHERE grupo_id = p_grupo_id AND prioridad = 1;

  -- Para el panel de equivalentes: el numerito al lado de cada pieza pasa a
  -- ser lo que vendio en 90 dias, que es lo que decide. Se guarda primero y
  -- se elige leyendolo.
  UPDATE public.producto_grupo_miembros m
     SET score_ultimo = COALESCE((SELECT SUM(fd.cantidad)
                                   FROM public.facturas_detalle fd
                                   JOIN public.facturas f ON f.id = fd.factura_id
                                  WHERE fd.producto_id = m.producto_id
                                    AND COALESCE(f.estado, '') <> 'Anulada'
                                    AND f.fecha >= CURRENT_DATE - 90), 0),
         scoreado_at = now()
   WHERE m.grupo_id = p_grupo_id;

  SELECT m.producto_id, m.score_ultimo INTO v_mejor, v_ventas
    FROM public.producto_grupo_miembros m
    JOIN public.productos p ON p.id = m.producto_id
   WHERE m.grupo_id = p_grupo_id
   ORDER BY COALESCE(p.activo, true) DESC,
            m.score_ultimo DESC,
            (m.producto_id = v_anterior) DESC NULLS LAST,
            public.get_stock_actual(m.producto_id) DESC,
            p.codigo
   LIMIT 1;

  IF v_mejor IS NULL THEN
    RETURN jsonb_build_object('cambio', false, 'razon', 'grupo_vacio');
  END IF;

  UPDATE public.producto_grupo_miembros
     SET prioridad = CASE WHEN producto_id = v_mejor THEN 1 ELSE 2 END
   WHERE grupo_id = p_grupo_id
     AND prioridad IS DISTINCT FROM CASE WHEN producto_id = v_mejor THEN 1 ELSE 2 END;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN jsonb_build_object(
    'cambio', v_filas > 0,
    'preferido_anterior', v_anterior,
    'preferido_nuevo', v_mejor,
    'ventas_90d', v_ventas
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public._elegir_preferido_por_ventas(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._elegir_preferido_por_ventas(uuid) IS
  'Deja UN solo preferido (prioridad 1) en el grupo: la pieza activa que mas vendio en 90 dias. Empate: se queda el actual, luego la de mas existencia. Respeta prioridad_manual. Interna: no revisa empresa.';

-- ============================================================
-- 2. Las puertas de siempre usan la regla nueva
-- ============================================================
-- Misma firma y mismas llaves en el json ('cambio', 'razon') que lee
-- recalcular_preferidos_todos y el boton del panel.
CREATE OR REPLACE FUNCTION public.recalcular_preferido_grupo(p_grupo_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.producto_grupos
                  WHERE id = p_grupo_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Ese grupo no es de esta empresa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._elegir_preferido_por_ventas(p_grupo_id)::json;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cron_recalcular_preferidos_all_tenants()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_grupo     record;
  v_r         jsonb;
  v_total     int := 0;
  v_cambiados int := 0;
  v_manual    int := 0;
BEGIN
  FOR v_grupo IN SELECT id FROM public.producto_grupos ORDER BY tenant_id, id LOOP
    v_total := v_total + 1;
    v_r := public._elegir_preferido_por_ventas(v_grupo.id);
    IF (v_r->>'cambio')::boolean THEN v_cambiados := v_cambiados + 1; END IF;
    IF v_r->>'razon' = 'preferido_manual' THEN v_manual := v_manual + 1; END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'grupos_evaluados', v_total,
    'cambiados', v_cambiados,
    'omitidos_por_manual', v_manual,
    'ejecutado_at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.cron_recalcular_preferidos_all_tenants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_recalcular_preferidos_all_tenants() TO service_role;

-- El cron llamaba a la funcion web con una clave de ejemplo y lo rechazaban
-- callado. Ahora corre el SQL directo, todas las noches (3 a.m. RD): con la
-- regla nueva es barato y un grupo recien armado no espera al lunes.
DO $cron$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'cron-recalcular-preferidos';
  IF v_job IS NULL THEN
    PERFORM cron.schedule('cron-recalcular-preferidos', '0 7 * * *',
      'SELECT public.cron_recalcular_preferidos_all_tenants();');
  ELSE
    PERFORM cron.alter_job(v_job, schedule := '0 7 * * *',
      command := 'SELECT public.cron_recalcular_preferidos_all_tenants();');
  END IF;
END $cron$;

-- ============================================================
-- 3. Un grupo nace con un solo preferido
-- ============================================================
DO $injerto_confirmar$
DECLARE
  v_def   text;
  v_nuevo text;
  v_ancla text := E'  UPDATE public.producto_grupo_sugerencias\n     SET estado = ''confirmada''';
BEGIN
  SELECT pg_get_functiondef('public.confirmar_sugerencia_equivalentes(uuid,uuid[],text)'::regprocedure)
    INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('_elegir_preferido_por_ventas' IN v_def) > 0 THEN
    RAISE NOTICE 'confirmar_sugerencia_equivalentes ya elegia un solo preferido.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def, v_ancla,
    E'  -- Un solo preferido: el que mas vende (antes entraban todas con 1).\n'
    || E'  PERFORM public._elegir_preferido_por_ventas(v_grupo);\n\n' || v_ancla);

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro donde injertar en confirmar_sugerencia_equivalentes.';
  END IF;
  EXECUTE v_nuevo;
END $injerto_confirmar$;

DO $injerto_crear$
DECLARE
  v_def   text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef('public.crear_grupo_con_productos(text,text,uuid[],integer[])'::regprocedure)
    INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('_elegir_preferido_por_ventas' IN v_def) > 0 THEN
    RAISE NOTICE 'crear_grupo_con_productos ya elegia un solo preferido.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def, E'  RETURN v_grupo_id;\nEND;',
    E'  -- Un solo preferido: el que mas vende.\n'
    || E'  PERFORM public._elegir_preferido_por_ventas(v_grupo_id);\n\n'
    || E'  RETURN v_grupo_id;\nEND;');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro donde injertar en crear_grupo_con_productos.';
  END IF;
  EXECUTE v_nuevo;
END $injerto_crear$;

-- ============================================================
-- 4. Los borradores cuentan para TODO el grupo y de CUALQUIER suplidor
-- ============================================================
-- Antes: solo el mismo producto en un borrador del mismo suplidor. Ahora:
-- cualquier pieza del grupo en un borrador de cualquier suplidor, siempre que
-- la linea vaya en la orden (no las descartadas). Los borradores de OTRO
-- suplidor vencen como lo en camino; los del mismo suplidor cuentan siempre,
-- como hasta hoy.
DO $injerto_v1$
DECLARE
  v_def   text;
  v_nuevo text;
  v_viejo_cte text :=
E'  borrador_prod_agg AS (\n'
'    SELECT ocd.producto_id, SUM(ocd.cantidad)::NUMERIC AS en_borrador\n'
'    FROM public.ordenes_compra_detalle ocd\n'
'    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id\n'
'    WHERE oc.suplidor_id = p_suplidor_id\n'
'      AND COALESCE(oc.estado, ''Pendiente'') = ''Pendiente''\n'
'    GROUP BY ocd.producto_id\n'
'  ),';
  v_nuevo_cte text :=
E'  borrador_prod_agg AS (\n'
'    -- Por GRUPO y de cualquier suplidor (un_solo_preferido_por_grupo.sql)\n'
'    SELECT mi.bucket_id, SUM(ocd.cantidad)::NUMERIC AS en_borrador\n'
'    FROM miembros mi\n'
'    JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = mi.producto_id\n'
'    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id\n'
'    WHERE COALESCE(oc.estado, ''Pendiente'') = ''Pendiente''\n'
'      AND COALESCE(ocd.decision_estado, ''pedir_hoy'') IN (''pedir_hoy'', ''pedido'', ''pendiente_ult_compra'', ''agotado_en_venta'')\n'
'      AND (oc.suplidor_id = p_suplidor_id OR oc.fecha_orden >= CURRENT_DATE - v_caduca_dias)\n'
'    GROUP BY mi.bucket_id\n'
'  ),';
BEGIN
  SELECT pg_get_functiondef('public.get_productos_para_orden_automatica(uuid)'::regprocedure)
    INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('Por GRUPO y de cualquier suplidor' IN v_def) > 0 THEN
    RAISE NOTICE 'La v1 ya contaba los borradores por grupo.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def, v_viejo_cte, v_nuevo_cte);
  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro el CTE de borradores en la v1: la funcion cambio de forma.';
  END IF;

  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    'LEFT JOIN borrador_prod_agg bp ON bp.producto_id = gb.id',
    'LEFT JOIN borrador_prod_agg bp ON bp.bucket_id = gb.bucket_id');
  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro el JOIN de borradores en la v1.';
  END IF;

  EXECUTE v_nuevo;
END $injerto_v1$;

-- ============================================================
-- 5. La v2 sube al preferido restando lo que ya viene
-- ============================================================
-- Igual a la viva (sustituto con stock + grupos de colores) salvo el bloque
-- del preferido, que ahora resta en camino y borradores del grupo con las
-- mismas reglas de la v1.
CREATE OR REPLACE FUNCTION public.get_productos_para_orden_automatica_v2(
  p_suplidor_id UUID
)
RETURNS TABLE(
  id                          UUID,
  codigo                      TEXT,
  descripcion                 TEXT,
  existencia                  NUMERIC,
  min_stock                   NUMERIC,
  max_stock                   NUMERIC,
  precio                      NUMERIC,
  costo                       NUMERIC,
  itbis_pct                   NUMERIC,
  ventas_90d                  NUMERIC,
  cantidad_sugerida           INT,
  grupo_id                    UUID,
  grupo_nombre                TEXT,
  es_preferido                BOOLEAN,
  grupo_miembros              INT,
  grupo_stock_combinado       NUMERIC,
  grupo_ventas_30d_combinada  NUMERIC,
  cantidad_ajustada           INT,
  razon_ajuste                TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_row             RECORD;
  v_grupo_id        UUID;
  v_es_pref         BOOLEAN;
  v_grupo_nombre    TEXT;
  v_miembros        INT;
  v_stock_combo     NUMERIC;
  v_demand_combo    NUMERIC;
  v_ajustada        INT;
  v_razon           TEXT;
  v_deficit         NUMERIC;
  v_ya_viene        NUMERIC;
  v_caduca_dias     INT := public.dias_caducidad_orden(p_suplidor_id);
BEGIN
  FOR v_row IN
    SELECT * FROM public.get_productos_para_orden_automatica(p_suplidor_id)
  LOOP
    v_grupo_id     := NULL;
    v_es_pref      := NULL;
    v_grupo_nombre := NULL;
    v_miembros     := NULL;
    v_stock_combo  := NULL;
    v_demand_combo := NULL;
    v_ajustada     := v_row.cantidad_sugerida;
    v_razon        := NULL;

    SELECT m.grupo_id, (m.prioridad = 1), g.nombre
      INTO v_grupo_id, v_es_pref, v_grupo_nombre
    FROM public.producto_grupo_miembros m
    JOIN public.producto_grupos g ON g.id = m.grupo_id
    WHERE m.producto_id = v_row.id
      AND g.combina_stock   -- un grupo de colores no ajusta nada
    LIMIT 1;  -- producto_id es llave: una pieza vive en un solo grupo

    IF v_grupo_id IS NOT NULL THEN
      SELECT
        COUNT(*),
        COALESCE(SUM(public.get_stock_actual(p.id)), 0)
      INTO v_miembros, v_stock_combo
      FROM public.producto_grupo_miembros m
      JOIN public.productos p ON p.id = m.producto_id
      WHERE m.grupo_id = v_grupo_id;

      SELECT COALESCE(SUM(fd.cantidad), 0)
        INTO v_demand_combo
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      JOIN public.producto_grupo_miembros m ON m.producto_id = fd.producto_id
      WHERE m.grupo_id = v_grupo_id
        AND f.estado <> 'Anulada'
        AND f.fecha >= CURRENT_DATE - 30;

      IF v_demand_combo > 0 AND v_stock_combo >= v_demand_combo * 1.5 THEN
        v_ajustada := 0;
        v_razon := 'Grupo ya tiene ' ||
          ROUND((v_stock_combo / NULLIF(v_demand_combo, 0) * 30)::NUMERIC, 0)::TEXT ||
          ' dias de stock';
      ELSIF v_es_pref THEN
        -- >>> LO NUEVO <<< Lo que ya viene para el grupo: en camino (mismas
        -- reglas de la v1) + borradores que van en la orden.
        SELECT
          COALESCE((
            SELECT SUM(COALESCE(ocd.cantidad_pendiente,
                     GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))
            FROM public.producto_grupo_miembros m
            JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = m.producto_id
            JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
            WHERE m.grupo_id = v_grupo_id
              AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
              AND COALESCE(ocd.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
              AND oc.fecha_orden >= CURRENT_DATE - v_caduca_dias
          ), 0)
          + COALESCE((
            SELECT SUM(ocd.cantidad)
            FROM public.producto_grupo_miembros m
            JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = m.producto_id
            JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
            WHERE m.grupo_id = v_grupo_id
              AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
              AND COALESCE(ocd.decision_estado, 'pedir_hoy') IN ('pedir_hoy', 'pedido', 'pendiente_ult_compra', 'agotado_en_venta')
              AND (oc.suplidor_id = p_suplidor_id OR oc.fecha_orden >= CURRENT_DATE - v_caduca_dias)
          ), 0)
        INTO v_ya_viene;

        -- El preferido cubre el deficit del grupo, menos lo que ya viene
        v_deficit := GREATEST(0, v_demand_combo - v_stock_combo - v_ya_viene);
        IF v_deficit > v_row.cantidad_sugerida THEN
          v_ajustada := CEIL(v_deficit)::INT;
          v_razon := 'Aumentado: cubre deficit del grupo ('
            || ROUND(v_deficit, 0)::TEXT || ' und.)';
        END IF;
      ELSIF NOT v_es_pref AND v_row.existencia > 0 THEN
        -- Sustituto que YA TIENE stock propio: no se pide. El preferido
        -- del grupo cubre la demanda; pedir el sustituto duplica inventario.
        v_ajustada := 0;
        v_razon := 'No pedido: ya tiene ' || ROUND(v_row.existencia, 0)::TEXT
          || ' und. y el preferido del grupo cubre la demanda';
      ELSIF NOT v_es_pref AND v_row.cantidad_sugerida > 1 THEN
        -- Sustituto SIN stock propio: reducir a 30% (respaldo del preferido)
        v_ajustada := GREATEST(0, FLOOR(v_row.cantidad_sugerida * 0.3))::INT;
        IF v_ajustada < v_row.cantidad_sugerida THEN
          v_razon := 'Reducido: el preferido del grupo cubre el grueso ('
            || (v_row.cantidad_sugerida - v_ajustada)::TEXT || ' und. ahorradas)';
        END IF;
      END IF;
    END IF;

    id                         := v_row.id;
    codigo                     := v_row.codigo;
    descripcion                := v_row.descripcion;
    existencia                 := v_row.existencia;
    min_stock                  := v_row.min_stock;
    max_stock                  := v_row.max_stock;
    precio                     := v_row.precio;
    costo                      := v_row.costo;
    itbis_pct                  := v_row.itbis_pct;
    ventas_90d                 := v_row.ventas_90d;
    cantidad_sugerida          := v_row.cantidad_sugerida;
    grupo_id                   := v_grupo_id;
    grupo_nombre               := v_grupo_nombre;
    es_preferido               := v_es_pref;
    grupo_miembros             := v_miembros;
    grupo_stock_combinado      := v_stock_combo;
    grupo_ventas_30d_combinada := v_demand_combo;
    cantidad_ajustada          := v_ajustada;
    razon_ajuste               := v_razon;

    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_productos_para_orden_automatica_v2(UUID) TO authenticated, service_role;

-- ============================================================
-- 6. Arreglar los 352 grupos que ya estaban asi
-- ============================================================
SELECT public.cron_recalcular_preferidos_all_tenants();

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — termina en rojo si algo quedo mal
-- ============================================================
DO $prueba$
DECLARE
  v_varios int;
  v_cero   int;
  v_def    text;
BEGIN
  SELECT count(*) FILTER (WHERE n > 1), count(*) FILTER (WHERE n = 0)
    INTO v_varios, v_cero
    FROM (SELECT g.id, count(m.*) FILTER (WHERE m.prioridad = 1) n
            FROM public.producto_grupos g
            JOIN public.producto_grupo_miembros m ON m.grupo_id = g.id
           GROUP BY g.id) x;

  IF v_varios > 0 OR v_cero > 0 THEN
    RAISE EXCEPTION 'Quedan % grupos con varios preferidos y % sin preferido.', v_varios, v_cero;
  END IF;

  SELECT command INTO v_def FROM cron.job WHERE jobname = 'cron-recalcular-preferidos';
  IF v_def NOT ILIKE '%cron_recalcular_preferidos_all_tenants%' OR v_def ILIKE '%SERVICE_ROLE_KEY%' THEN
    RAISE EXCEPTION 'El cron de preferidos no quedo apuntando al SQL.';
  END IF;

  RAISE NOTICE 'Todos los grupos tienen un solo preferido. Cron corregido.';
END $prueba$;
