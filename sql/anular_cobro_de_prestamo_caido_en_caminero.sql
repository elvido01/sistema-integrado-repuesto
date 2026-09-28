-- ============================================================
-- ANULAR EL COBRO DE PRÉSTAMO QUE CAYÓ EN CAMINERO
-- ============================================================
-- Reparación de una vez. Decisión del dueño, 28/09/2026.
--
-- A las 2:44 PM, Yerlin Caraballo cobró RD$8,000 del préstamo PT-0026436
-- (Jean Dieumaitre, cliente de MotoPréstamos) con CAMINERO MOTORS como empresa
-- activa. `registrar_pago_prestamo` resuelve la empresa por la activa y:
--
--   · no comprobó que el cliente fuera de esa empresa,
--   · se saltó en silencio las 29 cuotas (no estaban en Caminero),
--   · y grabó igual un pago de 8,000 que no aplicó a nada (balance 0 → 0),
--     con su recibo de caja en Caminero.
--
-- Quedaron en Caminero:
--   prestamo_pagos   0000001    8,000  (cero líneas de cuota)
--   recibos_ingreso  RI-000068  8,000  Efectivo  ← este es el que infla la caja
--
-- El cobro BUENO lo hizo Yimber de León 8 minutos después, en MotoPréstamos:
--   prestamo_pagos 0148412 + recibos_ingreso RI-148412, cuotas 192→220,
--   balance 102,180.79 → 94,180.79. Ese NO se toca: el préstamo está bien y
--   el dinero se cobró una sola vez.
--
-- >>> POR QUÉ NO BASTA CON LA FUNCIÓN OFICIAL <<<
-- `_anular_pago_prestamo` anula el pago y busca su recibo de caja comparando
-- los DÍGITOS de los dos números. En MotoPréstamos siempre cuadran
-- (0148412 ↔ RI-148412). En Caminero no: el pago es 0000001 y el recibo es
-- RI-000068, porque Caminero ya tenía su propia numeración de recibos por las
-- ventas. Con solo la función, el pago quedaría anulado y el RI-000068 VIVO:
-- los 8,000 seguirían contando en el cuadre. Por eso aquí se anulan las dos
-- cosas, el recibo por su id.
--
-- La caja de Caminero del 28/09 NO está cerrada (comprobado: cero filas en
-- cierres_caja), así que esto no toca ningún cierre. Sin triggers en
-- recibos_ingreso ni prestamo_pagos: anular no dispara nada por detrás.
--
-- Guardias: si cualquiera de las dos filas no es exactamente la que se
-- espera (empresa, cliente, monto, sin anular), no se toca nada.
-- ============================================================

DO $anular$
DECLARE
  c_caminero   uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  c_jean       uuid := '78168a11-3c13-49cf-9d45-5fe64be4f39b';
  c_pago       uuid := '2d2aa53c-e020-41d2-8130-aa304b782e57';  -- prestamo_pagos 0000001
  c_recibo     uuid := '4c627f08-d6ae-408a-9d06-b8e8e00477c4';  -- recibos_ingreso RI-000068
  v_pago       record;
  v_recibo     record;
  v_lineas     int;
  v_cierre     int;
  v_res        json;
BEGIN
  SELECT * INTO v_pago   FROM public.prestamo_pagos  WHERE id = c_pago;
  SELECT * INTO v_recibo FROM public.recibos_ingreso WHERE id = c_recibo;

  -- Ya hecho: no se repite.
  IF v_pago.anulado AND v_recibo.anulado THEN
    RAISE NOTICE 'Ya estaban anulados los dos. No se toca nada.';
    RETURN;
  END IF;

  -- ── Que sean exactamente las filas que se esperan ──────────────────
  IF v_pago.id IS NULL OR v_pago.tenant_id <> c_caminero OR v_pago.cliente_id <> c_jean
     OR v_pago.numero <> '0000001' OR v_pago.total_pagado <> 8000 THEN
    RAISE EXCEPTION 'EL PAGO NO ES EL QUE SE ESPERA: %', row_to_json(v_pago);
  END IF;
  IF v_recibo.id IS NULL OR v_recibo.tenant_id <> c_caminero OR v_recibo.cliente_id <> c_jean
     OR v_recibo.numero <> 'RI-000068' OR v_recibo.monto_pagado <> 8000 THEN
    RAISE EXCEPTION 'EL RECIBO NO ES EL QUE SE ESPERA: %', row_to_json(v_recibo);
  END IF;

  -- El pago no puede haber aplicado nada: si tuviera cuotas, anularlo las
  -- movería, y aquí no se ha decidido eso.
  SELECT count(*) INTO v_lineas FROM public.prestamo_pago_detalle WHERE pago_id = c_pago;
  IF v_lineas <> 0 THEN
    RAISE EXCEPTION 'EL PAGO TIENE % LÍNEAS DE CUOTA: anularlo movería cuotas. Para y mira.', v_lineas;
  END IF;

  -- La caja del día, abierta.
  SELECT count(*) INTO v_cierre FROM public.cierres_caja
   WHERE tenant_id = c_caminero AND created_at >= '2026-09-28 04:00+00';
  IF v_cierre > 0 THEN
    RAISE EXCEPTION 'LA CAJA DE CAMINERO DEL 28/09 YA SE CERRÓ (% cierre/s). Los cierres no se tocan: decide con el dueño.', v_cierre;
  END IF;

  -- ── 1. El pago, por la función oficial ─────────────────────────────
  v_res := public._anular_pago_prestamo('0000001', c_caminero,
    'cobro de un préstamo de MotoPréstamos hecho con Caminero activa; el bueno es el 0148412 en MotoPréstamos');
  RAISE NOTICE 'Pago: %', v_res;

  -- ── 2. El recibo de caja, por su id (la función no lo encuentra) ───
  UPDATE public.recibos_ingreso SET anulado = true
   WHERE id = c_recibo AND NOT anulado;

  RAISE NOTICE 'Recibo RI-000068 anulado.';
