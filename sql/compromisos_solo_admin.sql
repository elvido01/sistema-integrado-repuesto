-- =====================================================================
-- Compromisos "solo administración" (todo el sistema, multi-tenant)
-- Un compromiso marcado solo_admin lo ven únicamente las cuentas con rol
-- admin/owner: no aparece en el dashboard, ni en Estado de Resultados,
-- ni en ningún listado de los demás usuarios. El candado es RLS, así
-- aplica a CUALQUIER pantalla presente o futura.
-- La caja NO se afecta: los RPC de caja/flujo (get_caja_excedente_dashboard,
-- get_flujo_neto_dashboard) son SECURITY DEFINER y siguen contando estos
-- compromisos, de modo que la rebaja al pagarlos la ve todo el que vea el
-- balance — solo el renglón del gasto queda reservado a administración.
-- =====================================================================

ALTER TABLE public.compromisos
  ADD COLUMN IF NOT EXISTS solo_admin boolean NOT NULL DEFAULT false;

-- ¿El usuario logueado es cuenta administrativa?
CREATE OR REPLACE FUNCTION public.es_usuario_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$;
GRANT EXECUTE ON FUNCTION public.es_usuario_admin() TO authenticated;

-- Candado restrictivo: se suma (AND) a las políticas de tenant existentes.
-- Aplica a leer, editar y borrar; e impide que un no-admin cree uno oculto.
DROP POLICY IF EXISTS compromisos_solo_admin_gate ON public.compromisos;
CREATE POLICY compromisos_solo_admin_gate ON public.compromisos
AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT solo_admin OR public.es_usuario_admin())
WITH CHECK (NOT solo_admin OR public.es_usuario_admin());

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compromisos_solo_admin.sql');
  END IF;
END $$;

SELECT 'Compromisos solo administración listos' AS status;
