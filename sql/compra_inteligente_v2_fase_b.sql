-- ============================================================
-- Compra Inteligente v2 — Fase B: inteligencia + distribucion
-- ============================================================
-- Sobre los cimientos de Fase A:
--   - Tabla `presupuesto_historico` para trazar incrementos mensuales
--   - Tabla `presupuesto_asignaciones_suplidor` para distribuir por suplidor
--   - RPC `optimizar_orden_compra` que reduce productos sin rotacion
--   - RPC `get_presupuesto_por_suplidor` para card en OrdenCompraPage
--   - RPC `aplicar_ajuste_mensual` (la llama el cron del 1ro de cada mes)
-- Idempotente.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) presupuesto_historico — trazabilidad mensual
-- ────────────────────────────────────────────────
-- Cada mes, el cron persiste una fila aqui. Util para:
--  - Ver evolucion del presupuesto mes a mes
--  - Auditar quien aprobo congelamientos / reducciones
--  - Reportes gerenciales
CREATE TABLE IF NOT EXISTS public.presupuesto_historico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mes               DATE NOT NULL,                                   -- siempre primer dia del mes
  monto_calculado   NUMERIC NOT NULL,                                -- lo que SUGERIA el algoritmo
  monto_aplicado    NUMERIC NOT NULL,                                -- lo que QUEDO efectivamente
  modo              TEXT,                                            -- 'manual' | 'auto'
  salud_caja        TEXT,                                            -- 'sano' | 'limite_cerca' | 'agotado' | etc
  razon             TEXT,                                            -- ej "incremento normal 5%", "congelado por CxP alta"
  metadata          JSONB,                                           -- volcado completo del RPC para debugging
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, mes)                                            -- 1 fila por tenant por mes
);

ALTER TABLE public.presupuesto_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presup_hist_select ON public.presupuesto_historico;
CREATE POLICY presup_hist_select ON public.presupuesto_historico
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- INSERT solo via service_role (lo hace el cron). No exponer al frontend.

CREATE INDEX IF NOT EXISTS idx_presup_hist_tenant_mes
  ON public.presupuesto_historico(tenant_id, mes DESC);

-- ────────────────────────────────────────────────
-- 2) presupuesto_asignaciones_suplidor
-- ────────────────────────────────────────────────
-- Cuando distribuir_por = 'suplidor' o 'mixto', cada suplidor tiene su
-- propio cap mensual. Si no esta listado, no hay limite (cap = NULL).
CREATE TABLE IF NOT EXISTS public.presupuesto_asignaciones_suplidor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  suplidor_id   UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  mes           DATE NOT NULL,                                       -- primer dia del mes
  monto_asignado NUMERIC NOT NULL,
  notas         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, suplidor_id, mes)
);

ALTER TABLE public.presupuesto_asignaciones_suplidor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presup_asig_sup_all ON public.presupuesto_asignaciones_suplidor;
CREATE POLICY presup_asig_sup_all ON public.presupuesto_asignaciones_suplidor
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_presup_asig_sup_lookup
  ON public.presupuesto_asignaciones_suplidor(tenant_id, suplidor_id, mes);

