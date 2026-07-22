-- =====================================================================
-- SAN: CUENTA MADRE — al completarse un SAN, el dinero ENTRA ahí
-- ---------------------------------------------------------------------
-- La "cuenta madre" es la cuenta bancaria que el módulo SAN muestra en el
-- tablero (el recuadro con el saldo en vivo). Antes se elegía solo en el
-- navegador (localStorage); ahora se guarda por empresa en
-- config_empresa.san_cuenta_madre_id para que el servidor pueda usarla.
-- Si no se ha elegido ninguna, se usa la cuenta PREDETERMINADA de la
-- empresa (config_empresa.cuenta_bancaria_default_id): sin configurar nada
-- el SAN ya cae donde debe.
--
-- Regla: cuando un SAN pasa a 'Completado', se registra una ENTRADA en la
-- cuenta madre por el total ahorrado (origen_tipo='san_completado',
-- origen_id = san.id). Así la línea del SAN aparece en la cuenta madre y
-- su saldo sube. La fecha del movimiento es la del ÚLTIMO pago (fecha real
-- del cierre), no la de digitación.
--
-- La cuenta madre PUEDE (y normalmente debe) ser la misma cuenta de donde
-- salen los abonos diarios (san.cuenta_bancaria_id): el SAN es un ahorro de
-- la empresa, así que cada día marcado DEBITA la cuenta y al cobrarse el SAN
-- se hace el INGRESO por el total. Es un movimiento de cuenta normal — el
-- neto en cero es exactamente lo esperado.
--
-- El disparo va por TRIGGER en public.san: cubre completar por pago, por
-- edición (san_editar re-aplica lo ahorrado y puede completar) y cualquier
-- camino futuro, sin tocar las RPC existentes. Si un SAN deja de estar
-- completado (se editó a una meta mayor) o se le quita la cuenta madre, la
-- ENTRADA se borra sola: el saldo nunca queda inflado.
--
-- Idempotente / re-ejecutable. Requiere sql/cuentas_bancarias.sql,
-- sql/san_modulo.sql, sql/san_cuenta_bancaria.sql y sql/san_editar_cuenta.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La cuenta madre del módulo SAN (una por empresa)
-- ---------------------------------------------------------------------
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS san_cuenta_madre_id uuid
  REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.config_empresa.san_cuenta_madre_id IS
  'Cuenta bancaria donde caen los SAN completados. NULL = usa cuenta_bancaria_default_id. Ver sql/san_cuenta_madre.sql';

-- ---------------------------------------------------------------------
-- 2) Nuevo origen en el libro bancario: el cierre de un SAN
-- ---------------------------------------------------------------------
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso',
                         'san','san_completado','ajuste','transferencia_interna'));

