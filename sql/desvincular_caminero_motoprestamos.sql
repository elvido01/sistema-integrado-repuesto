-- =====================================================================
-- Desvincular Caminero Motors -> MotoPrestamos Los Naranjos
-- ---------------------------------------------------------------------
-- Usar solo si se corrio el SQL viejo que llenaba financiera_tenant_id en
-- Caminero. No toca clientes, prestamos ni recibos de MotoPrestamos.
-- Re-ejecutable.
-- =====================================================================

WITH empresas AS (
  SELECT
    ce.tenant_id,
    ce.nombre,
    ce.razon_social,
    lower(translate(
      COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    )) AS lookup
  FROM public.config_empresa ce
  WHERE ce.tenant_id IS NOT NULL
),
dealer AS (
  SELECT tenant_id
  FROM empresas
  WHERE lookup LIKE '%caminero%'
    AND lookup NOT LIKE '%motoprestamo%'
    AND lookup NOT LIKE '%moto prestamo%'
  ORDER BY nombre NULLS LAST
  LIMIT 1
)
UPDATE public.config_empresa ce
   SET financiamiento_tipo = 'propio',
       financiera_tenant_id = NULL
  FROM dealer d
 WHERE ce.tenant_id = d.tenant_id
   AND ce.financiera_tenant_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

WITH empresas AS (
  SELECT
    ce.tenant_id,
    ce.nombre,
    ce.razon_social,
    ce.financiamiento_tipo,
    ce.financiera_tenant_id,
    lower(translate(
      COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    )) AS lookup
  FROM public.config_empresa ce
  WHERE ce.tenant_id IS NOT NULL
)
SELECT
  tenant_id AS caminero_tenant_id,
  COALESCE(razon_social, nombre) AS empresa,
  financiamiento_tipo,
  financiera_tenant_id,
  CASE
    WHEN financiera_tenant_id IS NULL THEN 'Caminero sin vinculo de financiera'
    ELSE 'Caminero todavia tiene financiera_tenant_id configurado'
  END AS status
FROM empresas
WHERE lookup LIKE '%caminero%'
  AND lookup NOT LIKE '%motoprestamo%'
  AND lookup NOT LIKE '%moto prestamo%'
ORDER BY nombre NULLS LAST
LIMIT 1;
