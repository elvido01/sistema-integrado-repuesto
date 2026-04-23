-- ============================================================
-- MIGRACIÓN PARTE 2: Aislamiento Multi-Tenant
-- Tablas restantes sin tenant_id
-- Morla tenant: 00000000-0000-0000-0000-000000000001
-- ============================================================

-- ============================================================
-- PASO 1: Agregar tenant_id + asignar a Morla + default
-- ============================================================

-- MARCAS
ALTER TABLE marcas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE marcas SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE marcas ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE marcas ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- MODELOS
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE modelos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE modelos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE modelos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- TIPOS_PRODUCTO
ALTER TABLE tipos_producto ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE tipos_producto SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE tipos_producto ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tipos_producto ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PRESENTACIONES
ALTER TABLE presentaciones ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE presentaciones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE presentaciones ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE presentaciones ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- TIPOS_PRESENTACION
ALTER TABLE tipos_presentacion ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE tipos_presentacion SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE tipos_presentacion ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tipos_presentacion ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COTIZACIONES_MAGNA
ALTER TABLE cotizaciones_magna ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE cotizaciones_magna SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE cotizaciones_magna ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cotizaciones_magna ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COTIZACIONES_MAGNA_DETALLE
ALTER TABLE cotizaciones_magna_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE cotizaciones_magna_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE cotizaciones_magna_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cotizaciones_magna_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- DEVOLUCIONES
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE devoluciones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE devoluciones ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE devoluciones ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- DEVOLUCIONES_DETALLE
ALTER TABLE devoluciones_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE devoluciones_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE devoluciones_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE devoluciones_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ORDENES_COMPRA
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE ordenes_compra SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE ordenes_compra ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ordenes_compra ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ORDENES_COMPRA_DETALLE
ALTER TABLE ordenes_compra_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE ordenes_compra_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE ordenes_compra_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ordenes_compra_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ENTRADAS_INVENTARIO
ALTER TABLE entradas_inventario ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE entradas_inventario SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE entradas_inventario ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entradas_inventario ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ENTRADAS_INVENTARIO_DETALLE
ALTER TABLE entradas_inventario_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE entradas_inventario_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE entradas_inventario_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entradas_inventario_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- SALIDAS_INVENTARIO
ALTER TABLE salidas_inventario ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE salidas_inventario SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE salidas_inventario ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE salidas_inventario ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- SALIDAS_INVENTARIO_DETALLE
ALTER TABLE salidas_inventario_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE salidas_inventario_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE salidas_inventario_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE salidas_inventario_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- INVENTARIO_MOVIMIENTOS
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE inventario_movimientos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE inventario_movimientos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventario_movimientos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- RECIBOS_INGRESO
ALTER TABLE recibos_ingreso ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE recibos_ingreso SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE recibos_ingreso ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recibos_ingreso ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- RECIBOS_INGRESO_DETALLE
ALTER TABLE recibos_ingreso_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE recibos_ingreso_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE recibos_ingreso_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recibos_ingreso_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PAGOS_SUPLIDORES
ALTER TABLE pagos_suplidores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pagos_suplidores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pagos_suplidores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pagos_suplidores ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PAGOS_SUPLIDORES_DETALLE
ALTER TABLE pagos_suplidores_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pagos_suplidores_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pagos_suplidores_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pagos_suplidores_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PAGOS_COMISIONES
ALTER TABLE pagos_comisiones ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pagos_comisiones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pagos_comisiones ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pagos_comisiones ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PAGOS_COMISIONES_FACTURAS
ALTER TABLE pagos_comisiones_facturas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pagos_comisiones_facturas SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pagos_comisiones_facturas ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pagos_comisiones_facturas ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- CIERRES_CAJA
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE cierres_caja SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE cierres_caja ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cierres_caja ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COMPROMISOS
ALTER TABLE compromisos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE compromisos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE compromisos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE compromisos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- SOLICITUDES_CLIENTES
ALTER TABLE solicitudes_clientes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE solicitudes_clientes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE solicitudes_clientes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE solicitudes_clientes ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- WAREHOUSES
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE warehouses SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE warehouses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE warehouses ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COMPRAS_DETALLE
ALTER TABLE compras_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE compras_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE compras_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE compras_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COTIZACIONES_DETALLE
ALTER TABLE cotizaciones_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE cotizaciones_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE cotizaciones_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cotizaciones_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- FACTURAS_DETALLE
ALTER TABLE facturas_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE facturas_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE facturas_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE facturas_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PEDIDOS_DETALLE
ALTER TABLE pedidos_detalle ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pedidos_detalle SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pedidos_detalle ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pedidos_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ============================================================
-- PASO 2: Habilitar RLS + Políticas tenant
-- (macro para generar para cada tabla)
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'marcas','modelos','tipos_producto','presentaciones','tipos_presentacion',
    'cotizaciones_magna','cotizaciones_magna_detalle',
    'devoluciones','devoluciones_detalle',
    'ordenes_compra','ordenes_compra_detalle',
    'entradas_inventario','entradas_inventario_detalle',
    'salidas_inventario','salidas_inventario_detalle',
    'inventario_movimientos',
    'recibos_ingreso','recibos_ingreso_detalle',
    'pagos_suplidores','pagos_suplidores_detalle',
    'pagos_comisiones','pagos_comisiones_facturas',
    'cierres_caja','compromisos','solicitudes_clientes','warehouses',
    'compras_detalle','cotizaciones_detalle','facturas_detalle','pedidos_detalle'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop old permissive policies
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete for authenticated users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update for authenticated users" ON %I', t);

    -- Drop new tenant policies if they exist (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "tenant_select_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON %I', t, t);

    -- Create tenant policies
    EXECUTE format('CREATE POLICY "tenant_select_%s" ON %I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant())', t, t);
    EXECUTE format('CREATE POLICY "tenant_insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant())', t, t);
    EXECUTE format('CREATE POLICY "tenant_update_%s" ON %I FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant())', t, t);
    EXECUTE format('CREATE POLICY "tenant_delete_%s" ON %I FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant())', t, t);

    -- Create index
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I(tenant_id)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- PASO 3: Limpiar políticas viejas en tablas de parte 1
-- (por si quedaron de la migración anterior)
-- ============================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'productos','clientes','facturas','pedidos','cotizaciones',
    'compras','vendedores','proveedores','almacenes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete for authenticated users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update for authenticated users" ON %I', t);
  END LOOP;
END $$;
