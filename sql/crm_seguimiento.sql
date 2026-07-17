-- =====================================================================
-- CRM MÍNIMO DE SEGUIMIENTO COMERCIAL (Etapa 1 — Repuestos Morla + Hermes)
-- ---------------------------------------------------------------------
-- Una fila = un seguimiento comercial abierto con un cliente/lead
-- (vino por WhatsApp, tienda o teléfono, preguntó por algo, y hay que
-- darle seguimiento hasta que compre o se pierda).
--
-- No duplica lo que ya existe:
--   * crm_whatsapp_* (inbox Meta) y sales_conversations/messages (espejo
--     WhatsApp Web) guardan la CONVERSACIÓN. Esta tabla guarda la
--     OPORTUNIDAD y su próxima acción.
--   * Si el lead pide algo agotado → se crea la solicitud en
--     solicitudes_clientes y aquí queda enlazada (solicitud_id).
--   * Cuando compra → factura_id enlaza la venta (medición de resultados).
--
-- Acceso Hermes:
--   * service_role / postgres (psycopg2): lee y escribe public.crm_seguimiento
--     directo, SIEMPRE filtrando tenant_id.
--   * rol hermes_readonly (si existe): vistas hermes.crm_seguimiento (RW) y
--     hermes.crm_hoy (lectura), limitadas al tenant de Morla. Como el rol
--     tiene default_transaction_read_only=on, para escribir debe abrir la
--     transacción con: BEGIN; SET TRANSACTION READ WRITE; ... COMMIT;
-- Multi-tenant: RLS por get_user_tenant() (mismo patrón que crm_whatsapp_*).
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_seguimiento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Quién es (nombre siempre; los enlaces se llenan si se conocen)
  cliente_nombre   text NOT NULL,
  telefono         text,
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  contact_id       uuid REFERENCES public.crm_whatsapp_contacts(id) ON DELETE SET NULL,
  canal_origen     text NOT NULL DEFAULT 'whatsapp'
    CHECK (canal_origen IN ('whatsapp','tienda','telefono','referido','redes','otro')),

  -- Qué busca
  producto_consultado text,
  codigo_producto     text,
  producto_id         uuid REFERENCES public.productos(id) ON DELETE SET NULL,

  -- Dónde va la venta
  estado           text NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo','interesado','precio_enviado','pendiente_pago',
                      'prometio_pasar','comprado','perdido',
                      'agotado_solicitado','requiere_aprobacion')),
  prioridad        text NOT NULL DEFAULT 'media'
    CHECK (prioridad IN ('alta','media','baja')),
  proxima_accion   text,
  fecha_seguimiento date,
  notas            text,

  -- Cierres / enlaces para medir resultados
  factura_id       uuid REFERENCES public.facturas(id) ON DELETE SET NULL,
  solicitud_id     uuid REFERENCES public.solicitudes_clientes(id) ON DELETE SET NULL,

  creado_por       text NOT NULL DEFAULT 'web',   -- 'hermes' | 'web'
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

-- Un solo seguimiento ABIERTO por teléfono y empresa: Hermes actualiza la
-- ficha existente en vez de crear otra cada vez que relee el chat.
CREATE UNIQUE INDEX IF NOT EXISTS crm_seguimiento_abierto_uq
  ON public.crm_seguimiento (tenant_id, telefono)
  WHERE telefono IS NOT NULL AND estado NOT IN ('comprado','perdido');

CREATE INDEX IF NOT EXISTS crm_seguimiento_estado_idx
  ON public.crm_seguimiento (tenant_id, estado);
CREATE INDEX IF NOT EXISTS crm_seguimiento_fecha_idx
  ON public.crm_seguimiento (tenant_id, fecha_seguimiento);

-- actualizado_en automático
CREATE OR REPLACE FUNCTION public.crm_seguimiento_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_seguimiento_touch_trg ON public.crm_seguimiento;
CREATE TRIGGER crm_seguimiento_touch_trg
  BEFORE UPDATE ON public.crm_seguimiento
  FOR EACH ROW EXECUTE FUNCTION public.crm_seguimiento_touch();

-- RLS: cada empresa ve solo lo suyo (mismo patrón que crm_whatsapp_*)
ALTER TABLE public.crm_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_seguimiento_tenant ON public.crm_seguimiento;
CREATE POLICY crm_seguimiento_tenant ON public.crm_seguimiento
  FOR ALL
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

REVOKE ALL ON public.crm_seguimiento FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_seguimiento TO authenticated, service_role;

-- ------------------------------------------------------------
-- Vista "qué toca hoy": seguimientos abiertos ya vencidos o sin fecha,
-- alta primero. security_invoker → un usuario web solo ve su empresa;
-- service_role la ve completa y filtra por tenant_id.
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
ORDER BY CASE cs.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         cs.fecha_seguimiento NULLS LAST,
         cs.actualizado_en;

GRANT SELECT ON public.hermes_crm_hoy TO authenticated, service_role;

-- ------------------------------------------------------------
-- Acceso para el rol restringido hermes_readonly:
-- las vistas del schema hermes (crm_seguimiento RW, crm_hoy, etc.)
-- viven TODAS en sql/hermes_readonly_vistas.sql — correr ese archivo
-- después de este (y después de cualquier re-run de hermes_readonly.sql,
-- que borra las vistas del schema hermes al regenerarlo).
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('crm_seguimiento.sql');
  END IF;
END $$;

SELECT 'CRM mínimo de seguimiento listo (tabla + vista hoy + acceso Hermes)' AS status;
