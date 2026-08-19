-- =====================================================================
-- El seguimiento deja de meter las tres redes en la misma bolsa
-- ---------------------------------------------------------------------
-- (2026-08-19) Complemento de origen_de_la_venta.sql, escrito despues de
-- comprobar por que la sugerencia no iba a servir.
--
-- `sugerir_canal_origen` mira TRES sitios y el primero, por ser el mas
-- especifico, es crm_seguimiento: si alguien anoto de donde venia ese
-- cliente, eso manda sobre cualquier deduccion. Pero ese campo no lo
-- escribe una persona: lo escribe `crm_seguimiento_crear`, que venia
-- haciendo
--
--     WHEN v_c_plat IN ('instagram','facebook','tiktok','youtube')
--       THEN 'redes'
--
-- O sea que el unico camino que alimenta la fuente MAS fiable de la
-- sugerencia era tambien el unico que borraba la respuesta. Un seguimiento
-- nacido de un hilo de TikTok proponia 'redes' en el mostrador — que ni
-- siquiera es una de las opciones que se ofrecen — y la pregunta que
-- justifica todo esto ("¿cuanto vino de TikTok?") quedaba sin contestar
-- justo en el camino que mejor podia contestarla.
--
-- El CHECK de crm_seguimiento ya acepta las tres por separado desde
-- origen_de_la_venta.sql, asi que aqui solo hay que dejar de colapsarlas.
--
-- >>> COMO SE HIZO <<<
-- El cuerpo de abajo NO esta reescrito a mano: es la definicion que estaba
-- en produccion, sacada con pg_get_functiondef, con el CASE cambiado y nada
-- mas. Reescribir la funcion entera para tocar cinco lineas es como se
-- pierden validaciones sin que nadie lo note.
--
-- Las filas viejas se quedan en 'redes' y se siguen leyendo: nombreCanal()
-- las muestra como "Redes (viejo)".
--
-- Los permisos no se tocan: CREATE OR REPLACE los conserva.
--
-- Idempotente. No toca dinero.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.crm_seguimiento_crear(p_fecha date, p_conversation_id uuid DEFAULT NULL::uuid, p_producto text DEFAULT NULL::text, p_accion text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_prioridad text DEFAULT 'media'::text, p_cliente_nombre text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid, p_codigo_producto text DEFAULT NULL::text, p_estado text DEFAULT 'nuevo'::text)
 RETURNS json
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

  -- La plataforma del hilo al vocabulario de la tabla. Cada red por su
  -- nombre: son tres esfuerzos distintos y hay que poder saber cual paga.
  -- Sin conversacion es alguien del mostrador.
  --
  -- El ELSE cubre lo que aparezca manana (youtube ya asoma en el codigo del
  -- espejo): entra como 'otro' en vez de reventar contra el CHECK. Cuando un
  -- canal nuevo traiga dinero de verdad se le abre su sitio aqui y en el
  -- CHECK, no antes.
  v_canal := CASE
               WHEN v_c_plat IS NULL THEN 'tienda'
               WHEN v_c_plat IN ('whatsapp','instagram','facebook','tiktok')
                 THEN v_c_plat
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


NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('seguimiento_canal_sin_bolsa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN d LIKE '%THEN v_c_plat%' AND d NOT LIKE '%THEN ''redes''%'
       THEN 'OK  cada red se guarda con su nombre'
       ELSE '*** FALLO *** sigue colapsando a redes' END AS mapeo
FROM (
  SELECT pg_get_functiondef(p.oid) AS d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'crm_seguimiento_crear'
) t;
