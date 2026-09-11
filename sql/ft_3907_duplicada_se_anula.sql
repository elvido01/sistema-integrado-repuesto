-- ============================================================
-- FT-3907 DE REPUESTOS MORLA ERA UN DOBLE TOQUE EN "COBRAR": SE ANULA
-- ============================================================
-- El 10/09/2026 el POS movil grabo FT-3906 (9:37:30) y FT-3907 (9:38:14):
-- mismo usuario, mismos 3 articulos (Havoline 40, mica TVS 100, tapita falda
-- TVS 100), mismo total RD$1,269.99, RD$1,270 recibidos en cada una. El boton
-- se deshabilitaba un render tarde. Arreglado en la app (commit 39acfc82).
-- El dueno confirmo el 11/09/2026 que FT-3907 sobra.
--
-- >>> QUE HACE <<<
-- 1. FT-3907 queda ANULADA, en MAYUSCULAS: es lo que excluyen el 607, el
--    cierre de caja, rentabilidad y el dashboard. (facturasRepository.anular
--    escribe 'Anulada' y una columna anulada_at que no existe: no se usa.)
--    Las notas conservan POS_MOVIL, que es como el cierre reconoce la venta
--    movil.
-- 2. Sus 3 piezas vuelven al kardex con ENTRADA 'FT-ANUL-3907', fechadas en el
--    mismo instante de la factura: la historia del inventario queda como si
--    el duplicado no hubiera existido.
-- 3. La reposicion de ayer (el_pos_movil_no_descontaba_inventario.sql) al
--    restar FT-3907 dejo la mica 005296 en 0, y trg_venta_alimenta_orden la
--    puso en un borrador ("Se acabo al vender FT-3907"). Con la anulacion le
--    queda 1: esa linea sobra y se quita. Solo esa: la creada en el instante
--    exacto de aquella reposicion, sin nada recibido, y solo si la pieza
--    queda con existencia. Si la orden la abrio la misma reposicion y queda
--    vacia, se va tambien.
--
-- >>> LO QUE NO TOCA <<<
-- · Ningun cierre de caja: el 10/09 de Morla todavia no se ha cerrado, y al
--   cerrarlo FT-3907 ya no sumara.
-- · La DGII: FT-3907 no tiene NCF ni documento fiscal.
-- Es idempotente: correrlo otra vez no devuelve las piezas dos veces.
-- ============================================================

SELECT public.registrar_migracion('ft_3907_duplicada_se_anula.sql');

-- 1. La factura.
UPDATE public.facturas
   SET estado          = 'ANULADA',
       monto_pendiente = 0,
       notas           = 'POS_MOVIL · ANULADA 11/09/2026: duplicada de FT-3906 (doble toque en Cobrar)',
       updated_at      = now()
 WHERE id = '117a037c-770a-48b8-809e-589dd8cec02e'
   AND numero = 3907;

-- 2. Las piezas vuelven.
INSERT INTO public.inventario_movimientos
  (tenant_id, producto_id, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, fecha)
SELECT f.tenant_id, d.producto_id, 'ENTRADA', d.cantidad,
       COALESCE(d.costo_unitario, 0), 'FT-ANUL-3907', f.usuario_id, f.fecha
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
 WHERE f.id = '117a037c-770a-48b8-809e-589dd8cec02e'
   AND d.producto_id IS NOT NULL
   AND COALESCE(d.cantidad, 0) <> 0
   AND NOT EXISTS (
     SELECT 1 FROM public.inventario_movimientos m
      WHERE m.tenant_id = f.tenant_id
        AND m.producto_id = d.producto_id
        AND m.referencia_doc = 'FT-ANUL-3907');

-- 3. La linea de borrador que creo la salida duplicada.
DELETE FROM public.ordenes_compra_detalle d
 USING public.ordenes_compra oc
 WHERE oc.id = d.orden_compra_id
   AND oc.tenant_id = (SELECT tenant_id FROM public.facturas WHERE id = '117a037c-770a-48b8-809e-589dd8cec02e')
   AND d.producto_id IN (SELECT producto_id FROM public.facturas_detalle
                          WHERE factura_id = '117a037c-770a-48b8-809e-589dd8cec02e')
   AND d.decision_estado = 'agotado_en_venta'
   AND d.decision_motivo = 'Se acabo al vender FT-3907'
   AND d.created_at = '2026-09-11 19:55:49.792568+00'
   AND COALESCE(d.cantidad_recibida, 0) = 0
   AND public.get_stock_actual(d.producto_id) > 0;

-- 4. Su orden, solo si la abrio esa misma reposicion y quedo vacia.
DELETE FROM public.ordenes_compra oc
 WHERE oc.tenant_id = (SELECT tenant_id FROM public.facturas WHERE id = '117a037c-770a-48b8-809e-589dd8cec02e')
   AND oc.created_at = '2026-09-11 19:55:49.792568+00'
   AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
   AND NOT EXISTS (SELECT 1 FROM public.ordenes_compra_detalle d WHERE d.orden_compra_id = oc.id);

DO $prueba$
DECLARE
  v_estado text;
  v_neto   numeric;
  v_sobra  int;
BEGIN
  SELECT estado INTO v_estado FROM public.facturas WHERE id = '117a037c-770a-48b8-809e-589dd8cec02e';
  IF v_estado IS DISTINCT FROM 'ANULADA' THEN
    RAISE EXCEPTION 'FT-3907 no quedo ANULADA (esta %)', v_estado;
  END IF;

  -- lo que FT-3907 resto y lo que FT-ANUL-3907 devolvio tienen que dar cero
  SELECT COALESCE(sum(abs(t.neto)), 0) INTO v_neto FROM (
    SELECT m.producto_id, sum(m.cantidad) neto
      FROM public.inventario_movimientos m
     WHERE m.tenant_id = (SELECT tenant_id FROM public.facturas WHERE id = '117a037c-770a-48b8-809e-589dd8cec02e')
       AND m.referencia_doc IN ('FT-3907', 'FT-ANUL-3907')
     GROUP BY m.producto_id) t;
  IF v_neto <> 0 THEN
    RAISE EXCEPTION 'FT-3907 y su devolucion no se anulan entre si (diferencia %)', v_neto;
  END IF;

  SELECT count(*) INTO v_sobra
    FROM public.ordenes_compra_detalle d
   WHERE d.decision_motivo = 'Se acabo al vender FT-3907'
     AND public.get_stock_actual(d.producto_id) > 0;
  IF v_sobra > 0 THEN
    RAISE EXCEPTION 'Sigue en borrador % linea(s) "agotada" por FT-3907 con existencia', v_sobra;
  END IF;
END $prueba$;
