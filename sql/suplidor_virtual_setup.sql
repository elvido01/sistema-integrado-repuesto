-- ============================================================
-- Suplidor Virtual — Setup inicial
-- ============================================================
-- Cuando un suplidor original no tiene mercancía, el operador
-- "envía" el producto al Suplidor Virtual desde la OC.
--
-- Reglas:
--   1) La fila vive 30 días desde marcado_at.
--   2) Durante esos 30 días el sistema NO debe sugerir reordenar
--      ese producto al suplidor_original (regla aplicada en
--      sugerencias automáticas / orden automática).
--   3) Tras 30 días o tras compra/cancelación, queda como histórico.
--
-- Ejecutar en PROD (Repuestos Morla) y DEV.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suplidor_virtual_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  suplidor_original_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,

  -- Snapshot al momento de marcar (independiente del producto)
  codigo TEXT,
  descripcion TEXT,
  cantidad_sugerida NUMERIC(18,2) DEFAULT 1,
  precio_referencia NUMERIC(18,2),

  -- Estado y ventana de 30 días
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  marcado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  -- Cuando se compra/cancela queda el rastro
  comprado_a_suplidor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  compra_id UUID, -- referencia opcional a public.compras (sin FK rígida)
  orden_compra_origen_id UUID, -- referencia opcional a la OC donde se marcó

  notas TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT estado_valido CHECK (estado IN ('pendiente','comprado','expirado','cancelado'))
);

COMMENT ON TABLE public.suplidor_virtual_items IS
  'Productos marcados como agotados al suplidor original. Bloqueados de reorden por 30 días.';
COMMENT ON COLUMN public.suplidor_virtual_items.expira_at IS
  'Después de esta fecha la fila se considera expirada y el producto vuelve a estar disponible para sugerencias al suplidor original.';

-- ────────────────────────────────────────────────
-- Índices
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supvirt_tenant_estado
  ON public.suplidor_virtual_items(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_supvirt_tenant_producto_estado
  ON public.suplidor_virtual_items(tenant_id, producto_id, estado);
CREATE INDEX IF NOT EXISTS idx_supvirt_expira
  ON public.suplidor_virtual_items(expira_at)
  WHERE estado = 'pendiente';

-- ────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────
ALTER TABLE public.suplidor_virtual_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supvirt_select_tenant" ON public.suplidor_virtual_items;
CREATE POLICY "supvirt_select_tenant" ON public.suplidor_virtual_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "supvirt_insert_tenant" ON public.suplidor_virtual_items;
CREATE POLICY "supvirt_insert_tenant" ON public.suplidor_virtual_items
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "supvirt_update_tenant" ON public.suplidor_virtual_items;
CREATE POLICY "supvirt_update_tenant" ON public.suplidor_virtual_items
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "supvirt_delete_tenant" ON public.suplidor_virtual_items;
CREATE POLICY "supvirt_delete_tenant" ON public.suplidor_virtual_items
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- ────────────────────────────────────────────────
-- Helper: producto bloqueado por Suplidor Virtual?
-- ────────────────────────────────────────────────
-- Devuelve true si existe una fila 'pendiente' no expirada
-- para ese producto en el tenant actual. Útil para que la
-- "Orden Automática" omita el producto si está bloqueado.
CREATE OR REPLACE FUNCTION public.producto_en_suplidor_virtual(p_producto_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.suplidor_virtual_items
    WHERE tenant_id = public.get_user_tenant()
      AND producto_id = p_producto_id
      AND estado = 'pendiente'
      AND expira_at > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.producto_en_suplidor_virtual(UUID) TO authenticated;

-- ────────────────────────────────────────────────
-- Job: marcar expirados (correr diario via cron)
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.suplidor_virtual_expirar_vencidos()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH updated AS (
    UPDATE public.suplidor_virtual_items
    SET estado = 'expirado',
        updated_at = NOW()
    WHERE estado = 'pendiente'
      AND expira_at <= NOW()
    RETURNING 1
  )
  SELECT COUNT(*)::INT FROM updated;
$$;

GRANT EXECUTE ON FUNCTION public.suplidor_virtual_expirar_vencidos() TO service_role;

-- ────────────────────────────────────────────────
-- Vista resumida (para dashboard/header con contador)
-- ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.suplidor_virtual_resumen AS
SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE estado = 'pendiente' AND expira_at > NOW())  AS pendientes,
  COUNT(*) FILTER (WHERE estado = 'pendiente' AND expira_at <= NOW() + INTERVAL '7 days' AND expira_at > NOW()) AS por_expirar_7d,
  COUNT(*) FILTER (WHERE estado = 'comprado')                          AS comprados,
  COUNT(*) FILTER (WHERE estado = 'expirado')                          AS expirados,
  COUNT(*) FILTER (WHERE estado = 'cancelado')                         AS cancelados
FROM public.suplidor_virtual_items
GROUP BY tenant_id;

-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT
  'suplidor_virtual_items' AS tabla,
  COUNT(*) AS filas
FROM public.suplidor_virtual_items;
