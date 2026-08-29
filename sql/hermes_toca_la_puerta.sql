-- =====================================================================
-- Hermes toca la puerta
-- ---------------------------------------------------------------------
-- (2026-08-29, segunda vuelta) Ayer se abrió `encargar_promocion` para que
-- Hermes pudiera encargarle la promoción al Comercial-Creativo. Se probó,
-- funcionaba... y Hermes siguió diciendo "promoción preparada" sin proponer
-- nada. Al mirar por dentro:
--
--   acciones propuestas hoy .............................. 0
--   mensajes de Hermes con acciones, EN TODA LA HISTORIA .. 0
--   las 185 propuestas que existen ....... todas con user_id
--
-- Las 185 las hizo JARVIS, que entra con la sesión del usuario.
-- `agente_proponer_accion` empieza con get_user_tenant(), que necesita un
-- JWT. Hermes entra como ROL de base de datos: no tiene sesión, así que esa
-- puerta le contesta "Sin sesión". Estaba abierta en una pared por la que él
-- no pasa.
--
-- >>> LO QUE SE HACE <<<
-- La misma puerta, en el esquema `hermes` y con la empresa explícita, que es
-- como están escritas TODAS sus funciones (registrar_promocion, buscar_producto,
-- equipo_*). Valida igual de duro que la de Jarvis, y deja exactamente la
-- misma fila en agente_acciones: la tarjeta de autorización, el botón y el
-- ejecutor son los que ya existen. No hay un segundo camino que mantener.
--
-- >>> LO QUE ESTO NO ARREGLA <<<
-- Que Hermes DECIDA llamarla. Su lista de herramientas la arma el gateway en
-- /data/scripts del VPS, fuera de este repo. Aquí queda la función y su
-- declaración en chat_capacidades(); registrarla como herramienta es el
-- último cable, y ese se aprieta allá. Ver docs/HERMES_ENCARGO_PROMOCION.md.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION hermes.proponer_encargo_promocion(
  p_codigo text,
  p_angulo text DEFAULT NULL,
  p_canal  text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  -- La empresa va explícita, como en el resto del esquema hermes: este
  -- Hermes es el de Morla y entra sin sesión, así que get_user_tenant()
  -- devolvería NULL. Ese fue exactamente el fallo de ayer.
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cod    text := btrim(COALESCE(p_codigo, ''));
  v_prod   record;
  v_motivo text;
  v_res    text;
  v_id     uuid;
BEGIN
  IF v_cod = '' THEN
    RETURN json_build_object('ok', false, 'motivo',
      'Falta el codigo de la pieza. Usa el codigo EXACTO de buscar_producto, no la descripcion.');
  END IF;

  SELECT p.id, p.codigo, p.descripcion, p.precio,
         COALESCE(public.get_stock_actual(p.id), 0) AS existencia
    INTO v_prod
  FROM public.productos p
  WHERE p.tenant_id = v_tenant AND lower(p.codigo) = lower(v_cod)
  LIMIT 1;

  IF v_prod.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo',
      format('No existe el codigo %s en el catalogo. Busca la pieza otra vez y usa su codigo exacto.', v_cod));
  END IF;

  -- Las que el dueño marcó a mano como "no promocionar", y las que ya se
  -- promocionaron hace poco. Enterarse después de publicarla no sirve.
  SELECT m.nota INTO v_motivo
  FROM public.marketing_promocion_manual m
  WHERE m.tenant_id = v_tenant AND m.producto_id = v_prod.id
    AND (m.permanente OR m.fecha > now() - interval '30 days')
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', false, 'motivo',
      'Esa pieza esta marcada como "no promocionar"' || COALESCE(': ' || v_motivo, '') || '.');
  END IF;

  -- Ya hay una propuesta viva para esta pieza: se devuelve esa en vez de
  -- apilar tarjetas. Pedir dos veces lo mismo no son dos encargos.
  SELECT a.id INTO v_id
  FROM public.agente_acciones a
  WHERE a.tenant_id = v_tenant AND a.tipo = 'encargar_promocion'
    AND a.estado = 'propuesta' AND a.vence_en > now()
    AND lower(a.payload ->> 'codigo') = lower(v_prod.codigo)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'accion_id', v_id,
      'di_esto', 'Ya te lo dejé propuesto en pantalla. Apruébalo y el Comercial-Creativo lo prepara.');
  END IF;

  v_res := format('Encargarle al Comercial-Creativo la promoción de %s (%s) — RD$ %s, %s en existencia%s',
    v_prod.descripcion, v_prod.codigo,
    to_char(COALESCE(v_prod.precio, 0), 'FM999G999G990D00'),
    v_prod.existencia,
    COALESCE('. Enfoque: ' || NULLIF(btrim(p_angulo), ''), ''));

  INSERT INTO public.agente_acciones (tenant_id, tipo, resumen, payload)
  VALUES (v_tenant, 'encargar_promocion', v_res,
          jsonb_strip_nulls(jsonb_build_object(
            'codigo', v_prod.codigo,
            'angulo', NULLIF(btrim(COALESCE(p_angulo, '')), ''),
            'canal',  NULLIF(btrim(COALESCE(p_canal,  '')), ''),
            'pedido_por', 'hermes')))
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'ok', true,
    'accion_id', v_id,
    'resumen', v_res,
    'producto', json_build_object('codigo', v_prod.codigo, 'descripcion', v_prod.descripcion,
                                  'precio', v_prod.precio, 'existencia', v_prod.existencia),
    -- Lo que Hermes tiene que decir. Se le da escrito para que no lo
    -- reinvente en "ya está lista", que es de donde vino todo esto.
    'di_esto', 'Te lo dejé PROPUESTO en pantalla. Apruébalo y el Comercial-Creativo '
            || 'la prepara; lo verás en Equipo IA. Mientras no lo apruebes, no hay promoción.');
