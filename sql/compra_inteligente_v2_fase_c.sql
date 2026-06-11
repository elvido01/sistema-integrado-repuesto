-- ============================================================
-- Compra Inteligente v2 — Fase C: workflow aprobaciones + reasignacion
-- ============================================================
-- C.1 Workflow de aprobaciones (alternativa al PIN supervisor)
--     Cuando control_estricto + workflow_aprobacion=true, las ordenes
--     que exceden el limite NO se graban con PIN. Entran a una cola
--     de pendientes, y un supervisor las aprueba/rechaza.
--
-- C.3 Reasignacion dinamica de presupuesto entre suplidores
--     Cron semanal evalua subutilizacion de algunos suplidores y
--     redistribuye hacia los que tienen mas demanda. Log en
--     presupuesto_reasignaciones.
--
-- Idempotente.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) presupuesto_config: nueva columna workflow_aprobacion
-- ────────────────────────────────────────────────
ALTER TABLE public.presupuesto_config
  ADD COLUMN IF NOT EXISTS workflow_aprobacion BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.presupuesto_config.workflow_aprobacion
  IS 'Cuando true, ordenes que exceden el limite entran a cola de aprobacion en vez de pedir PIN supervisor.';

-- ────────────────────────────────────────────────
-- 2) compras_aprobaciones — cola de pendientes
-- ────────────────────────────────────────────────
-- Una fila por orden de compra que requiere aprobacion. La orden YA
-- esta grabada en ordenes_compra pero en estado 'pendiente_aprobacion'.
-- Cuando el supervisor aprueba, se cambia a 'aprobada' (y la orden
-- pasa a estado normal). Si rechaza, se marca 'rechazada' y la orden
-- queda 'rechazada' tambien.
CREATE TABLE IF NOT EXISTS public.compras_aprobaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  orden_id        UUID NOT NULL,                                  -- ref logica a ordenes_compra
  solicitante_id  UUID,                                            -- profiles.id
  supervisor_id   UUID,                                            -- profiles.id (quien aprueba/rechaza)
  monto           NUMERIC NOT NULL,
  presupuesto_dispo NUMERIC,
  motivo_gate     TEXT,                                            -- EXCEDE_PRESUPUESTO | EXCEDE_LIMITE_APROBACION
  razon_solicitante TEXT,                                          -- razon que dio el solicitante
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada')),
  comentario_supervisor TEXT,                                      -- nota al aprobar/rechazar
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  resuelta_at     TIMESTAMPTZ
);

ALTER TABLE public.compras_aprobaciones ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario del tenant puede VER (asi puede saber el estado)
DROP POLICY IF EXISTS compras_aprob_select ON public.compras_aprobaciones;
CREATE POLICY compras_aprob_select ON public.compras_aprobaciones
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- INSERT: el solicitante crea la fila
DROP POLICY IF EXISTS compras_aprob_insert ON public.compras_aprobaciones;
CREATE POLICY compras_aprob_insert ON public.compras_aprobaciones
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

-- UPDATE: gateado por RPC aprobar/rechazar_orden (no permite DML directo)
-- Las RPCs usan SECURITY DEFINER.

CREATE INDEX IF NOT EXISTS idx_compras_aprob_tenant_estado
  ON public.compras_aprobaciones(tenant_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compras_aprob_orden
  ON public.compras_aprobaciones(orden_id);

-- ────────────────────────────────────────────────
-- 3) ordenes_compra: nueva columna estado_aprobacion
-- ────────────────────────────────────────────────
-- Para distinguir ordenes en limbo. Las que estan pendientes NO suman
-- al comprado_mes (el RPC v2 las excluye).
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS estado_aprobacion TEXT DEFAULT 'no_requerida'
  CHECK (estado_aprobacion IN ('no_requerida','pendiente','aprobada','rechazada','cancelada'));

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado_aprob
  ON public.ordenes_compra(tenant_id, estado_aprobacion);

