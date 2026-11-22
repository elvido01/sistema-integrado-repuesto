-- =====================================================================
-- Deshacer el Equipo IA
-- ---------------------------------------------------------------------
-- Quita las cuatro tablas y todas sus funciones. NO toca agentes_ia,
-- agente_sistema ni hermes_chat, porque el Equipo IA nunca los tocó:
-- Jarvis y el chat de Hermes siguen exactamente igual antes y después.
--
-- >>> QUÉ SE PIERDE <<<
-- El historial entero: trabajos, delegaciones, borradores y las decisiones
-- de aprobación con su firma y su hora. Eso es auditoría, y no se recupera
-- volviendo a correr la migración.
--
-- Si solo quieres apagar el módulo sin perder nada, no corras esto:
--
--     UPDATE public.equipo_agentes SET activo = false;
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FRENO DE MANO                                                   ║
-- ║  Para correr esta reversa, BORRA la línea de abajo.               ║
-- ║  Se lleva por delante el historial de aprobaciones: quién aprobó  ║
-- ║  qué y cuándo. Apagar el módulo NO necesita esto.                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
DO $$ BEGIN RAISE EXCEPTION 'FRENO DE MANO: esto BORRA trabajos, delegaciones y el historial de aprobaciones. Para solo apagar el modulo usa UPDATE public.equipo_agentes SET activo = false. Si de verdad quieres borrarlo, quita esta linea.'; END $$;

DROP FUNCTION IF EXISTS public.equipo_trabajo_detalle(uuid);
DROP FUNCTION IF EXISTS public.equipo_panel(integer);
DROP FUNCTION IF EXISTS public.equipo_trabajo_accion(uuid, text);
DROP FUNCTION IF EXISTS public.equipo_decidir(uuid, text, text);
DROP FUNCTION IF EXISTS public.equipo_pedir(text, text, text);

DROP FUNCTION IF EXISTS hermes.equipo_cerrar_trabajo(uuid, jsonb);
DROP FUNCTION IF EXISTS hermes.equipo_pedir_aprobacion(uuid, text, text, text, jsonb, text, text, jsonb, uuid, uuid);
DROP FUNCTION IF EXISTS hermes.equipo_progreso(uuid, text, text);
DROP FUNCTION IF EXISTS hermes.equipo_error(uuid, uuid, text);
DROP FUNCTION IF EXISTS hermes.equipo_responder(uuid, uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS hermes.equipo_renovar(uuid, uuid);
DROP FUNCTION IF EXISTS hermes.equipo_tomar(text, integer);
DROP FUNCTION IF EXISTS hermes.equipo_delegar(uuid, text, text, text, text, jsonb, uuid, boolean, smallint, text);
DROP FUNCTION IF EXISTS hermes.equipo_abrir_trabajo(uuid, text, text, text, text, integer, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS hermes.equipo_lease();

DROP TRIGGER  IF EXISTS equipo_mensajes_validar_trg ON public.equipo_mensajes;
DROP FUNCTION IF EXISTS public.equipo_mensajes_validar();

-- El orden lo manda la clave foránea: aprobaciones y mensajes cuelgan de
-- trabajos, así que caen primero.
DROP TABLE IF EXISTS public.equipo_aprobaciones;
DROP TABLE IF EXISTS public.equipo_mensajes;
DROP TABLE IF EXISTS public.equipo_trabajos;
DROP TABLE IF EXISTS public.equipo_agentes;

DROP FUNCTION IF EXISTS public.equipo_ia_permitido();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_revertir.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- VERIFICACIÓN: nada del Equipo IA, y el chat de Hermes intacto.
SELECT
  (SELECT count(*) FROM pg_class WHERE relname LIKE 'equipo\_%')            AS tablas_equipo,
  (SELECT count(*) FROM pg_proc  WHERE proname LIKE 'equipo\_%')            AS funciones_equipo,
  (SELECT count(*) FROM pg_class WHERE relname = 'agentes_ia')              AS jarvis_intacto_1,
  (SELECT count(*) FROM pg_class WHERE relname = 'agente_sistema')          AS jarvis_intacto_2,
  (SELECT count(*) FROM hermes.chat_pendientes(5))                          AS chat_responde;
-- Esperado: 0 | 0 | 1 | 1 | (lo que haya en cola)
