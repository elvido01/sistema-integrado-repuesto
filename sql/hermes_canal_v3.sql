-- =====================================================================
-- Canal MotoFlow ↔ Hermes — contrato v3
-- ---------------------------------------------------------------------
-- Implementa docs/CONTRATO_CANAL_HERMES.md §1, §2, §3, §4, §5 y §13.
-- Esta entrega: columnas, índices, chat_tomar() y la idempotencia.
-- Pendiente para la siguiente: chat_medir(), chat_metricas().
--
-- >>> NO ROMPE NADA DE LO QUE HAY <<<
-- Ninguna columna existente cambia de nombre ni de tipo. `respondido` se
-- conserva y se mantiene en sincronía con `estado` por trigger, así que
-- todo lo que hoy la lee —chat_pendientes(), la pantalla, el plugin—
-- sigue funcionando sin tocar una línea.
--
-- >>> REVERSIBLE <<<
-- sql/hermes_canal_v3_revertir.sql deshace esto por completo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. COLUMNAS  (contrato §1, §2, §5, §13)
-- ------------------------------------------------------------
ALTER TABLE public.hermes_chat
  ADD COLUMN IF NOT EXISTS estado            text        NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS estado_detalle    text,
  ADD COLUMN IF NOT EXISTS conversation_key  text,
  ADD COLUMN IF NOT EXISTS responde_a        bigint,
  -- El origen real. Nunca se falsifica: lo escrito en MotoFlow dice
  -- 'motoflow' aunque Hermes conteste sabiendo lo que se habló por otro
  -- canal. Ver contrato §13.
  ADD COLUMN IF NOT EXISTS origin_platform   text,
  ADD COLUMN IF NOT EXISTS origin_chat_id    text,
  ADD COLUMN IF NOT EXISTS origin_message_id text,
  ADD COLUMN IF NOT EXISTS recibido_en       timestamptz,
  ADD COLUMN IF NOT EXISTS procesando_en     timestamptz,
  ADD COLUMN IF NOT EXISTS respondido_en     timestamptz,
  ADD COLUMN IF NOT EXISTS error_en          timestamptz,
  ADD COLUMN IF NOT EXISTS intentos          smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error      text,
  ADD COLUMN IF NOT EXISTS metricas          jsonb;

ALTER TABLE public.hermes_chat DROP CONSTRAINT IF EXISTS hermes_chat_estado_check;
ALTER TABLE public.hermes_chat
  ADD CONSTRAINT hermes_chat_estado_check
  CHECK (estado IN ('pendiente', 'procesando', 'respondido', 'error'));

-- Las filas que ya existen. Las de Hermes nacen respondidas: son respuestas.
UPDATE public.hermes_chat
SET estado = CASE WHEN rol = 'hermes' OR respondido THEN 'respondido' ELSE 'pendiente' END
WHERE estado IS NULL OR (respondido AND estado = 'pendiente');

-- La clave de conversación es fija por tenant (contrato §5). Para lo viejo
-- se deduce; para lo nuevo la manda hermes_escribir().
UPDATE public.hermes_chat
SET conversation_key = 'agent:main:' ||
      CASE WHEN tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
           THEN 'morla' ELSE 'tenant' END
      || ':tenant:' || tenant_id::text
WHERE conversation_key IS NULL;

UPDATE public.hermes_chat
SET origin_platform = 'motoflow'
WHERE origin_platform IS NULL;

-- ------------------------------------------------------------
-- 2. LA RESTRICCIÓN QUE IMPIDE EL DUPLICADO  (contrato §4)
-- ------------------------------------------------------------
-- No es una comprobación dentro de una función: es la base la que hace
-- imposible que existan dos respuestas al mismo mensaje. Aunque dos
-- procesos de Hermes llamen en el mismo milisegundo, uno rebota.
CREATE UNIQUE INDEX IF NOT EXISTS hermes_chat_una_respuesta
  ON public.hermes_chat (tenant_id, responde_a)
  WHERE rol = 'hermes' AND responde_a IS NOT NULL;

-- Para que chat_tomar() no recorra la tabla entera al crecer.
CREATE INDEX IF NOT EXISTS hermes_chat_cola
  ON public.hermes_chat (conversation_key, estado, creado_en)
  WHERE rol = 'usuario';

