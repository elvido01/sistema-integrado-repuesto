-- =====================================================================
-- Cuando la financiera le paga al dealer, al dealer le ENTRA el dinero
-- ---------------------------------------------------------------------
-- (2026-08-20) MotoPrestamos le pago RD$90,000 a Caminero Motors. En
-- MotoPrestamos todo cuadro: la CxP bajo y el dinero salio de Odalys. En
-- Caminero no entro nada. Medido ese dia:
--
--     Caminero      CxC pendiente   RD$2,100,400
--     MotoPrestamos CxP pendiente   RD$1,956,000
--
-- Dos libros que describen la MISMA deuda y no coinciden. Y el hueco se
-- abre solo cada vez que se paga, en silencio, porque nada obliga a nadie a
-- ir a la otra empresa a registrar la entrada.
--
-- >>> POR QUE AUTOMATICO Y NO "QUE ALGUIEN HAGA EL RECIBO" <<<
-- Porque el reparto no es obvio: estos RD$90,000 se aplicaron a 5 CxP que
-- corresponden a 4 facturas distintas, en montos como 60,822.22 y 3,316.67.
-- Pedirle eso a una persona, en otra sesion y en otra empresa, es pedir que
-- se olvide o que se aplique mal — la misma familia de error que ya costo
-- dos correcciones a mano el mismo dia.
--
-- >>> POR QUE EL RECIBO ES EN EFECTIVO <<<
-- Las dos empresas comparten las cuentas fisicas. Si el recibo del dealer
-- acreditara una cuenta, los RD$90,000 que salieron de Odalys volverian a
-- entrar en el mismo sitio y el movimiento se anularia solo — cuando lo
-- cierto es que el dinero SI salio del banco y quedo en manos del dealer.
-- Registrado como efectivo cae donde de verdad esta: en la caja del dia.
-- Quien lo deposite despues lo registra como cualquier otro deposito.
--
-- >>> LO QUE NO HACE <<<
-- No toca la CxP ni el movimiento bancario: de eso ya se encargo el pago.
-- Aqui solo se escribe la punta que faltaba.
--
-- Idempotente: dos llamadas para el mismo pago no crean dos recibos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sincronizar_pago_a_dealer(
  p_pago_id uuid,
  p_forma   text DEFAULT 'Efectivo'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin      uuid := public.get_user_tenant();
  v_dealer   uuid;
  v_pago     record;
  v_cliente  uuid;
  v_clientes int;
  v_total    numeric := 0;
  v_numero   text;
  v_recibo   uuid;
  v_next     bigint;
  r          record;
  v_pend     numeric;
  v_lineas   int := 0;
BEGIN
  IF v_fin IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT * INTO v_pago FROM public.pagos_suplidores
  WHERE id = p_pago_id AND tenant_id = v_fin;
  IF v_pago.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Ese pago no es de esta empresa');
  END IF;
  IF COALESCE(v_pago.anulado, false) THEN
    RETURN json_build_object('ok', false, 'motivo', 'El pago esta anulado');
  END IF;

  -- El dealer es la empresa que apunta a esta como su financiera. Mismo
  -- modelo de confianza que registrar_movimiento_bancario_compartido: no se
  -- puede escribir en una empresa que no esta vinculada.
  SELECT ce.tenant_id INTO v_dealer
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_fin AND ce.tenant_id <> v_fin
  LIMIT 1;
  IF v_dealer IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Esta empresa no es la financiera de ningun dealer');
  END IF;

  -- Ya sincronizado: se devuelve lo que hay en vez de duplicar el ingreso.
  SELECT id, numero INTO v_recibo, v_numero
  FROM public.recibos_ingreso
  WHERE tenant_id = v_dealer
    AND origen = 'pago_suplidor:' || v_pago.numero
    AND COALESCE(anulado, false) = false
  LIMIT 1;
  IF v_recibo IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'ya_estaba', true, 'recibo', v_numero);
  END IF;

  -- Lo pagado, junto por factura del dealer. Solo entran las CxP que tienen
  -- factura enganchada: un pago a este mismo suplidor por algo que no sea
  -- financiamiento no le corresponde a ninguna factura y se queda fuera.
  CREATE TEMP TABLE _abonos ON COMMIT DROP AS
  SELECT c.factura_dealer_id AS factura_id,
         round(SUM(d.monto_abonado), 2) AS monto
  FROM public.pagos_suplidores_detalle d
  JOIN public.compras c ON c.id = d.compra_id AND c.tenant_id = v_fin
  JOIN public.facturas f ON f.id = c.factura_dealer_id AND f.tenant_id = v_dealer
  WHERE d.pago_id = p_pago_id
    AND c.factura_dealer_id IS NOT NULL
  GROUP BY c.factura_dealer_id;

  SELECT COALESCE(SUM(monto), 0), count(*) INTO v_total, v_lineas FROM _abonos;
  IF v_lineas = 0 THEN
    RETURN json_build_object('ok', false, 'motivo',
      'Ninguna de las cuentas por pagar de este pago viene de una factura del dealer');
  END IF;

  -- Todas las facturas tienen que ser del MISMO cliente: es el cliente
  -- "financiera" que creo el financiamiento. Si salieran dos, el recibo
  -- estaria mezclando deudas de dos personas distintas.
  -- array_agg y no min(): en Postgres no hay min(uuid).
  SELECT count(DISTINCT f.cliente_id), (array_agg(DISTINCT f.cliente_id))[1]
    INTO v_clientes, v_cliente
  FROM _abonos a JOIN public.facturas f ON f.id = a.factura_id;
  IF v_clientes <> 1 THEN
    RETURN json_build_object('ok', false, 'motivo',
      format('Las facturas son de %s clientes distintos: no se puede hacer un solo recibo', v_clientes));
  END IF;

  -- Numeracion del DEALER. get_next_recibo_ingreso_numero() no sirve aqui:
  -- lee get_user_tenant(), que es la financiera, y daria un numero de la
  -- empresa equivocada.
  SELECT COALESCE(MAX(CASE
           WHEN numero ~ '^\d+$'  THEN numero::bigint
           WHEN numero ~ '^RI-'   THEN REPLACE(numero, 'RI-', '')::bigint
           ELSE 0 END), 0) + 1
    INTO v_next
  FROM public.recibos_ingreso WHERE tenant_id = v_dealer;
  v_numero := 'RI-' || LPAD(v_next::text, 6, '0');

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen
  ) VALUES (
    v_dealer, v_numero, v_cliente, v_pago.fecha, v_total,
    format('Pago de la financiera (%s)', v_pago.numero),
    jsonb_build_array(jsonb_build_object(
      'id', 1, 'forma', COALESCE(NULLIF(btrim(p_forma), ''), 'Efectivo'),
      'monto', v_total, 'referencia', v_pago.numero)),
    auth.uid(),
    'pago_suplidor:' || v_pago.numero
  ) RETURNING id INTO v_recibo;

  FOR r IN SELECT factura_id, monto FROM _abonos LOOP
    INSERT INTO public.recibos_ingreso_detalle (tenant_id, recibo_id, factura_id, monto_abonado)
    VALUES (v_dealer, v_recibo, r.factura_id, r.monto);

    UPDATE public.facturas
       SET monto_pendiente = GREATEST(0, monto_pendiente - r.monto)
     WHERE id = r.factura_id AND tenant_id = v_dealer
    RETURNING monto_pendiente INTO v_pend;

    IF COALESCE(v_pend, 0) <= 0.01 THEN
      UPDATE public.facturas SET estado = 'PAGADA', monto_pendiente = 0
       WHERE id = r.factura_id AND tenant_id = v_dealer;
    END IF;
  END LOOP;

  -- El balance del cliente, igual que lo deja un recibo normal.
  UPDATE public.clientes
     SET balance = (SELECT COALESCE(SUM(monto_pendiente), 0) FROM public.facturas
                     WHERE cliente_id = v_cliente AND estado = 'PENDIENTE' AND tenant_id = v_dealer)
   WHERE id = v_cliente AND tenant_id = v_dealer;

  RETURN json_build_object(
    'ok', true, 'recibo', v_numero, 'total', v_total,
    'facturas', v_lineas, 'dealer', v_dealer, 'fecha', v_pago.fecha
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.sincronizar_pago_a_dealer(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sincronizar_pago_a_dealer(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- DESHACERLO
-- ------------------------------------------------------------
-- Hoy nada anula un pago a suplidor desde la pantalla (la columna `anulado`
-- existe y nadie la escribe). El dia que se agregue, tiene que llamar a
-- esto: si no, anular el pago dejaria el ingreso vivo en el dealer y el
-- hueco se abriria al reves.
CREATE OR REPLACE FUNCTION public.desincronizar_pago_a_dealer(p_pago_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin    uuid := public.get_user_tenant();
  v_dealer uuid;
  v_numero text;
  v_rec    record;
  v_pend   numeric;
BEGIN
  IF v_fin IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT numero INTO v_numero FROM public.pagos_suplidores
  WHERE id = p_pago_id AND tenant_id = v_fin;
  IF v_numero IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Ese pago no es de esta empresa');
  END IF;

  SELECT ce.tenant_id INTO v_dealer FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_fin AND ce.tenant_id <> v_fin LIMIT 1;
  IF v_dealer IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Sin dealer vinculado');
  END IF;

  -- Se devuelve lo abonado a cada factura y se marca el recibo anulado. No
  -- se borra: un ingreso que existio y se deshizo tiene que poder verse.
  FOR v_rec IN
    SELECT d.factura_id, d.monto_abonado, r.id AS recibo_id
    FROM public.recibos_ingreso r
    JOIN public.recibos_ingreso_detalle d ON d.recibo_id = r.id
    WHERE r.tenant_id = v_dealer
      AND r.origen = 'pago_suplidor:' || v_numero
      AND COALESCE(r.anulado, false) = false
  LOOP
    UPDATE public.facturas
       SET monto_pendiente = monto_pendiente + v_rec.monto_abonado,
           estado = 'PENDIENTE'
     WHERE id = v_rec.factura_id AND tenant_id = v_dealer;
  END LOOP;

  UPDATE public.recibos_ingreso SET anulado = true
   WHERE tenant_id = v_dealer AND origen = 'pago_suplidor:' || v_numero;

  RETURN json_build_object('ok', true, 'pago', v_numero);
END $$;

REVOKE EXECUTE ON FUNCTION public.desincronizar_pago_a_dealer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.desincronizar_pago_a_dealer(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('pago_a_suplidor_llega_al_dealer.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'sincronizar_pago_a_dealer')
       THEN 'OK  el pago llega al dealer' ELSE 'FALLO' END AS crear,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'desincronizar_pago_a_dealer')
       THEN 'OK  se puede deshacer' ELSE 'FALLO' END AS deshacer;