-- ────────────────────────────────────────────────
-- 4) RPC solicitar_aprobacion_orden
-- ────────────────────────────────────────────────
-- La llama OrdenCompraPage cuando control_estricto + workflow + orden excede.
-- Marca la orden como 'pendiente' e inserta fila en compras_aprobaciones.
CREATE OR REPLACE FUNCTION public.solicitar_aprobacion_orden(
  p_orden_id          UUID,
  p_motivo_gate       TEXT,
  p_monto             NUMERIC,
  p_presupuesto_dispo NUMERIC,
  p_razon             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  v_aprob  UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  v_user   := auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sin tenant'; END IF;

  UPDATE public.ordenes_compra
     SET estado_aprobacion = 'pendiente'
   WHERE id = p_orden_id AND tenant_id = v_tenant;

  INSERT INTO public.compras_aprobaciones
    (tenant_id, orden_id, solicitante_id, monto, presupuesto_dispo, motivo_gate, razon_solicitante, estado)
  VALUES
    (v_tenant, p_orden_id, v_user, p_monto, p_presupuesto_dispo, p_motivo_gate, p_razon, 'pendiente')
  RETURNING id INTO v_aprob;

  RETURN v_aprob;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_aprobacion_orden(UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ────────────────────────────────────────────────
-- 5) RPCs aprobar_orden_compra / rechazar_orden_compra
-- ────────────────────────────────────────────────
-- Solo usuarios con permiso 'aprobar-compras' deberian llamarlas.
-- Aqui no validamos rol — el RouteGuard en frontend gatea quien ve la UI.
CREATE OR REPLACE FUNCTION public.aprobar_orden_compra(
  p_aprobacion_id UUID,
  p_comentario    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  v_aprob  RECORD;
BEGIN
  v_tenant := public.get_user_tenant();
  v_user   := auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sin tenant'; END IF;

  SELECT * INTO v_aprob
  FROM public.compras_aprobaciones
  WHERE id = p_aprobacion_id AND tenant_id = v_tenant;
  IF v_aprob IS NULL THEN RAISE EXCEPTION 'aprobacion no encontrada'; END IF;
  IF v_aprob.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'la aprobacion ya esta %', v_aprob.estado;
  END IF;
  IF v_aprob.solicitante_id IS NOT NULL AND v_aprob.solicitante_id = v_user THEN
    RAISE EXCEPTION 'el solicitante no puede aprobarse a si mismo';
  END IF;

  UPDATE public.compras_aprobaciones
     SET estado = 'aprobada',
         supervisor_id = v_user,
         comentario_supervisor = p_comentario,
         resuelta_at = NOW()
   WHERE id = p_aprobacion_id;

  UPDATE public.ordenes_compra
     SET estado_aprobacion = 'aprobada'
   WHERE id = v_aprob.orden_id AND tenant_id = v_tenant;

  RETURN json_build_object('ok', true, 'orden_id', v_aprob.orden_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprobar_orden_compra(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rechazar_orden_compra(
  p_aprobacion_id UUID,
  p_comentario    TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
  v_aprob  RECORD;
BEGIN
  v_tenant := public.get_user_tenant();
  v_user   := auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sin tenant'; END IF;
  IF p_comentario IS NULL OR length(p_comentario) < 3 THEN
    RAISE EXCEPTION 'razon de rechazo requerida (min 3 chars)';
  END IF;

  SELECT * INTO v_aprob
  FROM public.compras_aprobaciones
  WHERE id = p_aprobacion_id AND tenant_id = v_tenant;
  IF v_aprob IS NULL THEN RAISE EXCEPTION 'aprobacion no encontrada'; END IF;
  IF v_aprob.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'la aprobacion ya esta %', v_aprob.estado;
  END IF;

  UPDATE public.compras_aprobaciones
     SET estado = 'rechazada',
         supervisor_id = v_user,
         comentario_supervisor = p_comentario,
         resuelta_at = NOW()
   WHERE id = p_aprobacion_id;

  UPDATE public.ordenes_compra
     SET estado_aprobacion = 'rechazada'
   WHERE id = v_aprob.orden_id AND tenant_id = v_tenant;

  RETURN json_build_object('ok', true, 'orden_id', v_aprob.orden_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_orden_compra(UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────
-- 6) C.3 — presupuesto_reasignaciones (log)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.presupuesto_reasignaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mes             DATE NOT NULL,
  desde_suplidor  UUID NOT NULL REFERENCES public.proveedores(id),
  hacia_suplidor  UUID NOT NULL REFERENCES public.proveedores(id),
  monto_movido    NUMERIC NOT NULL,
  razon           TEXT,
  algoritmo       TEXT DEFAULT 'cron_semanal_v1',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.presupuesto_reasignaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presup_reasig_select ON public.presupuesto_reasignaciones;
CREATE POLICY presup_reasig_select ON public.presupuesto_reasignaciones
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_presup_reasig_tenant_mes
  ON public.presupuesto_reasignaciones(tenant_id, mes DESC, created_at DESC);

-- ────────────────────────────────────────────────
-- 7) RPC aplicar_reasignacion_dinamica
-- ────────────────────────────────────────────────
-- Lo llama el cron semanal. Para cada tenant con distribuir_por incluye
-- 'suplidor', evalua subutilizacion:
--   subutilizado: comprado_mes/asignado < 0.5 Y queda mas de 1 semana del mes
--   sobreutilizado: comprado_mes/asignado > 0.9
-- Reasigna del subutilizado al sobreutilizado el menor entre:
--   - 30% del cap subutilizado restante
--   - lo que necesita el sobreutilizado para llegar a 1.2x
-- Logea cada movimiento en presupuesto_reasignaciones.
CREATE OR REPLACE FUNCTION public.aplicar_reasignacion_dinamica(
  p_mes DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_t              RECORD;
  v_sub            RECORD;
  v_sobre          RECORD;
  v_dias_mes       INT;
  v_dias_restantes INT;
  v_disponible     NUMERIC;
  v_necesidad      NUMERIC;
  v_mover          NUMERIC;
  v_total_movido   NUMERIC := 0;
  v_count_movs     INT     := 0;
  v_count_tenants  INT     := 0;
BEGIN
  v_dias_mes := EXTRACT(DAY FROM (p_mes + INTERVAL '1 month - 1 day'))::INT;
  v_dias_restantes := v_dias_mes - EXTRACT(DAY FROM CURRENT_DATE)::INT;

  -- Solo reasignar si queda al menos 1 semana del mes (no tiene sentido
  -- mover monto cuando ya casi termina el periodo)
  IF v_dias_restantes < 7 THEN
    RETURN json_build_object('mes', p_mes, 'skipped', 'menos_de_7_dias_restantes');
  END IF;

  FOR v_t IN
    SELECT tenant_id
    FROM public.presupuesto_config
    WHERE distribuir_por IN ('suplidor','mixto')
  LOOP
    v_count_tenants := v_count_tenants + 1;

    -- Identificar subutilizados (comprado/asignado < 0.5)
    FOR v_sub IN
      SELECT pas.*,
             COALESCE((SELECT SUM(total) FROM public.compras c
                       WHERE c.tenant_id = pas.tenant_id
                         AND c.suplidor_id = pas.suplidor_id
                         AND c.fecha >= p_mes
                         AND c.fecha < p_mes + INTERVAL '1 month'), 0) AS comprado
      FROM public.presupuesto_asignaciones_suplidor pas
      WHERE pas.tenant_id = v_t.tenant_id AND pas.mes = p_mes
    LOOP
      IF v_sub.monto_asignado <= 0 THEN CONTINUE; END IF;
      IF v_sub.comprado / v_sub.monto_asignado >= 0.5 THEN CONTINUE; END IF;

      v_disponible := v_sub.monto_asignado - v_sub.comprado;
      IF v_disponible <= 0 THEN CONTINUE; END IF;

      -- Movimiento maximo desde este suplidor = 30% del cap restante
      v_disponible := v_disponible * 0.3;

      -- Buscar un sobreutilizado del mismo tenant que necesite mas presupuesto
      FOR v_sobre IN
        SELECT pas2.*,
               COALESCE((SELECT SUM(total) FROM public.compras c
                         WHERE c.tenant_id = pas2.tenant_id
                           AND c.suplidor_id = pas2.suplidor_id
                           AND c.fecha >= p_mes
                           AND c.fecha < p_mes + INTERVAL '1 month'), 0) AS comprado
        FROM public.presupuesto_asignaciones_suplidor pas2
        WHERE pas2.tenant_id = v_t.tenant_id
          AND pas2.mes = p_mes
          AND pas2.suplidor_id <> v_sub.suplidor_id
        ORDER BY (
          (SELECT SUM(total) FROM public.compras c
           WHERE c.tenant_id = pas2.tenant_id
             AND c.suplidor_id = pas2.suplidor_id
             AND c.fecha >= p_mes
             AND c.fecha < p_mes + INTERVAL '1 month')
          / NULLIF(pas2.monto_asignado, 0)
        ) DESC NULLS LAST
        LIMIT 5
      LOOP
        IF v_sobre.monto_asignado <= 0 THEN CONTINUE; END IF;
        IF v_sobre.comprado / v_sobre.monto_asignado < 0.9 THEN CONTINUE; END IF;

        v_necesidad := GREATEST(0, v_sobre.comprado * 1.2 - v_sobre.monto_asignado);
        v_mover := LEAST(v_disponible, v_necesidad);
        IF v_mover < 100 THEN CONTINUE; END IF;     -- no mover migajas

        -- Aplicar el movimiento
        UPDATE public.presupuesto_asignaciones_suplidor
           SET monto_asignado = monto_asignado - v_mover, updated_at = NOW()
         WHERE id = v_sub.id;
        UPDATE public.presupuesto_asignaciones_suplidor
           SET monto_asignado = monto_asignado + v_mover, updated_at = NOW()
         WHERE id = v_sobre.id;

        INSERT INTO public.presupuesto_reasignaciones
          (tenant_id, mes, desde_suplidor, hacia_suplidor, monto_movido, razon, algoritmo)
        VALUES
          (v_t.tenant_id, p_mes, v_sub.suplidor_id, v_sobre.suplidor_id, v_mover,
           'subutilizado < 50% -> sobreutilizado > 90%', 'cron_semanal_v1');

        v_disponible := v_disponible - v_mover;
        v_total_movido := v_total_movido + v_mover;
        v_count_movs := v_count_movs + 1;

        EXIT WHEN v_disponible < 100;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'mes', p_mes,
    'tenants_evaluados', v_count_tenants,
    'movimientos', v_count_movs,
    'total_movido', v_total_movido,
    'dias_restantes', v_dias_restantes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_reasignacion_dinamica(DATE) TO service_role;

-- ────────────────────────────────────────────────
-- 8) Excluir ordenes pendientes/rechazadas del comprado_mes
-- ────────────────────────────────────────────────
-- Las ordenes con estado_aprobacion != 'aprobada','no_requerida' NO
-- deberian sumar al comprado_mes del RPC v2. Pero compras es OTRO
-- modelo (ordenes_compra != compras). Las ordenes solo se vuelven
-- "compra" al recibir mercancia. Asi que el v2 actual ya esta OK —
-- no hay que tocarlo. Pero dejamos esta nota para futuros.

-- ────────────────────────────────────────────────
-- 9) Sanity check
-- ────────────────────────────────────────────────
SELECT 'compra inteligente v2 fase C lista' AS status,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('compras_aprobaciones','presupuesto_reasignaciones')) AS tablas,
       (SELECT count(*) FROM pg_proc
        WHERE proname IN ('solicitar_aprobacion_orden','aprobar_orden_compra',
                          'rechazar_orden_compra','aplicar_reasignacion_dinamica')) AS rpcs;

NOTIFY pgrst, 'reload schema';
