-- =====================================================================
-- Hermes encarga de verdad, o dice que no puede
-- ---------------------------------------------------------------------
-- (2026-08-29) El dueño le pidió a Hermes por voz: "manda realizar la
-- promoción como el comercial creativo". Hermes contestó "promoción
-- comercial terminada: foto real, logo oficial y precio verificado de
-- RD$1,700, lista para Historia/Estado", y después "te la reenvío aquí
-- mismo como adjunto".
--
-- No existía nada de eso. Se miró TODO:
--   hermes_media hoy .............. 13 notas de voz. Última imagen: 14/08
--   hermes_publication_jobs ....... 2 filas, ambas del 30 de julio
--   equipo_trabajos ............... último el 14/08, los 3 cancelados
--   equipo_aprobaciones ........... 0 filas. Nunca ha habido una.
--   Storage (todos los buckets) ... 7 archivos hoy, todos audio
--
-- Y no es que fallara: el rol hermes_readonly no puede escribir en NINGUNA
-- tabla. No tenía forma física de dejar el encargo en ningún sitio. Le
-- pidieron delegar, no tenía a quién, y contestó como si lo hubiera hecho.
--
-- >>> LAS DOS COSAS QUE HACEN FALTA <<<
--
-- 1. UNA PUERTA. Que pueda encargarle de verdad al Comercial-Creativo. No
--    dándole permiso de escritura —eso es justo lo que no queremos— sino
--    por donde ya se hace todo aquí: PROPONE una acción, y la persona la
--    autoriza en pantalla. Es el mismo camino de crear_cotizacion, que
--    lleva 185 usos.
--
-- 2. QUE NO MIENTA. Mientras no haya apretado el botón, no hay promoción.
--    Que lo diga así.
--
-- >>> POR QUE ESTA ACCION NO PIDE CONTRASEÑA <<<
-- No mueve dinero ni inventario: abre un trabajo que produce un BORRADOR,
-- y ese borrador vuelve a pasar por la aprobación del dueño antes de
-- publicarse. Son dos puertas, no ninguna.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La acción nueva entra en la lista blanca
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._agente_accion_permitida(p_tipo text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_tipo
    WHEN 'crear_cotizacion' THEN
      jsonb_build_object('ok', true, 'password', false,
        'nota', 'Una cotización no mueve inventario ni dinero: se puede autorizar de viva voz.')
    WHEN 'crear_factura' THEN
      jsonb_build_object('ok', true, 'password', true,
        'nota', 'Factura: mueve inventario y emite comprobante fiscal.')
    WHEN 'registrar_pago' THEN
      jsonb_build_object('ok', true, 'password', true,
        'nota', 'Pago: mueve dinero y afecta el cuadre del día.')
    WHEN 'encargar_promocion' THEN
      jsonb_build_object('ok', true, 'password', false,
        'nota', 'Le encarga la promoción al Comercial-Creativo. No publica nada: '
             || 'produce un borrador que vuelve a pasar por tu aprobación.')
    ELSE jsonb_build_object('ok', false)
  END;
$fn$;

-- ---------------------------------------------------------------------
-- 2) Proponerla, con el mismo rigor que una cotización
-- ---------------------------------------------------------------------
-- El producto tiene que EXISTIR. Es la misma lección que dejó
-- crear_cotizacion: si no se comprueba, el modelo describe la pieza en vez
-- de dar su código y el encargo sale hacia una pieza que no está.
CREATE OR REPLACE FUNCTION public.agente_proponer_accion(
  p_tipo text, p_resumen text, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_regla  jsonb := public._agente_accion_permitida(p_tipo);
  v_id     uuid;
  v_malos  text;
  v_n      int;
  v_cod    text;
  v_motivo text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF NOT (v_regla ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'El agente no puede proponer acciones de tipo "%"', p_tipo;
  END IF;

  IF p_tipo = 'crear_cotizacion' THEN
    v_n := jsonb_array_length(COALESCE(p_payload -> 'lineas', '[]'::jsonb));
    IF v_n IS NULL OR v_n = 0 THEN
      RAISE EXCEPTION 'La cotización no lleva líneas. Agrega al menos un producto con su código exacto.';
    END IF;

    SELECT string_agg(DISTINCT quote_literal(x.cod), ', ')
    INTO v_malos
    FROM (
      SELECT btrim(e ->> 'codigo') AS cod
      FROM jsonb_array_elements(p_payload -> 'lineas') e
    ) x
    WHERE COALESCE(x.cod, '') = ''
       OR NOT EXISTS (
            SELECT 1 FROM public.productos p
            WHERE p.tenant_id = v_tenant AND p.codigo = x.cod
          );

    IF v_malos IS NOT NULL THEN
      RAISE EXCEPTION
        'Estos códigos no existen en el catálogo: %. Usa el campo "codigo" EXACTO que devolvió buscar_piezas, tal cual, sin inventarlo ni describirlo. Vuelve a buscar la pieza y propón otra vez.',
        v_malos;
    END IF;
  END IF;

  IF p_tipo = 'encargar_promocion' THEN
    v_cod := btrim(COALESCE(p_payload ->> 'codigo', ''));
    IF v_cod = '' THEN
      RAISE EXCEPTION
        'Falta el "codigo" del producto a promocionar. Usa el codigo EXACTO que devolvio buscar_piezas, no la descripcion.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.productos p
                   WHERE p.tenant_id = v_tenant AND p.codigo = v_cod) THEN
      RAISE EXCEPTION
        'El codigo % no existe en el catalogo. Vuelve a buscar la pieza y propon otra vez con el codigo exacto.',
        quote_literal(v_cod);
    END IF;

    -- El dueño marca a mano piezas que NO se promocionan. Enterarse después
    -- de publicarla no sirve de nada.
    --
    -- Se mira marketing_promocion_manual y NO hermes.productos_no_promocionar,
    -- que seria lo obvio: esa vista lleva el tenant de Morla escrito dentro.
    -- Dentro de una funcion que sirve a cualquier empresa, eso le aplicaria a
    -- una las reglas de otra — y en silencio, que es lo peor.
    SELECT m.nota INTO v_motivo
    FROM public.marketing_promocion_manual m
    JOIN public.productos p ON p.id = m.producto_id
    WHERE m.tenant_id = v_tenant AND p.codigo = v_cod
      AND (m.permanente OR m.fecha > now() - interval '30 days')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Esa pieza esta marcada como "no promocionar"%',
        COALESCE(': ' || v_motivo, '');
    END IF;
  END IF;

  INSERT INTO public.agente_acciones (tenant_id, tipo, resumen, payload)
  VALUES (v_tenant, p_tipo, p_resumen, p_payload)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'accion_id', v_id,
    'estado', 'propuesta',
    'requiere_password', (v_regla ->> 'password')::boolean,
    'nota', v_regla ->> 'nota',
    'aviso', 'PROPUESTA, no ejecutada. La persona debe autorizarla en pantalla.');
