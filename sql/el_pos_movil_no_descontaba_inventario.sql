-- ============================================================
-- EL POS MOVIL NO DESCONTABA EL INVENTARIO: SE REPONEN SUS SALIDAS
-- ============================================================
-- El dueno pregunto el 11/09/2026 si las facturas hechas con la app movil
-- descontaban del inventario. No: NUNCA lo hicieron.
--
-- La existencia es la suma del kardex (inventario_movimientos). La web
-- escribe la SALIDA desde el navegador despues de grabar la factura
-- (src/hooks/useVentas.js). El POS movil (mobile/app/(tabs)/pos.tsx) grababa
-- la factura y sus lineas y ahi terminaba, y en la base no hay trigger que lo
-- supla. Resultado: 49 facturas de REPUESTOS MORLA, del 24/06 al 11/09/2026,
-- 87 lineas, 99 unidades que siguen figurando como existencia. Todas PAGADA,
-- ninguna editada ni anulada desde la web (no hay movimientos con su numero).
-- Ademas sus 87 lineas se grabaron con costo_unitario = 0.
--
-- La app ya escribe su salida (mismo dia). Esto repara lo de antes.
--
-- >>> QUE HACE <<<
-- · Pone el costo en facturas_detalle.costo_unitario donde esta en 0: la
--   ultima COMPRA del producto hasta el dia de la venta; si no hay, el costo
--   actual de la ficha.
-- · Escribe la SALIDA que falto, una por linea, con la FECHA y el numero de su
--   factura (FT-<numero>) y ese costo: la misma que habria escrito la web.
--
-- >>> LO QUE NO HACE, A PROPOSITO <<<
-- · No repone una linea si DESPUES de esa venta el producto tuvo un ajuste,
--   traslado o fusion (cualquier movimiento que no sea FT-/COMPRA-/DEV). Hoy
--   son 6 lineas: RM131 AGUA COOL HEAVEN (FT-2485, 2501, 3016, 3017) y
--   842071003517 ACEITE HAVOLINE 40 (FT-3079, 3080). Las dos se ajustaron
--   "DESDE FICHA": alguien escribio a mano la existencia real, que ya tenia
--   esas ventas descontadas. Reponerlas restaria dos veces. Su costo SI se pone.
-- · Es idempotente: una linea que ya tiene su salida no se toca. Correrlo otra
--   vez (por ejemplo, para recoger facturas de un telefono que tardo en
--   actualizarse) no descuenta dos veces.
--
-- >>> EFECTO SECUNDARIO ESPERADO <<<
-- trg_venta_alimenta_orden ve estas salidas como ventas: si un producto queda
-- en 0 o menos, lo pone en el borrador de su suplidor ("Se acabo al vender
-- FT-..."). Es lo correcto: esa existencia no estaba.
-- ============================================================

SELECT public.registrar_migracion('el_pos_movil_no_descontaba_inventario.sql');

-- 1. El costo de cada linea del POS movil que quedo en 0.
UPDATE public.facturas_detalle d
   SET costo_unitario = c.costo
  FROM (
    SELECT d2.id,
           COALESCE(
             (SELECT m.costo_unitario
                FROM public.inventario_movimientos m
               WHERE m.tenant_id = f.tenant_id
                 AND m.producto_id = d2.producto_id
                 AND m.referencia_doc ILIKE 'COMPRA-%'
                 AND m.fecha <= f.fecha
                 AND COALESCE(m.costo_unitario, 0) > 0
               ORDER BY m.fecha DESC
               LIMIT 1),
             NULLIF(p.costo, 0),
             0) AS costo
      FROM public.facturas f
      JOIN public.facturas_detalle d2 ON d2.factura_id = f.id
      LEFT JOIN public.productos p ON p.id = d2.producto_id
     WHERE COALESCE(f.notas, '') ILIKE '%POS_MOVIL%'
       AND COALESCE(d2.costo_unitario, 0) = 0
  ) c
 WHERE d.id = c.id
   AND c.costo > 0;

-- 2. La salida que falto, con la fecha y el numero de su factura.
INSERT INTO public.inventario_movimientos
  (tenant_id, producto_id, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, fecha)
SELECT f.tenant_id, d.producto_id, 'SALIDA', -d.cantidad,
       COALESCE(d.costo_unitario, 0), 'FT-' || f.numero, f.usuario_id, f.fecha
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
 WHERE COALESCE(f.notas, '') ILIKE '%POS_MOVIL%'
   AND UPPER(COALESCE(f.estado, '')) <> 'ANULADA'   -- anulada sin salida: no hay nada que restar
   AND d.producto_id IS NOT NULL
   AND COALESCE(d.cantidad, 0) <> 0
   -- ya tiene su salida (la app nueva, o una corrida anterior de este archivo)
   AND NOT EXISTS (
     SELECT 1 FROM public.inventario_movimientos m
      WHERE m.tenant_id = f.tenant_id
        AND m.producto_id = d.producto_id
        AND m.referencia_doc = 'FT-' || f.numero)
   -- despues de la venta alguien ajusto la existencia a mano: ya la conto
   AND NOT EXISTS (
     SELECT 1 FROM public.inventario_movimientos m
      WHERE m.tenant_id = f.tenant_id
        AND m.producto_id = d.producto_id
        AND m.fecha > f.fecha
        AND COALESCE(m.referencia_doc, '') !~* '^(FT-|COMPRA-|DEV)');

DO $prueba$
DECLARE
  v_faltan    int;
  v_sin_costo int;
BEGIN
  SELECT count(*) INTO v_faltan
    FROM public.facturas f
    JOIN public.facturas_detalle d ON d.factura_id = f.id
   WHERE COALESCE(f.notas, '') ILIKE '%POS_MOVIL%'
     AND UPPER(COALESCE(f.estado, '')) <> 'ANULADA'
     AND d.producto_id IS NOT NULL
     AND COALESCE(d.cantidad, 0) <> 0
     AND NOT EXISTS (
       SELECT 1 FROM public.inventario_movimientos m
        WHERE m.tenant_id = f.tenant_id AND m.producto_id = d.producto_id
          AND m.referencia_doc = 'FT-' || f.numero)
     AND NOT EXISTS (
       SELECT 1 FROM public.inventario_movimientos m
        WHERE m.tenant_id = f.tenant_id AND m.producto_id = d.producto_id
          AND m.fecha > f.fecha
          AND COALESCE(m.referencia_doc, '') !~* '^(FT-|COMPRA-|DEV)');
  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'Quedan % lineas del POS movil sin su salida', v_faltan;
  END IF;

  SELECT count(*) INTO v_sin_costo
    FROM public.facturas f
    JOIN public.facturas_detalle d ON d.factura_id = f.id
    JOIN public.productos p ON p.id = d.producto_id
   WHERE COALESCE(f.notas, '') ILIKE '%POS_MOVIL%'
     AND COALESCE(d.costo_unitario, 0) = 0
     AND COALESCE(p.costo, 0) > 0;
  IF v_sin_costo > 0 THEN
    RAISE EXCEPTION 'Quedan % lineas del POS movil con costo 0 teniendo la ficha costo', v_sin_costo;
  END IF;
END $prueba$;
