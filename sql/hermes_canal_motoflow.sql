-- =====================================================================
-- MotoFlow como canal de Hermes — el de verdad, no un doble
-- ---------------------------------------------------------------------
-- (2026-08-08) "lo que le cuentas por Telegram lo sabe en MotoFlow, y al
-- revés. Esto es lo que necesito más que nada."
--
-- Lo que había dentro de MotoFlow era otro programa con el nombre de Hermes:
-- otra memoria, sin sus plugins, sin saber lo que hablaron ayer. Esto lo
-- reemplaza por un canal hacia el Hermes real, junto a Telegram y WhatsApp.
--
-- >>> EL CANAL YA EXISTÍA, FALTABA USARLO PARA CONVERSAR <<<
-- Hermes ya se conecta a esta base con hermes_readonly, lee las vistas del
-- esquema hermes y escucha en tiempo real con LISTEN hermes_llegadas. Aquí
-- no se inventa un transporte nuevo: se usa el mismo, con otro aviso.
--
--   MotoFlow escribe  ->  hermes_chat  ->  NOTIFY hermes_chat
--                                              |
--                                    Hermes lee y responde
--                                              |
--   MotoFlow lo muestra  <-  Realtime de Supabase
--
-- >>> POR QUÉ EN EL ESQUEMA hermes <<<
-- Porque es donde él ya tiene permisos y donde busca las cosas. Las
-- funciones son SECURITY DEFINER acotadas a Repuestos Morla: puede leer lo
-- que le escriben y responder, nada más.
--
-- >>> EL LATIDO <<<
-- Hermes vive en la PC del dueño. Si esa máquina se apaga, no hay asistente.
-- Por eso deja un latido y la pantalla puede decir "Hermes no está
-- conectado" en vez de dejar a alguien esperando una respuesta que no viene.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS hermes;

-- ------------------------------------------------------------
-- LOS MENSAJES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hermes_chat (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  user_id     uuid,
  rol         text NOT NULL CHECK (rol IN ('usuario', 'hermes')),
  texto       text NOT NULL,
  -- Dónde estaba parada la persona al escribir. Le permite contestar
  -- "¿qué es esto?" sin que le expliquen de qué pantalla se habla.
  pantalla    jsonb,
  respondido  boolean NOT NULL DEFAULT false,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hermes_chat_pend
  ON public.hermes_chat (tenant_id, rol, respondido, creado_en);

ALTER TABLE public.hermes_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_chat_propio ON public.hermes_chat;
CREATE POLICY hermes_chat_propio ON public.hermes_chat
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- Realtime: es lo que hace que la respuesta aparezca sola, sin recargar.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hermes_chat;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- EL LATIDO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hermes_presencia (
  tenant_id uuid PRIMARY KEY,
  ultimo    timestamptz NOT NULL DEFAULT now(),
  detalle   jsonb
);
ALTER TABLE public.hermes_presencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_presencia_propia ON public.hermes_presencia;
CREATE POLICY hermes_presencia_propia ON public.hermes_presencia
  FOR SELECT USING (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- LADO MOTOFLOW: escribir y saber si está
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_escribir(p_texto text, p_pantalla jsonb DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_id     bigint;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Mensaje vacío'; END IF;

  INSERT INTO public.hermes_chat (tenant_id, user_id, rol, texto, pantalla)
  VALUES (v_tenant, auth.uid(), 'usuario', btrim(p_texto), p_pantalla)
  RETURNING id INTO v_id;

  -- El mismo mecanismo de LISTEN/NOTIFY que ya usa para las llegadas.
  PERFORM pg_notify('hermes_chat',
    json_build_object('id', v_id, 'tenant_id', v_tenant, 'texto', left(btrim(p_texto), 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true);
END $$;

CREATE OR REPLACE FUNCTION public.hermes_estado_canal()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_ult    timestamptz;
BEGIN
  IF v_tenant IS NULL THEN RETURN json_build_object('conectado', false); END IF;
  SELECT ultimo INTO v_ult FROM public.hermes_presencia WHERE tenant_id = v_tenant;

  RETURN json_build_object(
    -- Dos minutos: suficiente para un latido de un minuto con margen, y
    -- corto para no prometer que está cuando la PC lleva rato apagada.
    'conectado', v_ult IS NOT NULL AND v_ult > now() - interval '2 minutes',
    'ultimo_latido', v_ult,
    'pendientes', (SELECT COUNT(*) FROM public.hermes_chat
                    WHERE tenant_id = v_tenant AND rol = 'usuario' AND respondido = false)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.hermes_escribir(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hermes_estado_canal() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_escribir(text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.hermes_estado_canal() TO authenticated;

-- ------------------------------------------------------------
-- LADO HERMES: leer, responder y avisar que está vivo
-- ------------------------------------------------------------
-- Van en el esquema hermes porque es donde él ya busca y donde tiene
-- permisos. Acotadas a Repuestos Morla por dentro: aunque se equivoque de
-- tenant_id, no puede leer ni escribir en otra empresa.
CREATE OR REPLACE FUNCTION hermes.chat_pendientes(p_limite int DEFAULT 10)
RETURNS TABLE (id bigint, texto text, pantalla jsonb, creado_en timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.texto, c.pantalla, c.creado_en
  FROM public.hermes_chat c
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.rol = 'usuario' AND c.respondido = false
  ORDER BY c.creado_en
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 10), 50));
$$;

CREATE OR REPLACE FUNCTION hermes.chat_responder(p_mensaje_id bigint, p_texto text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Respuesta vacía'; END IF;

  INSERT INTO public.hermes_chat (tenant_id, rol, texto)
  VALUES (v_tenant, 'hermes', btrim(p_texto));

  -- Marcar respondido evita que vuelva a contestar lo mismo al reconectarse.
  UPDATE public.hermes_chat
  SET respondido = true
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  RETURN json_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION hermes.latido(p_detalle jsonb DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.hermes_presencia (tenant_id, ultimo, detalle)
  VALUES (v_tenant, now(), p_detalle)
  ON CONFLICT (tenant_id) DO UPDATE SET ultimo = now(), detalle = EXCLUDED.detalle;
  RETURN json_build_object('ok', true);
END $$;

-- Lo mínimo para que su rol pueda usarlas.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT USAGE ON SCHEMA hermes TO hermes_readonly;
    GRANT EXECUTE ON FUNCTION hermes.chat_pendientes(int) TO hermes_readonly;
    GRANT EXECUTE ON FUNCTION hermes.chat_responder(bigint, text) TO hermes_readonly;
    GRANT EXECUTE ON FUNCTION hermes.latido(jsonb) TO hermes_readonly;
    -- Proponer cotizaciones: sigue SIN poder ejecutar. Propone y la persona
    -- autoriza en pantalla, igual que el asistente que se retira.
    GRANT EXECUTE ON FUNCTION public.agente_proponer_accion(text, text, jsonb) TO hermes_readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_canal_motoflow.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) ¿ESTÁ CONECTADO? (con sesión iniciada)
-- SELECT public.hermes_estado_canal();
--    conectado=false hasta que Hermes mande su primer latido.

-- 2) LA CONVERSACIÓN
SELECT creado_en, rol, left(texto, 70) AS texto, respondido
FROM public.hermes_chat ORDER BY creado_en DESC LIMIT 20;

-- 3) PRUEBA DEL LADO DE HERMES (correr como hermes_readonly)
-- SELECT * FROM hermes.chat_pendientes();
-- SELECT hermes.latido('{"origen":"gateway"}'::jsonb);
