-- ============================================================
-- MIGRACIÓN CRÍTICA: Aislamiento Multi-Tenant
-- Agregar tenant_id a todas las tablas principales
-- ============================================================
-- INSTRUCCIONES:
-- 1. Reemplazar TODO: 00000000-0000-0000-0000-000000000001 con el UUID real de Repuestos Morla
-- 2. Ejecutar en PRODUCCIÓN (SAAS REPUESTAS MORLA)
-- ============================================================

-- Variable: Reemplazar con el tenant_id real de Morla
-- SELECT id FROM tenants WHERE nombre ILIKE '%morla%';

-- ============================================================
-- PASO 1: Agregar columna tenant_id a las 9 tablas
-- ============================================================

-- PRODUCTOS
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE productos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE productos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE productos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- CLIENTES
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE clientes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE clientes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- FACTURAS
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE facturas SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE facturas ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE facturas ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PEDIDOS
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE pedidos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pedidos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COTIZACIONES
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE cotizaciones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE cotizaciones ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cotizaciones ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- COMPRAS
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE compras SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE compras ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE compras ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- VENDEDORES
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE vendedores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE vendedores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vendedores ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- PROVEEDORES
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE proveedores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE proveedores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE proveedores ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ALMACENES
ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE almacenes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE almacenes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE almacenes ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

-- ============================================================
-- PASO 2: Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_productos_tenant ON productos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facturas_tenant ON facturas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON pedidos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant ON cotizaciones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_tenant ON compras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_tenant ON vendedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_tenant ON proveedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_almacenes_tenant ON almacenes(tenant_id);

-- ============================================================
-- PASO 3: Habilitar RLS en todas las tablas
-- ============================================================
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE almacenes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PASO 4: Políticas RLS por tenant
-- ============================================================

-- PRODUCTOS
DROP POLICY IF EXISTS "tenant_select_productos" ON productos;
DROP POLICY IF EXISTS "tenant_insert_productos" ON productos;
DROP POLICY IF EXISTS "tenant_update_productos" ON productos;
DROP POLICY IF EXISTS "tenant_delete_productos" ON productos;
CREATE POLICY "tenant_select_productos" ON productos FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_productos" ON productos FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_productos" ON productos FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_productos" ON productos FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- CLIENTES
DROP POLICY IF EXISTS "tenant_select_clientes" ON clientes;
DROP POLICY IF EXISTS "tenant_insert_clientes" ON clientes;
DROP POLICY IF EXISTS "tenant_update_clientes" ON clientes;
DROP POLICY IF EXISTS "tenant_delete_clientes" ON clientes;
CREATE POLICY "tenant_select_clientes" ON clientes FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_clientes" ON clientes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_clientes" ON clientes FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_clientes" ON clientes FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- FACTURAS
DROP POLICY IF EXISTS "tenant_select_facturas" ON facturas;
DROP POLICY IF EXISTS "tenant_insert_facturas" ON facturas;
DROP POLICY IF EXISTS "tenant_update_facturas" ON facturas;
DROP POLICY IF EXISTS "tenant_delete_facturas" ON facturas;
CREATE POLICY "tenant_select_facturas" ON facturas FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_facturas" ON facturas FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_facturas" ON facturas FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_facturas" ON facturas FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- PEDIDOS
DROP POLICY IF EXISTS "tenant_select_pedidos" ON pedidos;
DROP POLICY IF EXISTS "tenant_insert_pedidos" ON pedidos;
DROP POLICY IF EXISTS "tenant_update_pedidos" ON pedidos;
DROP POLICY IF EXISTS "tenant_delete_pedidos" ON pedidos;
CREATE POLICY "tenant_select_pedidos" ON pedidos FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_pedidos" ON pedidos FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_pedidos" ON pedidos FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_pedidos" ON pedidos FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- COTIZACIONES
DROP POLICY IF EXISTS "tenant_select_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "tenant_insert_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "tenant_update_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "tenant_delete_cotizaciones" ON cotizaciones;
CREATE POLICY "tenant_select_cotizaciones" ON cotizaciones FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_cotizaciones" ON cotizaciones FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_cotizaciones" ON cotizaciones FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_cotizaciones" ON cotizaciones FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- COMPRAS
DROP POLICY IF EXISTS "tenant_select_compras" ON compras;
DROP POLICY IF EXISTS "tenant_insert_compras" ON compras;
DROP POLICY IF EXISTS "tenant_update_compras" ON compras;
DROP POLICY IF EXISTS "tenant_delete_compras" ON compras;
CREATE POLICY "tenant_select_compras" ON compras FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_compras" ON compras FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_compras" ON compras FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_compras" ON compras FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- VENDEDORES
DROP POLICY IF EXISTS "tenant_select_vendedores" ON vendedores;
DROP POLICY IF EXISTS "tenant_insert_vendedores" ON vendedores;
DROP POLICY IF EXISTS "tenant_update_vendedores" ON vendedores;
DROP POLICY IF EXISTS "tenant_delete_vendedores" ON vendedores;
CREATE POLICY "tenant_select_vendedores" ON vendedores FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_vendedores" ON vendedores FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_vendedores" ON vendedores FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_vendedores" ON vendedores FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- PROVEEDORES
DROP POLICY IF EXISTS "tenant_select_proveedores" ON proveedores;
DROP POLICY IF EXISTS "tenant_insert_proveedores" ON proveedores;
DROP POLICY IF EXISTS "tenant_update_proveedores" ON proveedores;
DROP POLICY IF EXISTS "tenant_delete_proveedores" ON proveedores;
CREATE POLICY "tenant_select_proveedores" ON proveedores FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_proveedores" ON proveedores FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_proveedores" ON proveedores FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_proveedores" ON proveedores FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- ALMACENES
DROP POLICY IF EXISTS "tenant_select_almacenes" ON almacenes;
DROP POLICY IF EXISTS "tenant_insert_almacenes" ON almacenes;
DROP POLICY IF EXISTS "tenant_update_almacenes" ON almacenes;
DROP POLICY IF EXISTS "tenant_delete_almacenes" ON almacenes;
CREATE POLICY "tenant_select_almacenes" ON almacenes FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_insert_almacenes" ON almacenes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_update_almacenes" ON almacenes FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant());
CREATE POLICY "tenant_delete_almacenes" ON almacenes FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- ============================================================
-- PASO 5: Verificar tablas secundarias (detalles)
-- Si estas tablas también carecen de tenant_id, agregar aquí
-- ============================================================
-- Ejecutar para verificar:
-- SELECT table_name FROM information_schema.tables t
-- WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
-- AND t.table_name LIKE '%detalle%'
-- AND t.table_name NOT IN (
--   SELECT table_name FROM information_schema.columns
--   WHERE column_name = 'tenant_id' AND table_schema = 'public'
-- );
