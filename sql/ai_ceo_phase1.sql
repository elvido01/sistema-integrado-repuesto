-- ============================================================
-- MORLA AI CEO — Fase 1
-- ============================================================
-- 1) Rename + extender tablas existentes (no se pierde data):
--    agent_daily_insights → ai_reports
--    agent_usage_log      → ai_agent_runs
-- 2) Crear tablas nuevas: ai_agents, ai_alerts, ai_decisions,
--    ai_metrics_snapshots, ai_settings, ai_chat_sessions,
--    ai_chat_messages.
-- 3) Funciones de alertas determinísticas (sin LLM).
-- 4) Función de Business Health Score.
-- 5) Seeds: catálogo de agentes + settings por defecto.
-- ============================================================

-- ────────────────────────────────────────────────
-- PARTE 1: Rename + extender tablas existentes
-- ────────────────────────────────────────────────

-- 1.A — agent_daily_insights → ai_reports
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='agent_daily_insights')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ai_reports') THEN
    ALTER TABLE public.agent_daily_insights RENAME TO ai_reports;
  END IF;
END$$;

-- Agregar columnas que faltan (idempotente)
ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS report_type VARCHAR(20) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS score INT,
  ADD COLUMN IF NOT EXISTS content_json JSONB DEFAULT '{}'::jsonb;

-- Constraint para report_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ai_reports_report_type_check'
      AND conrelid='public.ai_reports'::regclass
  ) THEN
    ALTER TABLE public.ai_reports
      ADD CONSTRAINT ai_reports_report_type_check
      CHECK (report_type IN ('daily','weekly','monthly','quarterly','on_demand'));
  END IF;
END$$;

COMMENT ON TABLE public.ai_reports IS
  'Reportes generados por agentes IA. Soporta daily/weekly/monthly/quarterly/on_demand.';

-- Renombrar índices viejos para mantener coherencia
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_insights_tenant_fecha')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_ai_reports_tenant_fecha') THEN
    ALTER INDEX public.idx_insights_tenant_fecha RENAME TO idx_ai_reports_tenant_fecha;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_insights_estado')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_ai_reports_estado') THEN
    ALTER INDEX public.idx_insights_estado RENAME TO idx_ai_reports_estado;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_ai_reports_tipo
  ON public.ai_reports(tenant_id, report_type, fecha DESC);

-- Recrear policies con nombres nuevos
DROP POLICY IF EXISTS "insights_select_tenant" ON public.ai_reports;
DROP POLICY IF EXISTS "insights_update_tenant" ON public.ai_reports;

DROP POLICY IF EXISTS "ai_reports_select_tenant" ON public.ai_reports;
CREATE POLICY "ai_reports_select_tenant" ON public.ai_reports
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "ai_reports_update_tenant" ON public.ai_reports;
CREATE POLICY "ai_reports_update_tenant" ON public.ai_reports
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());


-- 1.B — agent_usage_log → ai_agent_runs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='agent_usage_log')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ai_agent_runs') THEN
    ALTER TABLE public.agent_usage_log RENAME TO ai_agent_runs;
  END IF;
END$$;

ALTER TABLE public.ai_agent_runs
  ADD COLUMN IF NOT EXISTS agent_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS run_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS input_summary TEXT,
  ADD COLUMN IF NOT EXISTS output_summary TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Copiar agent_key → agent_name si vacío
UPDATE public.ai_agent_runs SET agent_name = agent_key WHERE agent_name IS NULL;

-- Drop vista vieja y recrear con nombres nuevos
DROP VIEW IF EXISTS public.agent_metrics_daily;
CREATE OR REPLACE VIEW public.ai_agent_metrics_daily AS
SELECT
  tenant_id,
  COALESCE(agent_name, agent_key) AS agent_name,
  DATE(created_at) AS dia,
  COUNT(*) AS invocaciones,
  SUM(credits_used) AS creditos_usados,
  SUM(input_tokens) AS tokens_entrada,
  SUM(output_tokens) AS tokens_salida,
  SUM(cost_usd) AS costo_total_usd,
  AVG(duration_ms) AS duracion_promedio_ms,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS fallos
