-- =====================================================================
-- Jarvis, también con motor elegible
-- ---------------------------------------------------------------------
-- (2026-08-12) "quiero que Jarvis también tenga la oportunidad de
-- conectarse a través de una suscripción de Claude o de OpenAI".
--
-- >>> JARVIS VIVE EN DOS SITIOS, Y SOLO UNO ADMITE LA SUSCRIPCIÓN <<<
--
--   EL WIDGET       Edge Function motoflow-ai-chat. Síncrona, la llama el
--                   navegador, atiende a CUALQUIERA que abra MotoFlow.
--                   Motores: openai | claude (clave de API).
--                   La suscripción NO cabe: corre en el servidor de
--                   Supabase y no hay cuenta con la que autenticarse.
--
--   LA COLA         hermes.equipo_tomar('jarvis'). Asíncrona, la atiende
--                   scripts/equipo-worker.mjs en una máquina tuya.
--                   Motores: los tres, incluida la suscripción.
--
-- Los dos leen la MISMA fila de equipo_agentes. Si pones
-- 'claude_suscripcion', el widget lo detecta, se queda con su respaldo y
-- sigue contestando: mejor eso que dejar mudo el botón que usa la gente
-- del mostrador todos los días.
--
-- >>> LO QUE NO CAMBIA, PONGAS EL MOTOR QUE PONGAS <<<
-- En la cola, el que busca en el catálogo es el SQL, no el modelo. El
-- worker llama a hermes.buscar_producto() y le pasa las filas ya
-- consultadas; el modelo solo las ordena y las redacta. Por eso "Jarvis
-- nunca inventa un precio" no depende de su prompt ni de qué modelo sea:
-- no tiene de dónde sacarlo.
--
-- Requiere sql/equipo_ia_claude_suscripcion.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

UPDATE public.equipo_agentes
SET persona = 'Eres el especialista de datos de MotoFlow, una tienda de repuestos de motores '
  || 'en República Dominicana. Tu trabajo es devolver datos verificables, no opiniones ni '
  || 'recomendaciones comerciales. '
  || E'\n\n'
  || 'Contestas corto y en orden. Si te preguntan por un precio, das el precio, el código y '
  || 'la existencia. Si hay varios candidatos, los listas y dices cuál encaja mejor y por qué, '
  || 'sin elegir por el que pregunta. '
  || E'\n\n'
  || 'Los datos te llegan ya consultados de la base, en la misma petición. Es lo ÚNICO que '
  || 'existe: no completes una descripción a medias, no redondees un precio, no supongas que '
  || 'hay existencia porque el producto aparece. Si la consulta no devolvió nada, lo dices y '
  || 'explicas qué se buscó. Un "creo que hay" tuyo es un cliente esperando en el mostrador.',
    actualizado_en = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND clave = 'jarvis'
  AND persona IS NULL;       -- no pisa lo editado a mano

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_jarvis_motor.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- CÓMO SE LE CAMBIA EL MOTOR A JARVIS
-- ------------------------------------------------------------
--   Suscripción — solo la cola; el widget sigue con su respaldo:
--     UPDATE public.equipo_agentes
--     SET proveedor='claude_suscripcion', modelo=NULL, ejecuta_en='maquina_propia'
--     WHERE clave='jarvis';
--
--   Claude por API — vale en los dos sitios:
--     UPDATE public.equipo_agentes
--     SET proveedor='claude', modelo='claude-haiku-4-5-20251001', ejecuta_en='nube'
--     WHERE clave='jarvis';
--
--   OpenAI — vale en los dos sitios (así está hoy):
--     UPDATE public.equipo_agentes
--     SET proveedor='openai', modelo='gpt-4o-mini', ejecuta_en='nube'
--     WHERE clave='jarvis';
--
-- El widget lo relee en cada pregunta y el worker en cada mensaje.
-- Ninguno de los dos hay que reiniciarlo.

SELECT clave, proveedor, COALESCE(modelo,'(lo decide el motor)') AS modelo,
       ejecuta_en, temperatura, (persona IS NOT NULL) AS tiene_persona
FROM public.equipo_agentes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY orden;
