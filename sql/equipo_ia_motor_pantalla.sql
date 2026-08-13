-- =====================================================================
-- Equipo IA — el motor de cada agente se cambia desde la pantalla
-- ---------------------------------------------------------------------
-- (2026-08-12) "quiero que se pueda agregar la suscripción del agente
-- desde la misma ventana del módulo Equipo IA".
--
-- Hasta aquí el motor era un UPDATE a mano en el editor de SQL. Eso tiene
-- dos problemas que no son de comodidad: nadie queda registrado como
-- responsable del cambio, y un dedazo en el nombre del modelo no se ve
-- hasta que el agente falla con un error de la API que no dice nada.
--
-- >>> QUÉ SE ELIGIÓ <<<
--   1. `ejecuta_en` deja de ser una decisión. Se deriva del proveedor:
--      la suscripción corre en una máquina tuya y las claves de API en la
--      nube. Ofrecerlo como casilla aparte solo permitía guardar
--      combinaciones imposibles.
--   2. El modelo se elige de un catálogo (equipo_modelos), no se teclea.
--      Se puede escribir uno que no esté, pero la respuesta lo avisa.
--   3. Cada cambio guarda quién, cuándo y desde qué motor. Un solo paso
--      atrás, que es el que hace falta para "¿y esto quién lo cambió?".
--
-- >>> LO QUE LA PANTALLA NO PUEDE PROMETER <<<
-- Guardar 'claude_suscripcion' no pone a nadie a trabajar. Hace falta que
-- scripts/equipo-worker.mjs esté corriendo en tu máquina; si no está, el
-- trabajo se queda en cola, visible y parado. La pantalla lo dice con esas
-- palabras en vez de fingir que quedó conectado.
--
-- Y la Edge Function del widget de Jarvis sigue sin poder usar la
-- suscripción: corre en el servidor de Supabase y no hay cuenta con la que
-- autenticarse. Si Jarvis queda en suscripción, el widget se pasa solo a
-- OpenAI y el panel lo enseña — mejor eso que dejar mudo el botón que usa
-- la gente del mostrador.
--
-- Requiere, en este orden:
--   sql/equipo_ia.sql
--   sql/equipo_ia_funciones.sql
--   sql/equipo_ia_modelo.sql
--   sql/equipo_ia_claude_suscripcion.sql
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. QUE NO SE CORRA FUERA DE ORDEN
-- ------------------------------------------------------------
-- Sin las columnas de los dos archivos anteriores esto crearía funciones
-- que fallan en la primera llamada. Mejor no crear nada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipo_agentes'
      AND column_name = 'proveedor')
  THEN
    RAISE EXCEPTION 'Falta sql/equipo_ia_modelo.sql — córrelo primero (crea proveedor/modelo/persona).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipo_agentes'
      AND column_name = 'ejecuta_en')
  THEN
    RAISE EXCEPTION 'Falta sql/equipo_ia_claude_suscripcion.sql — córrelo primero (agrega el tercer motor).';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. QUIÉN CAMBIÓ EL MOTOR, CUÁNDO Y DESDE QUÉ
-- ------------------------------------------------------------
ALTER TABLE public.equipo_agentes
  ADD COLUMN IF NOT EXISTS motor_por      uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motor_email    text,
  ADD COLUMN IF NOT EXISTS motor_en       timestamptz,
  -- Cómo estaba justo antes. Un paso, no un historial: alcanza para
  -- deshacer un cambio recién hecho y para saber de dónde se venía.
  ADD COLUMN IF NOT EXISTS motor_anterior jsonb;

-- ------------------------------------------------------------
-- 2. EL CATÁLOGO DE MODELOS
-- ------------------------------------------------------------
-- En la base y no en el JSX: cuando salga un modelo nuevo se agrega con un
-- INSERT y aparece en el desplegable sin desplegar la web.
--
-- OJO CON LOS COSTOS: la `nota` es orientación para elegir, NO es de donde
-- sale el medidor de gasto. Ese lee PRICES en
-- supabase/functions/motoflow-ai-chat/llm.ts. Un modelo que no esté allí
-- se reporta con costo 0 y el medidor miente — hay que agregarlo en los
-- dos sitios.
CREATE TABLE IF NOT EXISTS public.equipo_modelos (
  proveedor text NOT NULL CHECK (proveedor IN ('openai', 'claude', 'claude_suscripcion')),
  modelo    text NOT NULL,
  etiqueta  text NOT NULL,
  nota      text,
  activo    boolean NOT NULL DEFAULT true,
  orden     smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (proveedor, modelo)
);

