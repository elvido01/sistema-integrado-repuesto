-- =====================================================================
-- Pago anual de suscripciones (con descuento)
-- ---------------------------------------------------------------------
-- Permite que un tenant pague su plan por AÑO en vez de por mes. El precio
-- anual se calcula en el front (2 meses gratis = precio_mensual * 10), y el
-- monto + ciclo + duracion viajan en la solicitud de pago para que al aprobar
-- la suscripcion venza a los 365 dias (no a los 30).
--
-- Cambios:
--   * pagos_suscripcion: + ciclo ('mensual'|'anual') y + duracion_dias.
--   * solicitar_pago_suscripcion: recibe p_ciclo y p_duracion_dias.
--   * admin_aprobar_pago: usa la duracion del pago (fallback al plan).
--   * admin_get_pagos_pendientes: expone ciclo y duracion_dias.
--
-- Re-ejecutable.
-- =====================================================================

-- 1. Columnas nuevas en pagos_suscripcion
ALTER TABLE public.pagos_suscripcion
  ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'mensual';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.pagos_suscripcion'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%ciclo%'
  LOOP
    EXECUTE format('ALTER TABLE public.pagos_suscripcion DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.pagos_suscripcion
  ADD CONSTRAINT pagos_suscripcion_ciclo_check CHECK (ciclo IN ('mensual','anual'));

ALTER TABLE public.pagos_suscripcion
  ADD COLUMN IF NOT EXISTS duracion_dias integer;

-- 2. RPC solicitar_pago_suscripcion (nueva firma con ciclo + duracion_dias)
DROP FUNCTION IF EXISTS public.solicitar_pago_suscripcion(uuid, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.solicitar_pago_suscripcion(
  p_plan_id uuid,
  p_monto numeric,
  p_referencia text DEFAULT NULL,
  p_banco_origen text DEFAULT NULL,
  p_titular_cuenta text DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL,
  p_ciclo text DEFAULT 'mensual',
  p_duracion_dias integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _pago_id uuid;
  _ciclo text := CASE WHEN lower(COALESCE(p_ciclo,'mensual')) = 'anual' THEN 'anual' ELSE 'mensual' END;
  _dur integer;
BEGIN
  _tenant := get_user_tenant();
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pagos_suscripcion
    WHERE tenant_id = _tenant AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Ya tiene un pago pendiente de revisión. Espere la verificación.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM planes WHERE id = p_plan_id AND activo = true) THEN
    RAISE EXCEPTION 'Plan no encontrado o no activo';
  END IF;

  -- Duracion: la enviada, o 365 si es anual, o la del plan por defecto.
  _dur := COALESCE(
    p_duracion_dias,
    CASE WHEN _ciclo = 'anual' THEN 365 ELSE NULL END,
    (SELECT duracion_dias FROM planes WHERE id = p_plan_id)
  );

  INSERT INTO pagos_suscripcion (
    tenant_id, plan_id, monto, referencia,
    banco_origen, titular_cuenta, comprobante_url, ciclo, duracion_dias
  )
  VALUES (
    _tenant, p_plan_id, p_monto, p_referencia,
    p_banco_origen, p_titular_cuenta, p_comprobante_url, _ciclo, _dur
  )
  RETURNING id INTO _pago_id;

  RETURN _pago_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_pago_suscripcion(uuid, numeric, text, text, text, text, text, integer) TO authenticated;

-- 3. RPC admin_aprobar_pago: usar la duracion del pago (fallback al plan)
CREATE OR REPLACE FUNCTION public.admin_aprobar_pago(
  p_pago_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pago RECORD;
  _plan RECORD;
  _sub_id uuid;
  _is_super boolean;
  _dur integer;
  _fin timestamptz;
BEGIN
  SELECT is_superadmin INTO _is_super FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Solo superadmins pueden aprobar pagos';
  END IF;

  SELECT * INTO _pago FROM pagos_suscripcion WHERE id = p_pago_id;
  IF _pago IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF _pago.estado != 'pendiente' THEN RAISE EXCEPTION 'Este pago ya fue procesado'; END IF;

  SELECT * INTO _plan FROM planes WHERE id = _pago.plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Plan no encontrado'; END IF;

  -- Duracion efectiva: la guardada en el pago, o la del plan.
  _dur := COALESCE(_pago.duracion_dias, _plan.duracion_dias);
  _fin := now() + (_dur || ' days')::interval;

  UPDATE suscripciones
  SET estado = 'vencido', updated_at = now()
  WHERE tenant_id = _pago.tenant_id
    AND estado IN ('trial', 'activo');

  INSERT INTO suscripciones (
    tenant_id, plan_id, estado,
    fecha_inicio, fecha_fin,
    metodo_pago, referencia_pago, monto_pagado
  )
  VALUES (
    _pago.tenant_id, _plan.id, 'activo',
    now(), _fin,
    'transferencia', _pago.referencia, _pago.monto
  )
  RETURNING id INTO _sub_id;

  UPDATE tenants
  SET
    plan = LOWER(_plan.nombre),
    feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
    feat_carta_ruta = _plan.feat_carta_ruta,
    feat_cobranzas = _plan.feat_cobranzas,
    trial_end_date = _fin::date,
    activo = true,
    updated_at = now()
  WHERE id = _pago.tenant_id;

  UPDATE pagos_suscripcion
  SET
    estado = 'aprobado',
    revisado_por = auth.uid(),
    fecha_revision = now(),
    notas_revision = p_notas,
    suscripcion_id = _sub_id,
    updated_at = now()
  WHERE id = p_pago_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_aprobar_pago(uuid, text) TO authenticated;

-- 4. admin_get_pagos_pendientes: exponer ciclo y duracion
CREATE OR REPLACE FUNCTION public.admin_get_pagos_pendientes()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
BEGIN
  SELECT is_superadmin INTO _is_super FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Solo superadmins';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
    FROM (
      SELECT
        p.id, p.tenant_id,
        t.nombre AS empresa_nombre, t.email AS empresa_email, t.logo_url,
        pl.nombre AS plan_nombre, pl.precio AS plan_precio,
        p.monto, p.ciclo, p.duracion_dias,
        p.referencia, p.banco_origen, p.titular_cuenta, p.comprobante_url,
        p.estado, p.created_at
      FROM pagos_suscripcion p
      JOIN tenants t ON t.id = p.tenant_id
      JOIN planes pl ON pl.id = p.plan_id
      WHERE p.estado = 'pendiente'
      ORDER BY p.created_at ASC
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_pagos_pendientes() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'pago anual de suscripciones listo' AS status;
