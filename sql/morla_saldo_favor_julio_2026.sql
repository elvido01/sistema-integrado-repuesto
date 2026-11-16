-- =====================================================================
-- REPUESTOS MORLA: saldo a favor de ITBIS al inicio de julio 2026 (16/11/2026)
-- ---------------------------------------------------------------------
-- Último IT-1 presentado: 202606, crédito RD$ 88,386.46 (Estado de Cuenta
-- por Impuesto, Oficina Virtual de la DGII, visto por el dueño 16/11).
-- Es el saldo a favor anterior de la hoja del IT-1 de julio 2026.
-- Agosto–octubre NO se cargan aquí: salen del IT-1 real de cada mes
-- anterior (la hoja de MotoFlow no cuenta las ventas sin comprobante).
-- Solo la empresa Morla (…0001). Idempotente.
-- =====================================================================

INSERT INTO public.contab_periodos (tenant_id, anio, mes, saldo_favor_anterior, actualizado_at)
VALUES ('00000000-0000-0000-0000-000000000001', 2026, 7, 88386.46, now())
ON CONFLICT (tenant_id, anio, mes)
DO UPDATE SET saldo_favor_anterior = EXCLUDED.saldo_favor_anterior, actualizado_at = now();

SELECT registrar_migracion('morla_saldo_favor_julio_2026.sql');
