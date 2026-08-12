-- =====================================================================
-- Deshacer el contrato v4
-- ---------------------------------------------------------------------
-- Deja el canal exactamente en v3: sin fencing y sin cortes de contexto.
-- NO revierte v3; para eso está hermes_canal_v3_revertir.sql.
--
-- >>> QUÉ SE PIERDE <<<
-- Los claim_token y lease_until en vuelo (no importan: son de un momento)
-- y, esto sí, LOS CORTES DE CONTEXTO. Al desaparecer context_epoch, una
-- conversación que se había cortado tres veces vuelve a ser una sola
-- conversación continua. No se borra ni un mensaje —siguen todos, con su
-- texto y su hora— pero el agente vuelve a verlos como un solo hilo.
--
-- >>> ANTES DE CORRERLO <<<
-- Hermes tiene que haber vuelto a las firmas de dos y tres argumentos.
-- Si revierte mientras el plugin llama a chat_responder(id, texto,
-- acciones, token), esas llamadas empiezan a fallar con "function does
-- not exist" y el canal se queda mudo; el error sale en los registros
-- del gateway, no aquí.
--
-- El orden importa: primero se restauran las funciones de v3 —que no
-- miran ninguna columna nueva— y solo después se quitan las columnas y
-- la tabla. Al revés habría un hueco en que nada funciona.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FRENO DE MANO                                                   ║
-- ║                                                                  ║
-- ║  Para correr esta reversa, BORRA la línea de abajo.               ║
-- ║                                                                  ║
-- ║  Está aquí porque este archivo se corrió dos veces sin querer     ║
-- ║  —queda abierto en una pestaña del editor al lado de la           ║
-- ║  migración y de las pruebas, y las tres se ven igual—. La         ║
-- ║  segunda vez desmontó un v4 que acababa de pasar 20 pruebas.      ║
-- ║  No hizo daño, pero costó una vuelta entera.                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
DO $$ BEGIN RAISE EXCEPTION 'FRENO DE MANO: esto es la REVERSA de v4, no la migración. Si de verdad quieres desmontar el fencing y las épocas, borra esta línea del archivo. La migración es sql/hermes_canal_v4.sql.'; END $$;

-- ------------------------------------------------------------
-- 1. LAS FUNCIONES DE v3, TAL CUAL ESTABAN
-- ------------------------------------------------------------

-- 1a. El trigger: deja de sellar la época y de tocar hermes_conversaciones.
-- Va primero porque la tabla se borra al final y el trigger la nombra.
CREATE OR REPLACE FUNCTION public.hermes_chat_sincronizar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rol = 'hermes' THEN NEW.estado := 'respondido'; NEW.respondido := true; END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.respondido := (NEW.estado = 'respondido');
  ELSIF NEW.respondido IS DISTINCT FROM OLD.respondido THEN
    NEW.estado := CASE WHEN NEW.respondido THEN 'respondido' ELSE NEW.estado END;
  END IF;

  IF NEW.estado = 'respondido' AND NEW.respondido_en IS NULL THEN
    NEW.respondido_en := now();
  END IF;
  RETURN NEW;
END $$;

-- 1b. chat_tomar: pierde claim_token, lease_until y context_epoch, así que
-- cambia el tipo de retorno y CREATE OR REPLACE no basta (42P13).
DROP FUNCTION IF EXISTS hermes.chat_tomar(integer);

