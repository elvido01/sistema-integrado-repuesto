-- =====================================================================
-- SEGURIDAD DEL ESPEJO WHATSAPP + DIRECTORIO DE CONTACTOS (corrección)
-- ---------------------------------------------------------------------
-- 1) ocultar_secretos(): un mensaje cuyo texto coincide con patrones de
--    credenciales/secretos se sirve como '[contenido sensible oculto]'.
--    La tabla base NO se toca (auditoría intacta): solo las vistas que
--    lee Hermes/el CRM dejan de servir el secreto.
-- 2) Endurece las vistas public hermes_whatsapp_conversaciones/mensajes:
--    * solo conversaciones INDIVIDUALES con teléfono verificable
--      (sin teléfono o grupo → fuera de las vistas, no aptas para CRM);
--    * texto y último mensaje pasan por ocultar_secretos().
-- 3) Backfill del directorio: upsert en crm_whatsapp_contacts de TODAS
--    las conversaciones del espejo que ya tienen teléfono (idempotente
--    por tenant+teléfono normalizado; el nombre manual no se pisa;
--    cliente_id solo con coincidencia única).
-- 4) La vista de cotizaciones también exige teléfono verificable.
--
-- DESPUÉS de este archivo, RE-CORRER sql/hermes_readonly_vistas.sql
-- (aplica el mismo endurecimiento a las vistas del schema hermes, que
-- son las que lee el rol de Hermes). Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Detector/censor de secretos (client_secret, tokens, api keys,
--    passwords, JWT verificable, llaves privadas, OpenAI sk-…)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ocultar_secretos(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_texto IS NULL OR btrim(p_texto) = '' THEN p_texto
    WHEN p_texto ~* '(client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?key|secret[_-]?key|private[_-]?key|service[_-]?role|password|contrase[nñ]a|-----BEGIN)'
      OR p_texto ~  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+'
      OR p_texto ~* 'sk-[A-Za-z0-9_-]{20,}'
    THEN '[contenido sensible oculto]'
    ELSE p_texto
  END
$$;

-- ------------------------------------------------------------
-- 2) Vistas public endurecidas (mismas columnas, filtro + censura)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hermes_whatsapp_conversaciones
WITH (security_invoker = true) AS
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
  public.ocultar_secretos(c.last_message_preview) AS ultimo_mensaje,
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
  AND c.customer_phone IS NOT NULL                      -- solo identidad verificable
  AND COALESCE(c.metadata->>'grupo', 'false') <> 'true'; -- nunca grupos

CREATE OR REPLACE VIEW public.hermes_whatsapp_mensajes
WITH (security_invoker = true) AS
SELECT
  m.tenant_id,
  m.conversation_id,
  c.customer_name                             AS cliente,
  c.customer_phone                            AS telefono,
  CASE WHEN m.sender_type = 'agent' THEN 'yo' ELSE 'cliente' END AS quien,
  m.message_type                              AS tipo,
  public.ocultar_secretos(m.message_text)     AS texto,
  m.created_at                                AS fecha,
  (m.raw_data->>'source')                     AS origen
FROM public.sales_messages m
JOIN public.sales_conversations c ON c.id = m.conversation_id
WHERE m.platform = 'whatsapp'
  AND c.customer_phone IS NOT NULL
  AND COALESCE(c.metadata->>'grupo', 'false') <> 'true';

GRANT SELECT ON public.hermes_whatsapp_conversaciones TO authenticated, service_role;
GRANT SELECT ON public.hermes_whatsapp_mensajes       TO authenticated, service_role;

-- Cotizaciones (espejo service_role): también exige teléfono
CREATE OR REPLACE VIEW public.hermes_whatsapp_cotizaciones_srv AS
SELECT
  sc.tenant_id,
  sc.id                  AS conversation_id,
  sc.customer_phone      AS telefono,
  sc.customer_name       AS cliente,
  c.id                   AS cotizacion_id,
  c.numero               AS cotizacion_numero,
  cd.producto_id,
  cd.codigo              AS codigo_producto,
  cd.descripcion         AS producto_descripcion,
  cd.cantidad,
  cd.precio_unitario,
  c.created_at           AS fecha
