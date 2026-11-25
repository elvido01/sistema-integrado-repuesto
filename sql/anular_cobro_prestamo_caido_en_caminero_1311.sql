-- ============================================================
-- ANULAR EL COBRO DE PRÉSTAMO QUE CAYÓ EN CAMINERO EL 13/11 (25/11/2026)
-- ============================================================
-- Confirmado por el dueño el 25/11 ("si anula"). Mismo error que el 28/09 y
-- el 25/11: el 13/11 a las 10:13 AM Yimber de León cobró RD$12,323.86 a
-- OSCAR M. DE LOS SANTOS ("SALDO PARA RENOVAR", cliente de MotoPréstamos)
-- con CAMINERO MOTORS activa → pago 0000074 + RI-0000074 sin aplicar nada
-- (balance 0 → 0, cero líneas). 7 minutos después lo cobró bien en
-- MotoPréstamos: 0148961, 3 cuotas, 12,323.86 → 0 (préstamo saldado). Ese NO se toca.
-- Caminero no cierra caja desde el 14/10: el 13/11 no está en ningún cierre.
-- ============================================================

DO $anular$
DECLARE
  c_cam     uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  c_cli     uuid := '1b1c1ba3-b96e-4c6f-9451-4cb43bcfe624';
  c_pago    uuid := '0537009f-0625-49b2-bee0-a2344412792a';   -- 0000074
  c_recibo  uuid := '23747621-83b7-4c2d-ae98-b8c57dda424c';   -- RI-0000074
  v_pago record; v_recibo record; v_res json;
BEGIN
  SELECT * INTO v_pago   FROM public.prestamo_pagos  WHERE id = c_pago;
  SELECT * INTO v_recibo FROM public.recibos_ingreso WHERE id = c_recibo;
  IF v_pago.anulado AND v_recibo.anulado THEN RAISE NOTICE 'Ya estaban anulados.'; RETURN; END IF;
  IF v_pago.id IS NULL OR v_pago.tenant_id <> c_cam OR v_pago.cliente_id <> c_cli
     OR v_pago.numero <> '0000074' OR v_pago.total_pagado <> 12323.86 THEN
    RAISE EXCEPTION 'EL PAGO NO ES EL QUE SE ESPERA: %', row_to_json(v_pago); END IF;
  IF v_recibo.id IS NULL OR v_recibo.tenant_id <> c_cam OR v_recibo.numero <> 'RI-0000074' OR v_recibo.monto_pagado <> 12323.86 THEN
    RAISE EXCEPTION 'EL RECIBO NO ES EL QUE SE ESPERA: %', row_to_json(v_recibo); END IF;
  IF EXISTS (SELECT 1 FROM public.prestamo_pago_detalle WHERE pago_id = c_pago) THEN
    RAISE EXCEPTION 'EL PAGO TIENE LÍNEAS DE CUOTA. Para y mira.'; END IF;
  IF EXISTS (SELECT 1 FROM public.cierres_caja WHERE tenant_id = c_cam AND created_at >= '2026-11-13 04:00+00') THEN
    RAISE EXCEPTION 'CAMINERO YA CERRÓ CAJA DESPUÉS DEL 13/11: los cierres no se tocan, decide con el dueño.'; END IF;

  v_res := public._anular_pago_prestamo('0000074', c_cam,
    'cobro de un préstamo de MotoPréstamos hecho con Caminero activa; el bueno es el 0148961 en MotoPréstamos');
  RAISE NOTICE 'Pago: %', v_res;
  UPDATE public.recibos_ingreso SET anulado = true WHERE id = c_recibo AND NOT anulado;
END $anular$;

SELECT public.registrar_migracion('anular_cobro_prestamo_caido_en_caminero_1311.sql');

DO $prueba$
DECLARE v_b record;
BEGIN
  IF NOT (SELECT anulado FROM public.prestamo_pagos WHERE id = '0537009f-0625-49b2-bee0-a2344412792a') THEN RAISE EXCEPTION 'PAGO 0000074 VIVO'; END IF;
  IF NOT (SELECT anulado FROM public.recibos_ingreso WHERE id = '23747621-83b7-4c2d-ae98-b8c57dda424c') THEN RAISE EXCEPTION 'RI-0000074 VIVO'; END IF;
  SELECT p.anulado, p.balance_actual, (SELECT count(*) FROM public.prestamo_pago_detalle d WHERE d.pago_id = p.id) lin
    INTO v_b FROM public.prestamo_pagos p WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND p.numero = '0148961';
  IF v_b.anulado OR v_b.lin <> 3 THEN RAISE EXCEPTION 'SE MOVIÓ EL BUENO 0148961: %', row_to_json(v_b); END IF;
END $prueba$;

SELECT json_build_object(
  'malo', (SELECT numero || ' anulado=' || anulado FROM public.prestamo_pagos WHERE id = '0537009f-0625-49b2-bee0-a2344412792a'),
  'ri',   (SELECT numero || ' anulado=' || anulado FROM public.recibos_ingreso WHERE id = '23747621-83b7-4c2d-ae98-b8c57dda424c'),
  'bueno',(SELECT numero || ' anulado=' || anulado || ' ' || balance_anterior || '→' || balance_actual FROM public.prestamo_pagos WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero = '0148961')) r;
