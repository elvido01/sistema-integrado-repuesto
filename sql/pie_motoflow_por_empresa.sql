-- =====================================================================
-- Pie "Sistema de Gestión MotoFlow" en los recibos de 80 mm (16/11/2026)
-- ---------------------------------------------------------------------
-- Sale en todas las empresas. Solo el súper admin lo quita (decisión del
-- dueño): va en tenants, que las empresas leen (tenant_read_own) pero solo
-- el súper admin cambia (superadmin_full_access). Panel Admin → detalle de
-- la empresa → "Pie MotoFlow en recibos".
-- =====================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sin_pie_motoflow boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.sin_pie_motoflow IS
  'true = sus recibos térmicos NO llevan el pie "Sistema de Gestión MotoFlow · motoflow.com.do". Solo lo cambia el súper admin.';

SELECT registrar_migracion('pie_motoflow_por_empresa.sql');