FROM public.ai_agent_runs
GROUP BY tenant_id, COALESCE(agent_name, agent_key), DATE(created_at);

-- Policy con nombre nuevo
DROP POLICY IF EXISTS "tenant_select_agent_usage" ON public.ai_agent_runs;
DROP POLICY IF EXISTS "ai_agent_runs_select_tenant" ON public.ai_agent_runs;
CREATE POLICY "ai_agent_runs_select_tenant" ON public.ai_agent_runs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());


-- ────────────────────────────────────────────────
-- PARTE 2: Tablas nuevas
-- ────────────────────────────────────────────────

-- 2.A — ai_agents (catálogo)
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  orden INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ai_agents IS 'Catálogo de agentes del equipo MORLA AI CEO.';

-- 2.B — ai_alerts
CREATE TABLE IF NOT EXISTS public.ai_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  area VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  related_table VARCHAR(50),
  related_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved','ignored')),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, alert_type, related_id, status) -- evita duplicar misma alerta abierta
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON public.ai_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_area_severity ON public.ai_alerts(tenant_id, area, severity);

ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts_select_tenant" ON public.ai_alerts;
CREATE POLICY "alerts_select_tenant" ON public.ai_alerts
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS "alerts_update_tenant" ON public.ai_alerts;
CREATE POLICY "alerts_update_tenant" ON public.ai_alerts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- 2.C — ai_decisions
CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type VARCHAR(50) NOT NULL,
  area VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  expected_impact TEXT,
  risk_level VARCHAR(10) DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','postponed')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  decision_notes TEXT,
  source_alert_id UUID REFERENCES public.ai_alerts(id) ON DELETE SET NULL,
  source_report_id UUID REFERENCES public.ai_reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_tenant_status ON public.ai_decisions(tenant_id, status);

ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "decisions_select_tenant" ON public.ai_decisions;
CREATE POLICY "decisions_select_tenant" ON public.ai_decisions
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS "decisions_update_tenant" ON public.ai_decisions;
CREATE POLICY "decisions_update_tenant" ON public.ai_decisions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- 2.D — ai_metrics_snapshots
CREATE TABLE IF NOT EXISTS public.ai_metrics_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_type VARCHAR(20) NOT NULL CHECK (snapshot_type IN ('daily','weekly','monthly')),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  sales_total NUMERIC(18,2),
  gross_profit NUMERIC(18,2),
  margin_percent NUMERIC(8,4),
  inventory_value NUMERIC(18,2),
  accounts_receivable NUMERIC(18,2),
  overdue_amount NUMERIC(18,2),
  low_stock_count INT DEFAULT 0,
  dead_stock_count INT DEFAULT 0,
  health_score INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, snapshot_type, fecha)
);

CREATE INDEX IF NOT EXISTS idx_metrics_tenant_fecha ON public.ai_metrics_snapshots(tenant_id, fecha DESC);

ALTER TABLE public.ai_metrics_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "metrics_select_tenant" ON public.ai_metrics_snapshots;
CREATE POLICY "metrics_select_tenant" ON public.ai_metrics_snapshots
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

-- 2.E — ai_settings
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key VARCHAR(60) NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_tenant ON public.ai_settings(tenant_id);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_select_tenant" ON public.ai_settings;
CREATE POLICY "settings_select_tenant" ON public.ai_settings
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS "settings_update_tenant" ON public.ai_settings;
CREATE POLICY "settings_update_tenant" ON public.ai_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- 2.F — ai_chat_sessions + ai_chat_messages
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_tenant ON public.ai_chat_sessions(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  tokens_used INT,
  cost_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON public.ai_chat_messages(session_id, created_at);

ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_sessions_all_tenant" ON public.ai_chat_sessions;
CREATE POLICY "chat_sessions_all_tenant" ON public.ai_chat_sessions
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "chat_messages_all_tenant" ON public.ai_chat_messages;
CREATE POLICY "chat_messages_all_tenant" ON public.ai_chat_messages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());