ALTER TABLE public.equipo_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_modelos_duenio ON public.equipo_modelos;
CREATE POLICY equipo_modelos_duenio ON public.equipo_modelos
  FOR SELECT USING (public.equipo_ia_permitido());

-- Mismo motivo que en equipo_ia.sql: Supabase concede ALL a las tablas
-- nuevas de public. Se quita lo que nadie pidió.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.equipo_modelos FROM anon, authenticated;
GRANT SELECT ON public.equipo_modelos TO authenticated;

INSERT INTO public.equipo_modelos (proveedor, modelo, etiqueta, nota, orden) VALUES
  ('openai', 'gpt-4o-mini',  'GPT-4o mini',
   'El más barato de todos (≈US$0.15 por millón de entrada). Sobra para consultar datos.', 10),
  ('openai', 'gpt-4.1-mini', 'GPT-4.1 mini',
   'Un escalón más de calidad, todavía barato.', 20),
  ('openai', 'gpt-4o',       'GPT-4o',
   'Redacta mejor. ≈17 veces el costo del mini.', 30),
  ('claude', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',
   'El barato de Anthropic. Rápido, buen español.', 10),
  ('claude', 'claude-sonnet-5', 'Claude Sonnet 5',
   'El equilibrado. Es el que conviene para lo que va a leer un cliente.', 20),
  ('claude', 'claude-opus-5',   'Claude Opus 5',
   'El más capaz y el más caro (≈US$15 por millón de entrada). Solo si el resultado lo pide.', 30)
ON CONFLICT (proveedor, modelo) DO UPDATE
  SET etiqueta = EXCLUDED.etiqueta, nota = EXCLUDED.nota, orden = EXCLUDED.orden;

-- ------------------------------------------------------------
-- 3. CAMBIAR EL MOTOR DESDE LA PANTALLA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_motor(
  p_clave       text,
  p_proveedor   text,
  p_modelo      text    DEFAULT NULL,
  p_temperatura numeric DEFAULT NULL,
  p_max_tokens  integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_a       record;
  v_email   text;
  v_modelo  text;
  v_ejecuta text;
  v_temp    numeric;
  v_tokens  integer;
  v_aviso   text;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Solo el dueño puede cambiarle el motor a un agente.';
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  SELECT * INTO v_a FROM public.equipo_agentes
  WHERE tenant_id = v_tenant AND clave = btrim(COALESCE(p_clave, ''));

  IF v_a.clave IS NULL THEN
    RAISE EXCEPTION 'Ese agente no existe en esta empresa: %', p_clave;
  END IF;

  IF p_proveedor NOT IN ('openai', 'claude', 'claude_suscripcion') THEN
    RAISE EXCEPTION 'Motor desconocido: %', p_proveedor;
  END IF;

  -- Dónde corre NO se pregunta: se deduce. La suscripción se autentica con
  -- tu cuenta y eso solo puede pasar en una máquina tuya.
  v_ejecuta := CASE WHEN p_proveedor = 'claude_suscripcion'
                    THEN 'maquina_propia' ELSE 'nube' END;

  -- Con la suscripción el modelo lo decide la sesión de Claude Code.
  -- Guardar uno aquí sería fijar algo que nadie va a leer.
  IF p_proveedor = 'claude_suscripcion' THEN
    v_modelo := NULL;
  ELSE
    v_modelo := NULLIF(btrim(COALESCE(p_modelo, '')), '');
    -- NULL sigue significando lo que decía equipo_ia_modelo.sql: que decida
    -- el worker con su valor por defecto. No se convierte en error, entre
    -- otras cosas porque Hermes nació así.
    IF v_modelo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.equipo_modelos m
                       WHERE m.proveedor = p_proveedor AND m.modelo = v_modelo AND m.activo) THEN
      -- No se bloquea: puede ser un modelo recién salido. Pero se avisa,
      -- porque si el nombre está mal el agente falla en la primera
      -- pregunta y el error de la API no explica nada.
      v_aviso := 'Ese modelo no está en el catálogo. Si el nombre tiene un error, '
              || 'el agente va a fallar en la primera pregunta y el medidor de gasto '
              || 'lo va a contar como 0.';
    END IF;
  END IF;

  v_temp   := COALESCE(p_temperatura, v_a.temperatura);
  v_tokens := COALESCE(p_max_tokens, v_a.max_tokens);

  IF v_temp < 0 OR v_temp > 1 THEN
    RAISE EXCEPTION 'La temperatura va de 0 a 1 (llegó %).', v_temp;
  END IF;
  IF v_tokens < 100 OR v_tokens > 8000 THEN
    RAISE EXCEPTION 'El largo máximo va de 100 a 8000 tokens (llegó %).', v_tokens;
  END IF;

  v_email := COALESCE(NULLIF(auth.jwt() ->> 'email', ''),
                      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()));

  UPDATE public.equipo_agentes
  SET proveedor      = p_proveedor,
      modelo         = v_modelo,
      ejecuta_en     = v_ejecuta,
      temperatura    = v_temp,
      max_tokens     = v_tokens,
      motor_por      = auth.uid(),
      motor_email    = v_email,
      motor_en       = now(),
      motor_anterior = json_build_object(
                         'proveedor',   v_a.proveedor,
                         'modelo',      v_a.modelo,
                         'ejecuta_en',  v_a.ejecuta_en,
                         'temperatura', v_a.temperatura,
                         'max_tokens',  v_a.max_tokens)::jsonb,
      actualizado_en = now()
  WHERE tenant_id = v_tenant AND clave = v_a.clave;

  -- El worker relee la configuración en cada mensaje, así que no hace falta
  -- reiniciarlo. Esto es para el que quiera enterarse en el momento.
  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'motor', 'agente', v_a.clave, 'proveedor', p_proveedor)::text);

  RETURN json_build_object(
    'ok', true,
    'agente', v_a.clave,
    'proveedor', p_proveedor,
    'modelo', v_modelo,
    'ejecuta_en', v_ejecuta,
    'temperatura', v_temp,
    'max_tokens', v_tokens,
    'aviso', v_aviso,
    -- Lo que la pantalla tiene que decir después de guardar.
    'necesita_worker', (p_proveedor = 'claude_suscripcion'),
    'widget_degradado', (v_a.clave = 'jarvis' AND p_proveedor = 'claude_suscripcion'));
