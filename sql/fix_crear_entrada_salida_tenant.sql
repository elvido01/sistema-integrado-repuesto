-- ============================================================
-- FIX: RPCs crear_entrada_inventario / crear_salida_inventario
-- Setear tenant_id explícito en todos los INSERTs
-- Causa: tras migration_tenant_isolation_part2.sql las tablas
-- entradas_inventario, entradas_inventario_detalle, salidas_*,
-- salidas_*_detalle e inventario_movimientos requieren tenant_id
-- NOT NULL, y las RLS imponen WITH CHECK (tenant_id = get_user_tenant()).
-- Los RPCs originales no pasaban tenant_id y fallaban al guardar
-- un ajuste automático desde la ficha del producto.
-- ============================================================

-- ------------------------------------------------------------
-- crear_entrada_inventario
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_entrada_inventario(
  p_entrada_data jsonb,
  p_detalles_data jsonb,
  p_tipo_movimiento text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
    v_entrada_id uuid;
    v_detalle jsonb;
    v_tenant uuid;
BEGIN
    v_tenant := public.get_user_tenant();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No se pudo determinar el tenant del usuario actual';
    END IF;

    INSERT INTO public.entradas_inventario (
        numero, fecha, referencia, concepto, almacen_id, notas,
        total_costo, usuario_id, tenant_id
    ) VALUES (
        p_entrada_data->>'numero',
        (p_entrada_data->>'fecha')::date,
        p_entrada_data->>'referencia',
        p_entrada_data->>'concepto',
        (p_entrada_data->>'almacen_id')::uuid,
        p_entrada_data->>'notas',
        (p_entrada_data->>'total_costo')::numeric,
        auth.uid(),
        v_tenant
    ) RETURNING id INTO v_entrada_id;

    FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles_data)
    LOOP
        INSERT INTO public.entradas_inventario_detalle (
            entrada_id, producto_id, codigo, descripcion, cantidad,
            unidad, costo_unitario, importe, tenant_id
        ) VALUES (
            v_entrada_id,
            (v_detalle->>'producto_id')::uuid,
            v_detalle->>'codigo',
            v_detalle->>'descripcion',
            (v_detalle->>'cantidad')::numeric,
            v_detalle->>'unidad',
            (v_detalle->>'costo_unitario')::numeric,
            (v_detalle->>'importe')::numeric,
            v_tenant
        );

        INSERT INTO public.inventario_movimientos (
            producto_id, tipo, cantidad, costo_unitario,
            referencia_doc, usuario_id, fecha, tenant_id
        ) VALUES (
            (v_detalle->>'producto_id')::uuid,
            p_tipo_movimiento::movimiento_tipo,
            ABS((v_detalle->>'cantidad')::numeric),
            (v_detalle->>'costo_unitario')::numeric,
            'ENTRADA-' || (p_entrada_data->>'numero'),
            auth.uid(),
            (p_entrada_data->>'fecha')::date,
            v_tenant
        );
    END LOOP;

    RETURN v_entrada_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_entrada_inventario(jsonb, jsonb, text) TO authenticated;

-- ------------------------------------------------------------
-- crear_salida_inventario
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_salida_inventario(
  p_salida_data jsonb,
  p_detalles_data jsonb,
  p_tipo_movimiento text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
    v_salida_id uuid;
    v_detalle jsonb;
    v_tenant uuid;
BEGIN
    v_tenant := public.get_user_tenant();
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No se pudo determinar el tenant del usuario actual';
    END IF;

    INSERT INTO public.salidas_inventario (
        numero, fecha, referencia, concepto, almacen_id, notas,
        total_costo, usuario_id, tenant_id
    ) VALUES (
        p_salida_data->>'numero',
        (p_salida_data->>'fecha')::date,
        p_salida_data->>'referencia',
        p_salida_data->>'concepto',
        (p_salida_data->>'almacen_id')::uuid,
        p_salida_data->>'notas',
        (p_salida_data->>'total_costo')::numeric,
        auth.uid(),
        v_tenant
    ) RETURNING id INTO v_salida_id;

    FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles_data)
    LOOP
        INSERT INTO public.salidas_inventario_detalle (
            salida_id, producto_id, codigo, descripcion, cantidad,
            unidad, costo_unitario, importe, tenant_id
        ) VALUES (
            v_salida_id,
            (v_detalle->>'producto_id')::uuid,
            v_detalle->>'codigo',
            v_detalle->>'descripcion',
            (v_detalle->>'cantidad')::numeric,
            v_detalle->>'unidad',
            (v_detalle->>'costo_unitario')::numeric,
            (v_detalle->>'importe')::numeric,
            v_tenant
        );

        INSERT INTO public.inventario_movimientos (
            producto_id, tipo, cantidad, costo_unitario,
            referencia_doc, usuario_id, fecha, tenant_id
        ) VALUES (
            (v_detalle->>'producto_id')::uuid,
            p_tipo_movimiento::movimiento_tipo,
            -ABS((v_detalle->>'cantidad')::numeric),
            (v_detalle->>'costo_unitario')::numeric,
            'SALIDA-' || (p_salida_data->>'numero'),
            auth.uid(),
            (p_salida_data->>'fecha')::date,
            v_tenant
        );
    END LOOP;

    RETURN v_salida_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_salida_inventario(jsonb, jsonb, text) TO authenticated;

-- Refrescar cache de PostgREST
NOTIFY pgrst, 'reload schema';