-- ────────────────────────────────────────────────
-- PARTE 3: Funciones de alertas determinísticas (sin LLM)
-- ────────────────────────────────────────────────

-- 3.A — Stock bajo / agotado
CREATE OR REPLACE FUNCTION public.ai_detect_stock_bajo(p_tenant_id UUID)
RETURNS TABLE (producto_id UUID, codigo TEXT, descripcion TEXT, existencia NUMERIC, min_stock NUMERIC, severity TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    public.get_stock_actual(p.id) AS existencia,
    p.min_stock,
    CASE
      WHEN public.get_stock_actual(p.id) <= 0 THEN 'critical'
      WHEN public.get_stock_actual(p.id) < (p.min_stock * 0.5) THEN 'high'
      ELSE 'medium'
    END AS severity
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND p.min_stock > 0
    AND public.get_stock_actual(p.id) < p.min_stock
  ORDER BY public.get_stock_actual(p.id) ASC
  LIMIT 200;
$$;

-- 3.B — Existencia negativa
CREATE OR REPLACE FUNCTION public.ai_detect_existencia_negativa(p_tenant_id UUID)
RETURNS TABLE (producto_id UUID, codigo TEXT, descripcion TEXT, existencia NUMERIC)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id, p.codigo, p.descripcion, public.get_stock_actual(p.id)
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND public.get_stock_actual(p.id) < 0
  ORDER BY public.get_stock_actual(p.id) ASC
  LIMIT 100;
$$;

-- 3.C — Productos sin ubicación
CREATE OR REPLACE FUNCTION public.ai_detect_sin_ubicacion(p_tenant_id UUID)
RETURNS TABLE (producto_id UUID, codigo TEXT, descripcion TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id, p.codigo, p.descripcion
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND (p.ubicacion IS NULL OR p.ubicacion = '')
    AND public.get_stock_actual(p.id) > 0
  ORDER BY p.codigo
  LIMIT 100;
$$;

-- 3.D — Facturas vencidas
CREATE OR REPLACE FUNCTION public.ai_detect_facturas_vencidas(p_tenant_id UUID)
RETURNS TABLE (factura_id UUID, cliente_id UUID, total NUMERIC, monto_pendiente NUMERIC, dias_vencidos INT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    f.id,
    f.cliente_id,
    f.total,
    f.monto_pendiente,
    (CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE) AS dias_vencidos
  FROM public.facturas f
  WHERE f.tenant_id = p_tenant_id
    AND f.monto_pendiente > 0
    AND f.estado != 'Anulada'
    AND f.dias_credito > 0
    AND (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE
  ORDER BY (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE ASC
  LIMIT 200;
$$;

-- 3.E — Producto sin venta reciente (90 días)
CREATE OR REPLACE FUNCTION public.ai_detect_productos_lentos(p_tenant_id UUID, p_dias INT DEFAULT 90)
RETURNS TABLE (producto_id UUID, codigo TEXT, descripcion TEXT, existencia NUMERIC, capital_inmovilizado NUMERIC)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH ventas_recientes AS (
    SELECT DISTINCT fd.producto_id
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = p_tenant_id
      AND f.fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL
      AND f.estado != 'Anulada'
  )
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    public.get_stock_actual(p.id) AS existencia,
    (public.get_stock_actual(p.id) * COALESCE(p.costo, 0))::NUMERIC AS capital_inmovilizado
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND public.get_stock_actual(p.id) > 0
    AND p.id NOT IN (SELECT producto_id FROM ventas_recientes WHERE producto_id IS NOT NULL)
  ORDER BY (public.get_stock_actual(p.id) * COALESCE(p.costo, 0)) DESC
  LIMIT 100;
$$;

-- 3.F — Master: corre todas las alertas y guarda en ai_alerts
CREATE OR REPLACE FUNCTION public.ai_run_deterministic_alerts(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stock_bajo INT := 0;
  v_existencia_neg INT := 0;
  v_sin_ubicacion INT := 0;
  v_facturas_vencidas INT := 0;
  v_productos_lentos INT := 0;
  v_total INT := 0;
BEGIN
  -- Stock bajo
  WITH ins AS (
    INSERT INTO public.ai_alerts (tenant_id, alert_type, area, severity, title, description, recommendation, related_table, related_id, metadata)
    SELECT
      p_tenant_id,
      'stock_bajo',
      'inventario',
      sb.severity,
      'Stock bajo: ' || sb.codigo,
      sb.descripcion || ' — existencia ' || sb.existencia || ' / min ' || sb.min_stock,
      'Considerar reordenar pronto.',
      'productos',
      sb.producto_id,
      jsonb_build_object('existencia', sb.existencia, 'min_stock', sb.min_stock, 'codigo', sb.codigo)
    FROM public.ai_detect_stock_bajo(p_tenant_id) sb
    ON CONFLICT (tenant_id, alert_type, related_id, status) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_stock_bajo FROM ins;

  -- Existencia negativa
  WITH ins AS (
    INSERT INTO public.ai_alerts (tenant_id, alert_type, area, severity, title, description, recommendation, related_table, related_id, metadata)
    SELECT
      p_tenant_id,
      'existencia_negativa',
      'inventario',
      'high',
      'Existencia negativa: ' || en.codigo,
      en.descripcion || ' — existencia ' || en.existencia,
      'Revisar movimientos: probablemente falta una entrada o sobra una salida.',
      'productos',
      en.producto_id,
      jsonb_build_object('existencia', en.existencia, 'codigo', en.codigo)
    FROM public.ai_detect_existencia_negativa(p_tenant_id) en
    ON CONFLICT (tenant_id, alert_type, related_id, status) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_existencia_neg FROM ins;

  -- Sin ubicación
  WITH ins AS (
    INSERT INTO public.ai_alerts (tenant_id, alert_type, area, severity, title, description, recommendation, related_table, related_id, metadata)
    SELECT
      p_tenant_id,
      'sin_ubicacion',
      'operaciones',
      'low',
      'Producto con existencia y sin ubicación: ' || su.codigo,
      su.descripcion,
      'Asignar ubicación física al producto.',
      'productos',
      su.producto_id,
      jsonb_build_object('codigo', su.codigo)
    FROM public.ai_detect_sin_ubicacion(p_tenant_id) su
    ON CONFLICT (tenant_id, alert_type, related_id, status) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_sin_ubicacion FROM ins;

  -- Facturas vencidas
  WITH ins AS (
    INSERT INTO public.ai_alerts (tenant_id, alert_type, area, severity, title, description, recommendation, related_table, related_id, metadata)
    SELECT
      p_tenant_id,
      'factura_vencida',
      'credito',
      CASE
        WHEN fv.dias_vencidos > 60 THEN 'critical'
        WHEN fv.dias_vencidos > 30 THEN 'high'
        ELSE 'medium'
      END,
      'Factura vencida ' || fv.dias_vencidos || ' días',
      'Monto pendiente: ' || fv.monto_pendiente,
      'Contactar al cliente para cobrar.',
      'facturas',
      fv.factura_id,
      jsonb_build_object(
        'cliente_id', fv.cliente_id,
        'monto_pendiente', fv.monto_pendiente,
        'dias_vencidos', fv.dias_vencidos
      )
    FROM public.ai_detect_facturas_vencidas(p_tenant_id) fv
    ON CONFLICT (tenant_id, alert_type, related_id, status) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_facturas_vencidas FROM ins;

  -- Productos lentos / capital inmovilizado
  WITH ins AS (
    INSERT INTO public.ai_alerts (tenant_id, alert_type, area, severity, title, description, recommendation, related_table, related_id, metadata)
    SELECT
      p_tenant_id,
      'producto_lento',
      'inventario',
      CASE WHEN pl.capital_inmovilizado > 10000 THEN 'medium' ELSE 'low' END,
      'Producto sin venta 90+ días: ' || pl.codigo,
      pl.descripcion || ' — ' || pl.existencia || ' uds, capital RD$ ' || ROUND(pl.capital_inmovilizado),
      'Evaluar promoción, liquidación o devolver al suplidor.',
      'productos',
      pl.producto_id,
      jsonb_build_object(
        'existencia', pl.existencia,
        'capital_inmovilizado', pl.capital_inmovilizado,
        'codigo', pl.codigo
      )
    FROM public.ai_detect_productos_lentos(p_tenant_id, 90) pl
    ON CONFLICT (tenant_id, alert_type, related_id, status) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_productos_lentos FROM ins;

  v_total := v_stock_bajo + v_existencia_neg + v_sin_ubicacion + v_facturas_vencidas + v_productos_lentos;

  RETURN json_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'alertas_nuevas', v_total,
    'breakdown', json_build_object(
      'stock_bajo', v_stock_bajo,
      'existencia_negativa', v_existencia_neg,
      'sin_ubicacion', v_sin_ubicacion,
      'facturas_vencidas', v_facturas_vencidas,
      'productos_lentos', v_productos_lentos
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_run_deterministic_alerts(UUID) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- PARTE 4: Business Health Score
-- ────────────────────────────────────────────────
-- Score 0-100 basado en ventas, márgenes, alertas, mora.
-- Es estable (sin LLM), idempotente y rápido.
CREATE OR REPLACE FUNCTION public.ai_business_health_score(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_ventas_30 NUMERIC;
  v_ventas_60_30 NUMERIC;
  v_crecimiento_ventas NUMERIC;
  v_facturas_vencidas INT;
  v_cobrar_pendiente NUMERIC;
  v_mora_pct NUMERIC;
  v_alertas_criticas INT;
  v_alertas_high INT;
  v_productos_margen_negativo INT;

  s_ventas NUMERIC := 0;       -- 25 puntos
  s_margenes NUMERIC := 0;     -- 25 puntos
  s_credito NUMERIC := 0;      -- 20 puntos
  s_alertas NUMERIC := 0;      -- 20 puntos
  s_inventario NUMERIC := 0;   -- 10 puntos
  v_total INT;
  v_status TEXT;
BEGIN
  -- Ventas últimos 30 días vs 30-60 días anteriores
  SELECT COALESCE(SUM(total), 0) INTO v_ventas_30
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - INTERVAL '30 days'
    AND fecha <= CURRENT_DATE
    AND estado != 'Anulada';

  SELECT COALESCE(SUM(total), 0) INTO v_ventas_60_30
  FROM public.facturas
  WHERE tenant_id = p_tenant_id
    AND fecha >= CURRENT_DATE - INTERVAL '60 days'
    AND fecha <  CURRENT_DATE - INTERVAL '30 days'
    AND estado != 'Anulada';

  v_crecimiento_ventas := CASE
    WHEN v_ventas_60_30 > 0 THEN ((v_ventas_30 - v_ventas_60_30) / v_ventas_60_30) * 100
    WHEN v_ventas_30 > 0 THEN 50
    ELSE 0
  END;

  -- Cuentas por cobrar
  SELECT
    COUNT(*) FILTER (WHERE monto_pendiente > 0 AND estado != 'Anulada' AND dias_credito > 0
                     AND (fecha + (dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE),
    COALESCE(SUM(monto_pendiente) FILTER (WHERE monto_pendiente > 0 AND estado != 'Anulada'), 0)
  INTO v_facturas_vencidas, v_cobrar_pendiente
  FROM public.facturas
  WHERE tenant_id = p_tenant_id;

  v_mora_pct := CASE WHEN v_cobrar_pendiente > 0
    THEN (v_facturas_vencidas::NUMERIC / NULLIF(v_cobrar_pendiente, 0)) * 100
    ELSE 0 END;

  -- Alertas abiertas
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high')
  INTO v_alertas_criticas, v_alertas_high
  FROM public.ai_alerts
  WHERE tenant_id = p_tenant_id
    AND status = 'pending';

  -- Margen negativo
  SELECT COUNT(*) INTO v_productos_margen_negativo
  FROM public.productos
  WHERE tenant_id = p_tenant_id
    AND COALESCE(activo, true) = true
    AND precio > 0 AND costo > 0
    AND costo > precio;

  -- Score breakdown
  -- Ventas: si crecimiento positivo → más puntos
  s_ventas := CASE
    WHEN v_crecimiento_ventas >= 20 THEN 25
    WHEN v_crecimiento_ventas >= 10 THEN 22
    WHEN v_crecimiento_ventas >= 0  THEN 18
    WHEN v_crecimiento_ventas >= -10 THEN 12
    WHEN v_crecimiento_ventas >= -25 THEN 5
    ELSE 0
  END;

  -- Márgenes: penalizar productos con margen negativo
  s_margenes := CASE
    WHEN v_productos_margen_negativo = 0 THEN 25
    WHEN v_productos_margen_negativo <= 3 THEN 18
    WHEN v_productos_margen_negativo <= 10 THEN 12
    WHEN v_productos_margen_negativo <= 30 THEN 6
    ELSE 2
  END;

  -- Crédito
  s_credito := CASE
    WHEN v_facturas_vencidas = 0 THEN 20
    WHEN v_facturas_vencidas <= 3 THEN 16
    WHEN v_facturas_vencidas <= 10 THEN 10
    WHEN v_facturas_vencidas <= 25 THEN 5
    ELSE 0
  END;

  -- Alertas
  s_alertas := GREATEST(0, 20 - v_alertas_criticas * 5 - v_alertas_high * 2);

  -- Inventario (placeholder simple — luego se refina con rotación)
  s_inventario := 8;

  v_total := LEAST(100, GREATEST(0, ROUND(s_ventas + s_margenes + s_credito + s_alertas + s_inventario)::INT));

  v_status := CASE
    WHEN v_total >= 90 THEN 'excelente'
    WHEN v_total >= 75 THEN 'bueno'
    WHEN v_total >= 60 THEN 'atencion'
    WHEN v_total >= 40 THEN 'riesgo'
    ELSE 'critico'
  END;

  RETURN json_build_object(
    'score', v_total,
    'status', v_status,
    'breakdown', json_build_object(
      'ventas', s_ventas,
      'margenes', s_margenes,
      'credito', s_credito,
      'alertas', s_alertas,
      'inventario', s_inventario
    ),
    'metricas', json_build_object(
      'ventas_30d', v_ventas_30,
      'ventas_30_60d_prev', v_ventas_60_30,
      'crecimiento_ventas_pct', ROUND(v_crecimiento_ventas, 2),
      'facturas_vencidas', v_facturas_vencidas,
      'monto_pendiente_cobrar', v_cobrar_pendiente,
      'alertas_criticas', v_alertas_criticas,
      'alertas_high', v_alertas_high,
      'productos_margen_negativo', v_productos_margen_negativo
    ),
    'calculado_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_business_health_score(UUID) TO service_role, authenticated;


-- ────────────────────────────────────────────────
-- PARTE 5: Seeds
-- ────────────────────────────────────────────────

-- Catálogo de agentes
INSERT INTO public.ai_agents (name, role, description, orden) VALUES
  ('ai_ceo',         'Principal',  'Recibe outputs de sub-agentes y produce el reporte ejecutivo y decisiones priorizadas.', 1),
  ('ai_cfo',         'Finanzas',   'Analiza ventas, márgenes, flujo de caja y rentabilidad. Detecta capital inmovilizado.', 2),
  ('ai_inventario',  'Inventario', 'Detecta stock bajo, inventario muerto, sobre-stock y recomienda reorden.', 3),
  ('ai_compras',     'Compras',    'Recomienda qué comprar y compara suplidores.', 4),
  ('ai_ventas',      'Ventas',     'Analiza tendencias de ventas, ticket promedio y caídas.', 5),
  ('ai_credito',     'Crédito',    'Analiza clientes morosos y clasifica riesgo.', 6),
  ('ai_operaciones', 'Operaciones','Detecta errores, procesos lentos y movimientos sospechosos.', 7),
  ('ai_marketing',   'Marketing',  'Sugiere productos para promoción y campañas.', 8),
  ('ai_estrategia',  'Estrategia', 'Análisis trimestral y planes de crecimiento.', 9)
ON CONFLICT (name) DO NOTHING;

-- Habilitar nuevo set de agentes para Repuestos Morla
UPDATE public.tenant_credit_plan
SET agentes_habilitados = ARRAY['cambio_suplidor', 'margenes_diarios', 'ai_ceo_daily', 'ai_alerts_sql'],
    daily_credit_limit = 200,
    updated_at = NOW()
WHERE tenant_id IN (
  SELECT ce.tenant_id FROM public.config_empresa ce WHERE ce.nombre ILIKE '%morla%'
);

-- Settings por defecto para Morla (umbrales)
INSERT INTO public.ai_settings (tenant_id, key, value, description)
SELECT ce.tenant_id, k.key, k.value::jsonb, k.description
FROM public.config_empresa ce
CROSS JOIN (VALUES
  ('daily_report_hour',     '"21:00"',  'Hora del reporte diario (DR)'),
  ('weekly_report_day',     '"sunday"', 'Día del reporte semanal'),
  ('margen_minimo_aceptable','10',      'Margen mínimo aceptable %'),
  ('dias_producto_lento',   '90',       'Días sin venta para considerar producto lento'),
  ('dias_producto_muerto',  '180',      'Días sin venta para considerar inventario muerto'),
  ('capital_inmovilizado_threshold','10000', 'Umbral RD$ para marcar producto como capital alto'),
  ('mora_dias_critica',     '60',       'Días vencidos para mora crítica'),
  ('mora_dias_high',        '30',       'Días vencidos para mora alta'),
  ('llm_model',             '"gpt-4o-mini"', 'Modelo IA por defecto para reportes diarios')
) AS k(key, value, description)
WHERE ce.nombre ILIKE '%morla%'
ON CONFLICT (tenant_id, key) DO NOTHING;


-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT 'ai_reports' AS tabla, COUNT(*) AS filas FROM public.ai_reports
UNION ALL SELECT 'ai_agent_runs', COUNT(*) FROM public.ai_agent_runs
UNION ALL SELECT 'ai_agents', COUNT(*) FROM public.ai_agents
UNION ALL SELECT 'ai_alerts', COUNT(*) FROM public.ai_alerts
UNION ALL SELECT 'ai_decisions', COUNT(*) FROM public.ai_decisions
UNION ALL SELECT 'ai_metrics_snapshots', COUNT(*) FROM public.ai_metrics_snapshots
UNION ALL SELECT 'ai_settings', COUNT(*) FROM public.ai_settings
UNION ALL SELECT 'ai_chat_sessions', COUNT(*) FROM public.ai_chat_sessions
UNION ALL SELECT 'ai_chat_messages', COUNT(*) FROM public.ai_chat_messages;
