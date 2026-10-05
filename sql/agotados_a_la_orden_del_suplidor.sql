-- =====================================================================
-- AGOTADOS QUE SE VENDEN → A LA ORDEN DE SU SUPLIDOR
-- =====================================================================
-- (05/10/2026) El dueño, con el MILLERO DIGITAL XPRESS-125 (011694) marcado
-- "En Suplidor Virtual": "ese producto tiene suplidor, debe enviarlo es a la
-- orden de compra de su suplidor asignado".
--
-- "Pedir" en el cuadro de Equipo IA ahora pone la pieza en el BORRADOR
-- (orden 'Pendiente') de su suplidor, por la misma vía que usa la venta
-- cuando algo se acaba (poner_en_borrador_del_suplidor). Suplidor Virtual
-- queda solo para la pieza SIN suplidor asignado, donde sí hay que elegir.
--
-- Lo que este botón ya había mandado a Suplidor Virtual con suplidor se
-- pasa a su orden y el renglón de Suplidor Virtual se cancela.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.equipo_agotado_pedir(p_producto_id uuid, p_cantidad numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_p record;
  v_id uuid;
  v_orden record;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT p.id, p.codigo, p.descripcion, p.costo, p.suplidor_id, pr.nombre AS suplidor
    INTO v_p
    FROM public.productos p
    LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id AND pr.tenant_id = p.tenant_id
   WHERE p.id = p_producto_id AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa pieza no es de esta empresa.';
  END IF;

  -- Con suplidor: a su orden en borrador (la abre si no hay).
  IF v_p.suplidor_id IS NOT NULL THEN
    -- Ya pendiente en una orden abierta: no se suma otra vez.
    SELECT o.id, o.numero INTO v_orden
      FROM public.ordenes_compra_detalle d
      JOIN public.ordenes_compra o ON o.id = d.orden_compra_id
     WHERE o.tenant_id = v_tenant
       AND o.estado IN ('Pendiente', 'Enviada', 'Parcial')
       AND d.producto_id = v_p.id
       AND d.cerrada_at IS NULL
       AND COALESCE(d.cantidad_pendiente, d.cantidad, 0) > 0
     ORDER BY o.fecha_orden DESC NULLS LAST
     LIMIT 1;
    IF v_orden.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'destino', 'orden', 'ya_estaba', true,
        'orden_id', v_orden.id, 'numero', v_orden.numero, 'suplidor', v_p.suplidor);
    END IF;

    v_id := public.poner_en_borrador_del_suplidor(
      v_tenant, v_p.suplidor_id, v_p.id, GREATEST(COALESCE(p_cantidad, 1), 1),
      'pedir_hoy', 'Agotado que se vende (Equipo IA)');
    SELECT numero INTO v_orden FROM public.ordenes_compra WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'destino', 'orden', 'ya_estaba', false,
      'orden_id', v_id, 'numero', v_orden.numero, 'suplidor', v_p.suplidor);
  END IF;

  -- Sin suplidor: a Suplidor Virtual, donde el dueño elige a quién.
  SELECT id INTO v_id FROM public.suplidor_virtual_items
   WHERE tenant_id = v_tenant AND producto_id = p_producto_id
     AND estado = 'pendiente' AND orden_compra_pedida_id IS NULL
   ORDER BY marcado_at DESC
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'destino', 'suplidor_virtual', 'ya_estaba', true, 'id', v_id);
  END IF;

  INSERT INTO public.suplidor_virtual_items
    (tenant_id, producto_id, suplidor_original_id, codigo, descripcion,
     cantidad_sugerida, precio_referencia, notas, created_by)
  VALUES
    (v_tenant, v_p.id, NULL, v_p.codigo, v_p.descripcion,
     GREATEST(COALESCE(p_cantidad, 1), 1), NULLIF(v_p.costo, 0),
     'Agotado que se vende (Equipo IA)', auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'destino', 'suplidor_virtual', 'ya_estaba', false, 'id', v_id);
END $function$;

-- El nombre viejo sigue respondiendo (pestañas abiertas con la versión
-- anterior de la página), pero ya hace lo mismo que el nuevo.
CREATE OR REPLACE FUNCTION public.equipo_agotado_a_suplidor_virtual(p_producto_id uuid, p_cantidad numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.equipo_agotado_pedir(p_producto_id, p_cantidad);
$function$;

REVOKE ALL ON FUNCTION public.equipo_agotado_pedir(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_agotado_pedir(uuid, numeric) TO authenticated;

-- Lo que el botón ya había mandado a Suplidor Virtual teniendo suplidor.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.id, s.tenant_id, s.producto_id, s.cantidad_sugerida, p.suplidor_id
      FROM public.suplidor_virtual_items s
      JOIN public.productos p ON p.id = s.producto_id
     WHERE s.notas = 'Agotado que se vende (Equipo IA)'
       AND s.estado = 'pendiente' AND s.orden_compra_pedida_id IS NULL
       AND p.suplidor_id IS NOT NULL
  LOOP
    PERFORM public.poner_en_borrador_del_suplidor(
      r.tenant_id, r.suplidor_id, r.producto_id, r.cantidad_sugerida,
      'pedir_hoy', 'Agotado que se vende (Equipo IA)');
    UPDATE public.suplidor_virtual_items
       SET estado = 'cancelado',
           notas = notas || ' · pasada a la orden de su suplidor 05/10',
           updated_at = now()
     WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('agotados_a_la_orden_del_suplidor.sql');
