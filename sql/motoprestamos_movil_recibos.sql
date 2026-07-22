-- =====================================================================
-- MotoPrestamos Los Naranjos: recibos de pago desde app movil
-- ---------------------------------------------------------------------
-- NO vincula Caminero Motors con MotoPrestamos.
-- NO cambia financiamiento_tipo ni financiera_tenant_id de Caminero.
--
-- Solo deja identificado el tenant de MotoPrestamos como financiera para
-- que las RPC SECURITY DEFINER puedan emitir recibos de pago usando los
-- clientes y prestamos de MotoPrestamos, aunque MotoPrestamos no tenga app
-- movil propia.
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_financiera boolean NOT NULL DEFAULT false;

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
motoprestamos AS (
  SELECT tenant_id
  FROM empresas
  WHERE lookup LIKE '%naranjo%'
     OR lookup LIKE '%motoprestamo%'
     OR lookup LIKE '%moto prestamo%'
  ORDER BY
    CASE WHEN lookup LIKE '%naranjo%' THEN 0 ELSE 1 END,
    CASE WHEN lookup LIKE '%motoprestamo%' OR lookup LIKE '%moto prestamo%' THEN 0 ELSE 1 END,
    nombre NULLS LAST
  LIMIT 1
)
UPDATE public.config_empresa ce
   SET feat_financiera = true
  FROM motoprestamos mp
 WHERE ce.tenant_id = mp.tenant_id;

NOTIFY pgrst, 'reload schema';

WITH empresas AS (
  SELECT
    ce.tenant_id,
    ce.nombre,
    ce.razon_social,
    ce.feat_financiera,
    lower(translate(
      COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    )) AS lookup
  FROM public.config_empresa ce
  WHERE ce.tenant_id IS NOT NULL
),
motoprestamos AS (
  SELECT tenant_id, nombre, razon_social, feat_financiera
  FROM empresas
  WHERE lookup LIKE '%naranjo%'
     OR lookup LIKE '%motoprestamo%'
     OR lookup LIKE '%moto prestamo%'
  ORDER BY
    CASE WHEN lookup LIKE '%naranjo%' THEN 0 ELSE 1 END,
    CASE WHEN lookup LIKE '%motoprestamo%' OR lookup LIKE '%moto prestamo%' THEN 0 ELSE 1 END,
    nombre NULLS LAST
  LIMIT 1
)
SELECT
  tenant_id AS motoprestamos_tenant_id,
  COALESCE(razon_social, nombre) AS empresa,
  feat_financiera,
  CASE
    WHEN tenant_id IS NULL THEN 'No encontre MotoPrestamos Los Naranjos en config_empresa'
    WHEN feat_financiera IS TRUE THEN 'MotoPrestamos listo para recibos de pago desde app movil'
    ELSE 'MotoPrestamos encontrado, pero feat_financiera no quedo activo'
  END AS status
FROM motoprestamos;
