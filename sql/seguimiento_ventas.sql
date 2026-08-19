-- El seguimiento de un cliente que pregunto y no compro.
--
-- >>> POR QUE <<<
-- (2026-08-19) La tuberia comercial esta viva pero solo por un lado: entran
-- 273 mensajes por semana, se contestan... y ahi se acaba. Los numeros:
--
--   sales_conversations   207 en total, 202 siguen en estado 'nuevo'.
--                         Nadie mueve un estado desde MAYO.
--   crm_seguimiento       1 fila, y es una prueba de Hermes del 18/07.
--
-- La tabla crm_seguimiento se creo con los campos correctos --
-- fecha_seguimiento, proxima_accion, producto_consultado -- y lleva un mes
-- vacia porque ninguna pantalla escribe en ella. El boton "Crear seguimiento"
-- de la extension solo ponia status='seguimiento' en la conversacion: una
-- etiqueta sin fecha, sin producto y sin nota. Se uso UNA vez, en mayo.
--
-- Un seguimiento sin fecha no es un seguimiento; es un recordatorio que nadie
-- va a mirar. Esto le pone la fecha y lo hace volver solo ese dia.
--
-- >>> EL VOCABULARIO ES EL DE LA TABLA, NO EL MIO <<<
-- La primera version de este archivo invento sus propios estados
-- (pendiente / contactado / ganado) y la base los rechazo: crm_seguimiento
-- ya trae tres CHECK con un vocabulario propio, y es mejor que el mio porque
-- habla como se habla en el mostrador:
--
--   estado     nuevo, interesado, precio_enviado, pendiente_pago,
--              prometio_pasar, comprado, perdido, agotado_solicitado,
--              requiere_aprobacion
--   prioridad  alta, media, baja
--   canal      whatsapp, tienda, telefono, referido, redes, otro
--
-- "prometio_pasar" le dice al vendedor que decir cuando llame; "pendiente"
-- no le dice nada. Instagram, Facebook y TikTok entran todas como 'redes'.
--
-- >>> QUE TRAE <<<
--   1. crm_seguimiento.conversation_id  -- de que conversacion salio
--   2. el estado de la conversacion se mueve SOLO al contestar
--   3. crm_seguimiento_crear         -- crear uno desde una conversacion
--   4. crm_seguimientos_pendientes   -- los que tocan hoy (y los atrasados)
--   5. crm_seguimiento_cerrar        -- comprado / perdido / reprogramar
--
-- Nada de esto borra ni toca dinero. La tabla ya tenia RLS por tenant.

-- ===================================================================
-- 1. DE DONDE SALIO EL SEGUIMIENTO
-- ===================================================================
ALTER TABLE public.crm_seguimiento
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- El indice cubre la unica consulta que se hace en caliente: "que me toca
-- hoy". Parcial a proposito: lo cerrado no se busca nunca y es lo que mas va
-- a crecer con el tiempo. Se listan los estados CERRADOS y no los abiertos
-- porque son dos y no siete -- y porque si manana se agrega un estado nuevo,
-- lo normal es que sea uno abierto y el indice lo cubra solo.
DROP INDEX IF EXISTS public.ix_crm_seguimiento_pendientes;
CREATE INDEX ix_crm_seguimiento_pendientes
  ON public.crm_seguimiento (tenant_id, fecha_seguimiento)
  WHERE estado NOT IN ('comprado', 'perdido');

-- ===================================================================
-- 2. EL ESTADO SE MUEVE SOLO AL CONTESTAR
-- ===================================================================
-- 202 de 207 conversaciones estaban en 'nuevo' porque mover el estado era
-- trabajo manual sin premio: nadie lo hacia. Contestar YA es la senal de que
-- alguien la atendio, asi que el estado la sigue en vez de esperar un clic.
--
-- Va dentro de la funcion que ya existe y no en un disparador nuevo: es el
-- mismo UPDATE, una linea mas. Dos disparadores sobre la misma tabla para
-- tocar la misma fila es como se llega a que uno pise al otro.
--
-- OJO: aqui 'status' es el de sales_conversations, que tiene su propio
-- vocabulario (nuevo, en_atencion, cotizando, ...) y no es el de
-- crm_seguimiento. Son dos cosas distintas: una es el hilo, la otra es la
-- gestion de venta que sale de ese hilo.
CREATE OR REPLACE FUNCTION public.sales_touch_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.sales_conversations
  SET last_message_at = NEW.created_at,
      last_user_message_at = CASE WHEN NEW.sender_type = 'user' THEN NEW.created_at ELSE last_user_message_at END,
      last_agent_message_at = CASE WHEN NEW.sender_type IN ('assistant', 'agent') THEN NEW.created_at ELSE last_agent_message_at END,
      last_message_preview = LEFT(COALESCE(NEW.message_text, NEW.message_type), 180),
      intent = COALESCE(intent, CASE WHEN NEW.sender_type = 'user' THEN public.sales_detect_basic_intent(NEW.message_text) ELSE intent END),
      -- Solo desde 'nuevo': si alguien la marco 'seguimiento' o 'cotizando' a
      -- mano, contestar no le pisa la decision.
      status = CASE
                 WHEN NEW.sender_type IN ('assistant', 'agent') AND status = 'nuevo'
                 THEN 'en_atencion'
                 ELSE status
               END,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