CREATE OR REPLACE FUNCTION hermes.chat_tomar(p_limite integer DEFAULT 1)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  origin_platform text, origin_chat_id text, origin_message_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  RETURN QUERY
  WITH candidatos AS (
    SELECT
      c.id,
      row_number() OVER (PARTITION BY c.conversation_key
                         ORDER BY c.creado_en, c.id) AS puesto
    FROM public.hermes_chat c
    WHERE c.tenant_id = v_tenant
      AND c.rol = 'usuario'
      AND c.intentos < 3
      AND (
        c.estado = 'pendiente'
        OR (c.estado = 'procesando'
            AND c.procesando_en <= now() - interval '5 minutes')
      )
      AND NOT EXISTS (
            SELECT 1 FROM public.hermes_chat o
            WHERE o.tenant_id = c.tenant_id
              AND o.conversation_key IS NOT DISTINCT FROM c.conversation_key
              AND o.rol = 'usuario'
              AND o.id <> c.id
              AND o.estado = 'procesando'
              AND o.procesando_en > now() - interval '5 minutes'
          )
  ),
  elegidos AS (
    SELECT c.id
    FROM public.hermes_chat c
    WHERE c.id IN (SELECT k.id FROM candidatos k WHERE k.puesto = 1)
    ORDER BY c.creado_en, c.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 1), 10))
  ),
  tomados AS (
    UPDATE public.hermes_chat c
    SET estado = 'procesando',
        procesando_en = now(),
        recibido_en = COALESCE(c.recibido_en, now()),
        intentos = c.intentos + 1,
        estado_detalle = NULL
    FROM elegidos e
    WHERE c.id = e.id
    RETURNING c.*
  )
  SELECT t.id, t.texto, t.pantalla, t.creado_en,
         t.user_id, p.full_name, p.email, p.role,
         t.conversation_key, t.estado, t.intentos,
         t.origin_platform, t.origin_chat_id, t.origin_message_id
  FROM tomados t
  LEFT JOIN public.profiles p ON p.id = t.user_id AND p.tenant_id = t.tenant_id
  ORDER BY t.creado_en;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_tomar(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_tomar(integer) TO hermes_readonly;

-- 1c. chat_error sin soltar el claim (las columnas dejan de existir)
CREATE OR REPLACE FUNCTION hermes.chat_error(p_mensaje_id bigint, p_error text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_fila   record;
BEGIN
  UPDATE public.hermes_chat
  SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
      error_en = now(),
      ultimo_error = left(btrim(COALESCE(p_error, 'sin detalle')), 500),
      estado_detalle = NULL,
      procesando_en = NULL
  WHERE tenant_id = v_tenant AND id = p_mensaje_id AND estado <> 'respondido'
  RETURNING id, estado, intentos INTO v_fila;

  IF v_fila.id IS NULL THEN
    RETURN json_build_object('ok', true, 'cambiado', false,
                             'motivo', 'ya respondido o inexistente');
  END IF;

  RETURN json_build_object('ok', true, 'cambiado', true,
                           'estado', v_fila.estado, 'intentos', v_fila.intentos,
                           'reintentable', v_fila.estado = 'pendiente');
END $$;

-- 1d. chat_responder sin época ni arrendamiento
CREATE OR REPLACE FUNCTION hermes.chat_responder(
  p_mensaje_id bigint, p_texto text, p_acciones jsonb DEFAULT NULL::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_malos   text;
  v_estado  text;
  v_conv    text;
  v_previa  bigint;
  v_nueva   bigint;
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Respuesta vacía'; END IF;

  SELECT estado, conversation_key INTO v_estado, v_conv
  FROM public.hermes_chat
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El mensaje % no existe en este tenant', p_mensaje_id;
  END IF;

  IF v_estado = 'respondido' THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
  END IF;

  IF p_acciones IS NOT NULL AND p_acciones ->> 'tipo' = 'preparar_venta' THEN
    SELECT string_agg(DISTINCT quote_literal(x.cod), ', ')
    INTO v_malos
    FROM (
      SELECT btrim(e ->> 'codigo') AS cod
      FROM jsonb_array_elements(COALESCE(p_acciones -> 'lineas', '[]'::jsonb)) e
    ) x
    WHERE COALESCE(x.cod, '') = ''
       OR NOT EXISTS (
            SELECT 1 FROM public.productos p
            WHERE p.tenant_id = v_tenant AND p.codigo = x.cod
          );

    IF v_malos IS NOT NULL THEN
      RAISE EXCEPTION
        'Estos códigos no existen en el catálogo: %. Usa el "codigo" exacto de la vista de productos, copiado tal cual.',
        v_malos;
    END IF;
  END IF;

  IF p_acciones IS NOT NULL AND p_acciones ->> 'estado' IS NULL THEN
    p_acciones := p_acciones || jsonb_build_object('estado', 'propuesta');
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, acciones, responde_a, conversation_key, origin_platform)
  VALUES
    (v_tenant, 'hermes', btrim(p_texto), p_acciones, p_mensaje_id, v_conv, 'hermes')
  RETURNING id INTO v_nueva;

  UPDATE public.hermes_chat
  SET estado = 'respondido', respondido_en = now(), estado_detalle = NULL
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  RETURN json_build_object('ok', true, 'duplicado', false, 'respuesta_id', v_nueva);

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
END $$;

-- 1e. chat_pendientes sin las tres columnas nuevas (otra vez 42P13)
DROP FUNCTION IF EXISTS hermes.chat_pendientes(integer);

CREATE OR REPLACE FUNCTION hermes.chat_pendientes(p_limite integer DEFAULT 10)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.texto, c.pantalla, c.creado_en,
         c.user_id, p.full_name, p.email, p.role,
         c.conversation_key, c.estado, c.intentos
  FROM public.hermes_chat c
  LEFT JOIN public.profiles p
         ON p.id = c.user_id AND p.tenant_id = c.tenant_id
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.rol = 'usuario'
    AND c.estado IN ('pendiente', 'procesando')
  ORDER BY c.creado_en
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 10), 50));
$$;

