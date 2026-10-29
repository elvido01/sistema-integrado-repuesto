-- =====================================================================
-- AJUSTE I-7191 · MOTOR DE ARRANQUE CG200 GRIS RHYNO (Repuestos Morla) — 29/10/2026
-- ---------------------------------------------------------------------
-- El 14/08 la compra OC-0338 metió 4 uds; a las 11:33 se bajó a 0 desde la
-- ficha (SA-000439, −4) y a las 11:40 se editó la compra a 2 uds (quita las
-- 4 originales y mete 2). Las 4 se restaron dos veces → saldo −2.
-- Conteo físico del dueño 29/10: hay 2. Entrada de ajuste +4 → queda en 2.
-- Solo actúa si el saldo sigue en −2 (no se duplica si se corre otra vez).
-- =====================================================================
DO $$
DECLARE
  v_prod uuid;
  v_saldo numeric;
  v_num text;
BEGIN
  -- Actuar como el administrador de Morla (las RPC usan get_user_tenant / auth.uid).
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0a751661-5ec4-4136-a75c-b4d8493beae0","role":"authenticated"}', true);

  SELECT id INTO v_prod FROM public.productos
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND codigo = 'I-7191';
  SELECT COALESCE(SUM(cantidad), 0) INTO v_saldo FROM public.inventario_movimientos WHERE producto_id = v_prod;

  IF v_saldo <> -2 THEN
    RAISE NOTICE 'I-7191 tiene saldo %, no -2: no se ajusta.', v_saldo;
    RETURN;
  END IF;

  v_num := public.get_next_entrada_numero();
  PERFORM public.crear_entrada_inventario(
    jsonb_build_object(
      'numero', v_num,
      'fecha', (now() AT TIME ZONE 'America/Santo_Domingo')::date,
      'referencia', 'AJUSTE CONTEO FISICO',
      'concepto', 'AJUSTE DE INVENTARIO',
      'almacen_id', 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7',
      'notas', 'Corrige doble descuento 14/08 (SA-000439 + edición OC-0338). Conteo físico 29/10: 2 uds.',
      'total_costo', 4 * 867),
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod, 'codigo', 'I-7191',
      'descripcion', 'MOTOR DE ARRANQUE CG200 GRIS RHYNO',
      'cantidad', 4, 'unidad', 'UND - Unidad',
      'costo_unitario', 867, 'importe', 4 * 867)),
    'AJUSTE');
  RAISE NOTICE 'Entrada % creada: I-7191 queda en 2.', v_num;
END $$;

SELECT public.registrar_migracion('ajuste_i7191_morla.sql');
