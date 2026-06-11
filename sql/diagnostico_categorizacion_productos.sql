-- ============================================================
-- Diagnostico: porcentaje de productos categorizados por tenant
-- ============================================================
-- Corre este script en PROD para decidir si vale la pena implementar
-- la Fase C.2 (distribucion de presupuesto por categoria).
--
-- Reglas:
--   - pct >= 70%: implementar Fase C.2 vale la pena
--   - pct 40-70%: implementar pero con flow de tagueo masivo previo
--   - pct < 40%: NO implementar todavia. Priorizar tagueo primero.
-- ============================================================

-- 1) Diagnostico global (todos los tenants juntos)
SELECT
  COUNT(*)                                                          AS total_productos,
  COUNT(*) FILTER (WHERE tipo_id IS NOT NULL)                       AS con_tipo,
  COUNT(*) FILTER (WHERE marca_id IS NOT NULL)                      AS con_marca,
  COUNT(*) FILTER (WHERE modelo_id IS NOT NULL)                     AS con_modelo,
  ROUND(COUNT(*) FILTER (WHERE tipo_id IS NOT NULL)::numeric  * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct_con_tipo,
  ROUND(COUNT(*) FILTER (WHERE marca_id IS NOT NULL)::numeric * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct_con_marca
FROM public.productos
WHERE activo IS NOT FALSE;

-- 2) Diagnostico por tenant (cuales tenants tienen sus productos taggeados)
SELECT
  p.tenant_id,
  COALESCE(ce.nombre, p.tenant_id::text)                            AS empresa,
  COUNT(*)                                                          AS total_productos,
  COUNT(*) FILTER (WHERE p.tipo_id IS NOT NULL)                     AS con_tipo,
  COUNT(*) FILTER (WHERE p.marca_id IS NOT NULL)                    AS con_marca,
  ROUND(COUNT(*) FILTER (WHERE p.tipo_id IS NOT NULL)::numeric * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct_tipo,
  ROUND(COUNT(*) FILTER (WHERE p.marca_id IS NOT NULL)::numeric * 100.0 / NULLIF(COUNT(*), 0), 1) AS pct_marca,
  CASE
    WHEN COUNT(*) FILTER (WHERE p.tipo_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) >= 70 THEN '✅ LISTO para Fase C.2'
    WHEN COUNT(*) FILTER (WHERE p.tipo_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) >= 40 THEN '⚠️  PARCIAL — tagueo masivo previo'
    ELSE '❌ NO IMPLEMENTAR — tagueo insuficiente'
  END                                                                AS recomendacion_fase_c2
FROM public.productos p
LEFT JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
WHERE p.activo IS NOT FALSE
GROUP BY p.tenant_id, ce.nombre
ORDER BY total_productos DESC;

-- 3) Productos SIN tipo: ¿que tienen en comun?
-- (puede revelar que hay un "tipo default" en codigo o descripcion)
SELECT
  LEFT(p.descripcion, 30)  AS muestra_descripcion,
  COUNT(*)                  AS cantidad
FROM public.productos p
WHERE p.tipo_id IS NULL AND p.activo IS NOT FALSE
GROUP BY LEFT(p.descripcion, 30)
ORDER BY cantidad DESC
LIMIT 20;

-- 4) Distribucion del comprado por tipo este mes
-- (proyecta que tan util seria distribuir presupuesto por categoria)
SELECT
  t.nombre                                                          AS tipo,
  COUNT(DISTINCT c.id)                                              AS compras,
  ROUND(SUM(c.total)::numeric, 2)                                   AS monto_total,
  ROUND(SUM(c.total) * 100.0 / NULLIF(SUM(SUM(c.total)) OVER (), 0), 1) AS pct_del_total
FROM public.compras c
JOIN public.compras_detalle cd ON cd.compra_id = c.id
JOIN public.productos p        ON p.id = cd.producto_id
LEFT JOIN public.tipos_producto t ON t.id = p.tipo_id
WHERE c.fecha >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.nombre
ORDER BY monto_total DESC NULLS LAST
LIMIT 15;
