-- =====================================================================
-- SAN: eliminar un SAN cancelado (limpieza de la lista)
-- ---------------------------------------------------------------------
-- Regla: solo se ELIMINA un SAN en estado 'Cancelado' y SIN pagos
-- registrados (si recibió dinero, se conserva por auditoría — para eso
-- existe Cancelado/Archivado). El DELETE arrastra su calendario
-- (san_pagos) por FK ON DELETE CASCADE. Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.san_eliminar(p_san_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_san    record;
BEGIN
  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado <> 'Cancelado' THEN
    RAISE EXCEPTION 'Solo se elimina un SAN cancelado (este está %)', v_san.estado;
  END IF;
  IF v_san.monto_ahorrado > 0
     OR EXISTS (SELECT 1 FROM public.san_transacciones WHERE san_id = p_san_id) THEN
    RAISE EXCEPTION 'Este SAN tiene pagos registrados: se conserva por auditoría (déjalo Cancelado)';
  END IF;

  DELETE FROM public.san WHERE id = p_san_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.san_eliminar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.san_eliminar(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_eliminar.sql');
  END IF;
END $$;

SELECT 'san_eliminar listo (solo cancelados sin pagos)' AS status;
