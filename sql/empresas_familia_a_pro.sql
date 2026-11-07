-- =====================================================================
-- Empresas de la familia en Básico → Pro (07/11/2026)
-- ---------------------------------------------------------------------
-- La contabilidad (cuentas bancarias, flujo de caja, estado de resultado,
-- libros contables) pasa al plan Pro. Las dos empresas viejas que estaban
-- en Básico son de la familia (tratos especiales): suben a Pro sin tocar
-- su fecha de vencimiento ni su estado. Decisión del dueño.
--   · Motoprestasmos Caminero Morla  (64b0663a-…)
--   · INVERSIONES EL NARANJO         (160f0230-…)
-- Solo cambia la suscripción vigente de cada una, y solo si sigue en Básico.
-- =====================================================================

UPDATE public.suscripciones s
   SET plan_id = (SELECT id FROM public.planes WHERE nombre = 'PRO'),
       updated_at = now()
 WHERE s.id IN ('f4ae3d9c-1cee-4e5b-a3ce-474c47a73bcf', '4db39d84-3785-450a-88f7-5d5d71c076e2')
   AND s.plan_id = (SELECT id FROM public.planes WHERE nombre = 'BASICO')
RETURNING s.tenant_id, s.estado, s.fecha_fin;

SELECT public.registrar_migracion('empresas_familia_a_pro.sql');
