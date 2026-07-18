-- =====================================================================
-- ETAPA 1.2 — CRM OPERATIVO (escritura controlada del seguimiento)
-- ---------------------------------------------------------------------
-- Sobre la tabla crm_seguimiento (Etapa 1):
--
--  1) RPC crm_upsert_seguimiento: crear/actualizar una ficha desde una
--     conversación de WhatsApp. Normaliza el teléfono con
--     crm_whatsapp_phone_key, enlaza solos cliente_id (clientes),
--     contact_id (crm_whatsapp_contacts) y producto_id (por código), y
--     valida estado/prioridad. Las notas se ACUMULAN con fecha (no se
--     pierden). Mismo teléfono + mismo producto → actualiza la ficha
--     abierta; producto distinto → ficha nueva.
--  2) Anti-duplicados por TELÉFONO + PRODUCTO (antes era solo teléfono):
--     índice único parcial sobre fichas abiertas.
--  3) Cierre automático al facturar: trigger en facturas_detalle → si el
--     cliente de la factura (por cliente_id o teléfono) tiene fichas
--     abiertas del producto facturado (o sin producto), pasan a
--     'comprado' con factura_id enlazado. Ignora facturas anuladas.
--  4) hermes_crm_hoy: solo lo que requiere acción — se ocultan las fichas
--     'agotado_solicitado' cuya solicitud sigue esperando la pieza (al
--     llegar, el detector la marca 'notificada' y la ficha reaparece).
--
-- Después de este archivo, RE-CORRER sql/hermes_readonly_vistas.sql
-- (actualiza hermes.crm_hoy y crea hermes.crm_upsert_seguimiento para el
-- rol hermes_readonly, que no puede llamar funciones del schema public).
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Anti-duplicados: un seguimiento ABIERTO por teléfono + producto
--    (identidad de producto = código, o el texto consultado si no hay)
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.crm_seguimiento_abierto_uq;
CREATE UNIQUE INDEX crm_seguimiento_abierto_uq
  ON public.crm_seguimiento (
    tenant_id,
    telefono,
    (COALESCE(lower(NULLIF(btrim(codigo_producto), '')),
              lower(NULLIF(btrim(producto_consultado), '')), ''))
  )
  WHERE telefono IS NOT NULL AND estado NOT IN ('comprado','perdido');