-- ===================================================================
-- 3. CREAR UN SEGUIMIENTO
-- ===================================================================
-- Se puede crear desde una conversacion (lo normal) o a mano, para el que
-- pregunto en el mostrador y se fue sin comprar.
CREATE OR REPLACE FUNCTION public.crm_seguimiento_crear(
  p_fecha           date,
  p_conversation_id uuid DEFAULT NULL,
  p_producto        text DEFAULT NULL,
  p_accion          text DEFAULT NULL,
  p_notas           text DEFAULT NULL,
  p_prioridad       text DEFAULT 'media',
  p_cliente_nombre  text DEFAULT NULL,
  p_telefono        text DEFAULT NULL,
  p_cliente_id      uuid DEFAULT NULL,
  p_codigo_producto text DEFAULT NULL,
  p_estado          text DEFAULT 'nuevo'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  -- Campos sueltos y no un record: si no hay conversacion, un record sin
  -- asignar revienta al leerlo con "record is not assigned yet", y ese es
  -- justo el camino del cliente que pregunto en el mostrador.
  v_c_nombre text;
  v_c_tel    text;
  v_c_plat   text;
  v_nombre text;
  v_tel    text;
  v_canal  text;
  v_estado text;
  v_prio   text;
  v_fila   public.crm_seguimiento;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Un seguimiento sin fecha no sirve: dime cuando hay que volver a buscarlo';
  END IF;
  IF p_fecha < v_hoy THEN RAISE EXCEPTION 'La fecha de seguimiento no puede ser de ayer'; END IF;

  IF p_conversation_id IS NOT NULL THEN
    SELECT customer_name, customer_phone, platform
      INTO v_c_nombre, v_c_tel, v_c_plat
      FROM public.sales_conversations
     WHERE id = p_conversation_id AND tenant_id = v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esa conversacion no es de esta empresa'; END IF;
  END IF;

  -- Lo que se pase a mano manda sobre lo que traiga la conversacion: el
  -- nombre de WhatsApp suele ser un apodo o un numero.
  v_nombre := NULLIF(btrim(COALESCE(p_cliente_nombre, v_c_nombre, '')), '');
  v_tel    := NULLIF(btrim(COALESCE(p_telefono, v_c_tel, '')), '');

  -- La plataforma del hilo al vocabulario de la tabla. Instagram, Facebook y
  -- TikTok son todas 'redes'; sin conversacion es alguien del mostrador.
  v_canal := CASE
               WHEN v_c_plat = 'whatsapp' THEN 'whatsapp'
               WHEN v_c_plat IS NULL      THEN 'tienda'
               WHEN v_c_plat IN ('instagram','facebook','tiktok','youtube') THEN 'redes'
               ELSE 'otro'
             END;

  v_estado := lower(btrim(COALESCE(p_estado, '')));
  IF v_estado NOT IN ('nuevo','interesado','precio_enviado','pendiente_pago',
                      'prometio_pasar','agotado_solicitado','requiere_aprobacion') THEN
    v_estado := 'nuevo';
  END IF;

  v_prio := lower(btrim(COALESCE(p_prioridad, '')));
  IF v_prio NOT IN ('alta','media','baja') THEN v_prio := 'media'; END IF;

  IF v_nombre IS NULL AND v_tel IS NULL THEN
    RAISE EXCEPTION 'Hace falta al menos el nombre o el telefono de quien hay que buscar';
  END IF;

  INSERT INTO public.crm_seguimiento (
    tenant_id, conversation_id, cliente_id, cliente_nombre, telefono,
    canal_origen, producto_consultado, codigo_producto,
    estado, prioridad, proxima_accion, fecha_seguimiento, notas, creado_por
  ) VALUES (
    v_tenant, p_conversation_id, p_cliente_id,
    COALESCE(v_nombre, v_tel), v_tel,
    v_canal,
    NULLIF(btrim(COALESCE(p_producto, '')), ''),
    NULLIF(btrim(COALESCE(p_codigo_producto, '')), ''),
    v_estado, v_prio,
    NULLIF(btrim(COALESCE(p_accion, '')), ''),
    p_fecha,
    NULLIF(btrim(COALESCE(p_notas, '')), ''),
    COALESCE(auth.uid()::text, 'extension')
  ) RETURNING * INTO v_fila;

  -- La conversacion queda marcada, para que en la bandeja se vea de un
  -- vistazo que esa ya tiene quien la persiga.
  IF p_conversation_id IS NOT NULL THEN
    UPDATE public.sales_conversations
       SET status = 'seguimiento', updated_at = now()
     WHERE id = p_conversation_id AND tenant_id = v_tenant
       AND status IN ('nuevo', 'en_atencion');
  END IF;

  RETURN row_to_json(v_fila);
END;
$function$;

-- ===================================================================
-- 4. LO QUE TOCA HOY
-- ===================================================================
-- Devuelve los vencidos tambien, y de primero: un seguimiento atrasado es
-- mas urgente que uno de hoy, no menos.
CREATE OR REPLACE FUNCTION public.crm_seguimientos_pendientes(p_hasta date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_hasta  date := COALESCE(p_hasta, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;

  RETURN COALESCE((
    SELECT json_agg(x ORDER BY x.dias_atraso DESC, x.prioridad_orden, x.fecha_seguimiento)
    FROM (
      SELECT s.id, s.conversation_id, s.cliente_id, s.cliente_nombre, s.telefono,
             s.canal_origen, s.producto_consultado, s.codigo_producto,
             s.prioridad, s.proxima_accion, s.fecha_seguimiento, s.notas, s.estado,
             (v_hoy - s.fecha_seguimiento) AS dias_atraso,
             CASE s.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END AS prioridad_orden
      FROM public.crm_seguimiento s
      WHERE s.tenant_id = v_tenant
        -- Abierto es todo lo que no se cerro. Al reves -- listar los siete
        -- estados abiertos -- un estado nuevo se quedaria fuera sin que nadie
        -- lo note, y el seguimiento desapareceria en silencio.
        AND s.estado NOT IN ('comprado', 'perdido')
        AND s.fecha_seguimiento <= v_hasta
    ) x
  ), '[]'::json);
END;
$function$;

-- ===================================================================
-- 5. CERRARLO O MOVERLO DE FECHA
-- ===================================================================
CREATE OR REPLACE FUNCTION public.crm_seguimiento_cerrar(
  p_id          uuid,
  p_estado      text,
  p_nota        text DEFAULT NULL,
  p_nueva_fecha date DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fila   public.crm_seguimiento;
  v_estado text := lower(btrim(COALESCE(p_estado, '')));
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;
  IF v_estado NOT IN ('nuevo','interesado','precio_enviado','pendiente_pago',
                      'prometio_pasar','comprado','perdido','agotado_solicitado',
                      'requiere_aprobacion') THEN
    RAISE EXCEPTION 'Estado no valido: %', p_estado;
  END IF;
  -- Dejarlo abierto es seguir persiguiendo: exige fecha nueva o no se
  -- entiende para cuando.
  IF v_estado NOT IN ('comprado','perdido') AND p_nueva_fecha IS NULL THEN
    RAISE EXCEPTION 'Para dejarlo abierto hay que decir para que dia';
  END IF;

  UPDATE public.crm_seguimiento s
     SET estado = v_estado,
         fecha_seguimiento = COALESCE(p_nueva_fecha, s.fecha_seguimiento),
         -- La nota se AGREGA, no se pisa: el historial de por que se persiguio
         -- a alguien es lo que sirve la proxima vez.
         notas = CASE
                   WHEN NULLIF(btrim(COALESCE(p_nota, '')), '') IS NULL THEN s.notas
                   ELSE COALESCE(s.notas || chr(10), '')
                        || to_char((now() AT TIME ZONE 'America/Santo_Domingo')::date, 'DD/MM')
                        || ' ' || btrim(p_nota)
                 END
   WHERE s.id = p_id AND s.tenant_id = v_tenant
  RETURNING * INTO v_fila;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ese seguimiento no es de esta empresa'; END IF;
  RETURN row_to_json(v_fila);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crm_seguimiento_crear(date, uuid, text, text, text, text, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seguimientos_pendientes(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_seguimiento_cerrar(uuid, text, text, date) TO authenticated;

-- La firma vieja de crm_seguimiento_crear, la que inventaba estados propios y
-- que la base rechazo. Se quita para que no queden dos puertas.
DROP FUNCTION IF EXISTS public.crm_seguimiento_crear(date, uuid, text, text, text, text, text, text, uuid, text);

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'crm_seguimiento' AND column_name = 'conversation_id')
       THEN 'OK  conversation_id' ELSE '*** FALLO *** falta la columna' END AS columna,
  CASE WHEN position('en_atencion' in (
         SELECT pg_get_functiondef(p.oid) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'sales_touch_conversation')) > 0
       THEN 'OK  auto-estado al contestar' ELSE '*** FALLO *** disparador igual' END AS auto_estado,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('crm_seguimiento_crear','crm_seguimientos_pendientes','crm_seguimiento_cerrar'))
    AS rpcs_creadas,
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                     WHERE tablename = 'crm_seguimiento' AND indexname = 'ix_crm_seguimiento_pendientes')
       THEN 'OK  indice' ELSE '*** FALLO *** sin indice' END AS indice,
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='crm_seguimiento_crear') = 1
       THEN 'OK  una sola puerta' ELSE '*** FALLO *** quedan dos firmas' END AS sin_duplicados;

SELECT public.registrar_migracion('seguimiento_ventas.sql');
