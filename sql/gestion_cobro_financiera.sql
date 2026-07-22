-- =====================================================================
-- Gestion de Cobro - Financiera
-- ---------------------------------------------------------------------
-- Seguimiento operativo de clientes atrasados:
-- mensajes enviados, respuestas, promesas de pago, visitas y notas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cobro_gestiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.get_user_tenant(),
  cliente_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  prestamo_id     uuid REFERENCES public.prestamos(id) ON DELETE SET NULL,
  tipo            text NOT NULL, -- mensaje_enviado | respuesta_cliente | promesa_pago | mandado_buscar | visita | nota
  estado          text NOT NULL DEFAULT 'registrada',
  canal           text,
  fecha_promesa   date,
  monto_promesa   numeric(14,2),
  resultado       text,
  asignado_a      text,
  nota            text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_cobro_gestiones_cliente
  ON public.cobro_gestiones (tenant_id, cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cobro_gestiones_prestamo
  ON public.cobro_gestiones (tenant_id, prestamo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cobro_gestiones_tipo_estado
  ON public.cobro_gestiones (tenant_id, tipo, estado);

CREATE INDEX IF NOT EXISTS idx_cobro_gestiones_promesa
  ON public.cobro_gestiones (tenant_id, fecha_promesa)
  WHERE tipo = 'promesa_pago' AND estado NOT IN ('cumplida', 'cancelada');

ALTER TABLE public.cobro_gestiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cobro_gestiones_tenant ON public.cobro_gestiones;
CREATE POLICY cobro_gestiones_tenant ON public.cobro_gestiones
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE ON public.cobro_gestiones TO authenticated;

SELECT 'gestion de cobro financiera lista' AS status;
