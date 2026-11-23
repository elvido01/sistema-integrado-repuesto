-- ============================================================
-- SUPER ADMIN: REGISTRAR UN PAGO DE MEMBRESÍA A MANO (23/11/2026)
-- ============================================================
-- Para el panel de super administrador de la app móvil. Hasta hoy un pago
-- solo entraba si el cliente subía el comprobante (pagos_suscripcion
-- 'pendiente' → admin_aprobar_pago). Cuando el cliente paga en efectivo o
-- transfiere sin subir nada, el dueño lo registra aquí y queda igual que uno
-- aprobado: suscripción nueva 'activo', tenants.plan y features del plan, y la
-- fila en pagos_suscripcion ('aprobado') para el historial.
--
-- Diferencia con admin_aprobar_pago: si el cliente paga ANTES de vencer, los
-- días PAGADOS que le quedaban no se pierden (la nueva vence en max(hoy, fin
-- de la suscripción 'activo') + los meses pagados). Los días de prueba no se
-- suman (igual que al aprobar un comprobante). Cada año pagado = 365 días
-- (como el ciclo 'anual' de planes_pago_anual.sql); los meses sueltos, la
-- duración del plan.
-- (ajuste de la revisión: monto > 0 — una cortesía va por "Dar días";
--  registrar_migracion al final.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_registrar_pago(
  p_tenant_id uuid,
  p_plan_nombre text,
  p_meses integer,
  p_monto numeric,
  p_metodo text DEFAULT 'efectivo',
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _plan public.planes%ROWTYPE;
  _fin_actual timestamptz;
  _desde timestamptz;
  _fin timestamptz;
  _dur integer;
  _sub_id uuid;
  _pago_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Solo superadmins pueden registrar pagos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;
  IF COALESCE(p_meses, 0) < 1 OR p_meses > 36 THEN RAISE EXCEPTION 'Meses debe ser de 1 a 36'; END IF;
  IF COALESCE(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero (una cortesía va por Dar días)'; END IF;

  SELECT * INTO _plan FROM public.planes WHERE upper(nombre) = upper(btrim(p_plan_nombre)) AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan no encontrado: %', p_plan_nombre; END IF;
  IF upper(_plan.nombre) IN ('TRIAL', 'FREE') THEN
    RAISE EXCEPTION 'El plan % no se paga; usa Cambiar plan', _plan.nombre;
  END IF;

  _dur := (p_meses / 12) * 365 + (p_meses % 12) * COALESCE(_plan.duracion_dias, 30);

  -- Lo que le quedaba de la suscripción vigente se conserva.
  SELECT max(s.fecha_fin) INTO _fin_actual FROM public.suscripciones s
   WHERE s.tenant_id = p_tenant_id AND s.estado = 'activo' AND s.fecha_fin > now();
  _desde := GREATEST(now(), COALESCE(_fin_actual, now()));
  _fin := _desde + make_interval(days => _dur);

  UPDATE public.suscripciones SET estado = 'vencido', updated_at = now()
   WHERE tenant_id = p_tenant_id AND estado IN ('trial', 'activo');

  INSERT INTO public.suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin,
                                    metodo_pago, referencia_pago, monto_pagado)
  VALUES (p_tenant_id, _plan.id, 'activo', clock_timestamp(), _fin,  -- clock_timestamp: dos pagos en la misma transacción no chocan (tenant, plan, fecha_inicio)
          COALESCE(NULLIF(btrim(p_metodo), ''), 'efectivo'), NULLIF(btrim(p_referencia), ''), p_monto)
  RETURNING id INTO _sub_id;

  UPDATE public.tenants SET
    plan = lower(_plan.nombre),
    feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
    feat_carta_ruta = _plan.feat_carta_ruta,
    feat_cobranzas = _plan.feat_cobranzas,
    trial_end_date = _fin::date,
    activo = true,
    updated_at = now()
  WHERE id = p_tenant_id;

  INSERT INTO public.pagos_suscripcion (tenant_id, plan_id, monto, ciclo, duracion_dias, metodo_pago,
                                        referencia, estado, revisado_por, fecha_revision, notas_revision, suscripcion_id)
  VALUES (p_tenant_id, _plan.id, p_monto, CASE WHEN p_meses >= 12 THEN 'anual' ELSE 'mensual' END, _dur,
          COALESCE(NULLIF(btrim(p_metodo), ''), 'efectivo'), NULLIF(btrim(p_referencia), ''),
          'aprobado', auth.uid(), now(),
          concat_ws(' · ', 'Registrado a mano por super admin', NULLIF(btrim(p_notas), '')), _sub_id)
  RETURNING id INTO _pago_id;

  RETURN jsonb_build_object('suscripcion_id', _sub_id, 'pago_id', _pago_id, 'plan', _plan.nombre,
                            'fecha_fin', _fin, 'dias', _dur);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.admin_registrar_pago(uuid, text, integer, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_registrar_pago(uuid, text, integer, numeric, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA: como el super admin, sobre una empresa cualquiera; todo se deshace.
DO $prueba$
DECLARE v_t uuid; r jsonb; v_fin_antes timestamptz; v_plan text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb', 'role', 'authenticated')::text, true);

  SELECT t.id INTO v_t FROM public.tenants t ORDER BY t.created_at LIMIT 1;
  SELECT max(fecha_fin) INTO v_fin_antes FROM public.suscripciones
   WHERE tenant_id = v_t AND estado = 'activo' AND fecha_fin > now();

  r := public.admin_registrar_pago(v_t, 'basico', 2, 3900, 'efectivo', 'PRUEBA', 'prueba');
  IF (r->>'dias')::int <> 60 THEN RAISE EXCEPTION 'Días: %', r; END IF;
  IF (r->>'fecha_fin')::timestamptz < GREATEST(now(), COALESCE(v_fin_antes, now())) + interval '59 days' THEN
    RAISE EXCEPTION 'Perdió los días que le quedaban: %', r;
  END IF;
  SELECT plan INTO v_plan FROM public.tenants WHERE id = v_t;
  IF v_plan <> 'basico' THEN RAISE EXCEPTION 'tenants.plan = %', v_plan; END IF;
  IF (SELECT count(*) FROM public.suscripciones WHERE tenant_id = v_t AND estado = 'activo') <> 1 THEN
    RAISE EXCEPTION 'Más de una suscripción activa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pagos_suscripcion WHERE id = (r->>'pago_id')::uuid AND estado = 'aprobado') THEN
    RAISE EXCEPTION 'No quedó el pago en el historial';
  END IF;

  -- Un año = 365 días; monto 0 no
  r := public.admin_registrar_pago(v_t, 'basico', 12, 19500, 'transferencia');
  IF (r->>'dias')::int <> 365 THEN RAISE EXCEPTION 'Un año dio % días', r->>'dias'; END IF;
  BEGIN
    PERFORM public.admin_registrar_pago(v_t, 'basico', 1, 0);
    RAISE EXCEPTION 'Aceptó monto 0';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Aceptó monto 0' THEN RAISE; END IF;
  END;

  -- Un usuario que no es super admin no puede
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb', 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.admin_registrar_pago(v_t, 'basico', 1, 1950);
    RAISE EXCEPTION 'Un no-superadmin pudo registrar';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Un no-superadmin pudo registrar' THEN RAISE; END IF;
  END;

  RAISE EXCEPTION 'PRUEBA_OK';  -- deshace todo lo de la prueba
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('admin_registrar_pago_membresia.sql');
