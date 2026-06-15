-- ============================================================
-- Fix 0.11 — Aislamiento por tenant en 9 funciones residuales
-- ============================================================
-- Auditoria smoke 2026-06-15 (Fase 1.3) descubrio:
--
-- LEGACY (parte A):
--   - bulk_upsert_products      -> opera sobre tablas que NO existen.
--                                  Esta rota. DROP.
--   - get_perfiles_con_email    -> lee tabla 'perfiles' (legacy).
--                                  REPLACE para leer de 'profiles'
--                                  con filtro de tenant.
--   - get_usuarios_panel        -> idem
--
-- AISLAMIENTO (parte B): 6 funciones SECURITY DEFINER que no validan
-- tenant del caller. Operan sobre ordenes_compra, productos, grupos.
--
-- Cada CREATE/REPLACE incluye:
--   REVOKE EXECUTE FROM PUBLIC, anon;
--   GRANT  EXECUTE TO authenticated;
-- Regla 5 de docs/SECURITY_AND_RLS.md.
--
-- IDEMPOTENTE. No migra datos.
-- ============================================================

-- ╔════════════════════════════════════════════════════════════
-- ║ PARTE A — Legacy
-- ╚════════════════════════════════════════════════════════════

-- A.1 DROP bulk_upsert_products (tablas products/brands/models/suppliers/presentations
-- no existen; la funcion lanza error "relation does not exist" en cualquier llamada)
DROP FUNCTION IF EXISTS public.bulk_upsert_products(jsonb);