END $fn$;

-- ---------------------------------------------------------------------
-- 3) El ejecutor: abre el trabajo de verdad en el Equipo IA
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._agente_ejecutar_encargo_promocion(
  p_tenant uuid, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cod   text := btrim(COALESCE(p_payload ->> 'codigo', ''));
  v_prod  record;
  v_ang   text := NULLIF(btrim(COALESCE(p_payload ->> 'angulo', '')), '');
  v_canal text := NULLIF(btrim(COALESCE(p_payload ->> 'canal',  '')), '');
  v_pet   text;
  v_res   json;
BEGIN
  SELECT p.codigo, p.descripcion, p.precio, COALESCE(public.get_stock_actual(p.id), 0) AS existencia
    INTO v_prod
  FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p.codigo = v_cod;

  IF v_prod.codigo IS NULL THEN
    RAISE EXCEPTION 'El producto % ya no está en el catálogo', quote_literal(v_cod);
  END IF;

  -- La petición lleva los datos YA VERIFICADOS contra el catálogo. El
  -- Comercial-Creativo no tiene que volver a buscarlos —ni puede
  -- inventárselos— y el precio que salga en el arte es el de la base.
  v_pet := format(
    'Prepara la promoción de %s (código %s). Precio de catálogo: RD$ %s. Existencia: %s.%s%s'
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.',
    v_prod.descripcion, v_prod.codigo,
    to_char(COALESCE(v_prod.precio, 0), 'FM999G999G990D00'),
    v_prod.existencia,
    COALESCE(E'\nEnfoque pedido: ' || v_ang, ''),
    COALESCE(E'\nDestino: ' || v_canal, ''));

  v_res := hermes.equipo_abrir_trabajo(
    p_tenant,
    left('Promoción ' || v_prod.descripcion, 60),
    v_pet,
    'promocion',
    NULL, NULL, 'motoflow', auth.uid()::text, NULL, auth.uid(),
    -- Idempotente por producto y día: pedir dos veces la promoción de la
    -- misma pieza hoy devuelve el trabajo que ya existe en vez de abrir dos.
    'promo:' || p_tenant::text || ':' || v_cod || ':' || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text);

  RETURN json_build_object(
    'ok', true,
    'trabajo', v_res,
    'producto', json_build_object('codigo', v_prod.codigo, 'descripcion', v_prod.descripcion,
                                  'precio', v_prod.precio, 'existencia', v_prod.existencia),
    'donde_verlo', 'Equipo IA → Trabajos activos. Cuando el Comercial-Creativo termine, '
                || 'aparece en Esperando tu aprobación.');
END $fn$;

REVOKE EXECUTE ON FUNCTION public._agente_ejecutar_encargo_promocion(uuid, jsonb) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- 4) Confirmar la acción sabe ejecutarla
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agente_confirmar_accion(
  p_accion_id uuid, p_password text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  a        record;
  v_regla  jsonb;
  v_res    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  SELECT * INTO a FROM public.agente_acciones
  WHERE id = p_accion_id AND tenant_id = v_tenant FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Acción no encontrada'; END IF;

  IF a.estado <> 'propuesta' THEN
    RETURN json_build_object('ok', false, 'motivo', 'Esa acción ya fue ' || a.estado);
  END IF;

  IF now() > a.vence_en THEN
    UPDATE public.agente_acciones SET estado = 'vencida', resuelto_en = now() WHERE id = a.id;
    RETURN json_build_object('ok', false, 'motivo',
      'La propuesta venció. Pídesela de nuevo al agente para verla con los datos de ahora.');
  END IF;

  v_regla := public._agente_accion_permitida(a.tipo);
  IF (v_regla ->> 'password')::boolean AND NOT public.es_usuario_admin() THEN
    IF p_password IS NULL OR NOT public.verificar_password_administrativo(p_password) THEN
      RAISE EXCEPTION 'Esta acción mueve dinero: hace falta contraseña administrativa';
    END IF;
  END IF;

  BEGIN
    IF a.tipo = 'crear_cotizacion' THEN
      v_res := public._agente_ejecutar_cotizacion(v_tenant, a.payload);
    ELSIF a.tipo = 'encargar_promocion' THEN
      v_res := public._agente_ejecutar_encargo_promocion(v_tenant, a.payload);
    ELSE
      -- Declaradas pero sin ejecutor todavía. Se falla claro en vez de
      -- fingir: facturar y cobrar tienen que engancharse a los flujos que
      -- ya existen, no reimplementarse aquí a medias.
      RAISE EXCEPTION 'El tipo "%" todavía no tiene ejecutor conectado', a.tipo;
    END IF;

    UPDATE public.agente_acciones
    SET estado = 'ejecutada', resultado = v_res::jsonb, resuelto_en = now()
    WHERE id = a.id;

    RETURN json_build_object('ok', true, 'resultado', v_res);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.agente_acciones
    SET estado = 'fallida', error = SQLERRM, resuelto_en = now()
    WHERE id = a.id;
    RAISE;
  END;
END $fn$;

-- ---------------------------------------------------------------------
-- 5) Y que Hermes sepa que la puerta existe
-- ---------------------------------------------------------------------
-- Sin esto, la puerta está abierta y nadie la usa: el modelo no adivina que
-- tiene una herramienta nueva. Se declara en chat_capacidades(), que es lo
-- que el gateway lee en cada arranque.
CREATE OR REPLACE FUNCTION hermes.chat_capacidades()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT json_build_object(
    'contrato', 5,
    'contrato_menor', 2,               -- v5.2: encargar al Equipo IA
    'contratos_soportados', json_build_array(3, 4, 5),
    'voz', to_regprocedure('hermes.chat_tomar_v5(integer)') IS NOT NULL,
    'multimedia', to_regprocedure('public.hermes_medio_registrar(text,text,text,bigint,text,text,integer,integer,jsonb)') IS NOT NULL,
    'fencing', true,
    'corte_de_contexto', to_regprocedure('hermes.chat_nuevo_contexto(text)') IS NOT NULL,
    'transcripcion_en_motoflow', false,
    'tts_en_motoflow', false,

    -- ── LO QUE PUEDE ENCARGARLE AL EQUIPO IA ─────────────────────────
    -- Hermes NO tiene permiso de escritura en ninguna tabla, y asi debe
    -- seguir. Encarga PROPONIENDO: la persona autoriza en pantalla y solo
    -- entonces se abre el trabajo. Es el mismo camino de crear_cotizacion.
    'encargos', json_build_object(
      'como', 'public.agente_proponer_accion(p_tipo, p_resumen, p_payload)',
      'aviso', 'PROPONE, no ejecuta. Hasta que la persona lo autorice en '
            || 'pantalla NO existe el encargo. Nunca digas que ya esta hecho.',
      'tipos', json_build_array(
        json_build_object(
          'tipo', 'encargar_promocion',
          'para', 'Que el Comercial-Creativo prepare la promocion de una pieza.',
          'payload', json_build_object(
            'codigo', 'obligatorio — el codigo EXACTO de buscar_piezas, no la descripcion',
            'angulo', 'opcional — el enfoque que pidio el dueno',
            'canal',  'opcional — historia, feed, estado…'),
          'donde_aparece', 'Equipo IA → Trabajos activos; al terminar, en Esperando tu aprobacion',
          'rechaza_si', 'el codigo no existe, o la pieza esta marcada como no promocionar'))),

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

-- ---------------------------------------------------------------------
-- 6) Y que no diga que hizo algo que no hizo
-- ---------------------------------------------------------------------
-- Lo barato y lo que mas vale: la persona de Hermes vive en esta tabla, no
-- en el VPS. Se le añade la regla, conservando todo lo demas tal cual.
UPDATE public.agentes_ia
SET persona = persona || E'\r\n' || E'\r\n' ||
'LO QUE NO PUEDES DECIR' || E'\r\n' ||
'- Nunca digas que hiciste algo si no lo hizo una herramienta. Ni "ya está",' || E'\r\n' ||
'  ni "lo mandé", ni "te lo envío como adjunto". Si no hay resultado de una' || E'\r\n' ||
'  herramienta, no pasó — por muy razonable que suene.' || E'\r\n' ||
'- No describas un trabajo que no existe. Una promoción "con foto real, logo' || E'\r\n' ||
'  y precio verificado" que nadie preparó es peor que decir "no puedo": el' || E'\r\n' ||
'  dueño la da por hecha y no la busca hasta que la necesita.' || E'\r\n' ||
'- Si te piden algo que no tienes cómo hacer, dilo en una línea y ofrece lo' || E'\r\n' ||
'  más cercano que sí puedas.' || E'\r\n' ||
E'\r\n' ||
'CUANDO TE PIDEN ENCARGARLE ALGO AL EQUIPO' || E'\r\n' ||
'- Tú no publicas ni diseñas. Lo que puedes hacer es ENCARGARLO: propones la' || E'\r\n' ||
'  acción y el dueño la autoriza en pantalla.' || E'\r\n' ||
'- Para una promoción: busca la pieza, y propón con su CÓDIGO exacto. Después' || E'\r\n' ||
'  di la verdad: "te lo dejé propuesto, apruébalo y el Comercial-Creativo lo' || E'\r\n' ||
'  prepara. Lo verás en Equipo IA."' || E'\r\n' ||
'- Mientras no lo apruebe, NO hay promoción. Dilo así de claro.'
WHERE nombre = 'Hermes'
  AND persona NOT LIKE '%LO QUE NO PUEDES DECIR%';

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_encarga_de_verdad.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'accion_permitida', public._agente_accion_permitida('encargar_promocion'),
  'tiene_ejecutor', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_agente_ejecutar_encargo_promocion'),
  'declarada_a_hermes', (hermes.chat_capacidades() -> 'encargos' -> 'tipos' -> 0 ->> 'tipo'),
  'persona_avisada', (SELECT persona LIKE '%LO QUE NO PUEDES DECIR%'
     FROM public.agentes_ia WHERE nombre = 'Hermes'),
  'persona_largo', (SELECT length(persona) FROM public.agentes_ia WHERE nombre = 'Hermes')
) AS r;