END $$;

REVOKE ALL ON FUNCTION public.equipo_motor(text,text,text,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_motor(text,text,text,numeric,integer) TO authenticated;

-- ------------------------------------------------------------
-- 4. DESHACER EL ÚLTIMO CAMBIO
-- ------------------------------------------------------------
-- Un botón de arrepentimiento. Sin esto, equivocarse de motor obliga a
-- acordarse de cuál estaba puesto antes.
CREATE OR REPLACE FUNCTION public.equipo_motor_deshacer(p_clave text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_a      record;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Solo el dueño puede cambiarle el motor a un agente.';
  END IF;

  SELECT * INTO v_a FROM public.equipo_agentes
  WHERE tenant_id = v_tenant AND clave = btrim(COALESCE(p_clave, ''));

  IF v_a.clave IS NULL THEN
    RAISE EXCEPTION 'Ese agente no existe en esta empresa: %', p_clave;
  END IF;
  IF v_a.motor_anterior IS NULL THEN
    RAISE EXCEPTION 'No hay un cambio anterior que deshacer.';
  END IF;

  RETURN public.equipo_motor(
    v_a.clave,
    v_a.motor_anterior ->> 'proveedor',
    v_a.motor_anterior ->> 'modelo',
    (v_a.motor_anterior ->> 'temperatura')::numeric,
    (v_a.motor_anterior ->> 'max_tokens')::integer);
END $$;

REVOKE ALL ON FUNCTION public.equipo_motor_deshacer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_motor_deshacer(text) TO authenticated;

-- ------------------------------------------------------------
-- 5. EL PANEL, AHORA CON EL MOTOR DE CADA UNO
-- ------------------------------------------------------------
-- >>> ESTA ES LA VERSIÓN BUENA DE equipo_panel <<<
-- La de sql/equipo_ia_funciones.sql quedó atrás. Si hay que tocarla, se
-- toca aquí; correr aquel archivo después de este devuelve el panel sin
-- los datos del motor y la pantalla se queda sin qué enseñar.
CREATE OR REPLACE FUNCTION public.equipo_panel(p_limite integer DEFAULT 25)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_out json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RETURN json_build_object('permitido', false);
  END IF;

  SELECT json_build_object(
    'permitido', true,
    'agentes', (
      SELECT COALESCE(json_agg(x ORDER BY x.orden), '[]'::json) FROM (
        SELECT a.clave, a.nombre, a.rol_visible, a.descripcion,
               a.capacidades, a.limites, a.politicas, a.orden,
               -- El motor, para que se pueda cambiar desde la pantalla.
               a.proveedor, a.modelo, a.ejecuta_en,
               a.temperatura, a.max_tokens,
               (a.persona IS NOT NULL) AS tiene_persona,
               a.motor_email, a.motor_en,
               (a.motor_anterior IS NOT NULL) AS puede_deshacer,
               -- Jarvis es el único que además atiende el botón flotante,
               -- y ese no puede usar la suscripción. Se dice aquí para que
               -- la pantalla no tenga que saberlo de memoria.
               (a.clave = 'jarvis') AS atiende_widget,
               CASE WHEN a.clave = 'jarvis' AND a.proveedor = 'claude_suscripcion'
                    THEN 'openai' ELSE a.proveedor END AS proveedor_widget,
               COALESCE((
                 SELECT CASE
                   WHEN bool_or(m.status = 'processing') THEN 'trabajando'
                   WHEN bool_or(m.status = 'waiting_approval') THEN 'esperando_aprobacion'
                   WHEN bool_or(m.status = 'waiting_dependency') THEN 'esperando_datos'
                   WHEN bool_or(m.status = 'failed') THEN 'error'
                   WHEN bool_or(m.status = 'pending') THEN 'trabajando'
                   ELSE 'disponible' END
                 FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id AND m.to_agent = a.clave
                   AND m.status NOT IN ('completed','cancelled','expired')
               ), 'disponible') AS estado,
               (SELECT m.summary FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id AND m.to_agent = a.clave
                   AND m.status IN ('pending','processing')
                 ORDER BY m.created_at DESC LIMIT 1) AS tarea_actual,
               (SELECT max(m.created_at) FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id
                   AND (m.to_agent = a.clave OR m.from_agent = a.clave)) AS ultima_actividad,
               (SELECT count(*) FROM public.equipo_aprobaciones ap
                 WHERE ap.tenant_id = a.tenant_id AND ap.preparado_por = a.clave
                   AND ap.estado = 'pending') AS borradores_pendientes
        FROM public.equipo_agentes a
        WHERE a.tenant_id = v_tenant AND a.activo
      ) x
    ),
    -- Las opciones del desplegable. Van con el panel para que cambiar el
    -- motor no cueste una segunda llamada.
    'modelos', (
      SELECT COALESCE(json_agg(m ORDER BY m.proveedor, m.orden), '[]'::json) FROM (
        SELECT proveedor, modelo, etiqueta, nota, orden
        FROM public.equipo_modelos WHERE activo
      ) m
    ),
    'trabajos', (
      SELECT COALESCE(json_agg(t ORDER BY t.creado_en DESC), '[]'::json) FROM (
        SELECT w.id, w.titulo, w.peticion, w.tipo, w.estado, w.error,
               w.creado_en, w.iniciado_en, w.terminado_en, w.resultado,
               w.conversation_key, w.context_epoch, w.origin_platform,
               (SELECT count(*) FROM public.equipo_mensajes m WHERE m.trabajo_id = w.id) AS mensajes,
               (SELECT max(m.attempts) FROM public.equipo_mensajes m WHERE m.trabajo_id = w.id) AS intentos,
               (SELECT m.to_agent FROM public.equipo_mensajes m
                 WHERE m.trabajo_id = w.id AND m.status IN ('pending','processing')
                 ORDER BY m.created_at DESC LIMIT 1) AS esperando_a
        FROM public.equipo_trabajos w
        WHERE w.tenant_id = v_tenant
        ORDER BY w.creado_en DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 25), 100))
      ) t
    ),
    'aprobaciones', (
      SELECT COALESCE(json_agg(ap ORDER BY ap.creado_en DESC), '[]'::json) FROM (
        SELECT a.id, a.trabajo_id, a.preparado_por, a.accion, a.motivo,
               a.datos_usados, a.impacto, a.riesgo, a.contenido, a.estado,
               a.decidido_email, a.decidido_en, a.comentario,
               a.revision_de, a.revision_num, a.creado_en,
               w.titulo AS trabajo_titulo
        FROM public.equipo_aprobaciones a
        JOIN public.equipo_trabajos w ON w.id = a.trabajo_id
        WHERE a.tenant_id = v_tenant
        ORDER BY a.creado_en DESC LIMIT 50
      ) ap
    ),
    'publicacion_automatica', false
  ) INTO v_out;

  RETURN v_out;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_motor_pantalla.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación:
SELECT clave, proveedor, COALESCE(modelo, '(lo decide la sesión)') AS modelo,
       ejecuta_en, temperatura, max_tokens,
       COALESCE(motor_email, '(nunca se cambió desde la pantalla)') AS ultimo_cambio_por
FROM public.equipo_agentes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY orden;