FROM public.sales_conversations sc
JOIN public.cotizaciones c        ON c.id = sc.cotizacion_id AND c.tenant_id = sc.tenant_id
JOIN public.cotizaciones_detalle cd ON cd.cotizacion_id = c.id AND cd.tenant_id = c.tenant_id
WHERE sc.platform = 'whatsapp'
  AND sc.customer_phone IS NOT NULL;

REVOKE ALL ON public.hermes_whatsapp_cotizaciones_srv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hermes_whatsapp_cotizaciones_srv TO service_role;

-- ------------------------------------------------------------
-- 3) Backfill del directorio de contactos desde el espejo
--    (todas las conversaciones whatsapp que ya tienen teléfono)
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_contact uuid;
  v_cliente uuid;
  v_ins int := 0;
  v_upd int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (sc.tenant_id, public.crm_whatsapp_phone_key(sc.customer_phone))
      sc.tenant_id,
      regexp_replace(sc.customer_phone, '\D', '', 'g')  AS phone,
      public.crm_whatsapp_phone_key(sc.customer_phone)  AS tel_key,
      sc.customer_name,
      sc.customer_external_id,
      sc.last_message_at
    FROM public.sales_conversations sc
    WHERE sc.platform = 'whatsapp'
      AND sc.customer_phone IS NOT NULL
      AND length(public.crm_whatsapp_phone_key(sc.customer_phone)) >= 7
      AND COALESCE(sc.metadata->>'grupo', 'false') <> 'true'
    ORDER BY sc.tenant_id, public.crm_whatsapp_phone_key(sc.customer_phone),
             sc.last_message_at DESC NULLS LAST
  LOOP
    SELECT id INTO v_contact FROM public.crm_whatsapp_contacts
     WHERE tenant_id = r.tenant_id AND public.crm_whatsapp_phone_key(phone) = r.tel_key
     LIMIT 1;

    SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid END INTO v_cliente
    FROM public.clientes
    WHERE tenant_id = r.tenant_id AND public.crm_whatsapp_phone_key(telefono) = r.tel_key;

    IF v_contact IS NULL THEN
      INSERT INTO public.crm_whatsapp_contacts (tenant_id, cliente_id, phone, wa_id, name, source)
      VALUES (r.tenant_id, v_cliente, r.phone, r.customer_external_id,
              CASE WHEN r.customer_name IS NOT NULL AND r.customer_name !~ '^\+?[0-9\s()\-]+$'
                   THEN r.customer_name END,
              'omni_mirror');
      v_ins := v_ins + 1;
    ELSE
      -- el nombre solo se pisa si el actual está vacío o es un número
      UPDATE public.crm_whatsapp_contacts SET
        name = CASE WHEN (name IS NULL OR btrim(name) = '' OR name ~ '^\+?[0-9\s()\-]+$')
                     AND r.customer_name IS NOT NULL AND r.customer_name !~ '^\+?[0-9\s()\-]+$'
                    THEN r.customer_name ELSE name END,
        cliente_id = COALESCE(cliente_id, v_cliente),
        wa_id      = COALESCE(wa_id, r.customer_external_id),
        updated_at = GREATEST(updated_at, COALESCE(r.last_message_at, updated_at))
      WHERE id = v_contact;
      v_upd := v_upd + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Directorio de contactos: % creados, % actualizados desde el espejo', v_ins, v_upd;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('whatsapp_espejo_seguridad.sql');
  END IF;
END $$;

-- Resumen
SELECT
  (SELECT count(*) FROM public.crm_whatsapp_contacts)                                            AS contactos_directorio,
  (SELECT count(*) FROM public.hermes_whatsapp_conversaciones)                                   AS convs_visibles_para_crm,
  (SELECT count(*) FROM public.sales_conversations
    WHERE platform = 'whatsapp' AND customer_phone IS NULL)                                      AS convs_excluidas_sin_telefono,
  public.ocultar_secretos('client_secret: abc123')                                               AS prueba_censura;
