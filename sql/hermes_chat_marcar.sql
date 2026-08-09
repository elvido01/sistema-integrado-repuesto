-- =====================================================================
-- Marcar varias filas atendidas sin inventar respuestas
-- ---------------------------------------------------------------------
-- (2026-08-08) Un dictado entra partido en varias filas. Hermes las junta en
-- una sola conversación y contesta UNA vez — que está bien, es la misma
-- pregunta. Pero chat_responder() marca solo la fila que se le nombra, así
-- que las demás vuelven a salir en chat_pendientes() al reconectarse, y las
-- contesta otra vez.
--
-- La salida obvia era llamar chat_responder() una vez por fila, pero eso
-- mete respuestas repetidas en la pantalla de la persona: vería la misma
-- contestación cuatro veces. Y la otra, callarse y no marcarlas, deja la
-- cola creciendo para siempre.
--
-- Faltaba poder decir "estas filas ya están atendidas" sin escribir nada.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION hermes.chat_marcar_atendidos(p_ids bigint[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_n      integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN json_build_object('marcados', 0);
  END IF;

  -- Solo mensajes de la persona: marcar los suyos propios no significa nada
  -- y taparía un error de identificación de filas.
  UPDATE public.hermes_chat
  SET respondido = true
  WHERE tenant_id = v_tenant
    AND rol = 'usuario'
    AND id = ANY(p_ids);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('marcados', v_n);
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.chat_marcar_atendidos(bigint[]) TO hermes_readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_chat_marcar.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Del lado de Hermes, con transacción de escritura:
--   BEGIN; SET TRANSACTION READ WRITE;
--   SELECT hermes.chat_marcar_atendidos(ARRAY[25,26]::bigint[]);
--   COMMIT;
SELECT id, rol, respondido, left(texto, 50) AS texto
FROM public.hermes_chat WHERE respondido = false ORDER BY id;
