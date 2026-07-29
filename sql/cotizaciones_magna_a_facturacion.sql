-- =====================================================================
-- COTIZACIONES MAGNA → FACTURACIÓN
-- ---------------------------------------------------------------------
-- (2026-07-29) Reportado: "al módulo de cotizaciones Magna le falta poder
-- enviar las cotizaciones al módulo de facturación."
--
-- Cierto: el módulo cotizaba y ahí se quedaba. Para cobrarle a Magna había
-- que teclear la factura a mano, orden por orden, con el riesgo de
-- equivocar un monto o saltarse una orden completa.
--
-- >>> POR QUÉ HACÍA FALTA ESTE SCRIPT <<<
-- Una cotización Magna no tiene productos detrás: cada línea es una ORDEN
-- DE TRABAJO con su chasis, su valor de repuestos y su mano de obra. La
-- factura, en cambio, exige un producto por línea — hoy no existe ni una
-- sola línea de factura sin producto.
--
-- La salida es un producto de SERVICIO que sostiene las líneas. La
-- descripción de cada línea lleva la orden y el chasis:
--
--   Orden 852 · MD2A76BX6TW347461        2,826.10
--   Orden 861 · MD2A76BX8TW351102        4,177.20
--
-- que es como Magna concilia. Una línea por orden, con repuestos y mano de
-- obra sumados: en la cotización el ITBIS se calcula sobre el total de la
-- línea, así que separarlos no cambiaría ni un centavo del impuesto.
--
-- >>> ITBIS <<<
-- El producto va con 18%, igual que la cotización (subtotal + 18% = total).
-- El precio que se manda a la factura ya viene multiplicado por 1.18, porque
-- la factura trabaja con precios ITBIS incluido: sin eso se le descontaría
-- el impuesto al monto acordado y se cobraría de menos.
--
-- >>> STOCK <<<
-- stock_mode = 'manual': es un servicio, no una pieza. Que no salga a
-- buscar existencia de algo que no se almacena.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_id    uuid;
BEGIN
  SELECT id INTO v_id FROM public.productos
   WHERE tenant_id = v_morla AND codigo = 'SERV-MAGNA';

  IF v_id IS NULL THEN
    INSERT INTO public.productos
      (tenant_id, codigo, descripcion, precio, costo, itbis_pct,
       stock_mode, activo, min_stock)
    VALUES
      (v_morla, 'SERV-MAGNA', 'SERVICIO DE TALLER — COTIZACIÓN MAGNA',
       0, 0, 0.18, 'manual', true, 0);
    RAISE NOTICE 'Producto SERV-MAGNA creado.';
  ELSE
    -- Se re-asegura lo que importa, sin tocar precio (va por línea).
    UPDATE public.productos
       SET descripcion = 'SERVICIO DE TALLER — COTIZACIÓN MAGNA',
           itbis_pct = 0.18, stock_mode = 'manual', activo = true
     WHERE id = v_id;
    RAISE NOTICE 'SERV-MAGNA ya existía — se dejó al día.';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cotizaciones_magna_a_facturacion.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El producto que sostiene las líneas
SELECT codigo, descripcion, itbis_pct, stock_mode, activo
FROM public.productos
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND codigo = 'SERV-MAGNA';
-- esperado: 1 fila, itbis 0.18, stock_mode manual, activa

-- 2) Cómo quedaría facturada cada cotización pendiente (prueba en seco)
SELECT c.numero AS cotizacion,
       COALESCE('Orden ' || d.numero_orden, 'Servicio de taller')
         || COALESCE(' · ' || d.chasis, '')            AS linea,
       (d.valor_repuestos + d.valor_mano_obra)         AS sin_itbis,
       ROUND((d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS precio_facturado
FROM public.cotizaciones_magna c
JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
WHERE c.estado = 'Pendiente'
ORDER BY c.numero, d.created_at;

-- 3) El total facturado tiene que dar EXACTO al de la cotización
SELECT c.numero, c.subtotal, c.itbis, c.total AS total_cotizacion,
       ROUND(SUM(d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS total_factura,
       c.total - ROUND(SUM(d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS diferencia
FROM public.cotizaciones_magna c
JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
WHERE c.estado <> 'Anulada'
GROUP BY c.id, c.numero, c.subtotal, c.itbis, c.total
ORDER BY c.numero;
-- esperado: diferencia 0.00 en todas