-- ------------------------------------------------------------
-- 3. `respondido` Y `estado`, SIEMPRE DE ACUERDO
-- ------------------------------------------------------------
-- Código viejo escribe `respondido`; código nuevo escribe `estado`. Si se
-- separan, chat_pendientes() y chat_tomar() verían colas distintas y un
-- mensaje podría contestarse dos veces por caminos distintos.
CREATE OR REPLACE FUNCTION public.hermes_chat_sincronizar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rol = 'hermes' THEN NEW.estado := 'respondido'; NEW.respondido := true; END IF;
    RETURN NEW;
  END IF;

  -- Quién mandó: el que cambió. Si cambiaron los dos, manda `estado`.
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

DROP TRIGGER IF EXISTS hermes_chat_sincronizar_trg ON public.hermes_chat;
CREATE TRIGGER hermes_chat_sincronizar_trg
  BEFORE INSERT OR UPDATE ON public.hermes_chat
  FOR EACH ROW EXECUTE FUNCTION public.hermes_chat_sincronizar();

-- ------------------------------------------------------------
-- 4. TOMAR TRABAJO  (contrato §3)
-- ------------------------------------------------------------
-- FIFO por conversación, una conversación en vuelo, un worker por mensaje,
-- y aislamiento por tenant. Las cuatro cosas atómicamente.
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
      -- UNO POR CONVERSACIÓN, DENTRO DE ESTA MISMA LLAMADA.
      -- El NOT EXISTS de abajo mira el estado ANTERIOR al UPDATE, así que
      -- por sí solo deja pasar juntos los dos pendientes de una misma
      -- conversación: la exclusión funcionaba entre llamadas, no dentro de
      -- una. Numerar por conversación y quedarse con el primero lo cierra.
      row_number() OVER (PARTITION BY c.conversation_key
                         ORDER BY c.creado_en, c.id) AS puesto
    FROM public.hermes_chat c
    WHERE c.tenant_id = v_tenant
      AND c.rol = 'usuario'
      -- Tres intentos y para: no se arregla a la cuarta, y reintentar para
      -- siempre es como se llena un disco.
      AND c.intentos < 3
      AND (
        c.estado = 'pendiente'
        -- EL ARRENDAMIENTO. Un mensaje abandonado por un worker que se
        -- murió está en 'procesando', no en 'pendiente'. Exigiendo solo
        -- 'pendiente' nunca podía ser candidato y esa conversación no
        -- volvía a avanzar jamás, en silencio — que es exactamente lo que
        -- el contrato prometía evitar.
        OR (c.estado = 'procesando'
            AND c.procesando_en <= now() - interval '5 minutes')
      )
      -- Y no se le quita el trabajo a un worker que sigue vivo.
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
    -- `k.id` y no `id` a secas: la función devuelve RETURNS TABLE (id …),
    -- así que `id` también es una variable de PL/pgSQL y sin calificar
    -- Postgres no sabe a cuál de las dos te refieres.
    WHERE c.id IN (SELECT k.id FROM candidatos k WHERE k.puesto = 1)
    ORDER BY c.creado_en, c.id
    -- Dos workers a la vez reciben mensajes distintos, nunca el mismo.
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

