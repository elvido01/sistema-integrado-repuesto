-- ============================================================
-- Motoflow Agentes IA - Setup inicial
-- ============================================================
-- Etapa 1: Sistema de créditos por tenant + log de uso + función
-- de verificación de créditos disponibles.
--
-- Diseño:
--   - Cada tenant tiene un plan (free, beta, plus, pro)
--   - Cada agente consume créditos por invocación
--   - Los créditos se resetean diariamente (con base en CURRENT_DATE)
--   - Cada llamada queda logueada para análisis posterior
--
-- Ejecutar en SAAS REPUESTOS MORLA (PROD).
-- ============================================================

-- ────────────────────────────────────────────────
-- Tabla: tenant_credit_plan
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_credit_plan (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  daily_credit_limit INT NOT NULL DEFAULT 0,
  monthly_credit_limit INT,
  agentes_habilitados TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT plan_valido CHECK (plan IN ('free', 'beta', 'plus', 'pro', 'enterprise'))
);

COMMENT ON TABLE public.tenant_credit_plan IS
  'Plan de uso de agentes IA por tenant. Define cuánto puede usar y qué agentes.';
COMMENT ON COLUMN public.tenant_credit_plan.daily_credit_limit IS
  'Tope diario de créditos. Resetea cada medianoche server-side.';
COMMENT ON COLUMN public.tenant_credit_plan.agentes_habilitados IS
  'Array de keys de agentes habilitados (ej: [''cambio_suplidor'', ''auto_descripcion''])';

-- ────────────────────────────────────────────────
-- Tabla: agent_usage_log
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_key VARCHAR(50) NOT NULL,
  credits_used INT NOT NULL DEFAULT 1,
  provider VARCHAR(20),
  model VARCHAR(50),
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10,4),
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  duration_ms INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT status_valido CHECK (status IN ('pending', 'completed', 'failed', 'aborted'))
);

COMMENT ON TABLE public.agent_usage_log IS
  'Log de cada invocación de agente. Una fila = una llamada.';

CREATE INDEX IF NOT EXISTS idx_agent_usage_tenant_date
  ON public.agent_usage_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_key
  ON public.agent_usage_log(agent_key);

-- ────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ────────────────────────────────────────────────
ALTER TABLE public.tenant_credit_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_credit_plan" ON public.tenant_credit_plan;
CREATE POLICY "tenant_select_credit_plan" ON public.tenant_credit_plan
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "tenant_select_agent_usage" ON public.agent_usage_log;
CREATE POLICY "tenant_select_agent_usage" ON public.agent_usage_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- INSERT en agent_usage_log lo hace la Edge Function con service_role,
-- así que no necesita policy para usuarios autenticados.

-- ────────────────────────────────────────────────
-- Función: check_agent_credits
-- ────────────────────────────────────────────────
-- Verifica si el tenant del usuario actual puede invocar el agente.
-- Devuelve JSON: { ok, usado, limite, restante } o { ok: false, error }
CREATE OR REPLACE FUNCTION public.check_agent_credits(p_agent_key TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID;
  v_plan public.tenant_credit_plan%ROWTYPE;
  v_used_today INT;
BEGIN
  v_tenant := public.get_user_tenant();

  IF v_tenant IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'sin_tenant');
  END IF;

  SELECT * INTO v_plan
  FROM public.tenant_credit_plan
  WHERE tenant_id = v_tenant;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'sin_plan',
      'mensaje', 'Este tenant no tiene plan de agentes asignado.'
    );
  END IF;

  IF NOT (p_agent_key = ANY(v_plan.agentes_habilitados)) THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'agente_no_habilitado',
      'mensaje', format('El agente "%s" no está incluido en tu plan %s.', p_agent_key, v_plan.plan),
      'plan', v_plan.plan
    );
  END IF;

  SELECT COALESCE(SUM(credits_used), 0) INTO v_used_today
  FROM public.agent_usage_log
  WHERE tenant_id = v_tenant
    AND agent_key = p_agent_key
    AND created_at >= CURRENT_DATE
    AND status = 'completed';

  IF v_used_today >= v_plan.daily_credit_limit THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'limite_diario',
      'mensaje', format('Alcanzaste el límite diario (%s créditos).', v_plan.daily_credit_limit),
      'usado', v_used_today,
      'limite', v_plan.daily_credit_limit
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'usado', v_used_today,
    'limite', v_plan.daily_credit_limit,
    'restante', v_plan.daily_credit_limit - v_used_today,
    'plan', v_plan.plan,
    'tenant_id', v_tenant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_agent_credits(TEXT) TO authenticated;

-- ────────────────────────────────────────────────
-- Vista: agent_metrics_daily
-- ────────────────────────────────────────────────
-- Resumen diario de uso por tenant (para dashboard)
CREATE OR REPLACE VIEW public.agent_metrics_daily AS
SELECT
  tenant_id,
  agent_key,
  DATE(created_at) AS dia,
  COUNT(*) AS invocaciones,
  SUM(credits_used) AS creditos_usados,
  SUM(input_tokens) AS tokens_entrada,
  SUM(output_tokens) AS tokens_salida,
  SUM(cost_usd) AS costo_total_usd,
  AVG(duration_ms) AS duracion_promedio_ms,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS fallos
FROM public.agent_usage_log
GROUP BY tenant_id, agent_key, DATE(created_at);

-- ────────────────────────────────────────────────
-- Activar plan BETA para Repuestos Morla
-- ────────────────────────────────────────────────
INSERT INTO public.tenant_credit_plan
  (tenant_id, plan, daily_credit_limit, agentes_habilitados, notas)
SELECT
  ce.tenant_id,
  'beta',
  100,
  ARRAY['cambio_suplidor'],
  'Beta interno - testing del agente Sustituto de Suplidor'
FROM public.config_empresa ce
WHERE ce.nombre ILIKE '%morla%'
ON CONFLICT (tenant_id) DO UPDATE
SET plan = EXCLUDED.plan,
    daily_credit_limit = EXCLUDED.daily_credit_limit,
    agentes_habilitados = EXCLUDED.agentes_habilitados,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT
  ce.nombre AS empresa,
  tcp.plan,
  tcp.daily_credit_limit AS limite_diario,
  tcp.agentes_habilitados,
  tcp.created_at
FROM public.tenant_credit_plan tcp
JOIN public.config_empresa ce ON ce.tenant_id = tcp.tenant_id
ORDER BY tcp.created_at DESC;
