-- =====================================================================
-- SAN: poder eliminar un SAN COMPLETADO / ARCHIVADO sin tocar el dinero
-- ---------------------------------------------------------------------
-- Pedido 2026-07-22 (MotoPrestamos, SAN "DR ARECHE"): el SAN se completo,
-- su monto ya entro a la cuenta, y el usuario quiere borrarlo de la lista.
-- Hasta ahora era IMPOSIBLE:
--   * san_eliminar solo aceptaba estado 'Cancelado'
--   * san_cambiar_estado solo permite 'Cancelado' desde 'Activo'
--   => un SAN Completado/Archivado quedaba atrapado para siempre.
--
-- Ademas la version anterior BORRABA el movimiento bancario del SAN
-- completado (origen 'san_completado'). Eso descuadraba la cuenta: los
-- abonos diarios (SALIDAS, origen 'san') NO se borran, asi que al quitar
-- solo la ENTRADA el saldo bajaba por el monto del SAN. Caso real: DR
-- ARECHE habria bajado la cuenta OFICINA-ODALYS en RD$200,000.
--
-- Arreglo:
--   1) Se puede eliminar un SAN 'Cancelado', 'Completado' o 'Archivado'.
--      Un SAN 'Activo' sigue exigiendo cancelarlo primero (doble paso
--      contra accidentes).
--   2) Los movimientos bancarios NO se borran: ese dinero se movio de
--      verdad. Quedan en el historial de la cuenta (el concepto ya dice de
--      que SAN vinieron). El SAN, su calendario y su historial de abonos
--      si se borran (FK CASCADE).
--
-- Supersede el san_eliminar de sql/san_cuenta_madre.sql.
-- Idempotente / re-ejecutable.
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

  IF v_san.estado NOT IN ('Cancelado', 'Completado', 'Archivado') THEN
    RAISE EXCEPTION 'Cancela el SAN primero para poder eliminarlo (está %)', v_san.estado;
  END IF;

  -- OJO: los movimientos bancarios de este SAN se CONSERVAN a proposito.
  -- Los abonos diarios salieron de la cuenta y, al completarse, el total
  -- entro a la cuenta madre: es dinero que se movio de verdad. Borrar solo
  -- una parte descuadraria el saldo. Quedan como historial de la cuenta.

  DELETE FROM public.san WHERE id = p_san_id;   -- arrastra pagos e historial

  RETURN jsonb_build_object('ok', true, 'estado_previo', v_san.estado);
END $$;

REVOKE ALL ON FUNCTION public.san_eliminar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.san_eliminar(uuid) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_eliminar_completado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'san_eliminar acepta Cancelado/Completado/Archivado y NO borra movimientos bancarios' AS status;
