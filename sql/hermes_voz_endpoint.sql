-- =====================================================================
-- El endpoint de medios, descubrible desde la base
-- ---------------------------------------------------------------------
-- (2026-08-13) Hermes reportó dos bloqueos al implementar la voz:
--
--   1. "no tiene configurada la dirección/credencial del endpoint privado
--       hermes-media"
--   2. "su rol PostgreSQL no puede ejecutar directamente media_canjear()"
--
-- >>> EL SEGUNDO NO ES UN BLOQUEO: ES EL DISEÑO <<<
-- Y conviene decirlo antes de que alguien lo "arregle" con un GRANT.
--
-- media_canjear() devuelve una RUTA dentro de un bucket privado. No
-- devuelve el archivo ni una URL que sirva para bajarlo. Aunque
-- hermes_readonly pudiera ejecutarla, seguiría sin poder descargar nada:
-- las credenciales del bucket las tiene la Edge Function y solo ella.
--
-- Es decir: conceder media_canjear a Hermes no abriría una segunda ruta,
-- abriría media ruta —y de paso le daría a un rol de solo lectura la
-- capacidad de gastar los usos de un permiso ajeno—. La ruta buena es
-- una: el endpoint HTTP.
--
-- >>> EL PRIMERO SÍ ERA UN HUECO MÍO <<<
-- El contrato decía `https://<proyecto>.functions.supabase.co/...` con el
-- proyecto entre paréntesis angulares. Eso obliga a Hermes a que alguien
-- le pase la URL a mano y a hardcodearla. Ahora la anuncia la base: quien
-- ya puede llamar a chat_capacidades() —Hermes puede— obtiene la
-- dirección exacta sin que nadie se la dicte.
--
-- La CLAVE no va aquí y no es un descuido: es la anon key del proyecto,
-- que es pública por diseño (viaja en el bundle web y en la app móvil).
-- Ponerla en una función de la base sugeriría que es un secreto y que
-- este es su sitio. No lo es.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION hermes.chat_capacidades()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'contrato', 5,
    'contrato_menor', 1,               -- v5.1: superficie móvil y multi-medio
    'contratos_soportados', json_build_array(3, 4, 5),
    'voz', to_regprocedure('hermes.chat_tomar_v5(integer)') IS NOT NULL,
    'multimedia', to_regprocedure('public.hermes_medio_registrar(text,text,text,bigint,text,text,integer,integer,jsonb)') IS NOT NULL,
    'fencing', true,
    'corte_de_contexto', to_regprocedure('hermes.chat_nuevo_contexto(text)') IS NOT NULL,
    'transcripcion_en_motoflow', false,
    'tts_en_motoflow', false,

    -- ── LO QUE HERMES NECESITA PARA BAJAR Y SUBIR AUDIO ──────────────
    'medios', json_build_object(
      'base_url', 'https://zdvxowpuklbypweyqqki.functions.supabase.co/hermes-media',
      'descargar', json_build_object(
        'metodo', 'GET',
        'ruta', '/descargar',
        'cabeceras', json_build_array('Authorization: Bearer <ANON_KEY>',
                                      'X-Media-Token: <media_token de chat_tomar_v5>'),
        'devuelve', 'los bytes del archivo, con Content-Type, X-Media-Id y X-Sha256'),
      'tts', json_build_object(
        'metodo', 'POST',
        'ruta', '/tts',
        'cabeceras', json_build_array('Authorization: Bearer <ANON_KEY>',
                                      'Content-Type: audio/mpeg',
                                      'X-Mensaje-Id: <id>',
                                      'X-Claim-Token: <claim_token>',
                                      'X-Duration-Ms: <ms>'),
        'devuelve', 'media_id, para pasarlo a chat_responder_voz'),
      -- La anon key NO va en la base: es pública, pero su sitio es la
      -- configuración del gateway, no una función de PostgreSQL.
      'anon_key_donde', 'La misma anon key del proyecto. Está en mobile/src/supabase/client.ts y en el bundle web. Es pública por diseño.',
      'por_que_no_media_canjear',
        'media_canjear() devuelve una ruta dentro de un bucket privado, no el archivo. '
        || 'Las credenciales del bucket las tiene solo la Edge Function. Concederla a '
        || 'hermes_readonly no abriria una segunda ruta: dejaria gastar los usos de un '
        || 'permiso sin poder descargar nada.'),

    'limites', hermes.voz_limites(),
    'limites_medios', CASE WHEN to_regprocedure('hermes.medios_limites()') IS NOT NULL
                           THEN hermes.medios_limites() ELSE NULL END,
    'contrato_doc', 'docs/HERMES_MOTOFLOW_VOICE_CONTRACT_V1.md (repo MotoFlow, rama feat/mercancias-filtros)');
$$;

GRANT EXECUTE ON FUNCTION hermes.chat_capacidades() TO hermes_readonly, authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_voz_endpoint.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Lo que Hermes verá:
SELECT jsonb_pretty((hermes.chat_capacidades() -> 'medios')::jsonb) AS lo_que_necesita_hermes;
