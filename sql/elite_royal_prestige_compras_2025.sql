-- =====================================================================
-- ELITE SOLUTIONS COMPANY ESC SRL: compras de Royal Prestige de 2025
-- (20/11/2026). Leído de los PDF de facturas electrónicas (E31) de Royal
-- Prestige DR S.R.L. (RNC 130743819) a Elite (RNC 132958039), enero-
-- diciembre 2025: 39 facturas (las 2 de enero 2026 de la carpeta ya estaban,
-- OC-0001 y OC-0002). Cada factura cuadra línea por línea con su monto
-- gravado. Mismas reglas que las de 2026 (sql/elite_royal_prestige_compras.sql):
-- NADA entra al inventario y las compras quedan PAGADAS (no CxP).
-- Decisión del dueño (20/11): NO se crean productos. Elite está en TRIAL
-- (límite 50 artículos) y estas facturas traen 16 códigos que no están en
-- su catálogo: esas líneas quedan con código y descripción, sin producto.
-- Los productos que ya existen no se tocan (su costo es el de 2026).
-- Numeración OC25-0001…: get_next_compra_numero solo cuenta 'OC-<n>', así
-- la siguiente compra de Elite sigue en su número normal.
-- Solo escribe en la empresa 3e8823fa… (Elite). Idempotente por e-NCF.
-- =====================================================================
BEGIN;

