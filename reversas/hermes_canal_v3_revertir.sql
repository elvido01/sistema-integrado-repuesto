-- =====================================================================
-- Deshacer el contrato v3
-- ---------------------------------------------------------------------
-- Devuelve el canal exactamente a como estaba antes de hermes_canal_v3.sql.
--
-- >>> QUÉ SE PIERDE AL REVERTIR <<<
-- Los datos de las columnas nuevas: estados, marcas de tiempo, intentos,
-- errores, clave de conversación y origen. La conversación en sí NO se
-- pierde: id, texto, pantalla, acciones y `respondido` quedan intactos, y
-- `respondido` es lo único que el canal viejo necesitaba.
--
-- Por eso el orden importa: primero se restauran las funciones viejas
-- —que solo miran `respondido`— y solo después se quitan las columnas.
-- Al revés, entre una cosa y otra habría un hueco en que nada funciona.
--
-- >>> ANTES DE CORRERLO <<<
-- Hermes tiene que estar usando chat_pendientes() otra vez, no
-- chat_tomar(). Si revierte con el plugin llamando a chat_tomar(), el
-- canal se queda mudo: la función deja de existir y el error se ve en los
-- logs del gateway, no aquí.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  FRENO DE MANO                                                   ║
-- ║                                                                  ║
-- ║  Para correr esta reversa, BORRA la línea de abajo.               ║
-- ║                                                                  ║
-- ║  Esta es la más cara de correr por accidente: se lleva por        ║
-- ║  delante estados, intentos, errores, clave de conversación y      ║
-- ║  origen de TODAS las filas. La de v4 ya se corrió dos veces sin   ║
-- ║  querer; esta haría bastante más daño.                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
DO $$ BEGIN RAISE EXCEPTION 'FRENO DE MANO: esto es la REVERSA de v3 y borra los estados, la clave de conversación y el origen de todas las filas. Si de verdad lo quieres, borra esta línea del archivo.'; END $$;

-- ------------------------------------------------------------
-- 1. LAS FUNCIONES VIEJAS, TAL CUAL ESTABAN
-- ------------------------------------------------------------
-- Hay que borrarla antes: la versión de v3 devuelve tres columnas más, y
-- CREATE OR REPLACE no puede cambiar el tipo de retorno ni para añadir ni
-- para quitar. Va dentro de la transacción, así que no hay ningún momento
-- en que la función no exista para nadie.
DROP FUNCTION IF EXISTS hermes.chat_pendientes(integer);

CREATE OR REPLACE FUNCTION hermes.chat_pendientes(p_limite integer DEFAULT 10)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.texto, c.pantalla, c.creado_en,
         c.user_id, p.full_name, p.email, p.role
  FROM public.hermes_chat c
  LEFT JOIN public.profiles p
         ON p.id = c.user_id AND p.tenant_id = c.tenant_id
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.rol = 'usuario'
    AND c.respondido = false
  ORDER BY c.creado_en
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 10), 50));
$$;

CREATE OR REPLACE FUNCTION hermes.chat_responder(
  p_mensaje_id bigint, p_texto text, p_acciones jsonb DEFAULT NULL::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_malos  text;
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Respuesta vacía'; END IF;

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

  INSERT INTO public.hermes_chat (tenant_id, rol, texto, acciones)
  VALUES (v_tenant, 'hermes', btrim(p_texto), p_acciones);

  UPDATE public.hermes_chat
  SET respondido = true
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  RETURN json_build_object('ok', true);
END $function$;

-- La sobrecarga de dos argumentos NO se restaura, aunque existiera antes.
-- Convivía con la de tres y hacía ambigua cualquier llamada de dos
-- argumentos (42725: is not unique). Volver a ponerla sería restaurar una
-- mina, no un comportamiento: la de tres atiende esas llamadas igual
-- gracias a su DEFAULT.

CREATE OR REPLACE FUNCTION public.hermes_escribir(p_texto text, p_pantalla jsonb DEFAULT NULL::jsonb)
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
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF COALESCE(v_texto, '') = '' THEN RAISE EXCEPTION 'Mensaje vacío'; END IF;

  SELECT c.id, c.texto INTO v_prev
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant
    AND c.user_id IS NOT DISTINCT FROM auth.uid()
    AND c.rol = 'usuario'
    AND c.respondido = false
    AND c.creado_en > now() - interval '10 seconds'
  ORDER BY c.creado_en DESC, c.id DESC
  LIMIT 1;

  IF v_prev.id IS NOT NULL THEN
    IF v_prev.texto = v_texto THEN
      RETURN json_build_object('id', v_prev.id, 'enviado', true, 'repetido', true);
    END IF;
    IF starts_with(v_texto, v_prev.texto) THEN
      UPDATE public.hermes_chat SET respondido = true WHERE id = v_prev.id;
    END IF;
  END IF;

  INSERT INTO public.hermes_chat (tenant_id, user_id, rol, texto, pantalla)
  VALUES (v_tenant, auth.uid(), 'usuario', v_texto, p_pantalla)
  RETURNING id INTO v_id;

  PERFORM pg_notify('hermes_chat',
    json_build_object('id', v_id, 'tenant_id', v_tenant, 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true);
END $function$;

-- La versión de 3 argumentos que introdujo v3 desaparece. Se borra aparte
-- porque tiene firma distinta: un CREATE OR REPLACE no la alcanza.
DROP FUNCTION IF EXISTS public.hermes_escribir(text, jsonb, text);

-- ------------------------------------------------------------
-- 2. LO QUE v3 AÑADIÓ
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS hermes.chat_tomar(integer);
DROP FUNCTION IF EXISTS hermes.chat_estado(bigint, text);
DROP FUNCTION IF EXISTS hermes.chat_error(bigint, text);

DROP TRIGGER  IF EXISTS hermes_chat_sincronizar_trg ON public.hermes_chat;
DROP FUNCTION IF EXISTS public.hermes_chat_sincronizar();

DROP INDEX IF EXISTS public.hermes_chat_una_respuesta;
DROP INDEX IF EXISTS public.hermes_chat_cola;

ALTER TABLE public.hermes_chat DROP CONSTRAINT IF EXISTS hermes_chat_estado_check;

ALTER TABLE public.hermes_chat
  DROP COLUMN IF EXISTS estado,
  DROP COLUMN IF EXISTS estado_detalle,
  DROP COLUMN IF EXISTS conversation_key,
  DROP COLUMN IF EXISTS responde_a,
  DROP COLUMN IF EXISTS origin_platform,
  DROP COLUMN IF EXISTS origin_chat_id,
  DROP COLUMN IF EXISTS origin_message_id,
  DROP COLUMN IF EXISTS recibido_en,
  DROP COLUMN IF EXISTS procesando_en,
  DROP COLUMN IF EXISTS respondido_en,
  DROP COLUMN IF EXISTS error_en,
  DROP COLUMN IF EXISTS intentos,
  DROP COLUMN IF EXISTS ultimo_error,
  DROP COLUMN IF EXISTS metricas;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_canal_v3_revertir.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- VERIFICACIÓN DE LA REVERSA
-- ------------------------------------------------------------
-- Debe devolver las 9 columnas originales y ninguna más:
SELECT string_agg(a.attname, ', ' ORDER BY a.attnum) AS columnas
FROM pg_attribute a
WHERE a.attrelid = 'public.hermes_chat'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped;
-- Esperado: id, tenant_id, user_id, rol, texto, pantalla, respondido,
--           creado_en, acciones

-- Y que el canal viejo responde:
SELECT count(*) AS pendientes FROM hermes.chat_pendientes(5);
