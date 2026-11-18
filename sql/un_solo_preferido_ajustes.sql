-- ============================================================
-- UN SOLO PREFERIDO — AJUSTES DE LA REVISION (17/11/2026)
-- ============================================================
-- /code-review high sobre un_solo_preferido_por_grupo.sql encontro:
--
-- 1. URGENTE: confirmar_sugerencia_equivalentes corre como el usuario (no es
--    SECURITY DEFINER) y _elegir_preferido_por_ventas estaba revocada para
--    `authenticated` -> confirmar una propuesta de grupo reventaba con
--    "permission denied". Ahora se le da permiso, y la funcion revisa que el
--    grupo sea de la empresa del que llama (el cron, sin usuario, pasa).
-- 2. crear_grupo_con_productos pisaba el preferido que la persona escogio.
--    Ahora solo elige si NO vino exactamente un preferido.
-- 3. En un grupo con preferido fijado a mano, las piezas nuevas que entraban
--    con prioridad 1 se quedaban de preferidas para siempre. Ahora el fijado
--    a mano manda y el resto baja a sustituto. Y el numerito de ventas se
--    actualiza tambien en esos grupos.
-- ============================================================

SELECT public.registrar_migracion('un_solo_preferido_ajustes.sql');

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
  v_manual   uuid;
  v_filas    int := 0;
BEGIN
  -- Con usuario: solo grupos de SU empresa. Sin usuario (cron, service): todos.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.producto_grupos
        WHERE id = p_grupo_id AND tenant_id = public.get_user_tenant()) THEN
    RAISE EXCEPTION 'Ese grupo no es de esta empresa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El numerito del panel = lo vendido en 90 dias (tambien en grupos manuales).
  UPDATE public.producto_grupo_miembros m
     SET score_ultimo = COALESCE((SELECT SUM(fd.cantidad)
                                   FROM public.facturas_detalle fd
                                   JOIN public.facturas f ON f.id = fd.factura_id
                                  WHERE fd.producto_id = m.producto_id
                                    AND COALESCE(f.estado, '') <> 'Anulada'
                                    AND f.fecha >= CURRENT_DATE - 90), 0),
         scoreado_at = now()
   WHERE m.grupo_id = p_grupo_id;

  -- Fijado a mano: ese manda (si hubiera varios marcados, el de menor codigo).
  SELECT m.producto_id INTO v_manual
    FROM public.producto_grupo_miembros m
    JOIN public.productos p ON p.id = m.producto_id
   WHERE m.grupo_id = p_grupo_id AND m.prioridad_manual
   ORDER BY p.codigo
   LIMIT 1;

  IF v_manual IS NOT NULL THEN
    v_mejor := v_manual;
  ELSE
    SELECT CASE WHEN count(*) = 1 THEN min(producto_id::text)::uuid END
      INTO v_anterior
      FROM public.producto_grupo_miembros
     WHERE grupo_id = p_grupo_id AND prioridad = 1;

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
  END IF;

  IF v_mejor IS NULL THEN
    RETURN jsonb_build_object('cambio', false, 'razon', 'grupo_vacio');
  END IF;

  UPDATE public.producto_grupo_miembros
     SET prioridad = CASE WHEN producto_id = v_mejor THEN 1 ELSE 2 END
   WHERE grupo_id = p_grupo_id
     AND prioridad IS DISTINCT FROM CASE WHEN producto_id = v_mejor THEN 1 ELSE 2 END;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_manual IS NOT NULL THEN
    -- Misma llave que leen recalcular_preferidos_todos y el boton del panel.
    RETURN jsonb_build_object('cambio', false, 'razon', 'preferido_manual',
                              'sustitutos_bajados', v_filas);
  END IF;

  RETURN jsonb_build_object(
    'cambio', v_filas > 0,
    'preferido_anterior', v_anterior,
    'preferido_nuevo', v_mejor,
    'ventas_90d', v_ventas
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public._elegir_preferido_por_ventas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._elegir_preferido_por_ventas(uuid) TO authenticated, service_role;

-- crear_grupo_con_productos: respetar el preferido que la persona escogio.
DO $crear$
DECLARE
  v_def   text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef('public.crear_grupo_con_productos(text,text,uuid[],integer[])'::regprocedure)
    INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('-- Solo si no vino UN preferido' IN v_def) > 0 THEN
    RAISE NOTICE 'crear_grupo_con_productos ya respetaba el preferido escogido.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def,
    E'  -- Un solo preferido: el que mas vende.\n  PERFORM public._elegir_preferido_por_ventas(v_grupo_id);',
    E'  -- Solo si no vino UN preferido escogido: entonces, el que mas vende.\n'
    || E'  IF (SELECT count(*) FROM public.producto_grupo_miembros\n'
    || E'       WHERE grupo_id = v_grupo_id AND prioridad = 1) <> 1 THEN\n'
    || E'    PERFORM public._elegir_preferido_por_ventas(v_grupo_id);\n'
    || E'  END IF;');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro el injerto anterior en crear_grupo_con_productos.';
  END IF;
  EXECUTE v_nuevo;
