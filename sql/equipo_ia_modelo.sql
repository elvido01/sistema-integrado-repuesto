-- =====================================================================
-- Equipo IA — el modelo de cada agente es un dato, no una línea de código
-- ---------------------------------------------------------------------
-- (2026-08-12) "quiero que pueda utilizar una suscripción de Claude y de
-- OpenAI por si quiero cambiarle el modelo en el futuro".
--
-- La suscripción no: se autentica con una cuenta personal y esto corre en
-- un servidor atendiendo peticiones. Hace falta una clave de API de
-- console.anthropic.com o de OpenAI, con su crédito aparte.
--
-- Lo que sí, y es lo que pedía la frase de verdad: que cambiar de modelo
-- sea un UPDATE. Hoy el proveedor estaba escrito en el código de la Edge
-- Function; a partir de aquí vive aquí, por agente.
--
-- >>> POR QUÉ POR AGENTE Y NO GLOBAL <<<
-- No tienen el mismo trabajo. Jarvis consulta y devuelve datos: con el
-- modelo más barato sobra. Comercial-Creativo redacta lo que va a leer un
-- cliente, y ahí sí se nota uno mejor. Un ajuste global obliga a pagar el
-- caro para todos o a aguantar el flojo en lo que importa.
--
-- >>> LO QUE ESTO NO HACE <<<
-- No pone a nadie a trabajar. Sigue sin haber un proceso que recoja de la
-- cola del Comercial-Creativo: esto es la ficha del puesto, no el
-- empleado. Ver docs/CONTRATO_EQUIPO_IA.md.
--
-- Requiere sql/equipo_ia.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

ALTER TABLE public.equipo_agentes
  -- Cómo escribe. Lo que agentes_ia y agente_sistema ya tenían y a esta
  -- tabla le faltaba: sin persona, un agente contesta como un manual.
  ADD COLUMN IF NOT EXISTS persona   text,
  ADD COLUMN IF NOT EXISTS proveedor text NOT NULL DEFAULT 'openai'
             CHECK (proveedor IN ('openai', 'claude')),
  -- NULL = que decida el worker con su valor por defecto. Poner un modelo
  -- concreto aquí lo fija para ese agente.
  ADD COLUMN IF NOT EXISTS modelo    text,
  -- Cuánto se le deja escribir de una vez. Un copy de Instagram no
  -- necesita 4000 tokens; un concepto de video sí.
  ADD COLUMN IF NOT EXISTS max_tokens integer NOT NULL DEFAULT 800
             CHECK (max_tokens BETWEEN 100 AND 8000),
  ADD COLUMN IF NOT EXISTS temperatura numeric(3,2) NOT NULL DEFAULT 0.30
             CHECK (temperatura BETWEEN 0 AND 1);

-- ------------------------------------------------------------
-- LA PERSONA DEL COMERCIAL-CREATIVO
-- ------------------------------------------------------------
-- Las reglas duras NO van aquí: viven en `politicas` y en el código, y un
-- prompt no puede levantarlas. Aquí va solo cómo habla.
UPDATE public.equipo_agentes
SET persona = 'Escribes para una tienda de repuestos de motores en República Dominicana. '
  || 'Hablas como el dueño le habla a un cliente del barrio: directo, cercano, sin adornos '
  || 'y sin palabras de catálogo. Nada de "¡Increíble oferta!" ni signos de exclamación en '
  || 'cadena. Dices el producto, para qué sirve y qué cuesta. '
  || E'\n\n'
  || 'Los precios y las existencias NUNCA los pones tú: te llegan verificados por Jarvis. '
  || 'Si un dato no te llegó, lo dices y no lo rellenas. Un precio inventado en una '
  || 'promoción es un cliente que llega al mostrador esperando otra cosa. '
  || E'\n\n'
  || 'Entregas borradores, no publicaciones. Cada cosa que prepares lleva su estado claro: '
  || 'borrador, propuesta, aprobado o ejecutado. No apruebas tu propio trabajo.',
    -- Empieza barato a propósito. Se sube el día que el resultado lo pida,
    -- no el día que se instala.
    proveedor = COALESCE(proveedor, 'openai'),
    modelo = COALESCE(modelo, 'gpt-4o-mini'),
    max_tokens = 800,
    temperatura = 0.60,      -- redacta: algo de aire ayuda
    actualizado_en = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND clave = 'comercial_creativo'
  AND persona IS NULL;       -- no pisa lo que ya se haya editado a mano

UPDATE public.equipo_agentes
SET modelo = COALESCE(modelo, 'gpt-4o-mini'),
    temperatura = 0.10,      -- consulta datos: cuanto más literal, mejor
    actualizado_en = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND clave = 'jarvis' AND modelo IS NULL;

-- ------------------------------------------------------------
-- LO QUE NECESITA UN WORKER PARA ARRANCAR
-- ------------------------------------------------------------
-- Una sola llamada: quién es, cómo habla, con qué modelo y qué NO puede
-- hacer. Sin esto cada worker tendría que armarlo de tres consultas y
-- acabarían desincronizados.
CREATE OR REPLACE FUNCTION hermes.equipo_agente_config(p_clave text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
           'clave', a.clave, 'nombre', a.nombre, 'rol', a.rol_visible,
           'persona', a.persona,
           'proveedor', a.proveedor, 'modelo', a.modelo,
           'max_tokens', a.max_tokens, 'temperatura', a.temperatura,
           'capacidades', a.capacidades, 'limites', a.limites,
           'politicas', a.politicas,
           'puede_delegar_a', a.puede_delegar_a,
           'activo', a.activo)
  FROM public.equipo_agentes a
  WHERE a.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND a.clave = btrim(p_clave);
$$;

REVOKE ALL ON FUNCTION hermes.equipo_agente_config(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_agente_config(text) TO hermes_readonly;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_modelo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- CÓMO SE CAMBIA DE MODELO, EL DÍA QUE TOQUE
-- ------------------------------------------------------------
-- A Claude (necesita ANTHROPIC_API_KEY como secreto de Supabase):
--
--   UPDATE public.equipo_agentes
--   SET proveedor = 'claude', modelo = 'claude-haiku-4-5-20251001'
--   WHERE clave = 'comercial_creativo';
--
-- De vuelta a OpenAI:
--
--   UPDATE public.equipo_agentes
--   SET proveedor = 'openai', modelo = 'gpt-4o-mini'
--   WHERE clave = 'comercial_creativo';
--
-- Sin desplegar, sin tocar código, y por agente. Los precios de cada
-- modelo están en supabase/functions/motoflow-ai-chat/llm.ts (PRICES):
-- si pones uno que no esté en esa tabla, el costo se reporta como 0 y el
-- medidor miente. Agrégalo allí también.

-- Verificación:
SELECT clave, proveedor, modelo, max_tokens, temperatura,
       (persona IS NOT NULL) AS tiene_persona
FROM public.equipo_agentes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY orden;
