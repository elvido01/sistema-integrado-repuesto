-- =====================================================================
-- EFECTIVO DEL DÍA → A UNA CUENTA (24/10/2026)
-- ---------------------------------------------------------------------
-- MotoPréstamos Los Naranjos, durante el día, toma efectivo de las ventas
-- y los recibos para COMPRAR DÓLARES (o depositarlo). Ese dinero sale de la
-- gaveta pero NO es un gasto: cambia de lugar. Registrarlo como gasto
-- inflaba los gastos del día y no dejaba rastro de a dónde fue.
--
-- Ahora es su propio movimiento:
--   · sale de la caja del día   → el Cierre de Caja lo resta del efectivo
--                                  en su propia línea ("Efectivo movido a
--                                  cuentas"), digital e impreso;
--   · entra a la cuenta elegida → movimiento ENTRADA (origen 'efectivo_caja'),
--                                  en la MONEDA DE LA CUENTA. Si es la caja
--                                  chica en dólares, se guarda la tasa y entra
--                                  monto ÷ tasa (US$).
--   · el tablero (Caja del día y Caja actual) también lo resta.
--
-- Anular devuelve el efectivo a la caja y borra la entrada de la cuenta.
-- Para todas las empresas (la usa quien la necesite). Idempotente.
-- =====================================================================

-- 1. El registro
CREATE TABLE IF NOT EXISTS public.caja_depositos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.get_user_tenant(),
  fecha         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  monto_caja    numeric(14,2) NOT NULL CHECK (monto_caja > 0),      -- RD$ que salen de la gaveta
  cuenta_id     uuid NOT NULL REFERENCES public.cuentas_bancarias(id),
  moneda        text NOT NULL DEFAULT 'DOP',
  tasa          numeric(12,4),                                      -- solo si la cuenta es en otra moneda
  monto_cuenta  numeric(14,2) NOT NULL CHECK (monto_cuenta > 0),   -- lo que entra a la cuenta, en su moneda
  concepto      text,
  anulado       boolean NOT NULL DEFAULT false,
  anulado_at    timestamptz,
  anulado_por   uuid,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS caja_depositos_tenant_fecha ON public.caja_depositos (tenant_id, fecha) WHERE NOT anulado;

ALTER TABLE public.caja_depositos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caja_depositos_tenant ON public.caja_depositos;
CREATE POLICY caja_depositos_tenant ON public.caja_depositos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
-- Se escribe SOLO por las funciones de abajo (para que caja y cuenta se
-- muevan juntas): no hay política de INSERT/UPDATE.
GRANT SELECT ON public.caja_depositos TO authenticated;

-- 2. El origen nuevo en el libro de bancos
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo = ANY (ARRAY['venta','recibo','cierre_caja','pago_suplidor','compromiso','san',
    'san_completado','ingreso','retiro','desembolso','gasto','ajuste','transferencia_interna',
    'efectivo_caja']::text[]));