-- ------------------------------------------------------------
-- 2) RPC de escritura controlada (upsert)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_upsert_seguimiento(
  p_telefono          text,
  p_cliente_nombre    text DEFAULT NULL,
  p_canal_origen      text DEFAULT 'whatsapp',
  p_producto          text DEFAULT NULL,
  p_codigo            text DEFAULT NULL,
  p_estado            text DEFAULT NULL,   -- NULL = 'nuevo' al crear / mantener al actualizar
  p_prioridad         text DEFAULT NULL,
  p_proxima_accion    text DEFAULT NULL,
  p_fecha_seguimiento date DEFAULT NULL,
  p_nota              text DEFAULT NULL,
  p_solicitud_id      uuid DEFAULT NULL,
  p_creado_por        text DEFAULT 'hermes',
  p_tenant_id         uuid DEFAULT NULL    -- SOLO lo respeta service_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_morla   constant uuid := '00000000-0000-0000-0000-000000000001';
  v_estados constant text[] := ARRAY['nuevo','interesado','precio_enviado','pendiente_pago',
                                     'prometio_pasar','comprado','perdido',
                                     'agotado_solicitado','requiere_aprobacion'];
  v_tenant   uuid := public.get_user_tenant();
  v_jwt_role text := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_tel      text;
  v_prod_key text;
  v_id       uuid;
  v_cliente  uuid;
  v_contact  uuid;
  v_prod_id  uuid;
  v_accion   text;
BEGIN
  -- Tenant: usuario web → el suyo; Hermes (rol hermes_readonly) → Morla;
  -- service_role → el que diga p_tenant_id. Nadie más puede elegir tenant.
  IF v_tenant IS NULL THEN
    IF session_user = 'hermes_readonly' THEN
      v_tenant := v_morla;
    ELSIF v_jwt_role = 'service_role' AND p_tenant_id IS NOT NULL THEN
      v_tenant := p_tenant_id;
    END IF;
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  v_tel := public.crm_whatsapp_phone_key(p_telefono);
  IF v_tel IS NULL OR length(v_tel) < 7 THEN
    RAISE EXCEPTION 'Teléfono inválido: %', p_telefono;
  END IF;
  IF p_estado IS NOT NULL AND NOT (p_estado = ANY (v_estados)) THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado;
  END IF;
  IF p_prioridad IS NOT NULL AND p_prioridad NOT IN ('alta','media','baja') THEN
    RAISE EXCEPTION 'Prioridad inválida: %', p_prioridad;
  END IF;

  v_prod_key := COALESCE(lower(NULLIF(btrim(p_codigo), '')),
                         lower(NULLIF(btrim(p_producto), '')), '');

  -- Enlaces automáticos por teléfono / código
  SELECT id INTO v_cliente FROM public.clientes
   WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(telefono) = v_tel
   LIMIT 1;
  SELECT id INTO v_contact FROM public.crm_whatsapp_contacts
   WHERE tenant_id = v_tenant AND public.crm_whatsapp_phone_key(phone) = v_tel
   LIMIT 1;
  IF NULLIF(btrim(p_codigo), '') IS NOT NULL THEN
    SELECT id INTO v_prod_id FROM public.productos
     WHERE tenant_id = v_tenant AND upper(codigo) = upper(btrim(p_codigo))
     LIMIT 1;
  END IF;

  -- ¿Ficha abierta del mismo teléfono + producto?
  SELECT id INTO v_id
  FROM public.crm_seguimiento
  WHERE tenant_id = v_tenant
    AND telefono = v_tel
    AND estado NOT IN ('comprado','perdido')
    AND COALESCE(lower(NULLIF(btrim(codigo_producto), '')),
                 lower(NULLIF(btrim(producto_consultado), '')), '') = v_prod_key
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE public.crm_seguimiento SET
      cliente_nombre      = COALESCE(NULLIF(btrim(p_cliente_nombre), ''), cliente_nombre),
      canal_origen        = COALESCE(NULLIF(btrim(p_canal_origen), ''), canal_origen),
      producto_consultado = COALESCE(NULLIF(btrim(p_producto), ''), producto_consultado),
      codigo_producto     = COALESCE(NULLIF(btrim(p_codigo), ''), codigo_producto),
      producto_id         = COALESCE(v_prod_id, producto_id),
      estado              = COALESCE(p_estado, estado),
      prioridad           = COALESCE(p_prioridad, prioridad),
      proxima_accion      = COALESCE(NULLIF(btrim(p_proxima_accion), ''), proxima_accion),
      fecha_seguimiento   = COALESCE(p_fecha_seguimiento, fecha_seguimiento),
      notas               = CASE WHEN NULLIF(btrim(p_nota), '') IS NULL THEN notas
                                 ELSE COALESCE(notas || E'\n', '')
                                      || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM')
                                      || ' ' || btrim(p_nota) END,
      cliente_id          = COALESCE(cliente_id, v_cliente),
      contact_id          = COALESCE(contact_id, v_contact),
      solicitud_id        = COALESCE(p_solicitud_id, solicitud_id)
    WHERE id = v_id;
    v_accion := 'actualizada';
  ELSE
    INSERT INTO public.crm_seguimiento (
      tenant_id, cliente_nombre, telefono, cliente_id, contact_id, canal_origen,
      producto_consultado, codigo_producto, producto_id,
      estado, prioridad, proxima_accion, fecha_seguimiento, notas,
      solicitud_id, creado_por
    ) VALUES (
      v_tenant,
      COALESCE(NULLIF(btrim(p_cliente_nombre), ''),
               (SELECT nombre FROM public.clientes WHERE id = v_cliente),
               (SELECT name FROM public.crm_whatsapp_contacts WHERE id = v_contact),
               'Cliente WhatsApp'),
      v_tel, v_cliente, v_contact,
      COALESCE(NULLIF(btrim(p_canal_origen), ''), 'whatsapp'),
      NULLIF(btrim(p_producto), ''), NULLIF(btrim(p_codigo), ''), v_prod_id,
      COALESCE(p_estado, 'nuevo'),
      COALESCE(p_prioridad, 'media'),
      NULLIF(btrim(p_proxima_accion), ''),
      p_fecha_seguimiento,
      CASE WHEN NULLIF(btrim(p_nota), '') IS NULL THEN NULL
           ELSE to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM') || ' ' || btrim(p_nota) END,
      p_solicitud_id,
      COALESCE(NULLIF(btrim(p_creado_por), ''), 'hermes')
    )
    RETURNING id INTO v_id;
    v_accion := 'creada';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'accion', v_accion, 'seguimiento_id', v_id,
    'telefono', v_tel, 'cliente_id', v_cliente, 'contact_id', v_contact,
    'producto_id', v_prod_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_upsert_seguimiento(text,text,text,text,text,text,text,text,date,text,uuid,text,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Cierre automático al facturar (comprado + factura enlazada)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_cerrar_seguimientos_factura(p_factura_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_fac   record;
  v_tel   text;
  v_n     int := 0;
BEGIN
  SELECT id, tenant_id, cliente_id, numero
    INTO v_fac
  FROM public.facturas
  WHERE id = p_factura_id
    AND upper(COALESCE(estado, '')) <> 'ANULADA';
  IF NOT FOUND OR v_fac.cliente_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Guard barato: si el tenant no tiene fichas abiertas, no hay nada que hacer
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_seguimiento
    WHERE tenant_id = v_fac.tenant_id AND estado NOT IN ('comprado','perdido')
  ) THEN
    RETURN 0;
  END IF;

  SELECT public.crm_whatsapp_phone_key(telefono) INTO v_tel
  FROM public.clientes WHERE id = v_fac.cliente_id;

  UPDATE public.crm_seguimiento cs SET
    estado     = 'comprado',
    factura_id = v_fac.id,
    cliente_id = COALESCE(cs.cliente_id, v_fac.cliente_id),
    notas      = COALESCE(cs.notas || E'\n', '')
                 || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM')
                 || ' [auto] Comprado — factura #' || v_fac.numero
  WHERE cs.tenant_id = v_fac.tenant_id
    AND cs.estado NOT IN ('comprado','perdido')
    AND (cs.cliente_id = v_fac.cliente_id
         OR (COALESCE(v_tel, '') <> '' AND cs.telefono = v_tel))
    AND (
      -- la ficha es del producto facturado…
      (cs.producto_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.facturas_detalle fd
         WHERE fd.factura_id = v_fac.id AND fd.producto_id = cs.producto_id))
      OR (cs.producto_id IS NULL AND NULLIF(btrim(cs.codigo_producto), '') IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.facturas_detalle fd
         WHERE fd.factura_id = v_fac.id AND upper(fd.codigo) = upper(btrim(cs.codigo_producto))))
      -- …o no tiene producto: cualquier compra del cliente la cierra
      OR (cs.producto_id IS NULL AND NULLIF(btrim(cs.codigo_producto), '') IS NULL)
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_cerrar_seguimientos_factura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_cerrar_seguimientos_factura(uuid) TO service_role;

-- Trigger: cada línea facturada intenta cerrar fichas (idempotente y barato
-- por el guard; corre al insertar el detalle porque la factura se inserta antes)
CREATE OR REPLACE FUNCTION public.trg_crm_comprado_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.crm_cerrar_seguimientos_factura(NEW.factura_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_comprado ON public.facturas_detalle;
CREATE TRIGGER trg_crm_comprado
  AFTER INSERT ON public.facturas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_comprado_fn();

-- ------------------------------------------------------------
-- 4) crm_hoy: solo lo que requiere acción HOY
--    (se ocultan fichas 'agotado_solicitado' cuya pieza aún no llega)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hermes_crm_hoy
WITH (security_invoker = true) AS
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
WHERE cs.estado NOT IN ('comprado','perdido')
  AND (cs.fecha_seguimiento IS NULL
       OR cs.fecha_seguimiento <= (now() AT TIME ZONE 'America/Santo_Domingo')::date)
  AND (cs.estado <> 'agotado_solicitado'
       OR cs.solicitud_id IS NULL
       OR EXISTS (SELECT 1 FROM public.solicitudes_clientes sc
                  WHERE sc.id = cs.solicitud_id
                    AND (sc.estado = 'notificada' OR sc.available_at IS NOT NULL)))
ORDER BY CASE cs.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         cs.fecha_seguimiento NULLS LAST,
         cs.actualizado_en;

GRANT SELECT ON public.hermes_crm_hoy TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('crm_operativo.sql');
  END IF;
END $$;

SELECT 'CRM operativo listo (upsert + dedup tel+producto + cierre por factura + crm_hoy)' AS status;
