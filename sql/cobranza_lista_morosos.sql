-- ============================================================
-- Cobranza: lista de morosos + seguimiento por cliente
-- ============================================================
-- Upgrade del recordatorio de cobro: la pestana "Ver deuda" pasa a
-- mostrar una LISTA con TODOS los clientes que tienen facturas
-- vencidas (no solo el chat abierto). Cada cliente puede tener un
-- estado de seguimiento (ir a buscar / cliente vendra + fecha) y una
-- nota interna, que se guardan en base de datos y persisten.
--
-- Seguridad: RPCs SECURITY DEFINER que resuelven el tenant del
-- usuario autenticado (get_user_tenant). No usan service_role.
--
-- Criterio de "vencida": identico a get_estado_cuenta_cliente /
-- ai_detect_facturas_vencidas.
-- ============================================================

-- 1) Tabla de seguimiento de cobranza (un estado actual por cliente)
CREATE TABLE IF NOT EXISTS public.cobranza_seguimiento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cliente_id    uuid NOT NULL,
  estado        text NOT NULL DEFAULT 'pendiente',  -- pendiente | ir_a_buscar | cliente_vendra
  fecha_promesa date,
  nota          text,
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cliente_id)
);

ALTER TABLE public.cobranza_seguimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cobranza_seg_tenant ON public.cobranza_seguimiento;
CREATE POLICY cobranza_seg_tenant ON public.cobranza_seguimiento
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE ON public.cobranza_seguimiento TO authenticated;

-- Marca de ultimo recordatorio enviado (para detectar "no vino / reenviar")
ALTER TABLE public.cobranza_seguimiento
  ADD COLUMN IF NOT EXISTS ultimo_envio timestamptz;

-- Hora de corte para "Para reenviar" (p.ej. 10 min antes del cierre).
-- El cliente que prometio venir HOY solo aparece en reenviar despues de esta hora.
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS cobranza_hora_corte time NOT NULL DEFAULT '17:50';


