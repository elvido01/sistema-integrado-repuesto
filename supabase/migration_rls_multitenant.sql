-- ============================================================
-- MIGRACIÓN: Row Level Security (RLS) Multi-Tenant
-- Sistema Integrado Repuestos Morla → SaaS Seguro
-- Fecha: 2026-03-26
-- 
-- IMPORTANTE:
-- - NO modifica lógica de negocio existente
-- - NO cambia estructura funcional del sistema
-- - Solo agrega seguridad por tenant_id
--
-- REQUISITOS PREVIOS:
-- 1. La tabla usuarios_empresas debe existir con (user_id, tenant_id, rol)
-- 2. Todas las tablas de negocio deben tener columna tenant_id (uuid)
-- 3. Si alguna tabla NO tiene tenant_id, agregar la columna ANTES de ejecutar
--
-- EJECUTAR EN: Supabase SQL Editor (como superuser/service_role)
-- ============================================================

-- ============================================================
-- PASO 0: Crear tabla usuarios_empresas si no existe
-- ============================================================

CREATE TABLE IF NOT EXISTS public.usuarios_empresas (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rol         text NOT NULL DEFAULT 'usuario' CHECK (rol IN ('owner', 'admin', 'usuario', 'vendedor')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_user   ON public.usuarios_empresas(user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_tenant ON public.usuarios_empresas(tenant_id);


-- ============================================================
-- PASO 1: Función auxiliar get_user_tenant()
-- Retorna el tenant_id del usuario autenticado
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM usuarios_empresas
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Dar acceso a la función para roles autenticados
GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO anon;


-- ============================================================
-- PASO 2: Asegurar que todas las tablas tienen columna tenant_id
-- (Si ya existe NO hace nada gracias a IF NOT EXISTS / DO block)
-- ============================================================

DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_check
  LOOP
    -- Solo agregar si la tabla existe y NO tiene tenant_id
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id)', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON public.%I(tenant_id)', t, t);
      RAISE NOTICE 'Columna tenant_id agregada a: %', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PASO 3: Establecer DEFAULT en columnas tenant_id
-- Para que el frontend no necesite enviar tenant_id en cada insert
-- ============================================================

DO $$
DECLARE
  tables_with_default TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_default
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant()',
        t
      );
      RAISE NOTICE 'DEFAULT establecido en tenant_id de: %', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PASO 4: Habilitar RLS en TODAS las tablas de negocio
-- ============================================================

DO $$
DECLARE
  rls_tables TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion',
    'usuarios_empresas'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY rls_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS habilitado en: %', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PASO 5: Limpiar políticas antiguas (evitar conflictos)
-- ============================================================

DO $$
DECLARE
  rls_tables TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion'
  ];
  t TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY rls_tables
  LOOP
    -- Eliminar todas las políticas existentes para empezar limpio
    FOR pol IN
      SELECT policyname FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'Política eliminada: % en %', pol.policyname, t;
    END LOOP;
  END LOOP;
END $$;


-- ============================================================
-- PASO 6: Crear políticas RLS por tenant para TODAS las tablas
-- ============================================================

-- -------------------------------------------------------
-- Función helper para crear las 4 políticas estándar
-- (SELECT, INSERT, UPDATE, DELETE) por tabla
-- -------------------------------------------------------

DO $$
DECLARE
  business_tables TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY business_tables
  LOOP
    -- Verificar que la tabla existe y tiene tenant_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN

      -- POLICY: SELECT
      EXECUTE format(
        'CREATE POLICY "tenant_select_%s" ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant())',
        t, t
      );

      -- POLICY: INSERT  
      EXECUTE format(
        'CREATE POLICY "tenant_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant())',
        t, t
      );

      -- POLICY: UPDATE
      EXECUTE format(
        'CREATE POLICY "tenant_update_%s" ON public.%I FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant())',
        t, t
      );

      -- POLICY: DELETE
      EXECUTE format(
        'CREATE POLICY "tenant_delete_%s" ON public.%I FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant())',
        t, t
      );

      RAISE NOTICE 'Políticas tenant creadas para: %', t;
    ELSE
      RAISE WARNING 'Tabla % no tiene columna tenant_id, saltando...', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PASO 7: Políticas especiales para tablas críticas
-- ============================================================

-- -------------------------------------------------------
-- 7a. usuarios_empresas: Solo ver su propio registro
-- -------------------------------------------------------

DROP POLICY IF EXISTS "usuario_solo_ve_su_empresa" ON public.usuarios_empresas;

