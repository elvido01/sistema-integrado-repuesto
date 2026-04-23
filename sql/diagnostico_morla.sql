-- ============================================================
-- DIAGNÓSTICO: ¿Por qué Repuestos Morla no ve datos en el dashboard?
-- Ejecutar en Supabase SQL Editor como service_role
-- ============================================================

-- 1. ¿Qué devuelve get_user_tenant() para el admin de Morla?
-- (Esto ya se confirmó que funciona via usuarios_empresas)

-- 2. ¿profiles.tenant_id está configurado?
SELECT id, email, full_name, role, tenant_id, is_superadmin
FROM profiles
ORDER BY created_at;

-- 3. ¿Cuántas facturas tiene Morla?
SELECT 
  tenant_id,
  t.nombre as tenant_nombre,
  COUNT(*) as total_facturas,
  SUM(CASE WHEN estado != 'ANULADA' THEN total ELSE 0 END) as total_ventas
FROM facturas f
LEFT JOIN tenants t ON t.id = f.tenant_id
GROUP BY tenant_id, t.nombre;

-- 4. ¿Cuántos productos tiene Morla?
SELECT 
  tenant_id,
  COUNT(*) as total_productos,
  COUNT(*) FILTER (WHERE activo = true) as productos_activos
FROM productos
GROUP BY tenant_id;

-- 5. ¿Cuántos clientes tiene Morla?
SELECT 
  tenant_id,
  COUNT(*) as total_clientes
FROM clientes
GROUP BY tenant_id;

-- 6. ¿La función get_stats_dashboard tiene SECURITY DEFINER o INVOKER?
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  prorettype::regtype as return_type
FROM pg_proc 
WHERE proname IN (
  'get_stats_dashboard',
  'get_sales_quality', 
  'get_sales_metrics',
  'get_monthly_growth',
  'get_weekly_financials',
  'get_commitments_week'
);

-- 7. ¿Qué políticas RLS tiene facturas?
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'facturas';

-- 8. ¿Qué políticas RLS tiene recibos_ingreso?
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'recibos_ingreso';

-- 9. ¿Qué políticas RLS tiene compromisos?
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'compromisos';

-- 10. ¿Hay tablas con RLS habilitado pero SIN políticas?
SELECT c.relname as table_name, c.relrowsecurity as rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p 
    WHERE p.tablename = c.relname AND p.schemaname = 'public'
  );

-- 11. Test directo de la RPC (como service_role bypasa RLS)
SELECT get_stats_dashboard();
