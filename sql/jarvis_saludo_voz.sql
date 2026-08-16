-- =====================================================================
-- CÓMO SALUDA JARVIS AL ABRIR LA VOZ
-- ---------------------------------------------------------------------
-- (2026-08-16) "cuando abro el sistema de voz por primera vez en cada
-- conversación quiero que me pregunte en qué le puedo servir, señor."
--
-- El saludo NO está en el código: vive aquí, en la ficha del agente, para
-- que cambiarlo no exija un despliegue. Se edita, y en la siguiente vez que
-- se abra la esfera ya dice otra cosa.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

UPDATE public.agente_sistema
SET saludo = '¿En qué le puedo servir, señor?',
    actualizado_en = now()
WHERE id = 1;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_saludo_voz.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Para cambiarlo otra vez, esto y nada más:
--   UPDATE public.agente_sistema SET saludo = '...' WHERE id = 1;
SELECT nombre, saludo FROM public.agente_sistema WHERE id = 1;