CREATE POLICY "usuario_solo_ve_su_empresa"
ON public.usuarios_empresas
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Solo admins/owners pueden insertar nuevos usuarios
CREATE POLICY "admin_insert_usuarios_empresas"
ON public.usuarios_empresas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas
    WHERE user_id = auth.uid() AND rol IN ('owner', 'admin')
    AND tenant_id = (SELECT tenant_id FROM public.usuarios_empresas WHERE user_id = auth.uid() LIMIT 1)
  )
);

-- Solo admins/owners pueden actualizar
CREATE POLICY "admin_update_usuarios_empresas"
ON public.usuarios_empresas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas
    WHERE user_id = auth.uid() AND rol IN ('owner', 'admin')
  )
);

-- Solo owners pueden eliminar
CREATE POLICY "owner_delete_usuarios_empresas"
ON public.usuarios_empresas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas
    WHERE user_id = auth.uid() AND rol = 'owner'
  )
);


-- -------------------------------------------------------
-- 7b. profiles: Política actualizada con tenant awareness
-- -------------------------------------------------------

-- Limpiar políticas anteriores de profiles
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admins pueden ver todos los perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Solo admins pueden actualizar perfiles" ON public.profiles;

-- Usuarios ven su propio perfil
CREATE POLICY "perfil_propio_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Admins del mismo tenant ven todos los perfiles de su tenant
CREATE POLICY "admin_tenant_select_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue1
    JOIN public.usuarios_empresas ue2 ON ue1.tenant_id = ue2.tenant_id
    WHERE ue1.user_id = auth.uid()
    AND ue1.rol IN ('owner', 'admin')
    AND ue2.user_id = profiles.id
  )
);

-- Admins del mismo tenant pueden actualizar perfiles
CREATE POLICY "admin_tenant_update_profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue1
    JOIN public.usuarios_empresas ue2 ON ue1.tenant_id = ue2.tenant_id
    WHERE ue1.user_id = auth.uid()
    AND ue1.rol IN ('owner', 'admin')
    AND ue2.user_id = profiles.id
  )
);


-- -------------------------------------------------------
-- 7c. user_module_permissions: Políticas por tenant
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Usuarios pueden ver sus propios permisos" ON public.user_module_permissions;
DROP POLICY IF EXISTS "Admins pueden ver todos los permisos" ON public.user_module_permissions;
DROP POLICY IF EXISTS "Solo admins pueden modificar permisos" ON public.user_module_permissions;

-- Usuarios ven sus propios permisos
CREATE POLICY "permisos_propios_select"
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins del tenant ven todos los permisos de su tenant
CREATE POLICY "admin_tenant_select_permisos"
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue1
    JOIN public.usuarios_empresas ue2 ON ue1.tenant_id = ue2.tenant_id
    WHERE ue1.user_id = auth.uid()
    AND ue1.rol IN ('owner', 'admin')
    AND ue2.user_id = user_module_permissions.user_id
  )
);

-- Admins del tenant pueden gestionar permisos de su tenant
CREATE POLICY "admin_tenant_manage_permisos"
ON public.user_module_permissions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue1
    JOIN public.usuarios_empresas ue2 ON ue1.tenant_id = ue2.tenant_id
    WHERE ue1.user_id = auth.uid()
    AND ue1.rol IN ('owner', 'admin')
    AND ue2.user_id = user_module_permissions.user_id
  )
);


-- -------------------------------------------------------
-- 7d. tenants: Solo superadmins pueden ver todos,
--     users normales solo ven su tenant
-- -------------------------------------------------------

DROP POLICY IF EXISTS "tenant_select" ON public.tenants;
DROP POLICY IF EXISTS "tenant_update" ON public.tenants;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Usuarios ven solo su propio tenant
CREATE POLICY "usuario_ve_su_tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id = public.get_user_tenant()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);

-- Solo superadmins pueden actualizar tenants
CREATE POLICY "superadmin_update_tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);

-- Solo superadmins pueden insertar tenants
CREATE POLICY "superadmin_insert_tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);


-- ============================================================
-- PASO 8: Actualizar trigger handle_new_user para incluir tenant
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    COALESCE(new.raw_user_meta_data->>'role', 'seller')
  );
  
  -- Si se proporciona tenant_id en los metadata, crear relación
  IF new.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
    VALUES (
      new.id,
      (new.raw_user_meta_data->>'tenant_id')::uuid,
      COALESCE(new.raw_user_meta_data->>'empresa_rol', 'usuario')
    );
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PASO 9: Poblar tenant_id en registros existentes
-- (Para datos que ya existen y NO tienen tenant_id asignado)
-- 
-- IMPORTANTE: Ajustar el UUID al tenant correcto de tu empresa
-- ============================================================