END $crear$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — se ejecuta de verdad, como un usuario, y se deshace
-- ============================================================
DO $prueba$
DECLARE
  v_user   uuid;
  v_tenant uuid;
  v_grupo  uuid;
  v_ok     boolean := false;
BEGIN
  -- Un usuario real de la empresa que tiene grupos
  SELECT g.id, g.tenant_id INTO v_grupo, v_tenant
    FROM public.producto_grupos g ORDER BY g.created_at LIMIT 1;
  SELECT p.id INTO v_user FROM public.profiles p
   WHERE p.tenant_id = v_tenant ORDER BY p.id LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'Sin usuario de prueba; se omite.';
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public._elegir_preferido_por_ventas(v_grupo);
    v_ok := true;
    RAISE EXCEPTION 'DESHACER LA PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER LA PRUEBA' THEN
      RAISE EXCEPTION 'Como usuario, elegir el preferido fallo: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  IF NOT v_ok THEN
    RAISE EXCEPTION 'La prueba como usuario no llego al final.';
  END IF;

  IF EXISTS (SELECT 1 FROM (SELECT grupo_id, count(*) FILTER (WHERE prioridad = 1) n
                              FROM public.producto_grupo_miembros GROUP BY grupo_id) x
              WHERE n <> 1) THEN
    RAISE EXCEPTION 'Hay grupos sin exactamente un preferido.';
  END IF;
END $prueba$;

-- ============================================================
-- 4. Las notas repetidas del Suplidor Virtual no se cierran con una linea
--    DESCARTADA. Antes daba igual (lo descartado casi no se grababa); ahora
--    la orden graba lo que el suplidor "no tiene" con cantidad_pedida 0, y
--    esa linea cerraba la nota como si se hubiera pedido.
-- ============================================================
DO $sv_notas$
DECLARE
  v_def   text;
  v_nuevo text;
BEGIN
  SELECT pg_get_functiondef('public.sv_notas_de_la_orden(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('cantidad_pedida' IN v_def) > 0 THEN
    RAISE NOTICE 'sv_notas_de_la_orden ya ignoraba lo descartado.';
    RETURN;
  END IF;

  v_nuevo := replace(v_def,
    E'     WHERE d.orden_compra_id = p_orden_id\n       AND o.tenant_id = public.get_user_tenant()',
    E'     WHERE d.orden_compra_id = p_orden_id\n       AND o.tenant_id = public.get_user_tenant()\n'
    || E'       AND COALESCE(d.cantidad_pedida, d.cantidad, 0) > 0   -- lo descartado no cuenta');

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro el WHERE de lineas en sv_notas_de_la_orden.';
  END IF;
  EXECUTE v_nuevo;
END $sv_notas$;

NOTIFY pgrst, 'reload schema';
