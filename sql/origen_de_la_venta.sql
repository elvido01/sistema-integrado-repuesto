-- =====================================================================
-- De dónde vino la venta — PILOTO: solo Repuestos Morla
-- ---------------------------------------------------------------------
-- (2026-08-19) MotoFlow ya tiene las dos puntas y ningún hilo entre ellas:
-- arriba entran conversaciones de WhatsApp, Instagram, Facebook y TikTok al
-- Sales Hub, y Marketing IA publica y mide; abajo están las facturas. Pero
-- no hay una sola columna que diga qué canal trajo el dinero. Se comprobó
-- antes de escribir esto:
--
--   * facturas         → ninguna columna de origen
--   * conversaciones   → 1 de 211 tiene cotización enganchada
--   * conversaciones   → sin cliente_id, así que "Asociar cliente" en la
--                        extensión no guardaba nada en ningún sitio
--
-- Sin ese hilo no se puede contestar la única pregunta que decide dónde
-- poner el esfuerzo: de lo que facturé este mes, ¿cuánto vino de TikTok?
--
-- >>> PILOTO <<<
-- Decisión del dueño: esto arranca SOLO en Repuestos Morla. Por eso va
-- detrás de config_empresa.feat_origen_venta, apagado para todos menos ese
-- tenant. Las otras empresas no ven el campo ni cambia nada para ellas.
--
-- >>> LO QUE NO HACE, A PROPOSITO <<<
-- El campo NO bloquea la facturación. Es tentador ponerlo obligatorio en la
-- base, pero el precio de equivocarse es un cliente esperando en el
-- mostrador mientras la venta no graba por un dato de mercadeo. Se exige en
-- la pantalla; si aun así llega vacío, la factura entra y el reporte la
-- cuenta aparte como "sin anotar" — que además es la medida de si la
-- costumbre está agarrando.
--
-- Idempotente / re-ejecutable. No toca dinero ni cambia ningún total.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL INTERRUPTOR DEL PILOTO
-- ------------------------------------------------------------
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_origen_venta boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_empresa.feat_origen_venta IS
  'Piloto (2026-08-19, Repuestos Morla): pide de dónde vino el cliente al facturar.';

UPDATE public.config_empresa
   SET feat_origen_venta = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 2) EL CAMPO EN LA FACTURA
-- ------------------------------------------------------------
-- Anulable siempre: hay 200 facturas viejas sin origen, y ninguna empresa
-- que no sea el piloto va a llenarlo.
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS canal_origen text;

-- El vocabulario es el MISMO que ya usa crm_seguimiento. Una factura y el
-- seguimiento que la produjo tienen que poder compararse sin traducir.
--
-- 'redes' se queda por compatibilidad, pero ya no se ofrece: era justo lo
-- que impedía contestar la pregunta. Instagram, Facebook y TikTok metidos
-- en la misma bolsa hacen imposible saber cuál de los tres trae gente.
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_canal_origen_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_canal_origen_check
  CHECK (canal_origen IS NULL OR canal_origen = ANY (ARRAY[
    'tienda', 'whatsapp', 'instagram', 'facebook', 'tiktok',
    'telefono', 'referido', 'redes', 'otro']));

-- Ojo: el reporte filtra por la fecha LOCAL (ver mas abajo), asi que este
-- indice no le sirve para el rango. Se queda porque si sirve para lo otro
-- que se pide de esta columna: "traeme las facturas de TikTok" de un tenant.
CREATE INDEX IF NOT EXISTS ix_facturas_canal_origen
  ON public.facturas (tenant_id, fecha, canal_origen)
  WHERE canal_origen IS NOT NULL;

-- El seguimiento aprende las tres redes por separado.
ALTER TABLE public.crm_seguimiento DROP CONSTRAINT IF EXISTS crm_seguimiento_canal_origen_check;
ALTER TABLE public.crm_seguimiento ADD CONSTRAINT crm_seguimiento_canal_origen_check
  CHECK (canal_origen IS NULL OR canal_origen = ANY (ARRAY[
    'tienda', 'whatsapp', 'instagram', 'facebook', 'tiktok',
    'telefono', 'referido', 'redes', 'otro']));