-- ---------------------------------------------------------------------
-- 3) Aplicar (o retirar) el cierre de UN SAN en la cuenta madre
--    Idempotente por (tenant_id, origen_tipo, origen_id): correrla mil
--    veces deja siempre UNA sola línea con el monto correcto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_aplicar_cuenta_madre(p_san_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_san    record;
  v_cuenta uuid;
  v_fecha  date;
  v_id     uuid;
BEGIN
  SELECT * INTO v_san FROM public.san WHERE id = p_san_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Sin cuenta madre elegida manda la predeterminada de la empresa
  SELECT COALESCE(san_cuenta_madre_id, cuenta_bancaria_default_id) INTO v_cuenta
  FROM public.config_empresa WHERE tenant_id = v_san.tenant_id;

  -- Sin cuenta madre, sin plata o SAN que ya no está cerrado → no debe
  -- existir la línea (borra la que hubiera quedado de antes).
  IF v_cuenta IS NULL
     OR v_san.estado NOT IN ('Completado','Archivado')
     OR COALESCE(v_san.monto_ahorrado, 0) <= 0 THEN
    DELETE FROM public.movimientos_bancarios
    WHERE tenant_id = v_san.tenant_id
      AND origen_tipo = 'san_completado' AND origen_id = p_san_id;
    RETURN NULL;
  END IF;

  -- Fecha real del cierre = último día pagado
  SELECT COALESCE(
           (MAX(fecha_pago) AT TIME ZONE 'America/Santo_Domingo')::date,
           (now() AT TIME ZONE 'America/Santo_Domingo')::date)
    INTO v_fecha
  FROM public.san_pagos WHERE san_id = p_san_id;

  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, fecha, tipo, monto, concepto, origen_tipo, origen_id, usuario_id)
  VALUES (v_san.tenant_id, v_cuenta, v_fecha, 'ENTRADA', round(v_san.monto_ahorrado, 2),
          'SAN completado: ' || v_san.nombre, 'san_completado', p_san_id, auth.uid())
  ON CONFLICT (tenant_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL
  DO UPDATE SET
    cuenta_id = EXCLUDED.cuenta_id,   -- si cambian la cuenta madre, la línea se muda
    fecha     = EXCLUDED.fecha,
    monto     = EXCLUDED.monto,
    concepto  = EXCLUDED.concepto
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- 4) Trigger: cualquier cambio de estado/avance/nombre del SAN reajusta
--    su línea en la cuenta madre
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_san_cuenta_madre()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  PERFORM public.san_aplicar_cuenta_madre(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_san_cuenta_madre ON public.san;
CREATE TRIGGER trg_san_cuenta_madre
  AFTER UPDATE ON public.san
  FOR EACH ROW
  WHEN (NEW.estado         IS DISTINCT FROM OLD.estado
     OR NEW.monto_ahorrado IS DISTINCT FROM OLD.monto_ahorrado
     OR NEW.nombre         IS DISTINCT FROM OLD.nombre)
  EXECUTE FUNCTION public.trg_san_cuenta_madre();

-- ---------------------------------------------------------------------
-- 5) Elegir la cuenta madre (y arrastrar lo ya completado)
--    Al fijarla, los SAN que YA estaban completados entran también; si se
--    cambia de cuenta, sus líneas se mudan a la nueva.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_set_cuenta_madre(p_cuenta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_n      int  := 0;
  r        record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cuenta_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.cuentas_bancarias
       WHERE id = p_cuenta_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Esa cuenta bancaria no es de esta empresa';
  END IF;

  UPDATE public.config_empresa SET san_cuenta_madre_id = p_cuenta_id
  WHERE tenant_id = v_tenant;

  FOR r IN SELECT id FROM public.san
           WHERE tenant_id = v_tenant AND estado IN ('Completado','Archivado')
  LOOP
    PERFORM public.san_aplicar_cuenta_madre(r.id);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cuenta_id', p_cuenta_id, 'sincronizados', v_n);
END $$;

-- ---------------------------------------------------------------------
-- 6) san_eliminar: llevarse también la línea de la cuenta madre
--    (canónico: sql/san_editar_eliminar.sql + limpieza del movimiento)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.san_eliminar(p_san_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_san    record;
BEGIN
  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado <> 'Cancelado' THEN
    RAISE EXCEPTION 'Cancela el SAN primero para poder eliminarlo (está %)', v_san.estado;
  END IF;

  DELETE FROM public.movimientos_bancarios
  WHERE tenant_id = v_tenant AND origen_tipo = 'san_completado' AND origen_id = p_san_id;

  DELETE FROM public.san WHERE id = p_san_id;   -- arrastra pagos e historial
  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------------------------------------------------------------------
-- 7) Permisos
-- ---------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'san_aplicar_cuenta_madre(uuid)',
    'san_set_cuenta_madre(uuid)',
    'san_eliminar(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_cuenta_madre.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT 'config_empresa.san_cuenta_madre_id' AS objeto,
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema='public' AND table_name='config_empresa'
          AND column_name='san_cuenta_madre_id') AS existe
UNION ALL SELECT 'san_aplicar_cuenta_madre', to_regprocedure('public.san_aplicar_cuenta_madre(uuid)')::text
UNION ALL SELECT 'san_set_cuenta_madre',     to_regprocedure('public.san_set_cuenta_madre(uuid)')::text
UNION ALL SELECT 'trigger',
       (SELECT count(*)::text FROM pg_trigger WHERE tgname='trg_san_cuenta_madre' AND NOT tgisinternal);
