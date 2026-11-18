-- =====================================================================
-- Centenario: la mora vuelve a ser AL MES SIGUIENTE (18/11/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño 18/11: cada mensualidad lleva su recargo de RD$200 el
-- día 1 del mes siguiente (septiembre → 1 de octubre, octubre → 1 de
-- noviembre). Revierte lo del 17/11 (recargo_meses = 2, "al juntar dos
-- meses"). Solo es la configuración: la función private.edu_aplicar_recargos
-- ya lee recargo_meses por colegio.
-- Los dos colegios del grupo (CENTENARIO y CENTENARIO 1) llevan la misma regla.
-- Los recargos que se anularon a mano NO vuelven (la función los respeta).
-- =====================================================================

UPDATE public.edu_config
   SET recargo_meses = 1
 WHERE tenant_id IN ('8bcd59ef-9502-486c-b919-c77b991387bb', '29ad429d-71ad-4bab-bba1-392299ba1880');

-- Los recargos que ya tocan con la regla nueva, de una vez (no duplica).
SELECT private.edu_aplicar_recargos('8bcd59ef-9502-486c-b919-c77b991387bb') AS recargos_centenario,
       private.edu_aplicar_recargos('29ad429d-71ad-4bab-bba1-392299ba1880') AS recargos_centenario_1;

SELECT public.registrar_migracion('edu_recargo_al_mes_siguiente.sql');