-- ------------------------------------------------------------
-- 3) LA CONVERSACION SE ENGANCHA AL CLIENTE
-- ------------------------------------------------------------
-- Sin esto, una conversación de Instagram o TikTok no se puede atribuir a
-- nada: no traen teléfono, y el teléfono era el único puente que había.
ALTER TABLE public.sales_conversations
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sales_conversations_cliente
  ON public.sales_conversations (tenant_id, cliente_id)
  WHERE cliente_id IS NOT NULL;

-- La vista nombra sus columnas una por una, así que hay que añadirla ahí
-- también o la extensión nunca la ve.
CREATE OR REPLACE VIEW public.sales_conversations_view AS
 SELECT c.id,
    c.tenant_id,
    c.channel_id,
    c.platform,
    c.external_conversation_id,
    c.customer_name,
    c.customer_phone,
    c.customer_external_id,
    c.status,
    c.assigned_to,
    c.lead_score,
    c.intent,
    c.bot_enabled,
    c.crm_whatsapp_conversation_id,
    c.cotizacion_id,
    c.last_message_at,
    c.last_user_message_at,
    c.last_agent_message_at,
    c.last_message_preview,
    c.metadata,
    c.created_at,
    c.updated_at,
    COALESCE(m.messages_count, 0::bigint)::integer AS messages_count,
    COALESCE(l.leads_count, 0::bigint)::integer AS leads_count,
    q.numero AS cotizacion_numero,
    q.estado AS cotizacion_estado,
    q.estado_comercial AS cotizacion_estado_comercial,
    q.total_cotizacion,
    -- Al FINAL, no en su sitio logico: CREATE OR REPLACE VIEW solo deja
    -- ANADIR columnas al final. Meterlas en medio renombra las de despues
    -- y Postgres lo rechaza. Recrear la vista entera seria mas limpio de
    -- leer y mucho mas arriesgado: hay que tirarla antes, y con ella se
    -- van los permisos y cualquier cosa que dependa de ella.
    c.cliente_id,
    cl.nombre AS cliente_nombre
   FROM sales_conversations c
     LEFT JOIN cotizaciones q ON q.id = c.cotizacion_id
     LEFT JOIN clientes cl ON cl.id = c.cliente_id
     LEFT JOIN ( SELECT sales_messages.conversation_id,
            count(*) AS messages_count
           FROM sales_messages
          GROUP BY sales_messages.conversation_id) m ON m.conversation_id = c.id
     LEFT JOIN ( SELECT sales_leads.conversation_id,
            count(*) AS leads_count
           FROM sales_leads
          GROUP BY sales_leads.conversation_id) l ON l.conversation_id = c.id;