END $fn$;

REVOKE EXECUTE ON FUNCTION hermes.proponer_encargo_promocion(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION hermes.proponer_encargo_promocion(text, text, text) TO hermes_readonly;

-- ---------------------------------------------------------------------
-- La tarjeta tiene que aparecer sola
-- ---------------------------------------------------------------------
-- Las propuestas de Jarvis vienen dentro de su respuesta y la pantalla las
-- pinta al momento. Las de Hermes no: él contesta por hermes_chat, y la fila
-- de agente_acciones queda ahí sin que nadie la mire. Esto es lo que la
-- pantalla consulta para enterarse.
--
-- Se devuelve UNA, la más nueva viva. Dos tarjetas a la vez no se pueden
-- atender y la segunda solo tapa a la primera.
CREATE OR REPLACE FUNCTION public.agente_accion_pendiente()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  SELECT json_build_object(
           'accion_id', a.id,
           'resumen', a.resumen,
           'payload', a.payload,
           'tipo', a.tipo,
           'requiere_password', (public._agente_accion_permitida(a.tipo) ->> 'password')::boolean,
           'de', COALESCE(a.payload ->> 'pedido_por', 'agente'),
           'creado_en', a.creado_en)
    INTO v_out
  FROM public.agente_acciones a
  WHERE a.tenant_id = v_tenant
    AND a.estado = 'propuesta'
    AND a.vence_en > now()
  ORDER BY a.creado_en DESC
  LIMIT 1;

  RETURN v_out;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.agente_accion_pendiente() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.agente_accion_pendiente() TO authenticated;

-- ---------------------------------------------------------------------
-- Y que Hermes vea la herramienta con su nombre de verdad
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.chat_capacidades()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT json_build_object(
    'contrato', 5,
    'contrato_menor', 3,               -- v5.3: encargar al Equipo IA sin sesion
    'contratos_soportados', json_build_array(3, 4, 5),
    'voz', to_regprocedure('hermes.chat_tomar_v5(integer)') IS NOT NULL,
    'multimedia', to_regprocedure('public.hermes_medio_registrar(text,text,text,bigint,text,text,integer,integer,jsonb)') IS NOT NULL,
    'fencing', true,
    'corte_de_contexto', to_regprocedure('hermes.chat_nuevo_contexto(text)') IS NOT NULL,
    'transcripcion_en_motoflow', false,
    'tts_en_motoflow', false,

    -- ── LO QUE PUEDE ENCARGARLE AL EQUIPO IA ─────────────────────────
    -- Hermes NO escribe en ninguna tabla, y asi debe seguir. Encarga
    -- PROPONIENDO: la persona autoriza en pantalla y solo entonces se abre
    -- el trabajo. Ojo: NO uses public.agente_proponer_accion — esa pide
    -- sesion de usuario y Hermes entra como rol, sin JWT.
    'encargos', json_build_object(
      'funcion', 'hermes.proponer_encargo_promocion(p_codigo, p_angulo, p_canal)',
      'devuelve', 'ok, accion_id y di_esto — el texto exacto que debes contestar',
      'aviso', 'PROPONE, no ejecuta. Hasta que la persona lo apruebe en pantalla '
            || 'NO existe la promocion. Nunca digas que ya esta hecha.',
      'p_codigo', 'obligatorio — el codigo EXACTO de buscar_producto, no la descripcion',
      'p_angulo', 'opcional — el enfoque que pidio el dueno',
      'p_canal',  'opcional — historia, feed, estado…',
      'rechaza_si', 'el codigo no existe, o la pieza esta marcada como no promocionar',
      'donde_aparece', 'Equipo IA → Trabajos activos; al terminar, en Esperando tu aprobacion'),

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
$fn$;

-- Y la persona apunta a la funcion correcta, no a la de Jarvis.
UPDATE public.agentes_ia
SET persona = replace(persona,
  '- Para una promoción: busca la pieza, y propón con su CÓDIGO exacto.',
  '- Para una promoción: busca la pieza y llama a proponer_encargo_promocion'
  || E'\r\n' || '  con su CÓDIGO exacto. Contesta con el texto que te devuelve en "di_esto".')
WHERE nombre = 'Hermes'
  AND persona LIKE '%propón con su CÓDIGO exacto.%';

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_toca_la_puerta.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'hermes_puede_llamarla', (SELECT COALESCE(bool_or(
      has_function_privilege('hermes_readonly', p.oid, 'EXECUTE')), false)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='hermes' AND p.proname='proponer_encargo_promocion'),
  'la_pantalla_puede_verla', (SELECT COALESCE(bool_or(
      has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='agente_accion_pendiente'),
  'declarada', (hermes.chat_capacidades() -> 'encargos' ->> 'funcion'),
  'persona_apunta_bien', (SELECT persona LIKE '%proponer_encargo_promocion%'
    FROM public.agentes_ia WHERE nombre='Hermes')
) AS r;