-- 3. Mover efectivo de la caja a una cuenta
CREATE OR REPLACE FUNCTION public.mover_efectivo_caja_a_cuenta(
  p_cuenta_id uuid, p_monto_caja numeric, p_tasa numeric DEFAULT NULL,
  p_concepto text DEFAULT NULL, p_fecha date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fin    uuid := public.financiera_vinculada_tenant();
  v_cta    record;
  v_monto_cta numeric;
  v_fecha  date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_id     uuid;
  v_conc   text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar la empresa'; END IF;
  IF COALESCE(p_monto_caja, 0) <= 0 THEN RAISE EXCEPTION 'El monto tiene que ser mayor que cero'; END IF;

  SELECT id, tenant_id, upper(COALESCE(moneda, 'DOP')) AS moneda, banco, alias, activo
    INTO v_cta FROM public.cuentas_bancarias WHERE id = p_cuenta_id;
  IF v_cta.id IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
  IF v_cta.tenant_id <> v_tenant AND v_cta.tenant_id IS DISTINCT FROM v_fin THEN
    RAISE EXCEPTION 'Esa cuenta no es de esta empresa';
  END IF;
  IF v_cta.activo IS FALSE THEN RAISE EXCEPTION 'Esa cuenta está desactivada'; END IF;

  IF v_cta.moneda = 'DOP' THEN
    v_monto_cta := round(p_monto_caja, 2);
  ELSE
    -- A una cuenta en dólares no se le suman pesos: se convierte a la tasa
    -- de ESTA compra, que queda guardada (el saldo no cambia si mañana
    -- cambia la tasa).
    IF COALESCE(p_tasa, 0) <= 0 THEN
      RAISE EXCEPTION 'La cuenta es en %: falta la tasa a la que se compraron', v_cta.moneda;
    END IF;
    v_monto_cta := round(p_monto_caja / p_tasa, 2);
  END IF;

  v_conc := COALESCE(NULLIF(btrim(p_concepto), ''),
              CASE WHEN v_cta.moneda = 'DOP' THEN 'Efectivo de la caja' ELSE 'Compra de ' || v_cta.moneda || ' con efectivo de la caja' END);

  INSERT INTO public.caja_depositos (tenant_id, fecha, monto_caja, cuenta_id, moneda, tasa, monto_cuenta, concepto)
  VALUES (v_tenant, v_fecha, round(p_monto_caja, 2), p_cuenta_id, v_cta.moneda,
          CASE WHEN v_cta.moneda = 'DOP' THEN NULL ELSE p_tasa END, v_monto_cta, v_conc)
  RETURNING id INTO v_id;

  PERFORM public.registrar_movimiento_bancario_compartido(
    p_cuenta_id, 'ENTRADA', v_monto_cta,
    v_conc || CASE WHEN v_cta.moneda <> 'DOP' THEN ' (RD$ ' || to_char(p_monto_caja, 'FM999,999,990.00') || ' a ' || p_tasa || ')' ELSE '' END,
    NULL, 'efectivo_caja', v_id, v_fecha);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'monto_caja', round(p_monto_caja, 2),
                            'monto_cuenta', v_monto_cta, 'moneda', v_cta.moneda);
END $$;
REVOKE ALL ON FUNCTION public.mover_efectivo_caja_a_cuenta(uuid, numeric, numeric, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_efectivo_caja_a_cuenta(uuid, numeric, numeric, text, date) TO authenticated;

-- 4. Anular: el efectivo vuelve a la caja y la entrada sale de la cuenta
CREATE OR REPLACE FUNCTION public.anular_efectivo_caja_a_cuenta(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_dep    record;
BEGIN
  SELECT * INTO v_dep FROM public.caja_depositos WHERE id = p_id AND tenant_id = v_tenant FOR UPDATE;
  IF v_dep.id IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF v_dep.anulado THEN RETURN jsonb_build_object('ok', true, 'ya_anulado', true); END IF;

  UPDATE public.caja_depositos SET anulado = true, anulado_at = now(), anulado_por = auth.uid() WHERE id = p_id;
  -- La entrada puede estar en una cuenta de la financiera vinculada: se borra
  -- por su origen, sin mirar de qué empresa es la cuenta.
  DELETE FROM public.movimientos_bancarios WHERE origen_tipo = 'efectivo_caja' AND origen_id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.anular_efectivo_caja_a_cuenta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_efectivo_caja_a_cuenta(uuid) TO authenticated;

-- 5. El tablero: Caja del día y Caja actual también lo restan.
-- Se parte de la función EN PRODUCCIÓN (se ha reescrito muchas veces) y se
-- agrega una resta al final de cada bloque.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.get_caja_excedente_dashboard()'::regprocedure);
  IF position('caja_depositos' IN d) > 0 THEN RETURN; END IF;
  n := replace(d,
    $x$AND desembolso IS NOT NULL), 0);$x$,
    $x$AND desembolso IS NOT NULL), 0)
    -- (24/10/2026) efectivo movido de la caja a una cuenta (compra de dólares, depósito)
    - COALESCE((SELECT SUM(monto_caja) FROM public.caja_depositos
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND NOT anulado), 0);$x$);
  n := replace(n,
    $x$AND desembolso ILIKE 'efectivo'), 0);$x$,
    $x$AND desembolso ILIKE 'efectivo'), 0)
    -- (24/10/2026) efectivo movido hoy de la caja a una cuenta
    - COALESCE((SELECT SUM(monto_caja) FROM public.caja_depositos
        WHERE tenant_id = v_tenant AND fecha = v_today AND NOT anulado), 0);$x$);
  IF (length(n) - length(replace(n, 'caja_depositos', ''))) / length('caja_depositos') <> 2 THEN
    RAISE EXCEPTION 'get_caja_excedente_dashboard cambió: no se pudieron poner las dos restas';
  END IF;
  EXECUTE n;
END $$;

SELECT public.registrar_migracion('efectivo_caja_a_cuenta.sql');