-- ------------------------------------------------------------
-- 4) ASOCIAR UNA CONVERSACION A UN CLIENTE
-- ------------------------------------------------------------
-- El botón "Asociar cliente" de la extensión existía desde hace meses y no
-- escribía nada: solo cambiaba de pestaña. Ahora guarda.
CREATE OR REPLACE FUNCTION public.sales_conversacion_asociar_cliente(
  p_conversation_id uuid,
  p_cliente_id      uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nombre text;
  v_tel    text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT nombre, telefono INTO v_nombre, v_tel
  FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;
  IF v_nombre IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'El cliente no es de esta empresa');
  END IF;

  UPDATE public.sales_conversations
     SET cliente_id = p_cliente_id,
         -- El teléfono del cliente solo se copia si la conversación no
         -- traía ninguno: en Instagram y TikTok no viene, y tenerlo es lo
         -- que después permite cruzar la venta.
         customer_phone = COALESCE(NULLIF(btrim(customer_phone), ''), v_tel),
         updated_at = now()
   WHERE id = p_conversation_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'La conversacion no es de esta empresa');
  END IF;

  RETURN json_build_object('ok', true, 'cliente', v_nombre);
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_conversacion_asociar_cliente(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_conversacion_asociar_cliente(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5) EL SISTEMA PROPONE, EL VENDEDOR CONFIRMA
-- ------------------------------------------------------------
-- Un campo que hay que llenar a mano en cada venta se llena mal a los tres
-- días: todo el mundo elige la primera opción de la lista. Cuando el
-- sistema YA SABE de dónde vino esa persona, lo propone y el vendedor solo
-- confirma. Esa es la diferencia entre un dato que sirve y uno que miente.
--
-- Mira, en este orden:
--   1. una ficha de seguimiento abierta de ese cliente (lo más específico:
--      alguien anotó a mano de dónde venía)
--   2. una conversación del Sales Hub ya enganchada a ese cliente
--   3. una conversación cuyo teléfono coincide con el del cliente
CREATE OR REPLACE FUNCTION public.sugerir_canal_origen(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_canal  text;
  v_porque text;
  v_tel    text;
BEGIN
  IF v_tenant IS NULL OR p_cliente_id IS NULL THEN
    RETURN json_build_object('canal', NULL, 'porque', NULL);
  END IF;

  SELECT cs.canal_origen INTO v_canal
  FROM public.crm_seguimiento cs
  WHERE cs.tenant_id = v_tenant
    AND cs.cliente_id = p_cliente_id
    AND cs.canal_origen IS NOT NULL
    AND cs.estado NOT IN ('comprado', 'perdido')
  ORDER BY cs.creado_en DESC
  LIMIT 1;
  IF v_canal IS NOT NULL THEN
    RETURN json_build_object('canal', v_canal, 'porque', 'tiene un seguimiento abierto por ahi');
  END IF;

  SELECT sc.platform INTO v_canal
  FROM public.sales_conversations sc
  WHERE sc.tenant_id = v_tenant AND sc.cliente_id = p_cliente_id
  ORDER BY sc.last_message_at DESC NULLS LAST
  LIMIT 1;
  IF v_canal IS NOT NULL THEN
    RETURN json_build_object('canal', v_canal, 'porque', 'te escribio por ahi');
  END IF;

  SELECT public.crm_whatsapp_phone_key(telefono) INTO v_tel
  FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;

  IF COALESCE(v_tel, '') <> '' THEN
    SELECT sc.platform INTO v_canal
    FROM public.sales_conversations sc
    WHERE sc.tenant_id = v_tenant
      AND public.crm_whatsapp_phone_key(sc.customer_phone) = v_tel
    ORDER BY sc.last_message_at DESC NULLS LAST
    LIMIT 1;
    IF v_canal IS NOT NULL THEN
      RETURN json_build_object('canal', v_canal, 'porque', 'ese numero te escribio por ahi');
    END IF;
  END IF;

  RETURN json_build_object('canal', NULL, 'porque', NULL);
END $$;

REVOKE EXECUTE ON FUNCTION public.sugerir_canal_origen(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sugerir_canal_origen(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6) LA RESPUESTA: CUANTO TRAJO CADA CANAL
-- ------------------------------------------------------------
-- Lo que no se puede contestar hoy. Devuelve también las que nadie anotó,
-- porque un reporte que esconde su propio hueco no sirve para decidir.
CREATE OR REPLACE FUNCTION public.get_ventas_por_canal(p_desde date, p_hasta date)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.total DESC), '[]'::json) INTO v_out
  FROM (
    SELECT COALESCE(f.canal_origen, 'sin_anotar') AS canal,
           count(*)                               AS facturas,
           count(DISTINCT f.cliente_id)           AS clientes,
           round(sum(f.total), 2)                 AS total,
           round(avg(f.total), 2)                 AS ticket_promedio
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      -- La hora local, no la del servidor. `fecha` es timestamptz y la base
      -- corre en UTC: comparando en crudo, una venta de las 8 de la noche
      -- del 19 ya es del 20 y este reporte no cuadraria con ningun otro.
      -- Es la misma forma que usa mcp_ventas_periodo.
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date
          BETWEEN p_desde AND p_hasta
      AND upper(COALESCE(f.estado, '')) <> 'ANULADA'
    GROUP BY 1
  ) x;

  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_ventas_por_canal(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ventas_por_canal(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('origen_de_la_venta.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='facturas' AND column_name='canal_origen')
       THEN 'OK  la factura guarda de donde vino' ELSE '*** FALLO ***' END AS campo,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='sales_conversations' AND column_name='cliente_id')
       THEN 'OK  la conversacion se engancha al cliente' ELSE '*** FALLO ***' END AS enganche,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='sales_conversations_view' AND column_name='cliente_id')
       THEN 'OK  la vista lo publica' ELSE '*** FALLO *** la extension no lo veria' END AS vista,
  (SELECT count(*) FROM public.config_empresa WHERE feat_origen_venta) AS empresas_en_piloto,
  (SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('sugerir_canal_origen','get_ventas_por_canal','sales_conversacion_asociar_cliente')) AS funciones;