-- Obtener el primer tenant existente como fallback
DO $$
DECLARE
  default_tenant uuid;
BEGIN
  SELECT id INTO default_tenant FROM public.tenants LIMIT 1;
  
  IF default_tenant IS NULL THEN
    RAISE EXCEPTION 'No hay tenants creados. Cree al menos un tenant antes de ejecutar esta migración.';
  END IF;

  RAISE NOTICE 'Usando tenant por defecto: %', default_tenant;

  -- Actualizar registros sin tenant_id en todas las tablas
  EXECUTE format('UPDATE public.productos SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.presentaciones SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.clientes SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.proveedores SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.vendedores SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.almacenes SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.facturas SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.facturas_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.compras SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.compras_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.ordenes_compra SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.ordenes_compra_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.devoluciones SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.devoluciones_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.recibos_ingreso SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.inventario_movimientos SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.pedidos SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.pedidos_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.cotizaciones SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.cotizaciones_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.cotizaciones_magna SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.cotizaciones_magna_detalle SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.cierres_caja SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.pagos_suplidores SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.compromisos SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.solicitudes_clientes SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.notificaciones SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.config_empresa SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.tipos_producto SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.marcas SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.modelos SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);
  EXECUTE format('UPDATE public.tipos_presentacion SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant);

  -- Asegurar que el primer usuario está vinculado al tenant
  INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
  SELECT p.id, default_tenant, 'owner'
  FROM public.profiles p
  WHERE p.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue 
    WHERE ue.user_id = p.id AND ue.tenant_id = default_tenant
  )
  LIMIT 1;

  RAISE NOTICE 'Datos existentes actualizados con tenant_id: %', default_tenant;
END $$;


-- ============================================================
-- PASO 10: Hacer tenant_id NOT NULL después de poblar datos
-- ============================================================

DO $$
DECLARE
  tables_not_null TEXT[] := ARRAY[
    'productos',
    'presentaciones',
    'clientes',
    'proveedores',
    'vendedores',
    'almacenes',
    'facturas',
    'facturas_detalle',
    'compras',
    'compras_detalle',
    'ordenes_compra',
    'ordenes_compra_detalle',
    'devoluciones',
    'devoluciones_detalle',
    'recibos_ingreso',
    'inventario_movimientos',
    'pedidos',
    'pedidos_detalle',
    'cotizaciones',
    'cotizaciones_detalle',
    'cotizaciones_magna',
    'cotizaciones_magna_detalle',
    'cierres_caja',
    'pagos_suplidores',
    'compromisos',
    'solicitudes_clientes',
    'notificaciones',
    'config_empresa',
    'tipos_producto',
    'marcas',
    'modelos',
    'tipos_presentacion'
  ];
  t TEXT;
  null_count INTEGER;
BEGIN
  FOREACH t IN ARRAY tables_not_null
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      -- Verificar que no hay NULLs antes de aplicar NOT NULL
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO null_count;
      
      IF null_count = 0 THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
        RAISE NOTICE 'NOT NULL aplicado en tenant_id de: %', t;
      ELSE
        RAISE WARNING 'Tabla % aún tiene % registros con tenant_id NULL, saltando NOT NULL', t, null_count;
      END IF;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PASO 11: Actualizar funciones RPC/SECURITY DEFINER existentes
-- para que respeten el tenant_id
-- ============================================================

-- Actualizar fn_check_stock_notify para filtrar por tenant
CREATE OR REPLACE FUNCTION public.fn_check_stock_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sol     RECORD;
  _usr     RECORD;
  _stock   numeric;
  _desc    text;
  _tenant  uuid;
BEGIN
  -- Solo procesar entradas positivas
  IF NEW.tipo <> 'ENTRADA' OR NEW.cantidad <= 0 THEN
    RETURN NEW;
  END IF;

  -- Obtener el tenant del movimiento
  _tenant := NEW.tenant_id;

  -- ¿Hay solicitudes abiertas para este producto EN ESTE TENANT?
  IF NOT EXISTS (
    SELECT 1 FROM solicitudes_clientes
    WHERE producto_id = NEW.producto_id
      AND estado = 'abierta'
      AND tenant_id = _tenant
  ) THEN
    RETURN NEW;
  END IF;

  -- Calcular stock actual
  SELECT get_stock_actual(NEW.producto_id) INTO _stock;

  IF _stock IS NULL OR _stock <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT descripcion INTO _desc
    FROM productos WHERE id = NEW.producto_id;

  -- Recorrer solicitudes abiertas de este producto EN ESTE TENANT
  FOR _sol IN
    SELECT id, cliente_nombre, cliente_id
      FROM solicitudes_clientes
     WHERE producto_id = NEW.producto_id
       AND estado = 'abierta'
       AND tenant_id = _tenant
  LOOP
    -- Notificar solo a usuarios del MISMO TENANT
    FOR _usr IN
      SELECT ue.user_id AS id FROM usuarios_empresas ue
      WHERE ue.tenant_id = _tenant
    LOOP
      INSERT INTO notificaciones (tipo, titulo, mensaje, user_id, solicitud_id, producto_id, tenant_id)
      VALUES (
        'stock_disponible',
        '¡Producto disponible!',
        'El producto "' || COALESCE(_desc, 'N/D') || '" ya tiene stock (' || _stock || ' uds). '
          || 'Solicitado por: ' || COALESCE(
              (SELECT nombre FROM clientes WHERE id = _sol.cliente_id),
              _sol.cliente_nombre,
              'Desconocido'
            ),
        _usr.id,
        _sol.id,
        NEW.producto_id,
        _tenant
      );
    END LOOP;

    UPDATE solicitudes_clientes SET estado = 'notificada' WHERE id = _sol.id;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- PASO 12: Actualizar vistas que puedan existir
-- Las views heredan RLS de las tablas subyacentes
-- si están creadas con SECURITY INVOKER (default en Supabase)
-- No se requiere acción adicional para:
--   - v_productos_export
--   - pedidos_list_view
--   - cotizaciones_list_view
-- ============================================================


-- ============================================================
-- PASO 13: GRANTs de acceso a tablas para roles authenticated
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presentaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacenes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devoluciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devoluciones_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibos_ingreso TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_movimientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones_magna TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones_magna_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cierres_caja TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_suplidores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compromisos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes_clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.config_empresa TO authenticated;
GRANT SELECT ON public.tipos_producto TO authenticated;
GRANT SELECT ON public.marcas TO authenticated;
GRANT SELECT ON public.modelos TO authenticated;
GRANT SELECT ON public.tipos_presentacion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_empresas TO authenticated;
GRANT SELECT, UPDATE ON public.tenants TO authenticated;


-- ============================================================
-- PASO 14: Verificación final
-- ============================================================

DO $$
DECLARE
  t TEXT;
  rls_enabled BOOLEAN;
  has_policies INTEGER;
  all_tables TEXT[] := ARRAY[
    'productos', 'presentaciones', 'clientes', 'proveedores',
    'vendedores', 'almacenes', 'facturas', 'facturas_detalle',
    'compras', 'compras_detalle', 'ordenes_compra', 'ordenes_compra_detalle',
    'devoluciones', 'devoluciones_detalle', 'recibos_ingreso',
    'inventario_movimientos', 'pedidos', 'pedidos_detalle',
    'cotizaciones', 'cotizaciones_detalle', 'cotizaciones_magna',
    'cotizaciones_magna_detalle', 'cierres_caja', 'pagos_suplidores',
    'compromisos', 'solicitudes_clientes', 'notificaciones',
    'config_empresa', 'tipos_producto', 'marcas', 'modelos',
    'tipos_presentacion', 'usuarios_empresas', 'profiles',
    'user_module_permissions', 'tenants'
  ];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  VERIFICACIÓN DE SEGURIDAD RLS';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';

  FOREACH t IN ARRAY all_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- Verificar RLS habilitado
      SELECT relrowsecurity INTO rls_enabled
      FROM pg_class
      WHERE relname = t AND relnamespace = 'public'::regnamespace;

      -- Contar políticas
      SELECT COUNT(*) INTO has_policies
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t;

      IF rls_enabled AND has_policies > 0 THEN
        RAISE NOTICE '✅ % — RLS: ON, Políticas: %', rpad(t, 30), has_policies;
      ELSIF rls_enabled THEN
        RAISE WARNING '⚠️ % — RLS: ON, SIN POLÍTICAS (tabla bloqueada!)', t;
      ELSE
        RAISE WARNING '❌ % — RLS: OFF', t;
      END IF;
    ELSE
      RAISE NOTICE '⏭️  % — Tabla no existe (ignorada)', t;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  MIGRACIÓN RLS COMPLETADA';
  RAISE NOTICE '==========================================';
END $$;
