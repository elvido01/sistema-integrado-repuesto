-- ============================================================
-- agent_daily_insights — Setup
-- ============================================================
-- Tabla donde aterriza el resultado del agente diario.
-- Una fila por (tenant, fecha, agent_key).
-- El banner del dashboard muestra el último insight no descartado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_daily_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  agent_key VARCHAR(50) NOT NULL,

  -- Contenido del insight
  titulo TEXT NOT NULL,
  resumen TEXT,                       -- 1-2 oraciones para el banner
  detalles JSONB NOT NULL DEFAULT '{}'::jsonb,  -- estructura libre por agente
  prioridad VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  total_alertas INT DEFAULT 0,

  -- Metadata LLM
  provider VARCHAR(20),
  model VARCHAR(50),
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10,4),
  duration_ms INT,

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','visto','descartado')),
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, fecha, agent_key)
);

COMMENT ON TABLE public.agent_daily_insights IS
  'Insights diarios generados por agentes IA. Una fila por (tenant, fecha, agente). Mostrados en banner del dashboard.';

CREATE INDEX IF NOT EXISTS idx_insights_tenant_fecha
  ON public.agent_daily_insights(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_insights_estado
  ON public.agent_daily_insights(tenant_id, estado)
  WHERE estado != 'descartado';

-- ────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────
ALTER TABLE public.agent_daily_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insights_select_tenant" ON public.agent_daily_insights;
CREATE POLICY "insights_select_tenant" ON public.agent_daily_insights
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "insights_update_tenant" ON public.agent_daily_insights;
CREATE POLICY "insights_update_tenant" ON public.agent_daily_insights
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- INSERT lo hace la Edge Function con service_role, no necesita policy.

-- ────────────────────────────────────────────────
-- RPC: get_productos_anomalos
-- ────────────────────────────────────────────────
-- Devuelve productos con anomalías de margen/costo para un tenant.
-- Llamado por la Edge Function motoflow-daily-insights con service_role.
--
-- Detecta 3 tipos:
--  - margen_negativo : costo > precio
--  - margen_bajo     : 0 < margen < 10%
--  - costo_subio     : costo actual > 115% del promedio últimos 90 días
CREATE OR REPLACE FUNCTION public.get_productos_anomalos(
  p_tenant_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  descripcion TEXT,
  costo NUMERIC,
  precio NUMERIC,
  margen_pct NUMERIC,
  costo_promedio_90d NUMERIC,
  compras_90d INT,
  costo_cambio_pct NUMERIC,
  tipo_alerta TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH historial AS (
    SELECT
      cd.producto_id,
      AVG(cd.costo_unitario)::NUMERIC AS costo_promedio_90d,
      COUNT(*)::INT AS compras_90d
    FROM public.compras_detalle cd
    WHERE cd.tenant_id = p_tenant_id
      AND cd.created_at >= NOW() - INTERVAL '90 days'
      AND cd.costo_unitario > 0
    GROUP BY cd.producto_id
  ),
  base AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.costo,
      p.precio,
      CASE WHEN p.precio > 0
           THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 2)
           ELSE NULL END AS margen_pct,
      h.costo_promedio_90d,
      COALESCE(h.compras_90d, 0) AS compras_90d,
      CASE WHEN h.costo_promedio_90d > 0 AND p.costo > 0
           THEN ROUND(((p.costo - h.costo_promedio_90d) / h.costo_promedio_90d * 100)::NUMERIC, 2)
           ELSE NULL END AS costo_cambio_pct
    FROM public.productos p
    LEFT JOIN historial h ON h.producto_id = p.id
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND p.precio > 0
      AND p.costo > 0
  )
  SELECT
    b.id,
    b.codigo,
    b.descripcion,
    b.costo,
    b.precio,
    b.margen_pct,
    b.costo_promedio_90d,
    b.compras_90d,
    b.costo_cambio_pct,
    CASE
      WHEN b.costo > b.precio THEN 'margen_negativo'
      WHEN b.costo_cambio_pct IS NOT NULL AND b.costo_cambio_pct > 15 THEN 'costo_subio'
      WHEN b.margen_pct < 10 THEN 'margen_bajo'
      ELSE 'otro'
    END AS tipo_alerta
  FROM base b
  WHERE b.costo > b.precio
     OR b.margen_pct < 10
     OR (b.costo_cambio_pct IS NOT NULL AND b.costo_cambio_pct > 15)
  ORDER BY
    CASE WHEN b.costo > b.precio THEN 0
         WHEN b.costo_cambio_pct > 15 THEN 1
         ELSE 2 END,
    b.margen_pct ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_productos_anomalos(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_productos_anomalos(UUID, INT) TO authenticated;

-- ────────────────────────────────────────────────
-- Habilitar agente 'margenes_diarios' para Repuestos Morla
-- ────────────────────────────────────────────────
UPDATE public.tenant_credit_plan
SET agentes_habilitados = ARRAY(
      SELECT DISTINCT unnest(agentes_habilitados || ARRAY['margenes_diarios'])
    ),
    updated_at = NOW()
WHERE tenant_id IN (
  SELECT ce.tenant_id
  FROM public.config_empresa ce
  WHERE ce.nombre ILIKE '%morla%'
);

-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT
  ce.nombre AS empresa,
  tcp.plan,
  tcp.agentes_habilitados,
  tcp.daily_credit_limit
FROM public.tenant_credit_plan tcp
JOIN public.config_empresa ce ON ce.tenant_id = tcp.tenant_id;
