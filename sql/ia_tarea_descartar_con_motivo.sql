-- =====================================================================
-- IA CEO: DESCARTAR UNA TAREA CON SU MOTIVO, Y CERRAR LA CONVERSACIÓN
-- (26/10/2026)
-- ---------------------------------------------------------------------
-- "Contacta a Alexander Primo Banco Reserva…": no es un cliente, es del
-- banco. La ✕ solo la tachaba, y mañana la IA CEO lo volvía a proponer
-- porque la conversación seguía abierta y no sabía POR QUÉ se descartó.
--
-- Ahora la ✕ pide un comentario y, si la tarea es de una conversación,
-- deja marcar "no va con los intereses de la empresa":
--   · la tarea queda descartada con el comentario (la IA CEO lo lee al
--     armar las tareas del día siguiente);
--   · la persona entra a la lista de NO DAR SEGUIMIENTO
--     (crm_no_seguir_agregar): su conversación se cierra, sus casos se
--     resuelven, sale de "clientes esperando" y no vuelve a salir en tareas.
-- Para sacarla de esa lista: Sales Hub → No dar seguimiento.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.ia_tareas ADD COLUMN IF NOT EXISTS nota text;

CREATE OR REPLACE FUNCTION public.ia_tarea_descartar(
  p_id uuid, p_nota text DEFAULT NULL, p_cerrar_conversacion boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  t        public.ia_tareas;
  v_conv   uuid;
  c        record;
  v_nota   text := nullif(btrim(coalesce(p_nota, '')), '');
  v_cierre jsonb := NULL;
BEGIN
  SELECT * INTO t FROM public.ia_tareas WHERE id = p_id AND tenant_id = v_tenant;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;

  UPDATE public.ia_tareas
     SET estado = 'descartada', marcada_at = now(), marcada_por = auth.uid(), confirmada_por = 'persona',
         nota = v_nota,
         evidencia = CASE WHEN v_nota IS NOT NULL THEN 'Descartada: ' || v_nota ELSE evidencia END
   WHERE id = p_id;

  IF p_cerrar_conversacion THEN
    BEGIN
      v_conv := nullif(t.accion #>> '{conversacion,id}', '')::uuid;
    EXCEPTION WHEN others THEN v_conv := NULL;
    END;
    IF v_conv IS NULL AND t.verificacion ->> 'tipo' = 'conversacion' THEN
      BEGIN v_conv := (t.verificacion ->> 'id')::uuid; EXCEPTION WHEN others THEN v_conv := NULL; END;
    END IF;

    SELECT id, customer_name, customer_phone INTO c
      FROM public.sales_conversations WHERE id = v_conv AND tenant_id = v_tenant;

    IF c.id IS NULL AND nullif(t.accion ->> 'telefono', '') IS NULL THEN
      RAISE EXCEPTION 'Esta tarea no tiene una conversación que cerrar';
    END IF;

    v_cierre := public.crm_no_seguir_agregar(
      coalesce(nullif(btrim(c.customer_name), ''), t.accion #>> '{conversacion,cliente}'),
      coalesce(nullif(btrim(c.customer_phone), ''), nullif(t.accion ->> 'telefono', '')),
      coalesce(v_nota, 'No va con los intereses de la empresa'));

    -- La conversación concreta, aunque el nombre o el teléfono no coincidan
    -- exacto con la lista.
    IF c.id IS NOT NULL THEN
      UPDATE public.sales_conversations SET etapa = 'perdido', status = 'cerrado' WHERE id = c.id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'cerrada', v_cierre IS NOT NULL, 'detalle', v_cierre);
END $$;
REVOKE ALL ON FUNCTION public.ia_tarea_descartar(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_tarea_descartar(uuid, text, boolean) TO authenticated;

SELECT public.registrar_migracion('ia_tarea_descartar_con_motivo.sql');
