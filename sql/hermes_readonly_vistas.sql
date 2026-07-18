-- =====================================================================
-- VISTAS DEL SCHEMA hermes PARA EL ROL hermes_readonly (Repuestos Morla)
-- ---------------------------------------------------------------------
-- hermes_readonly NO tiene permisos sobre public (a propósito). Las vistas
-- públicas hermes_* usan security_invoker=true, así que si una vista del
-- schema hermes se define ENCIMA de ellas, Postgres chequea los permisos
-- del usuario de la sesión sobre las tablas base → "permission denied for
-- table productos/crm_seguimiento". Por eso aquí TODAS las vistas van
-- DIRECTO a las tablas base (se ejecutan como el dueño, igual que las
-- vistas por tabla que genera hermes_readonly.sql), fijadas al tenant de
-- Morla.
--
-- Este archivo es el CANÓNICO de las vistas custom del schema hermes:
--   crm_seguimiento (lectura+escritura), crm_hoy, product_image_status,
--   hermes_whatsapp_conversaciones, hermes_whatsapp_mensajes,
--   hermes_llegadas_pendientes (lectura), y la función
--   hermes.crm_upsert_seguimiento (la vía RECOMENDADA de escritura del CRM:
--   normaliza teléfono, enlaza cliente/contacto/producto, dedup tel+producto).
--   Requiere que public.crm_upsert_seguimiento exista → correr DESPUÉS de
--   sql/crm_operativo.sql.
-- Los nombres de WhatsApp/llegadas son idénticos a las vistas públicas
-- para que las consultas sin schema resuelvan por search_path (=hermes).
--
-- ⚠ Si se re-ejecuta sql/hermes_readonly.sql, ese script BORRA todas las
--   vistas del schema hermes al regenerarlo → volver a correr ESTE archivo.
-- Permisos de escritura: SOLO hermes.crm_seguimiento (INSERT/UPDATE).
-- Como el rol es read-only por defecto, escribir requiere:
--   BEGIN; SET TRANSACTION READ WRITE; ... COMMIT;
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_morla constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'hermes')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    RAISE EXCEPTION 'Falta el schema hermes o el rol hermes_readonly: correr primero sql/hermes_readonly.sql';
  END IF;

  -- ------------------------------------------------------------
  -- 1) CRM de seguimiento (la ÚNICA con escritura)
  --    CHECK OPTION: no se puede insertar/mover una fila fuera de Morla.
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.crm_seguimiento WITH (security_barrier = true) AS
      SELECT * FROM public.crm_seguimiento WHERE tenant_id = %L::uuid
    WITH CASCADED CHECK OPTION
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- 2) CRM: qué toca hoy (abiertos con fecha vencida o sin fecha)
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.crm_hoy WITH (security_barrier = true) AS
    SELECT
      cs.tenant_id,
      ce.nombre            AS empresa,
      cs.id                AS seguimiento_id,
      cs.cliente_nombre,
      cs.telefono,
      cs.canal_origen,
      cs.producto_consultado,
      cs.codigo_producto,
      cs.estado,
      cs.prioridad,
      cs.proxima_accion,
      cs.fecha_seguimiento,
      cs.notas,
      cs.actualizado_en
    FROM public.crm_seguimiento cs
    LEFT JOIN public.config_empresa ce ON ce.tenant_id = cs.tenant_id
    WHERE cs.tenant_id = %L::uuid
      AND cs.estado NOT IN ('comprado','perdido')
      AND (cs.fecha_seguimiento IS NULL
           OR cs.fecha_seguimiento <= (now() AT TIME ZONE 'America/Santo_Domingo')::date)
      AND (cs.estado <> 'agotado_solicitado'
           OR cs.solicitud_id IS NULL
           OR EXISTS (SELECT 1 FROM public.solicitudes_clientes sc
                      WHERE sc.id = cs.solicitud_id
                        AND (sc.estado = 'notificada' OR sc.available_at IS NOT NULL)))
    ORDER BY CASE cs.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
             cs.fecha_seguimiento NULLS LAST,
             cs.actualizado_en
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- 3) Estado de imagen por producto (promocionables sin foto)
  --    Misma definición que public.hermes_product_image_status.
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.product_image_status WITH (security_barrier = true) AS
    SELECT
      p.tenant_id,
      p.id                                          AS product_id,
      p.codigo,
      p.descripcion,
      p.activo,
      COALESCE(kar.stock_actual, 0)                 AS stock_actual,
      p.precio,
      NULLIF(trim(p.imagen_url), '')                AS imagen_url,
      (NULLIF(trim(p.imagen_url), '') IS NOT NULL)  AS has_image,
      (NULLIF(trim(p.imagen_url), '') IS NOT NULL)::int AS image_count,
      p.updated_at,
      COALESCE(ven.sales_30d, 0)                    AS sales_30d,
      ven.last_sale_at,
      kar.first_stock_entry_at
    FROM public.productos p
    LEFT JOIN LATERAL (
      SELECT SUM(im.cantidad)::numeric                        AS stock_actual,
             MIN(im.fecha) FILTER (WHERE im.cantidad > 0)     AS first_stock_entry_at
      FROM public.inventario_movimientos im
      WHERE im.tenant_id = p.tenant_id
        AND im.producto_id = p.id
    ) kar ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= current_date - 30), 0)::numeric AS sales_30d,
             MAX(f.fecha) AS last_sale_at
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.tenant_id = p.tenant_id
        AND fd.producto_id = p.id
        AND upper(COALESCE(f.estado, '')) <> 'ANULADA'
    ) ven ON true
    WHERE p.activo = true
      AND p.tenant_id = %L::uuid
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- 4) WhatsApp: conversaciones (espejo) — misma def que la pública
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.hermes_whatsapp_conversaciones WITH (security_barrier = true) AS
    SELECT
      c.tenant_id,
      ce.nombre                                   AS empresa,
      c.id                                        AS conversacion_id,
      c.customer_name                             AS cliente,
      c.customer_phone                            AS telefono,
      c.external_conversation_id,
      c.last_message_at                           AS ultimo_mensaje_at,
      c.last_user_message_at                      AS ultimo_del_cliente_at,
      c.last_agent_message_at                     AS ultimo_mio_at,
      c.last_message_preview                      AS ultimo_mensaje,
      (c.last_user_message_at IS NOT NULL
        AND (c.last_agent_message_at IS NULL
             OR c.last_user_message_at > c.last_agent_message_at)) AS sin_responder,
      CASE WHEN c.last_user_message_at IS NOT NULL
           THEN round(extract(epoch FROM (now() - c.last_user_message_at)) / 3600.0, 1)
      END                                         AS horas_desde_cliente,
      (SELECT count(*) FROM public.sales_messages m WHERE m.conversation_id = c.id) AS total_mensajes
    FROM public.sales_conversations c
    LEFT JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id
    WHERE c.platform = 'whatsapp'
      AND c.tenant_id = %L::uuid
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- 5) WhatsApp: mensajes legibles
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.hermes_whatsapp_mensajes WITH (security_barrier = true) AS
    SELECT
      m.tenant_id,
      m.conversation_id,
      c.customer_name                             AS cliente,
      c.customer_phone                            AS telefono,
      CASE WHEN m.sender_type = 'agent' THEN 'yo' ELSE 'cliente' END AS quien,
      m.message_type                              AS tipo,
      m.message_text                              AS texto,
      m.created_at                                AS fecha,
      (m.raw_data->>'source')                     AS origen
    FROM public.sales_messages m
    JOIN public.sales_conversations c ON c.id = m.conversation_id
    WHERE m.platform = 'whatsapp'
      AND m.tenant_id = %L::uuid
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- 6) Llegadas pendientes de avisar — misma def que la pública
  --    (marcar avisado NO va por aquí: el RPC lo llama la web/service_role)
  -- ------------------------------------------------------------
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.hermes_llegadas_pendientes WITH (security_barrier = true) AS
    SELECT
      sc.tenant_id,
      ce.nombre                                                      AS empresa,
      sc.id                                                          AS solicitud_id,
      sc.cliente_id,
      COALESCE(cl.nombre, sc.cliente_nombre, sc.customer_name_snapshot) AS cliente,
      COALESCE(cl.telefono, sc.cliente_telefono, sc.phone_normalized)   AS telefono,
      sc.producto_id,
      COALESCE(p.descripcion, sc.producto_texto)                     AS producto,
      p.codigo,
      sc.cantidad_solicitada,
      sc.available_at,
      round(extract(epoch FROM (now() - sc.available_at)) / 3600.0, 1) AS horas_desde_llegada,
      sc.source_channel,
      sc.source_conversation_id,
      sc.notas
    FROM public.solicitudes_clientes sc
    LEFT JOIN public.productos p ON p.id = sc.producto_id
    LEFT JOIN public.clientes cl ON cl.id = sc.cliente_id
    LEFT JOIN public.config_empresa ce ON ce.tenant_id = sc.tenant_id
    WHERE sc.tenant_id = %L::uuid
      AND sc.estado = 'notificada'
      AND sc.available_at IS NOT NULL
      AND sc.customer_notified_at IS NULL
    ORDER BY sc.available_at ASC
  $q$, v_morla);

  -- ------------------------------------------------------------
  -- Permisos mínimos: todo lectura; escritura SOLO en crm_seguimiento
  -- ------------------------------------------------------------
  EXECUTE 'GRANT SELECT ON hermes.crm_seguimiento, hermes.crm_hoy, hermes.product_image_status,
           hermes.hermes_whatsapp_conversaciones, hermes.hermes_whatsapp_mensajes,
           hermes.hermes_llegadas_pendientes TO hermes_readonly';
  EXECUTE 'GRANT INSERT, UPDATE ON hermes.crm_seguimiento TO hermes_readonly';

  -- ------------------------------------------------------------
  -- 7) Escritura RECOMENDADA del CRM: wrapper de crm_upsert_seguimiento.
  --    hermes_readonly no tiene USAGE sobre public (no puede llamar la
  --    función de allá), así que se expone aquí. Fuerza creado_por='hermes'
  --    y tenant de Morla (el wrapper no acepta tenant).
  -- ------------------------------------------------------------
  IF to_regprocedure('public.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.crm_upsert_seguimiento: correr primero sql/crm_operativo.sql';
  END IF;

  CREATE OR REPLACE FUNCTION hermes.crm_upsert_seguimiento(
    p_telefono          text,
    p_cliente_nombre    text DEFAULT NULL,
    p_canal_origen      text DEFAULT 'whatsapp',
    p_producto          text DEFAULT NULL,
    p_codigo            text DEFAULT NULL,
    p_estado            text DEFAULT NULL,
    p_prioridad         text DEFAULT NULL,
    p_proxima_accion    text DEFAULT NULL,
    p_fecha_seguimiento date DEFAULT NULL,
    p_nota              text DEFAULT NULL,
    p_solicitud_id      uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO public
  AS $fn$
    SELECT public.crm_upsert_seguimiento(
      p_telefono, p_cliente_nombre, p_canal_origen, p_producto, p_codigo,
      p_estado, p_prioridad, p_proxima_accion, p_fecha_seguimiento, p_nota,
      p_solicitud_id, 'hermes', NULL);
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION hermes.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION hermes.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid) TO hermes_readonly';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_readonly_vistas.sql');
  END IF;
END $$;

SELECT 'Vistas del schema hermes listas (lectura total, escritura solo crm_seguimiento)' AS status;
