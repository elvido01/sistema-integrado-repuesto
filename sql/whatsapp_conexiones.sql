-- =====================================================================
-- WhatsApp oficial vendible — tabla de conexiones (19/11/2026)
-- ---------------------------------------------------------------------
-- Una fila por número conectado con el botón "Conectar WhatsApp"
-- (registro integrado de Meta + coexistencia). La empresa la VE (estado,
-- número, último mensaje) pero no la escribe: solo las funciones del
-- servidor (whatsapp-conectar y el webhook) con service_role.
-- El permiso de Meta va aparte en whatsapp_conexion_secretos, que nadie
-- puede leer desde la web (igual que social_account_secrets).
-- Plan: https://claude.ai/artifact/S6eV7xsKbWij3HCHmkNEzs
-- No reemplaza crm_whatsapp_settings (número de prueba viejo de mayo).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_conexiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  waba_id             text NOT NULL,
  phone_number_id     text NOT NULL UNIQUE,
  numero              text,                       -- como lo muestra Meta: +1 809-555-0000
  nombre_visible      text,
  modo                text NOT NULL DEFAULT 'coexistencia' CHECK (modo IN ('coexistencia', 'cloud')),
  estado              text NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado', 'desconectado', 'error')),
  motivo_desconexion  text,                       -- PRIMARY_INACTIVITY, CHANGE_NUMBER… (account_update)
  conectado_at        timestamptz NOT NULL DEFAULT now(),
  desconectado_at     timestamptz,
  ultimo_webhook_at   timestamptz,                -- cualquier aviso de Meta
  ultimo_mensaje_at   timestamptz,                -- último mensaje (entrante o desde la app)
  contactos_pedido_at timestamptz,                -- sincronización de contactos (una vez, 24 h)
  historial_pedido_at timestamptz,                -- sincronización de 6 meses de chats (una vez, 24 h)
  historial_progreso  int,                        -- 0-100 según los avisos 'history'
  historial_rechazado boolean NOT NULL DEFAULT false,
  ultimo_error        text,
  conectado_por       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Una conexión viva por empresa (se puede reconectar otro número después de desconectar).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conexiones_una_viva
  ON public.whatsapp_conexiones (tenant_id) WHERE estado <> 'desconectado';
CREATE INDEX IF NOT EXISTS whatsapp_conexiones_waba ON public.whatsapp_conexiones (waba_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_conexion_secretos (
  conexion_id   uuid PRIMARY KEY REFERENCES public.whatsapp_conexiones(id) ON DELETE CASCADE,
  access_token  text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conexion_secretos ENABLE ROW LEVEL SECURITY;

-- La empresa activa ve su conexión (regla: get_user_tenant(), no profiles.tenant_id).
DROP POLICY IF EXISTS whatsapp_conexiones_ver ON public.whatsapp_conexiones;
CREATE POLICY whatsapp_conexiones_ver ON public.whatsapp_conexiones
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

-- Secretos: sin políticas = nadie desde la web; solo service_role.
REVOKE ALL ON public.whatsapp_conexion_secretos FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_conexiones FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_conexiones TO authenticated;

-- Prueba: la tabla existe, el índice de una viva funciona (se deshace).
DO $prueba$
DECLARE v_t uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.whatsapp_conexiones (tenant_id, waba_id, phone_number_id) VALUES (v_t, 'PRUEBA', 'PRUEBA-1');
  BEGIN
    INSERT INTO public.whatsapp_conexiones (tenant_id, waba_id, phone_number_id) VALUES (v_t, 'PRUEBA', 'PRUEBA-2');
    RAISE EXCEPTION 'FALLO: dejó dos conexiones vivas en la misma empresa';
  EXCEPTION WHEN unique_violation THEN NULL;  -- bien
  END;
  UPDATE public.whatsapp_conexiones SET estado = 'desconectado' WHERE phone_number_id = 'PRUEBA-1';
  INSERT INTO public.whatsapp_conexiones (tenant_id, waba_id, phone_number_id) VALUES (v_t, 'PRUEBA', 'PRUEBA-2');
  DELETE FROM public.whatsapp_conexiones WHERE waba_id = 'PRUEBA';
  RAISE NOTICE 'whatsapp_conexiones: prueba OK';
END $prueba$;

SELECT public.registrar_migracion('whatsapp_conexiones.sql');