-- 1f. hermes_escribir sin época
CREATE OR REPLACE FUNCTION public.hermes_escribir(
  p_texto text,
  p_pantalla jsonb DEFAULT NULL::jsonb,
  p_origin_chat_id text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_texto  text := btrim(p_texto);
  v_id     bigint;
  v_prev   record;
  v_pantalla jsonb := p_pantalla;
  v_cands  jsonb;
  v_conv   text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF COALESCE(v_texto, '') = '' THEN RAISE EXCEPTION 'Mensaje vacío'; END IF;

  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT c.id, c.texto INTO v_prev
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant
    AND c.user_id IS NOT DISTINCT FROM auth.uid()
    AND c.rol = 'usuario'
    AND c.estado = 'pendiente'
    AND c.creado_en > now() - interval '10 seconds'
  ORDER BY c.creado_en DESC, c.id DESC
  LIMIT 1;

  IF v_prev.id IS NOT NULL THEN
    IF v_prev.texto = v_texto THEN
      RETURN json_build_object('id', v_prev.id, 'enviado', true, 'repetido', true);
    END IF;
    IF starts_with(v_texto, v_prev.texto) THEN
      UPDATE public.hermes_chat SET estado = 'respondido', respondido = true
      WHERE id = v_prev.id;
    END IF;
  END IF;

  IF v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
     AND v_texto ~* '(precio|costo|cuánto|cuanto|vale|cotiz|tien|teng|tenem|hay |queda|disponib|existencia|stock|inventario|busca|búsca|consigue|vend|cobr|factur)'
  THEN
    BEGIN
      SELECT jsonb_agg(to_jsonb(b)) INTO v_cands
      FROM (SELECT codigo, descripcion, marca, precio, existencia, ubicacion
            FROM hermes.buscar_producto(v_texto, 6)) b;
    EXCEPTION WHEN OTHERS THEN
      v_cands := NULL;
    END;

    IF v_cands IS NOT NULL THEN
      v_pantalla := COALESCE(v_pantalla, '{}'::jsonb) || jsonb_build_object(
        'candidatos', v_cands,
        'candidatos_son',
          'Resultados REALES de hermes.buscar_producto sobre esta pregunta, ya consultados por MotoFlow. ' ||
          'Precio y existencia salen de la base en este instante: puedes citarlos sin volver a consultar. ' ||
          'Van ordenados por cuánto encajan; el primero no siempre es el bueno, elige tú. ' ||
          'Si ninguno encaja, dilo y busca con hermes.buscar_producto(otro_texto).');
    END IF;
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, user_id, rol, texto, pantalla, conversation_key,
     origin_platform, origin_chat_id, estado)
  VALUES
    (v_tenant, auth.uid(), 'usuario', v_texto, v_pantalla, v_conv,
     'motoflow', COALESCE(p_origin_chat_id, auth.uid()::text), 'pendiente')
  RETURNING id INTO v_id;

  UPDATE public.hermes_chat SET origin_message_id = v_id::text WHERE id = v_id;

  PERFORM pg_notify('hermes_chat', json_build_object(
    'id', v_id, 'tenant_id', v_tenant, 'conversation_key', v_conv,
    'origin_platform', 'motoflow', 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true,
                           'conversation_key', v_conv);
END $function$;

-- ------------------------------------------------------------
-- 2. LO QUE v4 AÑADIÓ
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS hermes.chat_estado(bigint, text, uuid);
DROP FUNCTION IF EXISTS hermes.chat_error(bigint, text, uuid);
DROP FUNCTION IF EXISTS hermes.chat_responder(bigint, text, jsonb, uuid);
DROP FUNCTION IF EXISTS hermes.chat_renovar(bigint, uuid);
DROP FUNCTION IF EXISTS hermes.chat_nuevo_contexto(text);
DROP FUNCTION IF EXISTS hermes.chat_contexto(text);
DROP FUNCTION IF EXISTS public.hermes_nuevo_contexto(text);
DROP FUNCTION IF EXISTS hermes.cortar_contexto(uuid, text, uuid);

-- Después de las de arriba: chat_tomar y chat_pendientes ya la soltaron.
DROP FUNCTION IF EXISTS hermes.chat_lease();

-- No hay índice que quitar: v4 no creó ninguno. Ver la nota en la migración.
DROP TABLE IF EXISTS public.hermes_conversaciones;

ALTER TABLE public.hermes_chat
  DROP COLUMN IF EXISTS claim_token,
  DROP COLUMN IF EXISTS lease_until,
  DROP COLUMN IF EXISTS context_epoch;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_canal_v4_revertir.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- VERIFICACIÓN DE LA REVERSA
-- ------------------------------------------------------------
-- Ninguna de las tres columnas nuevas, ninguna de las funciones nuevas:
SELECT
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid = 'public.hermes_chat'::regclass AND attnum > 0
      AND NOT attisdropped
      AND attname IN ('claim_token','lease_until','context_epoch')) AS columnas_v4,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('chat_renovar','chat_nuevo_contexto','chat_contexto',
                        'cortar_contexto','chat_lease','hermes_nuevo_contexto')
      AND n.nspname IN ('hermes','public'))                          AS funciones_v4,
  (SELECT count(*) FROM pg_class WHERE relname = 'hermes_conversaciones') AS tabla_v4;
-- Esperado: 0 | 0 | 0

-- Y que el canal de v3 responde:
SELECT count(*) AS en_cola FROM hermes.chat_pendientes(5);
