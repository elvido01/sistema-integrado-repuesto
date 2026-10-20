-- =====================================================================
-- IA CEO EN MODO PRUEBA: SOLO REPUESTOS MORLA (21/10/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño: "por el momento está en modo prueba, solo estará
-- disponible para Repuestos Morla con el usuario admin@repuestosmorla.com".
--
-- · MotoPréstamos Los Naranjos y Caminero Motors salen de
--   tenant_credit_plan: ni el análisis de las 6:30 ni la guía de las 7:00
--   los procesan, y no llegan sus mensajes a Telegram.
-- · Se borran los planes, tareas, métricas y avisos de prueba que la guía
--   les generó el 20/10 (los primeros y únicos).
-- · La pantalla y la función ia-ceo-guia solo abren con
--   admin@repuestosmorla.com (código, 21/10/2026).
-- Para activarlas después: volver a correr la parte 1 de
-- sql/ia_ceo_empresas_y_limpieza.sql.
-- =====================================================================

DELETE FROM public.tenant_credit_plan
 WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4',   -- MotoPréstamos Los Naranjos
                     'b39506c3-27dc-467d-830b-096731b83113');  -- Caminero Motors

DELETE FROM public.ia_tareas       WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4', 'b39506c3-27dc-467d-830b-096731b83113');
DELETE FROM public.ia_planes       WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4', 'b39506c3-27dc-467d-830b-096731b83113');
DELETE FROM public.ia_metricas_dia WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4', 'b39506c3-27dc-467d-830b-096731b83113');
DELETE FROM public.ia_guia_avisos  WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4', 'b39506c3-27dc-467d-830b-096731b83113');

SELECT public.registrar_migracion('ia_ceo_solo_morla.sql');

SELECT tenant_id, plan FROM public.tenant_credit_plan;   -- debe quedar solo Morla (…0001)