-- ────────────────────────────────────────────────
-- 3) RPC get_presupuesto_por_suplidor
-- ────────────────────────────────────────────────
-- Devuelve cuanto le toca este mes al suplidor + cuanto ya se le compro
-- + disponible. Para mostrar en card de OrdenCompraPage.
CREATE OR REPLACE FUNCTION public.get_presupuesto_por_suplidor(
  p_tenant_id   UUID DEFAULT NULL,
  p_suplidor_id UUID DEFAULT NULL,
  p_mes         DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant     UUID;
  v_asignado   NUMERIC;
  v_comprado   NUMERIC := 0;
  v_disponible NUMERIC;
  v_color      TEXT;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL OR p_suplidor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y suplidor_id son requeridos';
  END IF;

  SELECT monto_asignado INTO v_asignado
  FROM public.presupuesto_asignaciones_suplidor
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND mes = p_mes;

  -- Comprado este mes a este suplidor
  SELECT COALESCE(SUM(total), 0) INTO v_comprado
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND fecha >= p_mes
    AND fecha < (p_mes + INTERVAL '1 month');

  IF v_asignado IS NULL THEN
    -- Sin asignacion = sin limite. Devolvemos info igual para mostrar comprado.
    RETURN json_build_object(
      'tiene_asignacion', false,
      'asignado',         NULL,
      'comprado',         ROUND(v_comprado, 2),
      'disponible',       NULL,
      'color',            'sin_limite'
    );
  END IF;

  v_disponible := GREATEST(0, v_asignado - v_comprado);

  v_color := CASE
    WHEN v_disponible <= 0 THEN 'rojo'
    WHEN v_disponible / NULLIF(v_asignado, 0) < 0.25 THEN 'amarillo'
    ELSE 'verde'
  END;

  RETURN json_build_object(
    'tiene_asignacion', true,
    'asignado',         ROUND(v_asignado, 2),
    'comprado',         ROUND(v_comprado, 2),
    'disponible',       ROUND(v_disponible, 2),
    'color',            v_color,
    'mes',              p_mes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_por_suplidor(UUID, UUID, DATE)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 4) RPC optimizar_orden_compra
-- ────────────────────────────────────────────────
-- Recibe los items actuales de una orden + presupuesto objetivo.
-- Devuelve cuales recortar/mantener para no exceder. Logica:
--   1. Prioridad URGENTE (existencia=0 y ventas_90d>0)  -> SIEMPRE mantener
--   2. Prioridad PROXIMA (rotacion alta)                 -> mantener mientras quepa
--   3. PUEDE ESPERAR (ventas_90d=0)                      -> primer candidato a recortar
--
-- Input: p_items = jsonb [{ producto_id, cantidad, subtotal }, ...]
-- Output: jsonb [{ producto_id, accion: 'mantener'|'reducir'|'quitar',
--                  cantidad_nueva, subtotal_nuevo, urgencia }]
CREATE OR REPLACE FUNCTION public.optimizar_orden_compra(
  p_tenant_id     UUID,
  p_items         JSONB,                          -- [{producto_id, cantidad, subtotal}]
  p_presupuesto   NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant      UUID;
  v_total       NUMERIC := 0;
  v_acc         NUMERIC := 0;
  v_item        RECORD;
  v_resultado   JSONB := '[]'::JSONB;
  v_urgencia    TEXT;
  v_existencia  NUMERIC;
  v_ventas_90   NUMERIC;
  v_ratio_keep  NUMERIC;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;
  IF p_presupuesto IS NULL OR p_presupuesto <= 0 THEN
    RAISE EXCEPTION 'presupuesto invalido';
  END IF;

  -- Total actual
  SELECT COALESCE(SUM((value->>'subtotal')::NUMERIC), 0) INTO v_total
  FROM jsonb_array_elements(p_items);

  IF v_total <= p_presupuesto THEN
    -- No hay nada que recortar
    RETURN jsonb_build_object(
      'optimizada', false,
      'razon', 'la_orden_no_excede_presupuesto',
      'total_actual', v_total,
      'presupuesto', p_presupuesto,
      'items', p_items
    );
  END IF;

  -- Pasada 1: ordenar items por prioridad (urgente primero)
  -- + acumular hasta llenar presupuesto
  FOR v_item IN
    SELECT
      (it.value->>'producto_id')::UUID  AS producto_id,
      (it.value->>'cantidad')::NUMERIC  AS cantidad,
      (it.value->>'subtotal')::NUMERIC  AS subtotal,
      COALESCE(public.get_stock_actual((it.value->>'producto_id')::UUID), 0) AS existencia,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = (it.value->>'producto_id')::UUID
          AND f.tenant_id = v_tenant
          AND f.fecha >= NOW() - INTERVAL '90 days'
          AND f.estado <> 'Anulada'
      ), 0) AS ventas_90d
    FROM jsonb_array_elements(p_items) it
    ORDER BY
      -- 1ro: urgentes (sin stock + con ventas)
      CASE WHEN COALESCE(public.get_stock_actual((it.value->>'producto_id')::UUID), 0) = 0
                AND COALESCE((
                  SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                  JOIN public.facturas f ON f.id = fd.factura_id
                  WHERE fd.producto_id = (it.value->>'producto_id')::UUID
                    AND f.fecha >= NOW() - INTERVAL '90 days'
                    AND f.estado <> 'Anulada'
                ), 0) > 0
           THEN 0 ELSE 1 END,
      -- 2do: alto movimiento
      COALESCE((
        SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = (it.value->>'producto_id')::UUID
          AND f.fecha >= NOW() - INTERVAL '90 days'
          AND f.estado <> 'Anulada'
      ), 0) DESC
  LOOP
    v_existencia := v_item.existencia;
    v_ventas_90  := v_item.ventas_90d;

    v_urgencia := CASE
      WHEN v_existencia = 0 AND v_ventas_90 > 0 THEN 'urgente'
      WHEN v_ventas_90 > 0 THEN 'proxima'
      ELSE 'puede_esperar'
    END;

    IF v_acc + v_item.subtotal <= p_presupuesto THEN
      -- Cabe entera
      v_resultado := v_resultado || jsonb_build_object(
        'producto_id',     v_item.producto_id,
        'urgencia',        v_urgencia,
        'accion',          'mantener',
        'cantidad_nueva',  v_item.cantidad,
        'subtotal_nuevo',  v_item.subtotal
      );
      v_acc := v_acc + v_item.subtotal;
    ELSIF v_urgencia = 'urgente' THEN
      -- Urgente: mantener entera AUNQUE pase del presupuesto
      v_resultado := v_resultado || jsonb_build_object(
        'producto_id',     v_item.producto_id,
        'urgencia',        v_urgencia,
        'accion',          'mantener',
        'cantidad_nueva',  v_item.cantidad,
        'subtotal_nuevo',  v_item.subtotal,
        'forzado_urgente', true
      );
      v_acc := v_acc + v_item.subtotal;
    ELSE
      -- No urgente: reducir proporcionalmente o quitar
      v_ratio_keep := GREATEST(0, p_presupuesto - v_acc) / NULLIF(v_item.subtotal, 0);
      IF v_ratio_keep >= 0.5 THEN
        v_resultado := v_resultado || jsonb_build_object(
          'producto_id',    v_item.producto_id,
          'urgencia',       v_urgencia,
          'accion',         'reducir',
          'cantidad_nueva', ROUND(v_item.cantidad * v_ratio_keep, 0),
          'subtotal_nuevo', ROUND(v_item.subtotal * v_ratio_keep, 2)
        );
        v_acc := v_acc + (v_item.subtotal * v_ratio_keep);
      ELSE
        v_resultado := v_resultado || jsonb_build_object(
          'producto_id',    v_item.producto_id,
          'urgencia',       v_urgencia,
          'accion',         'quitar',
          'cantidad_nueva', 0,
          'subtotal_nuevo', 0
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'optimizada',  true,
    'total_antes', ROUND(v_total, 2),
    'total_despues', ROUND(v_acc, 2),
    'presupuesto', p_presupuesto,
    'ahorro',      ROUND(v_total - v_acc, 2),
    'items',       v_resultado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.optimizar_orden_compra(UUID, JSONB, NUMERIC)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 5) RPC aplicar_ajuste_mensual — la llama el cron
