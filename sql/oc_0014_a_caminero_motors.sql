-- =====================================================================
-- OC-0014 (Motores del Sur, factura 029017) → CAMINERO MOTORS
-- ---------------------------------------------------------------------
-- (2026-10-01) La compra de 18 motos Loncin (US$28,475 = RD$1,699,957.50 a
-- 59.70, financiada en 6 pagarés) se digitó el 01/10 en MotoPréstamos Los
-- Naranjos (766fe3d6) pero es de CAMINERO MOTORS (b39506c3). Pedido del dueño:
-- moverla de empresa.
--
-- Lo que se comprobó antes:
--   * El suplidor (MOTORES DEL SUR) y los 18 productos (chasis) ya son de
--     Caminero: por eso en MotoPréstamos el suplidor salía "N/A".
--   * Caminero no tiene la factura 029017 y su última compra es OC-0013:
--     OC-0014 cae justo en su numeración. Ningún chasis está en otra compra.
--   * Sin pagos aplicados ni orden de compra enlazada. Costos de producto
--     iguales a los de la compra (no hay precios que actualizar).
--   * Las motos NUNCA entraron al inventario (0 movimientos): la entrada se
--     perdió al grabar productos de Caminero dentro de MotoPréstamos. Se hace
--     aquí igual que la OC-0013: ENTRADA por chasis, 'COMPRA-OC-0014', fecha
--     de la compra, a su costo.
--
-- Si algo no está como se encontró, no toca nada. Idempotente.
-- =====================================================================

DO $$
DECLARE
  v_de     constant uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MotoPréstamos Los Naranjos
  v_a      constant uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- Caminero Motors
  v_ids    constant uuid[] := ARRAY[
    '2c02b53c-d42a-4476-8d4e-e3be451b9311','ea74486d-41c9-46b5-a1b8-d024c9b569b7',
    'd8010dd7-1fbc-4af8-91d6-3fad3cf0fc02','e6494922-91cb-4370-8120-6b0868d67f9d',
    'be26e0f1-ddef-45ef-8db6-fa9077f23b2b','4469d789-c739-4da8-b978-2f16b613e718']::uuid[];
  v_lineas constant uuid := '2c02b53c-d42a-4476-8d4e-e3be451b9311';  -- pagaré 1/6 lleva el detalle
  n int;
BEGIN
  IF (SELECT count(*) FROM public.compras WHERE id = ANY (v_ids) AND tenant_id = v_a) = 6 THEN
    RAISE NOTICE 'Ya estaba en Caminero Motors.';
    RETURN;
  END IF;

  -- Comprobaciones: exactamente lo que se encontró.
  IF (SELECT count(*) FROM public.compras WHERE id = ANY (v_ids) AND tenant_id = v_de AND numero LIKE 'OC-0014-0%') <> 6 THEN
    RAISE EXCEPTION 'Los 6 pagarés de OC-0014 no están como se esperaba en MotoPréstamos';
  END IF;
  IF (SELECT sum(total_compra) FROM public.compras WHERE id = ANY (v_ids)) <> 1699957.50 THEN
    RAISE EXCEPTION 'El total no es 1,699,957.50';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos_suplidores_detalle WHERE compra_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'Tiene pagos aplicados: revisar a mano';
  END IF;
  IF EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = v_a AND numero LIKE 'OC-0014%') THEN
    RAISE EXCEPTION 'Caminero ya tiene una OC-0014';
  END IF;
  IF EXISTS (SELECT 1 FROM public.compras_detalle d JOIN public.productos p ON p.id = d.producto_id
              WHERE d.compra_id = v_lineas AND p.tenant_id <> v_a) THEN
    RAISE EXCEPTION 'Hay productos de la compra que no son de Caminero';
  END IF;

  UPDATE public.compras SET tenant_id = v_a, updated_at = now()
   WHERE id = ANY (v_ids) AND tenant_id = v_de;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 6 THEN RAISE EXCEPTION 'pagarés movidos: % de 6', n; END IF;

  UPDATE public.compras_detalle SET tenant_id = v_a
   WHERE compra_id = ANY (v_ids) AND tenant_id = v_de;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 18 THEN RAISE EXCEPTION 'líneas movidas: % de 18', n; END IF;

  -- La entrada al inventario que nunca se hizo (solo si no existe ya).
  INSERT INTO public.inventario_movimientos
    (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, tenant_id)
  SELECT d.producto_id, c.fecha::timestamptz, 'ENTRADA', d.cantidad, d.costo_unitario,
         'COMPRA-OC-0014', c.usuario_id, v_a
    FROM public.compras_detalle d
    JOIN public.compras c ON c.id = d.compra_id
   WHERE d.compra_id = v_lineas
     AND NOT EXISTS (SELECT 1 FROM public.inventario_movimientos m
                      WHERE m.producto_id = d.producto_id AND m.referencia_doc = 'COMPRA-OC-0014');
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 18 THEN RAISE EXCEPTION 'entradas de inventario: % de 18', n; END IF;
END $$;

SELECT public.registrar_migracion('oc_0014_a_caminero_motors.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) || ' pagarés / ' || sum(total_compra) FROM public.compras
    WHERE numero LIKE 'OC-0014-0%' AND tenant_id = 'b39506c3-27dc-467d-830b-096731b83113') AS en_caminero,
  (SELECT count(*) FROM public.compras
    WHERE numero LIKE 'OC-0014-0%' AND tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS quedan_en_motoprestamos,
  (SELECT count(*) FROM public.inventario_movimientos
    WHERE referencia_doc = 'COMPRA-OC-0014' AND tenant_id = 'b39506c3-27dc-467d-830b-096731b83113') AS motos_con_entrada;
