-- =====================================================================
-- Equipo IA — tercer proveedor: la suscripción de Claude
-- ---------------------------------------------------------------------
-- (2026-08-12) "necesito poder conectar el modelo comercial con una
-- suscripción de Claude".
--
-- Yo había dicho que no se podía, y estaba mirando el sitio equivocado.
-- Es cierto que una Edge Function NO puede usar una suscripción: corre en
-- el servidor de Supabase y no hay cuenta con la que autenticarse. Pero el
-- Comercial-Creativo no tiene por qué correr ahí.
--
-- Claude Code SÍ se autentica con la suscripción, y corre como un proceso
-- en una máquina tuya. Es exactamente la forma que ya tiene Hermes en el
-- VPS: un proceso que toma de una cola y contesta. La cola ya existe.
--
-- >>> LOS TRES MOTORES <<<
--   openai              clave de API de OpenAI, desde donde sea
--   claude              clave de API de console.anthropic.com
--   claude_suscripcion  Claude Code en una maquina tuya, con tu cuenta
--
-- El worker es scripts/equipo-comercial-worker.mjs y los tres se eligen
-- con un UPDATE de una linea.
--
-- >>> LO QUE TIENES QUE MIRAR TU <<<
-- Una suscripcion personal atendiendo trabajo de la empresa es un uso que
-- conviene que confirmes en los terminos de Anthropic. Y los limites de
-- uso son los de tu cuenta: si te quedas sin cuota, el worker se queda
-- sin contestar y el trabajo se ve parado en la pantalla — no falla en
-- silencio, pero se para.
--
-- Requiere sql/equipo_ia_modelo.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

ALTER TABLE public.equipo_agentes DROP CONSTRAINT IF EXISTS equipo_agentes_proveedor_check;
ALTER TABLE public.equipo_agentes
  ADD CONSTRAINT equipo_agentes_proveedor_check
  CHECK (proveedor IN ('openai', 'claude', 'claude_suscripcion'));

-- Dónde corre el worker de ese agente. Solo informativo, para que la
-- pantalla pueda decir "esto lo atiende una máquina tuya" en vez de dejar
-- pensar que vive en la nube.
ALTER TABLE public.equipo_agentes
  ADD COLUMN IF NOT EXISTS ejecuta_en text NOT NULL DEFAULT 'nube'
             CHECK (ejecuta_en IN ('nube', 'maquina_propia'));

-- El Comercial-Creativo pasa a la suscripción.
--
-- El modelo queda en NULL a propósito: con Claude Code lo decide la
-- sesión, no esta fila. Fijar aquí un modelo que la suscripción no sirva
-- daría un error del CLI que no dice nada útil.
UPDATE public.equipo_agentes
SET proveedor  = 'claude_suscripcion',
    modelo     = NULL,
    ejecuta_en = 'maquina_propia',
    actualizado_en = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND clave = 'comercial_creativo';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_claude_suscripcion.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- CAMBIAR DE MOTOR, EL DÍA QUE TOQUE
-- ------------------------------------------------------------
--   Suscripción (Claude Code en tu máquina):
--     UPDATE public.equipo_agentes
--     SET proveedor='claude_suscripcion', modelo=NULL, ejecuta_en='maquina_propia'
--     WHERE clave='comercial_creativo';
--
--   Clave de API de Anthropic:
--     UPDATE public.equipo_agentes
--     SET proveedor='claude', modelo='claude-haiku-4-5-20251001', ejecuta_en='nube'
--     WHERE clave='comercial_creativo';
--
--   OpenAI:
--     UPDATE public.equipo_agentes
--     SET proveedor='openai', modelo='gpt-4o-mini', ejecuta_en='nube'
--     WHERE clave='comercial_creativo';
--
-- El worker lee esto en CADA mensaje. Cambiarlo no exige reiniciarlo.

SELECT clave, proveedor, COALESCE(modelo,'(lo decide el motor)') AS modelo,
       ejecuta_en, temperatura
FROM public.equipo_agentes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY orden;