INSERT INTO public.proveedores (tenant_id, nombre, rnc, activo, vende_a_credito, dias_credito, moneda)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'ROYAL PRESTIGE DR S.R.L.', '130743819', true, true, 30, 'DOP'
WHERE NOT EXISTS (SELECT 1 FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819');


-- DR-Y002-1636989 · E310000002434 · 2025-01-02 · RD$ 455.67
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0001', '2025-01-02', 'E310000002434', 'DR-Y002-1636989', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 386.16, 0, 69.51, 455.67, false, false,
    'Credito', 25, 455.67, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000002434')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('SRIC', 'Sample Balance Interest Charge', 1.00, 386.1600, 0.18, 455.67)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1646802 · E310000002751 · 2025-01-09 · RD$ 57,139.71
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0002', '2025-01-09', 'E310000002751', 'DR-Y002-1646802', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 48423.48, 0, 8716.23, 57139.71, false, false,
    'Credito', 25, 57139.71, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000002751')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 8246.6300, 0.18, 9731.02),
  ('NACF', 'National Advertising Campaign', 1.00, 930.0500, 0.18, 1097.46),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 4087.6500, 0.18, 4823.43),
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 11965.2500, 0.18, 14118.99),
  ('CO9217', 'INNOVE 316L 10"/26CM PAELLA W/CVR', 1.00, 9015.3800, 0.18, 10638.15),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1998.8900, 0.18, 2358.69),
  ('JVPT', 'Joint Venture Payment', 1.00, 8370.4400, 0.18, 9877.12),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1646.1900, 0.18, 1942.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1648353 · E310000002836 · 2025-01-10 · RD$ 1,089.03
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0003', '2025-01-10', 'E310000002836', 'DR-Y002-1648353', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 922.91, 0, 166.12, 1089.03, false, false,
    'Credito', 25, 1089.03, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000002836')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 922.9100, 0.18, 1089.03)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1675258 · E310000004361 · 2025-02-03 · RD$ 28,712.98
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0004', '2025-02-03', 'E310000004361', 'DR-Y002-1675258', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 24333.03, 0, 4379.95, 28712.98, false, false,
    'Credito', 25, 28712.98, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000004361')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 16142.3500, 0.18, 19047.97),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 968.5400, 0.18, 1142.88),
  ('JVPT', 'Joint Venture Payment', 1.00, 3868.5000, 0.18, 4564.83),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 760.8100, 0.18, 897.76),
  ('NACF', 'National Advertising Campaign', 1.00, 429.8300, 0.18, 507.20)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1681284 · E310000004829 · 2025-02-07 · RD$ 546.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0005', '2025-02-07', 'E310000004829', 'DR-Y002-1681284', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 463.00, 0, 83.34, 546.34, false, false,
    'Credito', 25, 546.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000004829')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1681285 · E310000004820 · 2025-02-07 · RD$ 546.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0006', '2025-02-07', 'E310000004820', 'DR-Y002-1681285', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 463.00, 0, 83.34, 546.34, false, false,
    'Credito', 25, 546.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000004820')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1684464 · E310000005034 · 2025-02-10 · RD$ 1,100.92
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0007', '2025-02-10', 'E310000005034', 'DR-Y002-1684464', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 932.98, 0, 167.94, 1100.92, false, false,
    'Credito', 25, 1100.92, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000005034')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 932.9800, 0.18, 1100.92)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1688048 · E310000005404 · 2025-02-12 · RD$ 40,533.43
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0008', '2025-02-12', 'E310000005404', 'DR-Y002-1688048', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 34350.36, 0, 6183.07, 40533.43, false, false,
    'Credito', 25, 40533.43, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000005404')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1125.0000, 0.18, 1327.50),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('PHAN', 'Product Handling Charge', 1.00, 1371.5900, 0.18, 1618.48),
  ('CO1251', 'ROYAL PRESTIGE PRESSURE COOKER-6L', 1.00, 13747.8900, 0.18, 16222.51),
  ('CO9217', 'INNOVE 316L 10"/26CM PAELLA W/CVR', 1.00, 9111.9500, 0.18, 10752.10),
  ('NACF', 'National Advertising Campaign', 1.00, 635.5900, 0.18, 750.00),
  ('JVPT', 'Joint Venture Payment', 1.00, 5720.3400, 0.18, 6750.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1694241 · E310000005865 · 2025-02-19 · RD$ 219,416.97
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0009', '2025-02-19', 'E310000005865', 'DR-Y002-1694241', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 185946.57, 0, 33470.40, 219416.97, false, false,
    'Credito', 25, 219416.97, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000005865')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('PHAN', 'Product Handling Charge', 1.00, 8010.4800, 0.18, 9452.37),
  ('JVPT', 'Joint Venture Payment', 1.00, 32318.3000, 0.18, 38135.59),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 6355.9300, 0.18, 7500.00),
  ('NACF', 'National Advertising Campaign', 1.00, 3590.9200, 0.18, 4237.29),
  ('CO9254', 'INNOVE 316L 8PC SPECIAL W/CKBK & RS', 1.00, 43289.5900, 0.18, 51081.72),
  ('CO9224', 'INNOVE 316L 12 QT/30CM STCKPT W/CVR', 1.00, 13515.8600, 0.18, 15948.71),
  ('CO9226', 'INNOVE 316L 20 QT/35CM STCKPT W/CVR', 1.00, 16625.3100, 0.18, 19617.87),
  ('CO9230', 'INNOVE 316L 8"/20CM GRMT SKLT W/CVR', 1.00, 6056.7000, 0.18, 7146.91),
  ('CO9739', '12" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 15001.8400, 0.18, 17702.17),
  ('CU0831', 'ROYAL PRESTIGE ALL-IN-ONE KNFE BLCK', 1.00, 21061.8200, 0.18, 24852.95),
  ('CO9232', 'INNOVE 316L10"/24CM GRMT SKLT W/CVR', 1.00, 7154.8300, 0.18, 8442.70),
  ('CO1001', 'ROYAL PRESTIGE EXPERTEA', 1.00, 10801.9900, 0.18, 12746.35)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1694242 · E310000005935 · 2025-02-19 · RD$ 43,137.55
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0010', '2025-02-19', 'E310000005935', 'DR-Y002-1694242', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 36557.24, 0, 6580.31, 43137.55, false, false,
    'Credito', 25, 43137.55, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000005935')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9265', 'INNOVE 316L 6PC GOURMET SKILLET SET', 1.00, 23106.1900, 0.18, 27265.30),
  ('PR0025', 'ROYAL PRESTIGE PERFECT POP', 1.00, 1960.6400, 0.18, 2313.56),
  ('RP4802', 'ROYAL PRESTIGE WHISTLE', 1.00, 248.7800, 0.18, 293.56),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1386.3700, 0.18, 1635.92),
  ('JVPT', 'Joint Venture Payment', 1.00, 5881.9300, 0.18, 6940.68),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1156.7800, 0.18, 1365.00),
  ('NACF', 'National Advertising Campaign', 1.00, 653.5500, 0.18, 771.19)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1699852 · E310000006268 · 2025-02-25 · RD$ 11,630.37
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0011', '2025-02-25', 'E310000006268', 'DR-Y002-1699852', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 9856.25, 0, 1774.12, 11630.37, false, false,
    'Credito', 25, 11630.37, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000006268')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT0099', 'RP INNOVE ALL PRODUCT CATALG - DR', 1.00, 1386.6200, 0.18, 1636.21),
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4671.6000, 0.18, 5512.49),
  ('RP2285', 'RP PRESSURE COOKER VALVE', 1.00, 275.0200, 0.18, 324.52),
  ('RP4802', 'ROYAL PRESTIGE WHISTLE', 2.00, 248.7800, 0.18, 587.12),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 1.00, 572.3900, 0.18, 675.42),
  ('SP0440', 'INNOVE 26CM RIM/WINDOW GASKETS-RED', 2.00, 548.1800, 0.18, 1293.70),
  ('SP5050', 'ROYALSHINE', 2.00, 215.3500, 0.18, 508.23),
  ('PSHP', 'Product Shipping Charge', 1.00, 926.0000, 0.18, 1092.68)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1752177 · E310000052930 · 2025-04-10 · RD$ 1,094.37
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0012', '2025-04-10', 'E310000052930', 'DR-Y002-1752177', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 927.43, 0, 166.94, 1094.37, false, false,
    'Credito', 25, 1094.37, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000052930')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 927.4300, 0.18, 1094.37)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1756952 · E310000053323 · 2025-04-14 · RD$ 59,852.50
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0013', '2025-04-14', 'E310000053323', 'DR-Y002-1756952', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 50722.45, 0, 9130.05, 59852.50, false, false,
    'Credito', 25, 59852.50, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000053323')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1512.7100, 0.18, 1785.00),
  ('CO9217', 'INNOVE 316L 10"/26CM PAELLA W/CVR', 2.00, 9325.3000, 0.18, 22007.71),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 15039.5900, 0.18, 17746.72),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2788.7500, 0.18, 3290.72),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 2021.4100, 0.18, 2385.26),
  ('NACF', 'National Advertising Campaign', 1.00, 854.6400, 0.18, 1008.48),
  ('JVPT', 'Joint Venture Payment', 1.00, 7691.7500, 0.18, 9076.26)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1759004 · E310000053457 · 2025-04-16 · RD$ 33,351.07
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0014', '2025-04-16', 'E310000053457', 'DR-Y002-1759004', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 28263.61, 0, 5087.46, 33351.07, false, false,
    'Credito', 25, 33351.07, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000053457')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('NACF', 'National Advertising Campaign', 1.00, 452.4500, 0.18, 533.89),
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 16520.3100, 0.18, 19493.97),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2788.7500, 0.18, 3290.72),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('PHAN', 'Product Handling Charge', 1.00, 991.2200, 0.18, 1169.64),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.0400, 0.18, 4805.01),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8400, 0.18, 944.99)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1784700 · E310000054761 · 2025-05-10 · RD$ 1,043.53
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0015', '2025-05-10', 'E310000054761', 'DR-Y002-1784700', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 884.35, 0, 159.18, 1043.53, false, false,
    'Credito', 25, 1043.53, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000054761')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 884.3500, 0.18, 1043.53)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1802640 · E310000056373 · 2025-05-29 · RD$ 30,127.90
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0016', '2025-05-29', 'E310000056373', 'DR-Y002-1802640', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 25532.12, 0, 4595.78, 30127.90, false, false,
    'Credito', 25, 30127.90, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000056373')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 15372.7500, 0.18, 18139.84),
  ('SP0262', '2PC BOWLS W/SLCNE BASE & COVR-304SS', 1.00, 1748.6000, 0.18, 2063.35),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 922.3600, 0.18, 1088.38),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1809486 · E310000056637 · 2025-06-03 · RD$ 119,814.40
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0017', '2025-06-03', 'E310000056637', 'DR-Y002-1809486', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 101537.63, 0, 18276.77, 119814.40, false, false,
    'Credito', 25, 119814.40, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000056637')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9237', 'INNOVE 316L8QT/26CM DUTCH OVN W/CVR', 1.00, 12317.0100, 0.18, 14534.07),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('PHAN', 'Product Handling Charge', 1.00, 3678.6000, 0.18, 4340.75),
  ('JVPT', 'Joint Venture Payment', 1.00, 19390.9800, 0.18, 22881.36),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 3813.5600, 0.18, 4500.00),
  ('NACF', 'National Advertising Campaign', 1.00, 2154.5500, 0.18, 2542.37),
  ('CU0831', 'ROYAL PRESTIGE ALL-IN-ONE KNFE BLCK', 1.00, 20144.7100, 0.18, 23770.76),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14055.6000, 0.18, 16585.61),
  ('CO9215', 'INNOVE 316L 14"/35CM PAELLA W/CVR', 1.00, 14792.6900, 0.18, 17455.37),
  ('SP0136', '2PC DOUBLE WALL 16OZ MUG SET', 1.00, 1200.7600, 0.18, 1416.90),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2606.2900, 0.18, 3075.42),
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4197.4100, 0.18, 4952.94),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 1.00, 547.4700, 0.18, 646.01),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1816878 · E310000057080 · 2025-06-09 · RD$ 31,223.41
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0018', '2025-06-09', 'E310000057080', 'DR-Y002-1816878', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 26460.52, 0, 4762.89, 31223.41, false, false,
    'Credito', 25, 31223.41, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000057080')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 15439.4500, 0.18, 18218.55),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2606.2900, 0.18, 3075.42),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 926.3700, 0.18, 1093.12),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1818258 · E310000057234 · 2025-06-10 · RD$ 1,052.11
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0019', '2025-06-10', 'E310000057234', 'DR-Y002-1818258', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 891.62, 0, 160.49, 1052.11, false, false,
    'Credito', 25, 1052.11, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000057234')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 891.6200, 0.18, 1052.11)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1827246 · E310000057913 · 2025-06-19 · RD$ 39,577.70
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0020', '2025-06-19', 'E310000057913', 'DR-Y002-1827246', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 33540.42, 0, 6037.28, 39577.70, false, false,
    'Credito', 25, 39577.70, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000057913')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 15439.4500, 0.18, 18218.55),
  ('CO9218', 'INNOVE 316L DOUBLE GRIDDLE', 1.00, 6905.0400, 0.18, 8147.95),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1340.6700, 0.18, 1581.99),
  ('JVPT', 'Joint Venture Payment', 1.00, 5881.9300, 0.18, 6940.68),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1156.7800, 0.18, 1365.00),
  ('NACF', 'National Advertising Campaign', 1.00, 653.5500, 0.18, 771.19)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1828041 · E310000057982 · 2025-06-20 · RD$ 17,640.27
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0021', '2025-06-20', 'E310000057982', 'DR-Y002-1828041', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 14949.39, 0, 2690.88, 17640.27, false, false,
    'Credito', 25, 17640.27, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000057982')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8715.1800, 0.18, 10283.91),
  ('SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 1.00, 547.4700, 0.18, 646.01),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 522.9100, 0.18, 617.03),
  ('JVPT', 'Joint Venture Payment', 1.00, 2294.6000, 0.18, 2707.63),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 451.2700, 0.18, 532.50),
  ('NACF', 'National Advertising Campaign', 1.00, 254.9600, 0.18, 300.85)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1831503 · E310000058168 · 2025-06-24 · RD$ 5,499.28
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0022', '2025-06-24', 'E310000058168', 'DR-Y002-1831503', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 4660.41, 0, 838.87, 5499.28, false, false,
    'Credito', 25, 5499.28, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000058168')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4197.4100, 0.18, 4952.94),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1832392 · E310000058270 · 2025-06-25 · RD$ 41,669.81
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0023', '2025-06-25', 'E310000058270', 'DR-Y002-1832392', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 35313.40, 0, 6356.41, 41669.81, false, false,
    'Credito', 25, 41669.81, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000058270')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9736', '8" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 9428.4000, 0.18, 11125.51),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14055.6000, 0.18, 16585.61),
  ('SP0113', 'RP FOOD STORAGE - 8 PC SET', 1.00, 945.4800, 0.18, 1115.67),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1409.0400, 0.18, 1662.67),
  ('JVPT', 'Joint Venture Payment', 1.00, 5591.0700, 0.18, 6597.46),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1099.5800, 0.18, 1297.50),
  ('NACF', 'National Advertising Campaign', 1.00, 621.2300, 0.18, 733.05)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1841974 · E310000058981 · 2025-07-03 · RD$ 45,104.85
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0024', '2025-07-03', 'E310000058981', 'DR-Y002-1841974', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 38224.46, 0, 6880.39, 45104.85, false, false,
    'Credito', 25, 45104.85, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000058981')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 11722.3900, 0.18, 13832.42),
  ('NACF', 'National Advertising Campaign', 1.00, 797.1900, 0.18, 940.68),
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4253.8600, 0.18, 5019.55),
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 8079.2400, 0.18, 9533.50),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 960.0000, 0.18, 1132.80),
  ('PHAN', 'Product Handling Charge', 1.00, 1188.1000, 0.18, 1401.96),
  ('JVPT', 'Joint Venture Payment', 1.00, 7174.6600, 0.18, 8466.10),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1411.0200, 0.18, 1665.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1850397 · E310000059576 · 2025-07-10 · RD$ 1,070.56
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0025', '2025-07-10', 'E310000059576', 'DR-Y002-1850397', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 907.25, 0, 163.31, 1070.56, false, false,
    'Credito', 25, 1070.56, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000059576')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 907.2500, 0.18, 1070.55)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1855090 · E310000059846 · 2025-07-15 · RD$ 5,009.06
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0026', '2025-07-15', 'E310000059846', 'DR-Y002-1855090', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 4244.97, 0, 764.09, 5009.06, false, false,
    'Credito', 25, 5009.06, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000059846')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 4004.6900, 0.18, 4725.53),
  ('PHAN', 'Product Handling Charge', 1.00, 240.2800, 0.18, 283.53)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1881607 · E310000061618 · 2025-08-10 · RD$ 1,091.08
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0027', '2025-08-10', 'E310000061618', 'DR-Y002-1881607', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 924.64, 0, 166.44, 1091.08, false, false,
    'Credito', 25, 1091.08, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000061618')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 924.6400, 0.18, 1091.08)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1899948 · E310000063065 · 2025-08-29 · RD$ 21,588.94
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0028', '2025-08-29', 'E310000063065', 'DR-Y002-1899948', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 18295.72, 0, 3293.22, 21588.94, false, false,
    'Credito', 25, 21588.94, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000063065')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('JVPT', 'Joint Venture Payment', 1.00, 2650.1000, 0.18, 3127.12),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 521.1900, 0.18, 615.00),
  ('CO9222', 'INNOVE 316L WOK W/COVER', 1.00, 10416.1500, 0.18, 12291.06),
  ('PR0021', 'BAMBOO CUTTNG BOARD W/SILICON-SMALL', 1.00, 1625.8500, 0.18, 1918.50),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 624.9700, 0.18, 737.46),
  ('NACF', 'National Advertising Campaign', 1.00, 294.4600, 0.18, 347.46)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1913081 · E310000063764 · 2025-09-08 · RD$ 546.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0029', '2025-09-08', 'E310000063764', 'DR-Y002-1913081', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 463.00, 0, 83.34, 546.34, false, false,
    'Credito', 25, 546.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000063764')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1915295 · E310000064131 · 2025-09-10 · RD$ 1,133.31
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0030', '2025-09-10', 'E310000064131', 'DR-Y002-1915295', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 960.43, 0, 172.88, 1133.31, false, false,
    'Credito', 25, 1133.31, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000064131')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 960.4300, 0.18, 1133.31)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1947501 · E310000066280 · 2025-10-10 · RD$ 546.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0031', '2025-10-10', 'E310000066280', 'DR-Y002-1947501', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 463.00, 0, 83.34, 546.34, false, false,
    'Credito', 25, 546.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000066280')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1947502 · E310000066277 · 2025-10-10 · RD$ 1,118.94
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0032', '2025-10-10', 'E310000066277', 'DR-Y002-1947502', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 948.25, 0, 170.69, 1118.94, false, false,
    'Credito', 25, 1118.94, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000066277')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 948.2500, 0.18, 1118.93)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1957238 · E310000066981 · 2025-10-20 · RD$ 70,588.08
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0033', '2025-10-20', 'E310000066981', 'DR-Y002-1957238', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 59820.41, 0, 10767.67, 70588.08, false, false,
    'Credito', 25, 70588.08, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000066981')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 1.00, 32820.1000, 0.18, 38727.72),
  ('NACF', 'National Advertising Campaign', 1.00, 969.5500, 0.18, 1144.07),
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4732.3000, 0.18, 5584.11),
  ('PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 1.00, 2278.6900, 0.18, 2688.85),
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4445.5200, 0.18, 5245.71),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1969.2100, 0.18, 2323.67),
  ('JVPT', 'Joint Venture Payment', 1.00, 8725.9400, 0.18, 10296.61),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1716.1000, 0.18, 2025.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1960301 · E310000067225 · 2025-10-23 · RD$ 63,157.01
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0034', '2025-10-23', 'E310000067225', 'DR-Y002-1960301', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 53522.89, 0, 9634.12, 63157.01, false, false,
    'Credito', 25, 63157.01, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000067225')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9247', 'INNOVE 5PC COMPLEM CS W/PERFECT POP', 1.00, 30979.0400, 0.18, 36555.27),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 992.0000, 0.18, 1170.56),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 4185.1100, 0.18, 4938.43),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2760.3400, 0.18, 3257.20),
  ('PHAN', 'Product Handling Charge', 1.00, 2109.8500, 0.18, 2489.62),
  ('JVPT', 'Joint Venture Payment', 1.00, 8111.8900, 0.18, 9572.03),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1595.3400, 0.18, 1882.50),
  ('NACF', 'National Advertising Campaign', 1.00, 901.3200, 0.18, 1063.56),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1425.0000, 0.18, 1681.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1961104 · E310000067280 · 2025-10-24 · RD$ 7,239.68
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0035', '2025-10-24', 'E310000067280', 'DR-Y002-1961104', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 6135.32, 0, 1104.36, 7239.68, false, false,
    'Credito', 25, 7239.68, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000067280')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT2709', 'DR CREDIT APP & PAGARE-SPA-25PK', 1.00, 328.7800, 0.18, 387.96),
  ('LT4031', 'SALES ORDER FORM-25 PACK-DR', 1.00, 216.8800, 0.18, 255.92),
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4445.5200, 0.18, 5245.71),
  ('SP5050', 'ROYALSHINE', 1.00, 218.1400, 0.18, 257.41),
  ('PSHP', 'Product Shipping Charge', 1.00, 926.0000, 0.18, 1092.68)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1961105 · E310000067279 · 2025-10-24 · RD$ 14,352.44
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0036', '2025-10-24', 'E310000067279', 'DR-Y002-1961105', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 12163.09, 0, 2189.35, 14352.44, false, false,
    'Credito', 25, 14352.44, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000067279')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO0101', 'RP CHOCOLATERA', 1.00, 6827.8000, 0.18, 8056.80),
  ('SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 1.00, 579.8300, 0.18, 684.20),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 260.0000, 0.18, 306.80),
  ('PHAN', 'Product Handling Charge', 1.00, 409.6700, 0.18, 483.41),
  ('NACF', 'National Advertising Campaign', 1.00, 186.7300, 0.18, 220.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1425.0000, 0.18, 1681.50),
  ('JVPT', 'Joint Venture Payment', 1.00, 1680.5500, 0.18, 1983.05),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 330.5100, 0.18, 390.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-1979966 · E310000068416 · 2025-11-10 · RD$ 1,142.68
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0037', '2025-11-10', 'E310000068416', 'DR-Y002-1979966', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 968.37, 0, 174.31, 1142.68, false, false,
    'Credito', 25, 1142.68, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000068416')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 968.3700, 0.18, 1142.68)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2012279 · E310000070961 · 2025-12-10 · RD$ 46,784.54
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0038', '2025-12-10', 'E310000070961', 'DR-Y002-2012279', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 39647.91, 0, 7136.63, 46784.54, false, false,
    'Credito', 25, 46784.54, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000070961')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9736', '8" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 10110.0600, 0.18, 11929.87),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1042.3700, 0.18, 1230.00),
  ('NACF', 'National Advertising Campaign', 1.00, 588.9200, 0.18, 694.93),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 9345.2800, 0.18, 11027.43),
  ('CO0101', 'RP CHOCOLATERA', 1.00, 6912.8400, 0.18, 8157.15),
  ('SP0362', '2PC BOWLS W/SLCNE BASE & COVR-304SS', 1.00, 1883.1500, 0.18, 2222.12),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 720.0000, 0.18, 849.60),
  ('PHAN', 'Product Handling Charge', 1.00, 1582.0900, 0.18, 1866.87),
  ('JVPT', 'Joint Venture Payment', 1.00, 5300.2000, 0.18, 6254.24)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2012280 · E310000070959 · 2025-12-10 · RD$ 1,141.47
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC25-0039', '2025-12-10', 'E310000070959', 'DR-Y002-2012280', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 967.35, 0, 174.12, 1141.47, false, false,
    'Credito', 25, 1141.47, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (20/11/2026, compras de 2025). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000070959')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 967.3500, 0.18, 1141.47)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- Totales: 39 compras · base RD$ 904,975.39 · ITBIS RD$ 162,895.59
COMMIT;

SELECT registrar_migracion('elite_royal_prestige_compras_2025.sql');