-- A.2 REPLACE get_perfiles_con_email — leer de profiles con tenant filter.
-- Schema real de profiles: id, full_name, role, email, tenant_id, is_superadmin.
-- 'nombre_completo'/'rol'/'activo' eran nombres de la tabla legacy 'perfiles'.
-- Mantenemos la signature original para no romper consumidores.
CREATE OR REPLACE FUNCTION public.get_perfiles_con_email()
RETURNS TABLE(id uuid, email varchar, nombre_completo text, rol text, activo boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    COALESCE(p.email, u.email)::varchar AS email,
    p.full_name::text                   AS nombre_completo,
    p.role::text                        AS rol,
    true                                AS activo  -- profiles no tiene flag activo; default true
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.tenant_id = public.get_user_tenant()
$$;
REVOKE EXECUTE ON FUNCTION public.get_perfiles_con_email() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_perfiles_con_email() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_perfiles_con_email() TO authenticated;

-- A.3 REPLACE get_usuarios_panel — leer de profiles con tenant filter
CREATE OR REPLACE FUNCTION public.get_usuarios_panel()
RETURNS TABLE(id uuid, display_name text, email text, rol text, activo boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    COALESCE(
      NULLIF(TRIM(p.full_name), ''),
      split_part(COALESCE(p.email, u.email), '@', 1)
    )::text                                AS display_name,
    COALESCE(p.email, u.email)::text       AS email,
    p.role::text                           AS rol,
    true                                   AS activo
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.tenant_id = public.get_user_tenant()
$$;
REVOKE EXECUTE ON FUNCTION public.get_usuarios_panel() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_usuarios_panel() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_usuarios_panel() TO authenticated;

-- ╔════════════════════════════════════════════════════════════
-- ║ PARTE B — Aislamiento de 6 funciones SECURITY DEFINER
-- ╚════════════════════════════════════════════════════════════

-- B.1 _recalcular_totales_orden_compra(p_orden_id UUID)
-- Llamada desde _mover_linea_a_suplidor_correcto (flujo de reorganizacion).
-- Defensa: si hay sesion authenticated, validar orden pertenece al tenant.
-- Si no hay sesion (service_role), dejar pasar.
CREATE OR REPLACE FUNCTION public._recalcular_totales_orden_compra(
  p_orden_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant UUID;
  v_orden_tenant  UUID;
  v_aplicar_itbis BOOLEAN;
  v_total_exento  NUMERIC := 0;
  v_total_gravado NUMERIC := 0;
  v_descuento     NUMERIC := 0;
  v_itbis         NUMERIC := 0;
  v_total         NUMERIC := 0;
  v_row           RECORD;
  v_subtotal      NUMERIC;
  v_desc_pct      NUMERIC;
  v_itbis_pct     NUMERIC;
  v_desc_monto    NUMERIC;
  v_base          NUMERIC;
BEGIN
  -- Defensa: validar tenant del caller vs tenant de la orden
  v_caller_tenant := public.get_user_tenant();
  SELECT tenant_id, COALESCE(aplicar_itbis, true)
    INTO v_orden_tenant, v_aplicar_itbis
  FROM public.ordenes_compra WHERE id = p_orden_id;

  IF v_caller_tenant IS NOT NULL
     AND v_orden_tenant IS NOT NULL
     AND v_caller_tenant <> v_orden_tenant THEN
    RAISE EXCEPTION 'Acceso denegado: orden % no pertenece al tenant del usuario', p_orden_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN
    SELECT * FROM public.ordenes_compra_detalle WHERE orden_compra_id = p_orden_id
  LOOP
    v_subtotal  := COALESCE(v_row.cantidad, 0) * COALESCE(v_row.precio, 0);
    v_desc_pct  := COALESCE(v_row.descuento_pct, 0) / 100.0;
    v_itbis_pct := COALESCE(v_row.itbis_pct, 0);
    IF v_itbis_pct > 1 THEN v_itbis_pct := v_itbis_pct / 100.0; END IF;

    v_desc_monto := v_subtotal * v_desc_pct;
    v_base       := v_subtotal - v_desc_monto;
    v_descuento  := v_descuento + v_desc_monto;

    IF v_itbis_pct > 0 AND v_aplicar_itbis THEN
      v_total_gravado := v_total_gravado + v_base;
      v_itbis         := v_itbis + (v_base * v_itbis_pct);
    ELSE
      v_total_exento := v_total_exento + v_base;
    END IF;
  END LOOP;

  v_total := v_total_gravado + v_total_exento + v_itbis;

  UPDATE public.ordenes_compra
     SET total_exento    = v_total_exento,
         total_gravado   = v_total_gravado,
         descuento_total = v_descuento,
         itbis_total     = v_itbis,
         total_orden     = v_total
   WHERE id = p_orden_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._recalcular_totales_orden_compra(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._recalcular_totales_orden_compra(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public._recalcular_totales_orden_compra(UUID) TO authenticated, service_role;

-- B.2 reorganizar_orden_pendiente_one(p_orden_id UUID)
-- Reorganiza UNA orden Pendiente. Validar tenant del caller.
CREATE OR REPLACE FUNCTION public.reorganizar_orden_pendiente_one(
  p_orden_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant UUID;
  v_orden_tenant  UUID;
  v_row    RECORD;
  v_moved  INT := 0;
  v_res    JSON;
BEGIN
  v_caller_tenant := public.get_user_tenant();
  SELECT tenant_id INTO v_orden_tenant
  FROM public.ordenes_compra WHERE id = p_orden_id;

  IF v_caller_tenant IS NOT NULL
     AND v_orden_tenant IS NOT NULL
     AND v_caller_tenant <> v_orden_tenant THEN
    RAISE EXCEPTION 'Acceso denegado: orden % no pertenece al tenant del usuario', p_orden_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN
    SELECT d.id AS detalle_id, p.suplidor_id AS suplidor_correcto
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    JOIN public.productos p ON p.id = d.producto_id
    WHERE d.orden_compra_id = p_orden_id
      AND p.suplidor_id IS NOT NULL
      AND p.suplidor_id <> oc.suplidor_id
  LOOP
    v_res := public._mover_linea_a_suplidor_correcto(
      v_row.detalle_id, v_row.suplidor_correcto
    );
    IF (v_res->>'ok')::BOOLEAN THEN
      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true, 'lineas_movidas', v_moved);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reorganizar_orden_pendiente_one(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorganizar_orden_pendiente_one(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reorganizar_orden_pendiente_one(UUID) TO authenticated;

-- B.3 get_productos_movimiento(p_ids UUID[])
-- Lee productos por IDs. Agregar filtro de tenant.
CREATE OR REPLACE FUNCTION public.get_productos_movimiento(p_ids UUID[])
RETURNS TABLE(
  producto_id UUID,
  existencia  NUMERIC,
  ventas_30d  NUMERIC,
  ventas_90d  NUMERIC,
  costo       NUMERIC,
  precio      NUMERIC,
  margen_pct  NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;  -- sin sesion -> 0 filas
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    public.get_stock_actual(p.id)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id AND f.fecha >= NOW() - INTERVAL '30 days'
        AND f.estado <> 'Anulada' AND f.tenant_id = v_tenant), 0)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id AND f.fecha >= NOW() - INTERVAL '90 days'
        AND f.estado <> 'Anulada' AND f.tenant_id = v_tenant), 0)::NUMERIC,
    COALESCE(p.costo, 0)::NUMERIC,
    COALESCE(p.precio, 0)::NUMERIC,
    CASE WHEN p.precio > 0 AND p.costo > 0 AND p.precio > p.costo
         THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1) ELSE 0 END
  FROM public.productos p
  WHERE p.id = ANY(p_ids)
    AND p.tenant_id = v_tenant;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_productos_movimiento(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_productos_movimiento(UUID[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_productos_movimiento(UUID[]) TO authenticated, service_role;

-- B.4 set_preferido_manual(p_grupo_id UUID, p_producto_id UUID)
CREATE OR REPLACE FUNCTION public.set_preferido_manual(
  p_grupo_id    UUID,
  p_producto_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant UUID;
  v_grupo_tenant  UUID;
BEGIN
  v_caller_tenant := public.get_user_tenant();
  SELECT tenant_id INTO v_grupo_tenant
  FROM public.producto_grupos WHERE id = p_grupo_id;

  IF v_caller_tenant IS NOT NULL
     AND v_grupo_tenant IS NOT NULL
     AND v_caller_tenant <> v_grupo_tenant THEN
    RAISE EXCEPTION 'Acceso denegado: grupo % no pertenece al tenant del usuario', p_grupo_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.producto_grupo_miembros
     SET prioridad = 2, prioridad_manual = false
   WHERE grupo_id = p_grupo_id;

  UPDATE public.producto_grupo_miembros
     SET prioridad = 1, prioridad_manual = true
   WHERE grupo_id = p_grupo_id AND producto_id = p_producto_id;

  RETURN json_build_object('ok', true, 'grupo_id', p_grupo_id, 'producto_id', p_producto_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_preferido_manual(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_preferido_manual(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_preferido_manual(UUID, UUID) TO authenticated;

-- B.5 limpiar_manual_grupo(p_grupo_id UUID)
CREATE OR REPLACE FUNCTION public.limpiar_manual_grupo(p_grupo_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant UUID;
  v_grupo_tenant  UUID;
BEGIN
  v_caller_tenant := public.get_user_tenant();
  SELECT tenant_id INTO v_grupo_tenant
  FROM public.producto_grupos WHERE id = p_grupo_id;

  IF v_caller_tenant IS NOT NULL
     AND v_grupo_tenant IS NOT NULL
     AND v_caller_tenant <> v_grupo_tenant THEN
    RAISE EXCEPTION 'Acceso denegado: grupo % no pertenece al tenant del usuario', p_grupo_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.producto_grupo_miembros
     SET prioridad_manual = false
   WHERE grupo_id = p_grupo_id;
  RETURN public.recalcular_preferido_grupo(p_grupo_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpiar_manual_grupo(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limpiar_manual_grupo(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.limpiar_manual_grupo(UUID) TO authenticated;

-- B.6 validar_descuento(producto_id UUID, descuento_aplicado NUMERIC)
-- Defensa: solo lee descuento de productos del tenant del caller.
CREATE OR REPLACE FUNCTION public.validar_descuento(
  producto_id UUID,
  descuento_aplicado NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      UUID;
  max_descuento NUMERIC;
BEGIN
  v_tenant := public.get_user_tenant();

  SELECT pr."%_desc" INTO max_descuento
  FROM public.presentaciones pr
  JOIN public.productos p ON p.id = pr.producto_id
  WHERE pr.producto_id = validar_descuento.producto_id
    AND (v_tenant IS NULL OR p.tenant_id = v_tenant)
  LIMIT 1;

  IF max_descuento IS NULL THEN
    RAISE EXCEPTION 'No se encontro un descuento maximo configurado para este producto';
  END IF;

  IF descuento_aplicado < 0 OR descuento_aplicado > max_descuento THEN
    RAISE EXCEPTION 'El descuento aplicado (%) esta fuera del rango permitido (0%% - %%)', max_descuento;
  END IF;

  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_descuento(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validar_descuento(UUID, NUMERIC) FROM anon;
GRANT  EXECUTE ON FUNCTION public.validar_descuento(UUID, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'fix_0_11 aplicado: 1 DROP + 2 REPLACE legacy + 6 funciones aisladas por tenant' AS status;
