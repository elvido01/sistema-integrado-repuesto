-- =====================================================================
-- Nómina: pagar empleado por empleado, con comprobante de gasto
-- ---------------------------------------------------------------------
-- (2026-07-28) Hasta ahora la nómina se pagaba COMPLETA de un solo golpe.
-- Pero hay empresas que pagan a mano, uno por uno, según va llegando cada
-- quien. Ahora cada línea se puede pagar por separado.
--
-- Al pagar a un empleado:
--   1. Se le crea un GASTO con su nombre ("Nómina 16-31/07 — YERLIN CARABALLO")
--      del que sale el comprobante que se imprime y se le entrega.
--   2. La línea queda marcada como pagada, con la fecha y la forma de pago.
--   3. Cuando se paga el ÚLTIMO que faltaba, la nómina se marca 'pagada'
--      sola y se cierra su compromiso en el dashboard. No hay que acordarse
--      de darle a "Pagar" al final.
--
-- >>> EL GASTO NO ES UN ADELANTO <<<
-- Los adelantos se detectan por tipo_gasto = 'Adelanto de sueldo', y el
-- sistema los DESCUENTA de la próxima nómina. Si el pago del sueldo entrara
-- con ese tipo, se lo volverían a descontar. Por eso va como tipo_gasto =
-- 'Nómina', que ninguna consulta de adelantos mira.
--
-- El gasto sale de la caja (afecta_caja = true) salvo que se pague desde una
-- cuenta bancaria, igual que cualquier otro gasto.
--
-- Idempotente / re-ejecutable. Requiere sql/nomina_modulo.sql antes.
-- =====================================================================

ALTER TABLE public.nomina_detalle
  ADD COLUMN IF NOT EXISTS pagado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS forma_pago  text,
  ADD COLUMN IF NOT EXISTS gasto_id    uuid REFERENCES public.gastos_diarios(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.nomina_pagar_empleado(
  p_detalle_id uuid,
  p_forma_pago text DEFAULT 'Efectivo',
  p_cuenta_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  d         record;
  n         record;
  v_emp     text;
  v_gasto   uuid;
  v_faltan  int;
  v_desc    text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  SELECT * INTO d FROM public.nomina_detalle
   WHERE id = p_detalle_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea de nómina no encontrada'; END IF;
  IF d.pagado_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ese empleado ya está pagado en esta nómina';
  END IF;

  SELECT * INTO n FROM public.nominas WHERE id = d.nomina_id AND tenant_id = v_tenant;
  IF n.estado <> 'borrador' THEN
    RAISE EXCEPTION 'La nómina está %, no acepta pagos', n.estado;
  END IF;
  IF d.neto <= 0 THEN
    RAISE EXCEPTION 'El neto de ese empleado es cero: no hay nada que pagar';
  END IF;

  SELECT nombre INTO v_emp FROM public.empleados WHERE id = d.empleado_id;
  v_desc := 'Nómina ' || to_char(n.fecha_desde, 'DD/MM') || '-' || to_char(n.fecha_hasta, 'DD/MM/YYYY')
            || ' — ' || COALESCE(v_emp, 'empleado');

  -- El comprobante: un gasto a nombre del empleado.
  -- tipo_gasto 'Nómina' a propósito: 'Adelanto de sueldo' lo volvería a
  -- descontar en la próxima corrida.
  INSERT INTO public.gastos_diarios
    (tenant_id, fecha, tipo_gasto, monto, descripcion, usuario_id,
     empleado_id, cuenta_bancaria_id, afecta_caja, anulado)
  VALUES
    (v_tenant, (now() AT TIME ZONE 'America/Santo_Domingo')::date, 'Nómina',
     round(d.neto, 2), v_desc, auth.uid(),
     d.empleado_id, p_cuenta_id, p_cuenta_id IS NULL, false)
  RETURNING id INTO v_gasto;

  UPDATE public.nomina_detalle
     SET pagado_at = now(), forma_pago = p_forma_pago, gasto_id = v_gasto
   WHERE id = p_detalle_id;

  -- ¿Quedó alguno sin pagar?
  SELECT count(*) INTO v_faltan
    FROM public.nomina_detalle
   WHERE nomina_id = d.nomina_id AND pagado_at IS NULL AND neto > 0;

  IF v_faltan = 0 THEN
    UPDATE public.nominas
       SET estado = 'pagada', forma_pago = COALESCE(forma_pago, p_forma_pago), pagada_at = now()
     WHERE id = d.nomina_id;

    UPDATE public.compromisos
       SET activo = false, fecha_pago = now()
     WHERE id = n.compromiso_id AND fecha_pago IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'empleado', v_emp,
    'monto', round(d.neto, 2),
    'gasto_id', v_gasto,
    'descripcion', v_desc,
    'faltan', v_faltan,
    'nomina_cerrada', (v_faltan = 0));
END $$;

GRANT EXECUTE ON FUNCTION public.nomina_pagar_empleado(uuid, text, uuid) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_pago_por_empleado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las columnas y la función
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'nomina_detalle'
      AND column_name IN ('pagado_at','forma_pago','gasto_id')) AS columnas_nuevas,
  to_regprocedure('public.nomina_pagar_empleado(uuid,text,uuid)')::text AS funcion;
-- esperado: 3 | la firma

-- 2) Estado de la nómina en borrador: quién está pagado y quién no
SELECT n.numero, e.nombre, d.neto,
       CASE WHEN d.pagado_at IS NULL THEN 'PENDIENTE'
            ELSE 'pagado ' || to_char(d.pagado_at, 'DD/MM HH24:MI') END AS situacion,
       d.forma_pago
FROM public.nomina_detalle d
JOIN public.nominas n   ON n.id = d.nomina_id
JOIN public.empleados e ON e.id = d.empleado_id
WHERE n.estado = 'borrador'
ORDER BY n.numero, e.nombre;

-- 3) Los pagos de nómina NO deben aparecer como adelantos pendientes
SELECT count(*) AS pagos_nomina_contados_como_adelanto
FROM public.gastos_diarios
WHERE tipo_gasto = 'Nómina'
  AND id IN (SELECT gasto_id FROM public.nomina_adelantos_pendientes);
-- esperado: 0
