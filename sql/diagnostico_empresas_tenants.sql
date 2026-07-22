-- =====================================================================
-- Diagnóstico de empresas / tenants
-- ---------------------------------------------------------------------
-- Una fila por empresa con lo que "hace" según sus datos reales:
--   productos (catálogo), vehículos (productos con chasis), préstamos,
--   clientes, facturas (ventas), usuarios; más los feature flags activos.
-- Sirve para identificar cuál es dealer, cuál financiera, cuál está vacía.
-- Correr en el editor SQL de Supabase (proyecto que aloja los tenants).
-- =====================================================================

SELECT
  ce.nombre,
  ce.razon_social,
  ce.tenant_id,
  (SELECT count(*) FROM public.productos p WHERE p.tenant_id = ce.tenant_id)                               AS productos,
  (SELECT count(*) FROM public.productos p WHERE p.tenant_id = ce.tenant_id AND p.chasis IS NOT NULL)      AS vehiculos,
  (SELECT count(*) FROM public.prestamos  pr WHERE pr.tenant_id = ce.tenant_id)                            AS prestamos,
  (SELECT count(*) FROM public.prestamos  pr WHERE pr.tenant_id = ce.tenant_id AND pr.estado = 'activo')   AS prestamos_activos,
  (SELECT count(*) FROM public.clientes   c  WHERE c.tenant_id = ce.tenant_id)                             AS clientes,
  (SELECT count(*) FROM public.facturas   f  WHERE f.tenant_id = ce.tenant_id)                             AS facturas,
  (SELECT max(f.created_at) FROM public.facturas f WHERE f.tenant_id = ce.tenant_id)                       AS ultima_factura,
  (SELECT count(*) FROM public.profiles   u  WHERE u.tenant_id = ce.tenant_id)                             AS usuarios,
  -- Todos los feature flags (feat_*) + tipo_negocio, sin depender de nombres exactos de columna:
  (SELECT jsonb_object_agg(k, v)
     FROM jsonb_each_text(to_jsonb(ce)) AS t(k, v)
    WHERE k LIKE 'feat_%' OR k IN ('tipo_negocio'))                                                        AS flags
FROM public.config_empresa ce
ORDER BY prestamos DESC, productos DESC, ce.nombre;

-- Si alguna línea da error porque una tabla no existe con ese nombre
-- (p. ej. facturas), bórrala y vuelve a correr.