END $anular$;

SELECT public.registrar_migracion('anular_cobro_de_prestamo_caido_en_caminero.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que lo malo quedó anulado Y que lo bueno sigue intacto. Si lo bueno se
-- hubiera movido, esto revienta.
DO $prueba$
DECLARE
  v_malo_pago   boolean;
  v_malo_recibo boolean;
  v_bueno_pago  record;
  v_bueno_rec   boolean;
BEGIN
  SELECT anulado INTO v_malo_pago   FROM public.prestamo_pagos  WHERE id = '2d2aa53c-e020-41d2-8130-aa304b782e57';
  SELECT anulado INTO v_malo_recibo FROM public.recibos_ingreso WHERE id = '4c627f08-d6ae-408a-9d06-b8e8e00477c4';

  IF NOT v_malo_pago THEN   RAISE EXCEPTION 'EL PAGO 0000001 SIGUE VIVO en Caminero.'; END IF;
  IF NOT v_malo_recibo THEN RAISE EXCEPTION 'EL RECIBO RI-000068 SIGUE VIVO: los 8,000 siguen en la caja de Caminero.'; END IF;

  SELECT pp.anulado, pp.total_pagado, pp.balance_actual,
         (SELECT count(*) FROM public.prestamo_pago_detalle d WHERE d.pago_id = pp.id) AS lineas,
         (SELECT sum(d.abono_total) FROM public.prestamo_pago_detalle d WHERE d.pago_id = pp.id) AS suma
    INTO v_bueno_pago
    FROM public.prestamo_pagos pp WHERE pp.id = 'bab4a8e0-dc60-4f46-baa9-6490e3ab3223';

  IF v_bueno_pago.anulado OR v_bueno_pago.lineas <> 29 OR v_bueno_pago.suma <> 8000 THEN
    RAISE EXCEPTION 'SE MOVIÓ EL COBRO BUENO 0148412: %', row_to_json(v_bueno_pago);
  END IF;

  SELECT anulado INTO v_bueno_rec FROM public.recibos_ingreso WHERE id = '06c83940-2f6c-4262-9de8-0a15ec84040b';
  IF v_bueno_rec THEN RAISE EXCEPTION 'SE ANULÓ EL RECIBO BUENO RI-148412.'; END IF;

  RAISE NOTICE 'Lo malo anulado, lo bueno intacto.';
END $prueba$;

SELECT json_build_object(
  'caminero_recibos_vivos_de_prestamo_hoy', (SELECT count(*) FROM public.recibos_ingreso
      WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
        AND concepto = 'Pago de prestamo (financiera)' AND NOT anulado),
  'recibo_malo',  (SELECT json_build_object('numero', numero, 'anulado', anulado) FROM public.recibos_ingreso
                    WHERE id = '4c627f08-d6ae-408a-9d06-b8e8e00477c4'),
  'pago_malo',    (SELECT json_build_object('numero', numero, 'anulado', anulado, 'comentarios', comentarios)
                     FROM public.prestamo_pagos WHERE id = '2d2aa53c-e020-41d2-8130-aa304b782e57'),
  'cobro_bueno',  (SELECT json_build_object('numero', numero, 'anulado', anulado, 'balance', balance_anterior || ' → ' || balance_actual)
                     FROM public.prestamo_pagos WHERE id = 'bab4a8e0-dc60-4f46-baa9-6490e3ab3223')
) AS r;