-- ------------------------------------------------------------
-- 5. DECIR EN QUÉ ANDA  (contrato §1)
-- ------------------------------------------------------------
-- Solo el detalle. El estado no se toca desde aquí: para eso están
-- chat_responder() y chat_error().
CREATE OR REPLACE FUNCTION hermes.chat_estado(p_mensaje_id bigint, p_detalle text)
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
  SET estado_detalle = left(btrim(COALESCE(p_detalle, '')), 120)
  WHERE tenant_id = v_tenant AND id = p_mensaje_id AND estado = 'procesando'
  RETURNING id, estado, estado_detalle INTO v_fila;

  IF v_fila.id IS NULL THEN
    -- No falla: un plugin que avisa de algo ya terminado no debe reventar.
    SELECT id, estado, estado_detalle INTO v_fila
    FROM public.hermes_chat WHERE tenant_id = v_tenant AND id = p_mensaje_id;
    RETURN json_build_object('ok', true, 'cambiado', false,
                             'estado', COALESCE(v_fila.estado, 'inexistente'));
  END IF;

  RETURN json_build_object('ok', true, 'cambiado', true,
                           'estado', v_fila.estado, 'detalle', v_fila.estado_detalle);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_estado(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_estado(bigint, text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 6. FALLAR  (contrato §4)
-- ------------------------------------------------------------
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
      -- Se conserva aunque el reintento funcione: si algo falló y luego
      -- salió bien, eso hay que poder verlo después.
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

REVOKE ALL ON FUNCTION hermes.chat_error(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_error(bigint, text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 7. RESPONDER, AHORA IDEMPOTENTE  (contrato §4)
-- ------------------------------------------------------------
-- Misma firma. Un reintento no es un error del plugin: si ya está
-- respondido, devuelve la respuesta que ya existe y no inserta nada.
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

  -- Ya contestado: se devuelve lo que hay. Sin excepción y sin insertar.
  IF v_estado = 'respondido' THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
  END IF;

  -- Los códigos se comprueban AQUÍ, no en la pantalla. Un código inventado
  -- tiene que rebotarle a Hermes mientras todavía puede corregirlo; si se
  -- descubriera al abrir la factura, el mostrador vería una pantalla a medio
  -- llenar y nadie sabría por qué. Ya pasó con el otro agente.
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

  -- Nada definitivo sin confirmación: lo que va en `acciones` nace como
  -- propuesta y la pantalla espera a que una persona decida (contrato §9).
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
  -- Dos procesos en el mismo milisegundo: el índice único rebota a uno. Para
  -- el que rebota esto no es un fallo, es que el otro ya lo hizo.
  WHEN unique_violation THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_responder(bigint, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_responder(bigint, text, jsonb) TO hermes_readonly;

-- ------------------------------------------------------------
-- 7b. LA VERSIÓN DE DOS ARGUMENTOS SOBRA
-- ------------------------------------------------------------
-- Existían las dos: chat_responder(bigint, text) y chat_responder(bigint,
-- text, jsonb DEFAULT NULL). Y eso ya estaba roto ANTES de esta migración:
-- una llamada con dos argumentos encaja en las dos y Postgres responde
--
--   42725: function hermes.chat_responder(bigint, unknown) is not unique
--
-- Nadie lo había notado porque el plugin siempre llama con tres. Pero era
-- una mina: el día que alguien llamara sin `acciones`, el canal se caía
-- con un error que no dice dónde está el problema.
--
-- Se queda la de tres, que con su DEFAULT atiende igual las llamadas de
-- dos argumentos. Una sola función, ninguna ambigüedad.
DROP FUNCTION IF EXISTS hermes.chat_responder(bigint, text);

-- ------------------------------------------------------------
-- 8. chat_pendientes() — mirar la cola, no tomarla
-- ------------------------------------------------------------
-- Gana columnas, no pierde ninguna ni cambia el orden de las que ya
-- devolvía: un plugin que lea por nombre no se entera.
--
-- Hay que BORRARLA primero: CREATE OR REPLACE no puede cambiar el tipo de
-- retorno de una función que ya existe, y añadir columnas de salida lo
-- cambia. Va dentro de la transacción, así que no hay instante en que la
-- función no exista para nadie.
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

-- ------------------------------------------------------------
-- 9. ESCRIBIR, CON CLAVE DE CONVERSACIÓN Y ORIGEN  (contrato §13)
-- ------------------------------------------------------------
-- La versión de dos argumentos se retira. Si convivieran, una llamada con
-- dos argumentos sería ambigua y PostgREST no sabría cuál elegir: la
-- pantalla dejaría de poder escribir con un error que no señala aquí.
DROP FUNCTION IF EXISTS public.hermes_escribir(text, jsonb);

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

  -- Fija por tenant, no por navegador: la comparten WebUI, MotoFlow y el
  -- WhatsApp autorizado. Un botón de esta pantalla no puede partir en dos
  -- una conversación que también está viva en otro canal.
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
    -- El dictado manda trozos que crecen: "tenemos", "tenemos motul"…
    -- El anterior se descarta para no contestar tres veces lo mismo.
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

  -- Mínimo a propósito: Postgres corta el payload en 8000 bytes y la
  -- conexión se cae entera si se pasa. Lo demás se lee con chat_tomar().
  PERFORM pg_notify('hermes_chat', json_build_object(
    'id', v_id, 'tenant_id', v_tenant, 'conversation_key', v_conv,
    'origin_platform', 'motoflow', 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true,
                           'conversation_key', v_conv);
END $function$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_canal_v3.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
