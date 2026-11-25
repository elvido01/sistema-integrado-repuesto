-- ============================================================
-- SIN MOVIMIENTO: estado de la lista en cada pieza (25/11/2026)
-- ============================================================
-- El dueño vio que la etiqueta "en una lista" no se quitaba al confirmar en
-- el teléfono. Es a propósito: confirmar deja la lista 'enviada' y nada
-- cambia hasta "Revisar y aplicar" en la PC. Ahora la pieza dice en qué paso
-- está (verificacion_estado): 'pendiente' (por contar) o 'enviada' (contada,
-- falta aplicar). Si estuviera en dos listas abiertas (las creadas antes del
-- ajuste de inv_verif_crear podían), manda 'pendiente': aún falta contarla.
-- Cambia el tipo de retorno → DROP + CREATE (con sus permisos).
-- ============================================================
DROP FUNCTION IF EXISTS public.get_inventario_sin_movimiento(integer, integer, text);
CREATE OR REPLACE FUNCTION public.get_inventario_sin_movimiento(p_dias_min integer DEFAULT 60, p_dias_max integer DEFAULT NULL::integer, p_search text DEFAULT ''::text)
 RETURNS TABLE(id uuid, codigo text, descripcion text, referencia text, ubicacion text, marca text, existencia numeric, costo numeric, valor numeric, ultimo_movimiento date, dias integer, en_verificacion boolean, verificacion_estado text, total_piezas bigint, total_valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT public.get_user_tenant() AS id, (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy),
  mov AS (
    SELECT m.producto_id,
           sum(m.cantidad) AS stock,
           -- Las entradas/salidas con fecha sola quedan a las 00:00 UTC: su día es ese, no el anterior en RD.
           COALESCE(max(CASE WHEN (m.fecha AT TIME ZONE 'UTC')::time = '00:00' THEN (m.fecha AT TIME ZONE 'UTC')::date
                             ELSE (m.fecha AT TIME ZONE 'America/Santo_Domingo')::date END) FILTER (WHERE m.tipo <> 'AJUSTE'),
                    min(CASE WHEN (m.fecha AT TIME ZONE 'UTC')::time = '00:00' THEN (m.fecha AT TIME ZONE 'UTC')::date
                             ELSE (m.fecha AT TIME ZONE 'America/Santo_Domingo')::date END)) AS ultimo
      FROM public.inventario_movimientos m, t
     WHERE m.tenant_id = t.id
     GROUP BY m.producto_id
  ),
  base AS (
    SELECT p.id, p.codigo, p.descripcion, p.referencia, p.ubicacion, ma.nombre AS marca,
           mov.stock AS existencia, COALESCE(p.costo, 0) AS costo, round(mov.stock * COALESCE(p.costo, 0), 2) AS valor,
           mov.ultimo AS ultimo_movimiento, (t.hoy - mov.ultimo)::int AS dias,
           EXISTS (SELECT 1 FROM public.inv_verificacion_items i JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
                    WHERE i.producto_id = p.id AND v.estado IN ('pendiente', 'enviada')) AS en_verificacion,
           -- pendiente = falta contarla en el teléfono; enviada = ya contada, falta "Revisar y aplicar" en la PC.
           (SELECT CASE WHEN bool_or(v.estado = 'pendiente') THEN 'pendiente' ELSE 'enviada' END
              FROM public.inv_verificacion_items i JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
             WHERE i.producto_id = p.id AND v.estado IN ('pendiente', 'enviada')) AS verificacion_estado
      FROM public.productos p
      JOIN t ON p.tenant_id = t.id
      JOIN mov ON mov.producto_id = p.id
      LEFT JOIN public.marcas ma ON ma.id = p.marca_id
     WHERE COALESCE(p.activo, true) AND mov.stock > 0
       AND (t.hoy - mov.ultimo) >= COALESCE(p_dias_min, 0)
       AND (p_dias_max IS NULL OR (t.hoy - mov.ultimo) <= p_dias_max)
       AND (COALESCE(btrim(p_search), '') = ''
            OR public._sin_tildes(concat_ws(' ', p.codigo, p.referencia, p.descripcion, p.ubicacion, ma.nombre))
               LIKE '%' || public._sin_tildes(btrim(p_search)) || '%')
  )
  SELECT b.*, count(*) OVER (), sum(b.valor) OVER ()
    FROM base b
   ORDER BY b.valor DESC, b.codigo
   LIMIT 2000;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- PRUEBA sin depender de datos vivos: una lista inventada en el tenant del
-- administrador, pendiente y luego enviada; todo se deshace.
DO $prueba$
DECLARE v_t uuid; v_p uuid; v_l uuid; v_e text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '0a751661-5ec4-4136-a75c-b4d8493beae0', 'role', 'authenticated')::text, true);
  v_t := public.get_user_tenant();
  SELECT s.id INTO v_p FROM public.get_inventario_sin_movimiento(0, NULL, NULL) s WHERE NOT s.en_verificacion LIMIT 1;
  IF v_p IS NULL THEN RAISE EXCEPTION 'PRUEBA_OK'; END IF;   -- sin piezas libres no hay qué probar
  INSERT INTO public.inv_verificaciones (tenant_id, titulo, estado, asignado_a)
  VALUES (v_t, 'PRUEBA', 'pendiente', auth.uid()) RETURNING id INTO v_l;
  INSERT INTO public.inv_verificacion_items (tenant_id, verificacion_id, producto_id, existencia_sistema)
  VALUES (v_t, v_l, v_p, 1);
  SELECT verificacion_estado INTO v_e FROM public.get_inventario_sin_movimiento(0, NULL, NULL) WHERE id = v_p;
  IF v_e IS DISTINCT FROM 'pendiente' THEN RAISE EXCEPTION 'Pendiente dio %', v_e; END IF;
  UPDATE public.inv_verificaciones SET estado = 'enviada' WHERE id = v_l;
  SELECT verificacion_estado INTO v_e FROM public.get_inventario_sin_movimiento(0, NULL, NULL) WHERE id = v_p;
  IF v_e IS DISTINCT FROM 'enviada' THEN RAISE EXCEPTION 'Enviada dio %', v_e; END IF;
  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('inventario_sin_movimiento_estado_lista.sql');