-- 2) RPC: lista de clientes con facturas vencidas + su seguimiento
CREATE OR REPLACE FUNCTION public.get_clientes_morosos()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid;
  v_empresa    text;
  v_plantilla  text;
  v_corte      time := '17:50';
  v_clientes   json;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT nombre, plantilla_cobro, COALESCE(cobranza_hora_corte, '17:50')
    INTO v_empresa, v_plantilla, v_corte
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  WITH vencidas AS (
    SELECT
      f.cliente_id,
      'FT-' || f.numero::text                                  AS numero,
      ROUND(COALESCE(f.monto_pendiente, 0), 2)               AS monto_atrasado,
      (CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE) AS dias_vencida
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND f.cliente_id IS NOT NULL
      AND f.monto_pendiente > 0
      AND COALESCE(f.estado, '') <> 'Anulada'
      AND COALESCE(f.dias_credito, 0) > 0
      AND (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE
  ),
  agg AS (
    SELECT
      v.cliente_id,
      COUNT(*)               AS cuotas,
      SUM(v.monto_atrasado)  AS total,
      MAX(v.dias_vencida)    AS dias_max,
      json_agg(
        json_build_object(
          'numero',        v.numero,
          'monto_atrasado', v.monto_atrasado,
          'dias_vencida',  v.dias_vencida
        ) ORDER BY v.dias_vencida DESC
      ) AS facturas
    FROM vencidas v
    GROUP BY v.cliente_id
  )
  SELECT json_agg(
    json_build_object(
      'cliente_id',       a.cliente_id,
      'cliente_nombre',   c.nombre,
      'cliente_telefono', c.telefono,
      'cuotas_atrasadas', a.cuotas,
      'total_atrasado',   ROUND(a.total, 2),
      'dias_mas_vencido', a.dias_max,
      'facturas',         a.facturas,
      'seg_estado',       COALESCE(s.estado, 'pendiente'),
      'seg_fecha',        s.fecha_promesa,
      'seg_nota',         s.nota,
      'ultimo_envio',     s.ultimo_envio,
      -- "Para reenviar": le enviaste recordatorio, NO ha pagado, y ya paso el
      -- momento de esperar (el dia prometido vencio, o es hoy y ya paso la hora de corte)
      'por_reenviar',     (
        s.ultimo_envio IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.recibos_ingreso r
          WHERE r.cliente_id = a.cliente_id
            AND COALESCE(r.anulado, false) = false
            AND r.created_at >= s.ultimo_envio
        )
        AND (
          COALESCE(s.fecha_promesa, s.ultimo_envio::date) < CURRENT_DATE
          OR (
            COALESCE(s.fecha_promesa, s.ultimo_envio::date) = CURRENT_DATE
            AND (now() AT TIME ZONE 'America/Santo_Domingo')::time >= v_corte
          )
        )
      )
    ) ORDER BY a.dias_max DESC
  )
  INTO v_clientes
  FROM agg a
  JOIN public.clientes c
    ON c.id = a.cliente_id AND c.tenant_id = v_tenant
  LEFT JOIN public.cobranza_seguimiento s
    ON s.cliente_id = a.cliente_id AND s.tenant_id = v_tenant
  -- Pospuestos: si el cliente prometio venir en una fecha futura, se
  -- oculta de la lista hasta ese dia (reaparece el dia prometido).
  WHERE NOT (
    COALESCE(s.estado, '') = 'cliente_vendra'
    AND s.fecha_promesa IS NOT NULL
    AND s.fecha_promesa > CURRENT_DATE
  );

  RETURN json_build_object(
    'empresa_nombre', COALESCE(v_empresa, 'la empresa'),
    'plantilla',      v_plantilla,
    'clientes',       COALESCE(v_clientes, '[]'::json)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clientes_morosos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_clientes_morosos() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_clientes_morosos() TO authenticated, service_role;


-- 3) RPC: guardar/actualizar el seguimiento de un cliente
CREATE OR REPLACE FUNCTION public.set_cobranza_seguimiento(
  p_cliente_id UUID,
  p_estado     TEXT DEFAULT 'pendiente',
  p_fecha      DATE DEFAULT NULL,
  p_nota       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id es requerido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  INSERT INTO public.cobranza_seguimiento
    (tenant_id, cliente_id, estado, fecha_promesa, nota, updated_by, updated_at)
  VALUES
    (v_tenant, p_cliente_id, COALESCE(p_estado, 'pendiente'), p_fecha, p_nota, auth.uid(), now())
  ON CONFLICT (tenant_id, cliente_id) DO UPDATE
    SET estado        = COALESCE(EXCLUDED.estado, 'pendiente'),
        fecha_promesa = EXCLUDED.fecha_promesa,
        nota          = EXCLUDED.nota,
        updated_by    = EXCLUDED.updated_by,
        updated_at    = now();

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_cobranza_seguimiento(UUID, TEXT, DATE, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_cobranza_seguimiento(UUID, TEXT, DATE, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_cobranza_seguimiento(UUID, TEXT, DATE, TEXT) TO authenticated, service_role;


-- 4) RPC: actualizar el telefono de un cliente (editable desde la lista)
CREATE OR REPLACE FUNCTION public.set_cliente_telefono(
  p_cliente_id UUID,
  p_telefono   TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id es requerido';
  END IF;

  UPDATE public.clientes
  SET telefono = NULLIF(btrim(p_telefono), '')
  WHERE id = p_cliente_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_cliente_telefono(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_cliente_telefono(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_cliente_telefono(UUID, TEXT) TO authenticated, service_role;


-- 5) RPC: marcar que se le envio recordatorio a un cliente (para detectar "no vino")
CREATE OR REPLACE FUNCTION public.marcar_envio_cobranza(
  p_cliente_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id es requerido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  INSERT INTO public.cobranza_seguimiento (tenant_id, cliente_id, ultimo_envio, updated_by, updated_at)
  VALUES (v_tenant, p_cliente_id, now(), auth.uid(), now())
  ON CONFLICT (tenant_id, cliente_id) DO UPDATE
    SET ultimo_envio = now(),
        updated_by   = auth.uid(),
        updated_at   = now();

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_envio_cobranza(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marcar_envio_cobranza(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.marcar_envio_cobranza(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'cobranza_seguimiento + get_clientes_morosos + set_cobranza_seguimiento listos' AS status;
