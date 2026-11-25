-- ============================================================
-- ANULAR EL COBRO DE PRÉSTAMO QUE CAYÓ EN MOTOPRÉSTAMOS (25/11/2026)
-- ============================================================
-- Reparación de una vez. Decisión del dueño, 25/11/2026: solo anular (igual
-- que el 28/09, ver anular_cobro_de_prestamo_caido_en_caminero.sql). NO se
-- blindó registrar_pago_prestamo: el agujero sigue abierto por decisión suya.
--
-- A las 2:22 PM, Yerlin Caraballo cobró RD$3,650 a PABEL N. MONTERO SANTANA
-- (préstamo de INVERSIONES LOS NARANJOS) con MOTOPRÉSTAMOS LOS NARANJOS Y
-- CAMINERO MOTORS como empresa activa. registrar_pago_prestamo no aplicó nada
-- (balance 0 → 0, cero líneas) y grabó igual el pago y su recibo de caja:
--   prestamo_pagos   0149106     3,650  (cero líneas)
--   recibos_ingreso  RI-0149106  3,650  Efectivo  ← infla la caja, sale "Cliente Genérico"
--
-- El cobro BUENO se hizo 4 minutos después en INVERSIONES LOS NARANJOS:
--   prestamo_pagos 0004337 + RI-0004337, balance 18,250 → 14,600. NO se toca.
--
-- La caja de MotoPréstamos del 25/11 NO está cerrada (último cierre: 24/11).
-- El recibo se anula también por su id (la función oficial lo busca por los
-- dígitos; aquí cuadran, pero así no depende de eso).
-- ============================================================

DO $anular$
DECLARE
  c_mp      uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';   -- Motoprestamos los narajos y caminero motors
  c_pabel   uuid := '2f3239d6-ef2c-4939-9d07-5434490849d9';
  c_pago    uuid := '0cec6372-6764-4feb-8bb7-e149d34fa676';   -- prestamo_pagos 0149106
  c_recibo  uuid := '37d772e0-ee5b-440c-bfa1-364053dbeb78';   -- recibos_ingreso RI-0149106
  v_pago record; v_recibo record; v_lineas int; v_cierre int; v_res json;
BEGIN
  SELECT * INTO v_pago   FROM public.prestamo_pagos  WHERE id = c_pago;
  SELECT * INTO v_recibo FROM public.recibos_ingreso WHERE id = c_recibo;

  IF v_pago.anulado AND v_recibo.anulado THEN
    RAISE NOTICE 'Ya estaban anulados los dos. No se toca nada.';
    RETURN;
  END IF;

  IF v_pago.id IS NULL OR v_pago.tenant_id <> c_mp OR v_pago.cliente_id <> c_pabel
     OR v_pago.numero <> '0149106' OR v_pago.total_pagado <> 3650 THEN
    RAISE EXCEPTION 'EL PAGO NO ES EL QUE SE ESPERA: %', row_to_json(v_pago);
  END IF;
  IF v_recibo.id IS NULL OR v_recibo.tenant_id <> c_mp OR v_recibo.cliente_id <> c_pabel
     OR v_recibo.numero <> 'RI-0149106' OR v_recibo.monto_pagado <> 3650 THEN
    RAISE EXCEPTION 'EL RECIBO NO ES EL QUE SE ESPERA: %', row_to_json(v_recibo);
  END IF;

  SELECT count(*) INTO v_lineas FROM public.prestamo_pago_detalle WHERE pago_id = c_pago;
  IF v_lineas <> 0 THEN
    RAISE EXCEPTION 'EL PAGO TIENE % LÍNEAS DE CUOTA: anularlo movería cuotas. Para y mira.', v_lineas;
  END IF;

  SELECT count(*) INTO v_cierre FROM public.cierres_caja
   WHERE tenant_id = c_mp AND created_at >= '2026-11-25 04:00+00';
  IF v_cierre > 0 THEN
    RAISE EXCEPTION 'LA CAJA DE MOTOPRÉSTAMOS DEL 25/11 YA SE CERRÓ (% cierre/s). Los cierres no se tocan: decide con el dueño.', v_cierre;
  END IF;

  v_res := public._anular_pago_prestamo('0149106', c_mp,
    'cobro de un préstamo de Inversiones Los Naranjos hecho con MotoPréstamos activa; el bueno es el 0004337 en Los Naranjos');
  RAISE NOTICE 'Pago: %', v_res;

  UPDATE public.recibos_ingreso SET anulado = true WHERE id = c_recibo AND NOT anulado;
END $anular$;

SELECT public.registrar_migracion('anular_cobro_prestamo_caido_en_motoprestamos_2511.sql');

-- VERIFICACIÓN: lo malo anulado y lo bueno intacto.
DO $prueba$
DECLARE v_bueno record;
BEGIN
  IF NOT (SELECT anulado FROM public.prestamo_pagos WHERE id = '0cec6372-6764-4feb-8bb7-e149d34fa676') THEN
    RAISE EXCEPTION 'EL PAGO 0149106 SIGUE VIVO.'; END IF;
  IF NOT (SELECT anulado FROM public.recibos_ingreso WHERE id = '37d772e0-ee5b-440c-bfa1-364053dbeb78') THEN
    RAISE EXCEPTION 'EL RECIBO RI-0149106 SIGUE VIVO.'; END IF;
  SELECT pp.anulado, pp.balance_anterior, pp.balance_actual,
         (SELECT COALESCE(sum(d.abono_total), 0) FROM public.prestamo_pago_detalle d WHERE d.pago_id = pp.id) AS suma
    INTO v_bueno FROM public.prestamo_pagos pp WHERE pp.id = '66ea9446-1435-49fa-b9d9-803da01e009e';
  IF v_bueno.anulado OR v_bueno.balance_actual <> 14600 THEN
    RAISE EXCEPTION 'SE MOVIÓ EL COBRO BUENO 0004337: %', row_to_json(v_bueno); END IF;
  IF (SELECT anulado FROM public.recibos_ingreso WHERE id = '60c5b74e-590c-48ea-9918-8b3f1421483f') THEN
    RAISE EXCEPTION 'SE ANULÓ EL RECIBO BUENO RI-0004337.'; END IF;
  RAISE NOTICE 'Lo malo anulado, lo bueno intacto (suma de cuotas del bueno: %).', v_bueno.suma;
END $prueba$;

SELECT json_build_object(
  'pago_malo',   (SELECT json_build_object('numero', numero, 'anulado', anulado) FROM public.prestamo_pagos WHERE id = '0cec6372-6764-4feb-8bb7-e149d34fa676'),
  'recibo_malo', (SELECT json_build_object('numero', numero, 'anulado', anulado) FROM public.recibos_ingreso WHERE id = '37d772e0-ee5b-440c-bfa1-364053dbeb78'),
  'cobro_bueno', (SELECT json_build_object('numero', numero, 'anulado', anulado, 'balance', balance_anterior || ' → ' || balance_actual) FROM public.prestamo_pagos WHERE id = '66ea9446-1435-49fa-b9d9-803da01e009e')
) AS r;
