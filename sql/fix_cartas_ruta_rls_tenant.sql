-- =====================================================================
-- FIX RLS: cartas_ruta usa profiles.tenant_id en vez de get_user_tenant()
-- ---------------------------------------------------------------------
-- Sintoma (2026-07-24): "new row violates row-level security policy for
-- table cartas_ruta" al guardar una Carta de Ruta.
--
-- Causa: las politicas de cartas_ruta comparan contra
--   (SELECT tenant_id FROM profiles WHERE id = auth.uid())  -- tenant "de casa"
-- pero la app inserta con el tenant ACTIVO (get_user_tenant(), el del
-- selector de empresa). Cuando el usuario cambia de empresa, el tenant_id
-- de la fila (activo) no coincide con profiles.tenant_id -> RLS rechaza.
--
-- Resto del sistema ya usa get_user_tenant() en RLS; aqui quedo la version
-- vieja. Se alinean las 4 politicas (select/insert/update/delete) a
-- get_user_tenant(). Idempotente. Correr en PRODUCCION.
-- =====================================================================

ALTER TABLE public.cartas_ruta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cartas_ruta_tenant_select" ON public.cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_select" ON public.cartas_ruta
  FOR SELECT USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "cartas_ruta_tenant_insert" ON public.cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_insert" ON public.cartas_ruta
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "cartas_ruta_tenant_update" ON public.cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_update" ON public.cartas_ruta
  FOR UPDATE USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "cartas_ruta_tenant_delete" ON public.cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_delete" ON public.cartas_ruta
  FOR DELETE USING (tenant_id = public.get_user_tenant());

-- La politica de superadmin (is_superadmin) se deja como esta.

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_cartas_ruta_rls_tenant.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: politicas actuales de cartas_ruta
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cartas_ruta'
ORDER BY policyname;