-- ────────────────────────────────────────────────
-- Para cada tenant con config:
--   - Calcula el presupuesto del nuevo mes
--   - Aplica congelamiento si hay senales de riesgo
--   - Persiste en presupuesto_historico
--
-- Senales de congelamiento:
--   - CxP / ventas_30d > 1.5   -> congelar (no incrementar)
--   - facturas_vencidas > X     -> reducir 20%
--
-- Usa SECURITY DEFINER + bucle interno; el cron solo invoca esta RPC
-- una vez por mes.
CREATE OR REPLACE FUNCTION public.aplicar_ajuste_mensual(
  p_mes DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count_proc INT := 0;
  v_count_skip INT := 0;
  v_t          RECORD;
  v_calculado  NUMERIC;
  v_aplicado   NUMERIC;
  v_razon      TEXT;
  v_v30        NUMERIC;
  v_cxp        NUMERIC;
  v_meses      INT;
BEGIN
  FOR v_t IN
    SELECT pc.*, ce.nombre AS empresa_nombre
    FROM public.presupuesto_config pc
    LEFT JOIN public.config_empresa ce ON ce.tenant_id = pc.tenant_id
  LOOP
    -- Skip tenants en modo auto (su presupuesto se recalcula on demand)
    IF v_t.monto_base_mensual IS NULL OR v_t.monto_base_mensual <= 0 THEN
      v_count_skip := v_count_skip + 1;
      CONTINUE;
    END IF;

    -- Senales de riesgo
    SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0)
      INTO v_v30
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
     WHERE f.tenant_id = v_t.tenant_id
       AND f.estado <> 'Anulada'
       AND f.fecha >= p_mes - INTERVAL '30 days'
       AND f.fecha <  p_mes;

    SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp
      FROM public.compras
     WHERE tenant_id = v_t.tenant_id AND monto_pendiente > 0;

    v_meses := GREATEST(0,
      EXTRACT(YEAR  FROM AGE(p_mes, COALESCE(v_t.fecha_base, CURRENT_DATE)))::INT * 12 +
      EXTRACT(MONTH FROM AGE(p_mes, COALESCE(v_t.fecha_base, CURRENT_DATE)))::INT
    );

    -- Calculo base (con incremento acumulado)
    v_calculado := v_t.monto_base_mensual *
                   (1 + COALESCE(v_t.incremento_mensual_pct, 0) / 100.0 * v_meses);

    -- Aplicar regla de salud
    IF v_v30 > 0 AND v_cxp / v_v30 > 1.5 THEN
      v_aplicado := v_t.monto_base_mensual *
                    (1 + COALESCE(v_t.incremento_mensual_pct, 0) / 100.0 * GREATEST(0, v_meses - 1));
      v_razon := 'CONGELADO_CxP_ALTA — ratio CxP/ventas30d=' || ROUND(v_cxp / v_v30, 2);
    ELSIF v_v30 > 0 AND v_cxp / v_v30 > 1.0 THEN
      v_aplicado := v_calculado * 0.8;  -- reducir 20%
      v_razon := 'REDUCIDO_20PCT — endeudamiento alto';
    ELSE
      v_aplicado := v_calculado;
      v_razon := 'INCREMENTO_NORMAL_' || COALESCE(v_t.incremento_mensual_pct, 0) || 'PCT';
    END IF;

    -- Persistir (1 fila por tenant-mes, idempotente)
    INSERT INTO public.presupuesto_historico
      (tenant_id, mes, monto_calculado, monto_aplicado, modo, salud_caja, razon, metadata)
    VALUES (
      v_t.tenant_id, p_mes, ROUND(v_calculado, 2), ROUND(v_aplicado, 2),
      'manual',
      CASE
        WHEN v_v30 > 0 AND v_cxp / v_v30 > 1.5 THEN 'tension'
        WHEN v_v30 > 0 AND v_cxp / v_v30 > 1.0 THEN 'ajustada'
        ELSE 'sana'
      END,
      v_razon,
      json_build_object('v30', v_v30, 'cxp', v_cxp, 'meses_desde_base', v_meses)
    )
    ON CONFLICT (tenant_id, mes) DO UPDATE
      SET monto_calculado = EXCLUDED.monto_calculado,
          monto_aplicado  = EXCLUDED.monto_aplicado,
          razon           = EXCLUDED.razon,
          salud_caja      = EXCLUDED.salud_caja,
          metadata        = EXCLUDED.metadata;

    v_count_proc := v_count_proc + 1;
  END LOOP;

  RETURN json_build_object(
    'mes', p_mes,
    'tenants_procesados', v_count_proc,
    'tenants_skipped_auto', v_count_skip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_ajuste_mensual(DATE) TO service_role;

-- ────────────────────────────────────────────────
-- 6) Sanity check
-- ────────────────────────────────────────────────
SELECT 'compra inteligente v2 fase B lista' AS status,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('presupuesto_historico','presupuesto_asignaciones_suplidor')) AS tablas,
       (SELECT count(*) FROM pg_proc
        WHERE proname IN ('get_presupuesto_por_suplidor','optimizar_orden_compra','aplicar_ajuste_mensual')) AS rpcs;

NOTIFY pgrst, 'reload schema';
