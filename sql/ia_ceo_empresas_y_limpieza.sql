-- =====================================================================
-- IA CEO: MOTOPRÉSTAMOS Y CAMINERO ENTRAN + DECISIONES VIEJAS APARTE
-- (20/10/2026)
-- ---------------------------------------------------------------------
-- 1) El IA CEO solo analiza las empresas que están en tenant_credit_plan,
--    y ahí solo estaba Repuestos Morla. MotoPréstamos Los Naranjos (la
--    financiera: 302 préstamos activos, RD$1.64 M vencido) y Caminero
--    Motors (dealer) entran con los mismos agentes que Morla. Costo: menos
--    de un centavo de dólar por empresa al día.
--
-- 2) Las decisiones pendientes de antes de la fase 1 eran genéricas
--    ("Campaña de Marketing", "Liquidar productos con capital muerto") y
--    algunas se repetían. Se pasan a 'postponed' (no se borran: se pueden
--    retomar), con la nota de por qué. Las de hoy después de la fase 1
--    (15:46 en adelante) quedan pendientes.
-- =====================================================================

INSERT INTO public.tenant_credit_plan (tenant_id, plan, daily_credit_limit, agentes_habilitados, notas)
SELECT t.id, m.plan, m.daily_credit_limit, m.agentes_habilitados,
       'IA CEO activado 20/10/2026 (igual que Repuestos Morla)'
  FROM (VALUES ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid),     -- MotoPréstamos Los Naranjos
               ('b39506c3-27dc-467d-830b-096731b83113'::uuid)) t(id)
 CROSS JOIN (SELECT plan, daily_credit_limit, agentes_habilitados FROM public.tenant_credit_plan
              WHERE tenant_id = '00000000-0000-0000-0000-000000000001') m
 WHERE NOT EXISTS (SELECT 1 FROM public.tenant_credit_plan x WHERE x.tenant_id = t.id);

UPDATE public.ai_decisions
   SET status = 'postponed',
       decision_notes = 'Apartada 20/10/2026: genérica o repetida, de antes de que el IA CEO viera todo el negocio (fase 1).',
       updated_at = now()
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND status = 'pending'
   AND created_at < '2026-10-20 19:45:00+00';

SELECT public.registrar_migracion('ia_ceo_empresas_y_limpieza.sql');

SELECT tenant_id, plan, agentes_habilitados FROM public.tenant_credit_plan;
