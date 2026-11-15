-- =====================================================================
-- ELITE SOLUTIONS COMPANY ESC SRL: catálogo y compras de Royal Prestige
-- (15/11/2026). Leído de los 56 PDF de facturas electrónicas (E31) de
-- Royal Prestige DR S.R.L. (RNC 130743819), enero–octubre 2026; un archivo
-- repetido ("(1)") se omite: 55 facturas. Cada factura cuadra línea por
-- línea con su "Monto gravado Total".
-- Decisiones del dueño (15/11):
--   · catálogo de productos (bienes) con el costo de la última compra y
--     PRECIO 0 (lo pone él); los cargos (envío, Joint Venture, publicidad…)
--     como productos de SERVICIO (sin inventario);
--   · NADA entra al inventario (existencia 0; luego conteo físico);
--   · las 55 compras quedan PAGADAS (no van a Cuentas por Pagar).
-- Solo escribe en la empresa 3e8823fa… (Elite). No toca otras empresas.
-- Idempotente: no repite suplidor, productos ni compras (por e-NCF).
-- =====================================================================

INSERT INTO public.proveedores (tenant_id, nombre, rnc, activo, vende_a_credito, dias_credito, moneda)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'ROYAL PRESTIGE DR S.R.L.', '130743819', true, true, 30, 'DOP'
WHERE NOT EXISTS (SELECT 1 FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819');

INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'AP2801', 'RP AIR FILTER 120-127V TYPE A', 25530.13, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'AP2801');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 25530.13, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'AP2801' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CLAC', 'Territory Director Meeting Fund Charge', 797.03, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CLAC');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO0101', 'RP CHOCOLATERA', 6384.19, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO0101');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 6384.19, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO0101' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO0902', 'ROYAL PRESTIGE EXPERTEA', 10470.47, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO0902');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 10470.47, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO0902' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 16521.49, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO1255');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 16521.49, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO1255' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO1455', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 15931.54, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO1455');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 15931.54, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO1455' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO1458', 'RP PRESSURE COOKER 10L W/RECPE BOOK', 16772.47, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO1458');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 16772.47, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO1458' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9086', 'INNOVE 20CM MEDIUM COVER', 3450.83, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9086');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 3450.83, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9086' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9087', 'INNOVE 26CM LARGE COVER', 4004.75, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9087');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 4004.75, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9087' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9201', 'INNOVE 316L 2QT/16CM SAUCEPAN', 4936.49, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9201');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 4936.49, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9201' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9203', 'INNOVE 316L 3QT/20CM DUTCH OVEN', 6587.58, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9203');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 6587.58, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9203' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 8079.39, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9207');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 8079.39, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9207' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9222', 'INNOVE 316L WOK W/COVER', 10229.85, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9222');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 10229.85, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9222' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9232', 'INNOVE 316L10"/24CM GRMT SKLT W/CVR', 6767.19, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9232');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 6767.19, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9232' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9236', 'INNOVE 316L4QT/20CM DUTCH OVN W/CVR', 9857.71, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9236');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 9857.71, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9236' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9237', 'INNOVE 316L8QT/26CM DUTCH OVN W/CVR', 12714.53, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9237');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 12714.53, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9237' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9254', 'INNOVE 316L 8PC SPECIAL W/CKBK & RS', 41962.08, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9254');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 41962.08, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9254' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9315', 'INNOVE 14"/35CM PAELLA PAN W/CVR', 15270.10, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9315');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 15270.10, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9315' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 8832.54, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9317');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 8832.54, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9317' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9736', '8" DER SKILLET SE W/GLS /3PC TOOL', 9555.36, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9736');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 9555.36, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9736' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 11722.56, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9738');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 11722.56, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9738' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9757', '3.5QT/26CM ER SAUTE W/HH&CVRGLS RTK', 12388.45, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9757');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 12388.45, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9757' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 14244.88, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9779');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 14244.88, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9779' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CO9961', 'INNOVE 10PC SET + PERFECT POP DR', 55661.48, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CO9961');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 55661.48, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CO9961' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CU0800', 'ROYAL PRESTIGE 5PC KTCHEN KNIFE SET', 5632.29, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CU0800');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 5632.29, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CU0800' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'CU0831', 'ROYAL PRESTIGE ALL-IN-ONE KNFE BLCK', 20415.99, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'CU0831');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 20415.99, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'CU0831' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'ES0082', 'RP POWER BLENDER MAX 120-127V VPU', 27224.18, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'ES0082');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 27224.18, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'ES0082' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'FXIN', 'Closed End Interest Charge', 1875.00, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'FXIN');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 31405.65, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'JU0038');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 31405.65, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'JU0038' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'JVPT', 'Joint Venture Payment', 4052.71, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'JVPT');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'LT0099', 'RP INNOVE ALL PRODUCT CATALG - DR', 1416.27, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'LT0099');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 1416.27, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'LT0099' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'LT2493', 'GIFT HOLDER 10PK - SPA', 344.14, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'LT2493');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 344.14, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'LT2493' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'LT2709', 'DR CREDIT APP & PAGARE-SPA-25PK', 314.62, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'LT2709');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 314.62, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'LT2709' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'LT4031', 'SALES ORDER FORM-25 PACK-DR', 207.54, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'LT4031');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 207.54, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'LT4031' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'LT5301', 'ROYAL OPPORTUNITY FLYER â€“ 25 PK', 421.21, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'LT5301');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 421.21, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'LT5301' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'NACF', 'National Advertising Campaign', 450.31, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'NACF');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PHAN', 'Product Handling Charge', 529.95, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PHAN');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR0021', 'BAMBOO CUTTNG BOARD W/SILICON-SMALL', 1596.15, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR0021');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 1596.15, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR0021' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR0196', '6 PIECE KITCHEN TOOL SET', 2641.37, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR0196');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 2641.37, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR0196' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR0333', 'ROYAL PRESTIGE SHOWER FILTER', 6154.75, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR0333');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 6154.75, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR0333' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR0609', '24PC AMERICANA FLATWR SET-18/8 DR', 2300.51, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR0609');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 2300.51, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR0609' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 2180.47, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR1459');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 2180.47, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR1459' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR1460', 'RP JUICER 3PC STRAINER', 4528.34, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR1460');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 4528.34, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR1460' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 3341.90, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR2128');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 3341.90, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR2128' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 4156.68, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR2129');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 4156.68, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR2129' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR2138', 'RP ESPRESSO MAKER 4 CUP DWC-PLUS', 2749.50, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR2138');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 2749.50, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR2138' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PR2139', 'RP ESPRESSO MAKER 10 CUP DWC-PLUS', 3329.56, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PR2139');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 3329.56, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'PR2139' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'PSHP', 'Product Shipping Charge', 463.00, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'PSHP');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RCCR', 'Contract Processing Charge', 1700.00, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RCCR');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RCMC', 'Revolving Credit Risk Charge', 527.00, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RCMC');
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RP2286', 'RP PRESSURE COOKER HANDLE', 346.85, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RP2286');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 346.85, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'RP2286' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RP2287', 'RP PRESSURE COOKER SILICONE GASKET', 311.86, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RP2287');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 311.86, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'RP2287' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RP4801', 'INNOVE TOP KNOB-26CM, STOCKPT COVER', 401.12, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RP4801');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 401.12, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'RP4801' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RP4802', 'ROYAL PRESTIGE WHISTLE', 241.15, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RP4802');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 241.15, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'RP4802' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'RP9712', 'EASYRELEASE GLASS COV WHISTLE KNOB', 626.30, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'RP9712');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 626.30, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'RP9712' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SE0091', 'RP DIST JR PIN', 459.56, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SE0091');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 459.56, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SE0091' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SE0092', 'RP DISTR PIN', 442.34, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SE0092');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 442.34, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SE0092' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0081', '3PC NEW DELUXE SERVING SET 430SS', 541.39, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0081');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 541.39, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0081' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 554.85, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0091');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 554.85, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0091' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0111', 'RP 2 CUP FOOD STORAGE W/LID-6 PACK', 700.68, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0111');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 700.68, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0111' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0113', 'RP FOOD STORAGE - 8 PC SET', 958.19, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0113');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 958.19, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0113' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0135', '4 PC DOUBLE WALL MUG SET', 1556.72, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0135');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 1556.72, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0135' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0136', '2PC DOUBLE WALL 16OZ MUG SET', 1216.92, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0136');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 1216.92, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0136' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0145', 'DOUBLE WALL UTENSIL HOLDER', 609.61, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0145');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 609.61, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0145' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0430', 'INNOVE 20CM RIM/WINDOW GASKETS-RED', 427.91, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0430');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 427.91, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0430' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP0440', 'INNOVE 26CM RIM/WINDOW GASKETS-RED', 530.19, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP0440');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 530.19, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP0440' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'SP5050', 'ROYALSHINE', 208.74, 0, 0.18, true, 'bien', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'SP5050');
INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', pr.id, 1, 208.74, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND pr.codigo = 'SP5050' AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);
INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'TECH', 'Technology Fee', 927.37, 0, 0.18, true, 'servicio', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = 'TECH');

-- DR-Y002-2043913 · E310000073243 · 2026-01-10 · RD$ 1,131.29
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0001', '2026-01-10', 'E310000073243', 'DR-Y002-2043913', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 958.72, 0, 172.57, 1131.29, false, false,
    'Credito', 25, 1131.29, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000073243')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 958.7200, 0.18, 1131.29)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2047762 · E310000073618 · 2026-01-13 · RD$ 34,460.51
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0002', '2026-01-13', 'E310000073618', 'DR-Y002-2047762', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 29203.83, 0, 5256.68, 34460.51, false, false,
    'Credito', 25, 34460.51, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000073618')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 16487.3400, 0.18, 19455.06),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3608.8400, 0.18, 4258.43),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 630.0000, 0.18, 743.40),
  ('PHAN', 'Product Handling Charge', 1.00, 989.2400, 0.18, 1167.30),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2065557 · E310000074557 · 2026-02-02 · RD$ 9,906.32
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0003', '2026-02-02', 'E310000074557', 'DR-Y002-2065557', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 8395.19, 0, 1511.13, 9906.32, false, false,
    'Credito', 25, 9906.32, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000074557')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT0099', 'RP INNOVE ALL PRODUCT CATALG - DR', 1.00, 1416.2700, 0.18, 1671.20),
  ('SP5050', 'ROYALSHINE', 3.00, 219.9400, 0.18, 778.59),
  ('PSHP', 'Product Shipping Charge', 1.00, 926.0000, 0.18, 1092.68),
  ('LT2493', 'GIFT HOLDER 10PK - SPA', 1.00, 371.6300, 0.18, 438.52),
  ('LT2709', 'DR CREDIT APP & PAGARE-SPA-25PK', 1.00, 331.5100, 0.18, 391.18),
  ('LT4031', 'SALES ORDER FORM-25 PACK-DR', 1.00, 218.6700, 0.18, 258.03),
  ('LT5301', 'ROYAL OPPORTUNITY FLYER â€“ 25 PK', 1.00, 421.2100, 0.18, 497.03),
  ('RP4801', 'INNOVE TOP KNOB-26CM, STOCKPT COVER', 3.00, 401.1200, 0.18, 1419.96),
  ('RP4802', 'ROYAL PRESTIGE WHISTLE', 2.00, 254.1000, 0.18, 599.68),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 1.00, 584.6300, 0.18, 689.86),
  ('SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 3.00, 584.6300, 0.18, 2069.59)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2067516 · E310000074665 · 2026-02-03 · RD$ 38,866.08
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0004', '2026-02-03', 'E310000074665', 'DR-Y002-2067516', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32937.36, 0, 5928.72, 38866.08, false, false,
    'Credito', 25, 38866.08, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000074665')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1302.2000, 0.18, 1536.60),
  ('JVPT', 'Joint Venture Payment', 1.00, 5332.5200, 0.18, 6292.37),
  ('NACF', 'National Advertising Campaign', 1.00, 592.5000, 0.18, 699.15),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 9325.9600, 0.18, 11004.63),
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 12377.4500, 0.18, 14605.39),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 795.0000, 0.18, 938.10),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1048.7300, 0.18, 1237.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2071941 · E310000075029 · 2026-02-06 · RD$ 30,769.90
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0005', '2026-02-06', 'E310000075029', 'DR-Y002-2071941', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 26076.19, 0, 4693.71, 30769.90, false, false,
    'Credito', 25, 30769.90, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000075029')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 600.0000, 0.18, 708.00),
  ('CO1255', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 16521.4900, 0.18, 19495.36),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('PHAN', 'Product Handling Charge', 1.00, 991.2900, 0.18, 1169.72),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2071942 · E310000075047 · 2026-02-06 · RD$ 42,851.58
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0006', '2026-02-06', 'E310000075047', 'DR-Y002-2071942', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 36314.90, 0, 6536.68, 42851.58, false, false,
    'Credito', 25, 42851.58, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000075047')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 9325.9600, 0.18, 11004.63),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 15040.6600, 0.18, 17747.98),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 790.0000, 0.18, 932.20),
  ('PHAN', 'Product Handling Charge', 1.00, 1462.0000, 0.18, 1725.16),
  ('JVPT', 'Joint Venture Payment', 1.00, 5397.1500, 0.18, 6368.64),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1061.4400, 0.18, 1252.50),
  ('NACF', 'National Advertising Campaign', 1.00, 599.6900, 0.18, 707.63)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2074287 · E310000075112 · 2026-02-09 · RD$ 42,220.28
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0007', '2026-02-09', 'E310000075112', 'DR-Y002-2074287', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 35779.90, 0, 6440.38, 42220.28, false, false,
    'Credito', 25, 42220.28, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000075112')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 9325.9600, 0.18, 11004.63),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 15040.6600, 0.18, 17747.98),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 730.0000, 0.18, 861.40),
  ('PHAN', 'Product Handling Charge', 1.00, 1462.0000, 0.18, 1725.16),
  ('JVPT', 'Joint Venture Payment', 1.00, 5397.1500, 0.18, 6368.64),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1061.4400, 0.18, 1252.50),
  ('NACF', 'National Advertising Campaign', 1.00, 599.6900, 0.18, 707.63)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2075696 · E310000075226 · 2026-02-10 · RD$ 1,118.19
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0008', '2026-02-10', 'E310000075226', 'DR-Y002-2075696', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 947.62, 0, 170.57, 1118.19, false, false,
    'Credito', 25, 1118.19, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000075226')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 947.6200, 0.18, 1118.19)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2083196 · E310000075921 · 2026-02-17 · RD$ 27,232.70
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0009', '2026-02-17', 'E310000075921', 'DR-Y002-2083196', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 23078.56, 0, 4154.14, 27232.70, false, false,
    'Credito', 25, 27232.70, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000075921')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 15040.6600, 0.18, 17747.98),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 440.0000, 0.18, 519.20),
  ('PHAN', 'Product Handling Charge', 1.00, 902.4400, 0.18, 1064.88),
  ('JVPT', 'Joint Venture Payment', 1.00, 3102.5600, 0.18, 3661.02),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 610.1700, 0.18, 720.00),
  ('NACF', 'National Advertising Campaign', 1.00, 344.7300, 0.18, 406.78)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2101722 · E310000077248 · 2026-03-05 · RD$ 41,082.78
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0010', '2026-03-05', 'E310000077248', 'DR-Y002-2101722', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 34815.91, 0, 6266.87, 41082.78, false, false,
    'Credito', 25, 41082.78, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000077248')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8842.4900, 0.18, 10434.14),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14260.9300, 0.18, 16827.90),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 630.0000, 0.18, 743.40),
  ('PHAN', 'Product Handling Charge', 1.00, 1386.2100, 0.18, 1635.73),
  ('JVPT', 'Joint Venture Payment', 1.00, 5397.1500, 0.18, 6368.64),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1061.4400, 0.18, 1252.50),
  ('NACF', 'National Advertising Campaign', 1.00, 599.6900, 0.18, 707.63)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2106621 · E310000077430 · 2026-03-09 · RD$ 35,085.65
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0011', '2026-03-09', 'E310000077430', 'DR-Y002-2106621', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 29733.60, 0, 5352.05, 35085.65, false, false,
    'Credito', 25, 35085.65, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000077430')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 645.0000, 0.18, 761.10),
  ('NACF', 'National Advertising Campaign', 1.00, 463.2300, 0.18, 546.61),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 819.9200, 0.18, 967.51),
  ('CO0101', 'RP CHOCOLATERA', 1.00, 6540.9100, 0.18, 7718.27),
  ('CO0902', 'ROYAL PRESTIGE EXPERTEA', 1.00, 10482.2600, 0.18, 12369.07),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3428.8300, 0.18, 4046.02),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1021.3900, 0.18, 1205.24),
  ('JVPT', 'Joint Venture Payment', 1.00, 4169.0600, 0.18, 4919.49)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2107585 · E310000077474 · 2026-03-10 · RD$ 1,082.74
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0012', '2026-03-10', 'E310000077474', 'DR-Y002-2107585', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 917.58, 0, 165.16, 1082.74, false, false,
    'Credito', 25, 1082.74, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000077474')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 917.5800, 0.18, 1082.74)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2120790 · E310000078642 · 2026-03-24 · RD$ 29,418.94
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0013', '2026-03-24', 'E310000078642', 'DR-Y002-2120790', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 24931.31, 0, 4487.63, 29418.94, false, false,
    'Credito', 25, 29418.94, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000078642')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 1.00, 555.4700, 0.18, 655.45),
  ('CO1455', 'ROYAL PRESTIGE PRESSURE COOKER-10L', 1.00, 15931.5400, 0.18, 18799.22),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 955.8900, 0.18, 1127.95),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2135749 · E310000079726 · 2026-04-07 · RD$ 71,067.65
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0014', '2026-04-07', 'E310000079726', 'DR-Y002-2135749', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 60226.82, 0, 10840.83, 71067.65, false, false,
    'Credito', 25, 71067.65, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000079726')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9237', 'INNOVE 316L8QT/26CM DUTCH OVN W/CVR', 1.00, 12714.5300, 0.18, 15003.15),
  ('NACF', 'National Advertising Campaign', 1.00, 1055.7300, 0.18, 1245.76),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1868.6400, 0.18, 2205.00),
  ('CO9315', 'INNOVE 14"/35CM PAELLA PAN W/CVR', 1.00, 15270.1000, 0.18, 18018.72),
  ('CO9222', 'INNOVE 316L WOK W/COVER', 1.00, 10415.6900, 0.18, 12290.51),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3488.5300, 0.18, 4116.47),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 970.0000, 0.18, 1144.60),
  ('PHAN', 'Product Handling Charge', 1.00, 2304.0200, 0.18, 2718.74),
  ('JVPT', 'Joint Venture Payment', 1.00, 9501.5800, 0.18, 11211.86)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2139062 · E310000080158 · 2026-04-10 · RD$ 1,070.66
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0015', '2026-04-10', 'E310000080158', 'DR-Y002-2139062', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 907.34, 0, 163.32, 1070.66, false, false,
    'Credito', 25, 1070.66, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000080158')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 907.3400, 0.18, 1070.66)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2151969 · E310000080965 · 2026-04-24 · RD$ 17,346.09
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0016', '2026-04-24', 'E310000080965', 'DR-Y002-2151969', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 14700.08, 0, 2646.01, 17346.09, false, false,
    'Credito', 25, 17346.09, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000080965')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8996.4600, 0.18, 10615.82),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 539.7900, 0.18, 636.95),
  ('JVPT', 'Joint Venture Payment', 1.00, 2294.6000, 0.18, 2707.63),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 451.2700, 0.18, 532.50),
  ('NACF', 'National Advertising Campaign', 1.00, 254.9600, 0.18, 300.85)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2168304 · E310000082131 · 2026-05-10 · RD$ 1,056.08
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0017', '2026-05-10', 'E310000082131', 'DR-Y002-2168304', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 894.98, 0, 161.10, 1056.08, false, false,
    'Credito', 25, 1056.08, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000082131')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 894.9800, 0.18, 1056.08)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2185582 · E310000083666 · 2026-05-29 · RD$ 82,651.03
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0018', '2026-05-29', 'E310000083666', 'DR-Y002-2185582', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 70043.25, 0, 12607.78, 82651.03, false, false,
    'Credito', 25, 82651.03, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000083666')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 1.00, 31417.7900, 0.18, 37072.99),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 2237.2900, 0.18, 2640.00),
  ('NACF', 'National Advertising Campaign', 1.00, 1264.0100, 0.18, 1491.53),
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4530.1000, 0.18, 5345.52),
  ('PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 1.00, 2181.3100, 0.18, 2573.95),
  ('CO9222', 'INNOVE 316L WOK W/COVER', 1.00, 10229.8500, 0.18, 12071.22),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 1670.0000, 0.18, 1970.60),
  ('PHAN', 'Product Handling Charge', 1.00, 2498.8600, 0.18, 2948.65),
  ('JVPT', 'Joint Venture Payment', 1.00, 11376.0400, 0.18, 13423.73)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2189008 · E310000084091 · 2026-06-02 · RD$ 37,931.41
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0019', '2026-06-02', 'E310000084091', 'DR-Y002-2189008', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32145.26, 0, 5786.15, 37931.41, false, false,
    'Credito', 25, 37931.41, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000084091')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PR2129', 'RP ESPRESSO MAKER 10 CUP DWC', 1.00, 4156.6800, 0.18, 4904.88),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 962.2900, 0.18, 1135.50),
  ('NACF', 'National Advertising Campaign', 1.00, 543.6700, 0.18, 641.53),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 13919.2100, 0.18, 16424.67),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2580.9900, 0.18, 3045.57),
  ('SP0113', 'RP FOOD STORAGE - 8 PC SET', 1.00, 936.2800, 0.18, 1104.81),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 680.0000, 0.18, 802.40),
  ('PHAN', 'Product Handling Charge', 1.00, 835.1500, 0.18, 985.48),
  ('JVPT', 'Joint Venture Payment', 1.00, 4892.9900, 0.18, 5773.73)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2189009 · E310000084151 · 2026-06-02 · RD$ 41,218.88
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0020', '2026-06-02', 'E310000084151', 'DR-Y002-2189009', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 34931.25, 0, 6287.63, 41218.88, false, false,
    'Credito', 25, 41218.88, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000084151')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 13919.2100, 0.18, 16424.67),
  ('NACF', 'National Advertising Campaign', 1.00, 599.6900, 0.18, 707.63),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8630.6100, 0.18, 10184.12),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 1.00, 542.1600, 0.18, 639.75),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 790.0000, 0.18, 932.20),
  ('PHAN', 'Product Handling Charge', 1.00, 1352.9900, 0.18, 1596.53),
  ('JVPT', 'Joint Venture Payment', 1.00, 5397.1500, 0.18, 6368.64),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1061.4400, 0.18, 1252.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2189010 · E310000083975 · 2026-06-02 · RD$ 34,028.17
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0021', '2026-06-02', 'E310000083975', 'DR-Y002-2189010', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 28837.44, 0, 5190.73, 34028.17, false, false,
    'Credito', 25, 34028.17, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000083975')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1458', 'RP PRESSURE COOKER 10L W/RECPE BOOK', 1.00, 16389.0200, 0.18, 19339.04),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3346.6700, 0.18, 3949.07),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('PHAN', 'Product Handling Charge', 1.00, 983.3400, 0.18, 1160.34),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 630.0000, 0.18, 743.40),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2189300 · E310000084198 · 2026-06-03 · RD$ 26,064.55
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0022', '2026-06-03', 'E310000084198', 'DR-Y002-2189300', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 22088.60, 0, 3975.95, 26064.55, false, false,
    'Credito', 25, 26064.55, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000084198')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 11454.5600, 0.18, 13516.38),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3346.6700, 0.18, 3949.07),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 464.1700, 0.18, 547.72),
  ('PHAN', 'Product Handling Charge', 1.00, 687.2700, 0.18, 810.98),
  ('JVPT', 'Joint Venture Payment', 1.00, 3037.9200, 0.18, 3584.75),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 597.4600, 0.18, 705.00),
  ('NACF', 'National Advertising Campaign', 1.00, 337.5500, 0.18, 398.31)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2198266 · E310000084637 · 2026-06-10 · RD$ 1,043.99
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0023', '2026-06-10', 'E310000084637', 'DR-Y002-2198266', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 884.74, 0, 159.25, 1043.99, false, false,
    'Credito', 25, 1043.99, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000084637')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 884.7400, 0.18, 1043.99)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2200954 · E310000084922 · 2026-06-12 · RD$ 32,625.79
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0024', '2026-06-12', 'E310000084922', 'DR-Y002-2200954', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 27648.98, 0, 4976.81, 32625.79, false, false,
    'Credito', 25, 32625.79, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000084922')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8630.6100, 0.18, 10184.12),
  ('NACF', 'National Advertising Campaign', 1.00, 441.6900, 0.18, 521.19),
  ('CO0101', 'RP CHOCOLATERA', 1.00, 6384.1900, 0.18, 7533.34),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3346.6700, 0.18, 3949.07),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 550.0000, 0.18, 649.00),
  ('PHAN', 'Product Handling Charge', 1.00, 900.8900, 0.18, 1063.05),
  ('JVPT', 'Joint Venture Payment', 1.00, 3975.1500, 0.18, 4690.68),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 781.7800, 0.18, 922.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2211145 · E310000085426 · 2026-06-23 · RD$ 8,296.78
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0025', '2026-06-23', 'E310000085426', 'DR-Y002-2211145', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 7031.18, 0, 1265.60, 8296.78, false, false,
    'Credito', 25, 8296.78, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000085426')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT4031', 'SALES ORDER FORM-25 PACK-DR', 1.00, 202.7900, 0.18, 239.29),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3346.6700, 0.18, 3949.07),
  ('RP2286', 'RP PRESSURE COOKER HANDLE', 1.00, 338.9100, 0.18, 399.91),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 1.00, 542.1600, 0.18, 639.75),
  ('SP0430', 'INNOVE 20CM RIM/WINDOW GASKETS-RED', 2.00, 427.9100, 0.18, 1009.87),
  ('SP5050', 'ROYALSHINE', 1.00, 203.9700, 0.18, 240.68),
  ('PSHP', 'Product Shipping Charge', 1.00, 926.0000, 0.18, 1092.68),
  ('LT2709', 'DR CREDIT APP & PAGARE-SPA-25PK', 2.00, 307.4300, 0.18, 725.53)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2228385 · E310000086664 · 2026-07-10 · RD$ 1,042.05
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0026', '2026-07-10', 'E310000086664', 'DR-Y002-2228385', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 883.09, 0, 158.96, 1042.05, false, false,
    'Credito', 25, 1042.05, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000086664')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 883.0900, 0.18, 1042.05)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2232873 · E310000087006 · 2026-07-15 · RD$ 28,595.78
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0027', '2026-07-15', 'E310000087006', 'DR-Y002-2232873', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 24233.72, 0, 4362.06, 28595.78, false, false,
    'Credito', 25, 28595.78, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000087006')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9201', 'INNOVE 316L 2QT/16CM SAUCEPAN', 1.00, 4936.4900, 0.18, 5825.06),
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 8061.3500, 0.18, 9512.39),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 3995.8000, 0.18, 4715.04),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1019.6200, 0.18, 1203.15),
  ('JVPT', 'Joint Venture Payment', 1.00, 3102.5600, 0.18, 3661.02),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 610.1700, 0.18, 720.00),
  ('NACF', 'National Advertising Campaign', 1.00, 344.7300, 0.18, 406.78)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2237342 · E310000087244 · 2026-07-20 · RD$ 37,853.69
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0028', '2026-07-20', 'E310000087244', 'DR-Y002-2237342', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32079.39, 0, 5774.30, 37853.69, false, false,
    'Credito', 25, 37853.69, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000087244')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9236', 'INNOVE 316L4QT/20CM DUTCH OVN W/CVR', 1.00, 9857.7100, 0.18, 11632.10),
  ('NACF', 'National Advertising Campaign', 1.00, 540.8000, 0.18, 638.14),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8812.8300, 0.18, 10399.14),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2635.4800, 0.18, 3109.87),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 650.0000, 0.18, 767.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1120.2300, 0.18, 1321.87),
  ('JVPT', 'Joint Venture Payment', 1.00, 4867.1400, 0.18, 5743.23),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 957.2000, 0.18, 1129.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2237343 · E310000087261 · 2026-07-20 · RD$ 38,672.70
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0029', '2026-07-20', 'E310000087261', 'DR-Y002-2237343', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32773.47, 0, 5899.23, 38672.70, false, false,
    'Credito', 25, 38672.70, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000087261')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9236', 'INNOVE 316L4QT/20CM DUTCH OVN W/CVR', 1.00, 9857.7100, 0.18, 11632.10),
  ('NACF', 'National Advertising Campaign', 1.00, 540.8000, 0.18, 638.14),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8812.8300, 0.18, 10399.14),
  ('PR2139', 'RP ESPRESSO MAKER 10 CUP DWC-PLUS', 1.00, 3329.5600, 0.18, 3928.88),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 650.0000, 0.18, 767.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1120.2300, 0.18, 1321.87),
  ('JVPT', 'Joint Venture Payment', 1.00, 4867.1400, 0.18, 5743.23),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 957.2000, 0.18, 1129.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2240078 · E310000087541 · 2026-07-24 · RD$ 37,915.20
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0030', '2026-07-24', 'E310000087541', 'DR-Y002-2240078', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32131.53, 0, 5783.67, 37915.20, false, false,
    'Credito', 25, 37915.20, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000087541')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 11696.4000, 0.18, 13801.75),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8812.8300, 0.18, 10399.14),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 780.0000, 0.18, 920.40),
  ('PHAN', 'Product Handling Charge', 1.00, 1230.5500, 0.18, 1452.05),
  ('JVPT', 'Joint Venture Payment', 1.00, 5332.5200, 0.18, 6292.37),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1048.7300, 0.18, 1237.50),
  ('NACF', 'National Advertising Campaign', 1.00, 592.5000, 0.18, 699.15)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2240079 · E340000023055 · 2026-07-24 · RD$ 5,825.06
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0031', '2026-07-24', 'E340000023055', 'DR-Y002-2240079', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 4936.49, 0, 888.57, 5825.06, false, false,
    'Credito', 25, 5825.06, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E340000023055')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9201', 'INNOVE 316L 2QT/16CM SAUCEPAN', 1.00, 4936.4900, 0.18, 5825.06)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2244656 · E310000088017 · 2026-08-03 · RD$ 73,000.38
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0032', '2026-08-03', 'E310000088017', 'DR-Y002-2244656', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 61864.73, 0, 11135.65, 73000.38, false, false,
    'Credito', 25, 73000.38, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000088017')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 1.00, 31335.5600, 0.18, 36975.96),
  ('JVPT', 'Joint Venture Payment', 1.00, 8725.9400, 0.18, 10296.61),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1716.1000, 0.18, 2025.00),
  ('NACF', 'National Advertising Campaign', 1.00, 969.5500, 0.18, 1144.07),
  ('PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 1.00, 2175.6000, 0.18, 2567.21),
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4518.2400, 0.18, 5331.52),
  ('CU0800', 'ROYAL PRESTIGE 5PC KTCHEN KNIFE SET', 1.00, 5632.2900, 0.18, 6646.10),
  ('SP0440', 'INNOVE 26CM RIM/WINDOW GASKETS-RED', 2.00, 530.1900, 0.18, 1251.25),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 1350.0000, 0.18, 1593.00),
  ('PHAN', 'Product Handling Charge', 1.00, 2218.0700, 0.18, 2617.32)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2244657 · E310000088018 · 2026-08-03 · RD$ 546.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0033', '2026-08-03', 'E310000088018', 'DR-Y002-2244657', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 463.00, 0, 83.34, 546.34, false, false,
    'Credito', 25, 546.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000088018')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2257718 · E310000088742 · 2026-08-10 · RD$ 6,263.54
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0034', '2026-08-10', 'E310000088742', 'DR-Y002-2257718', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 5308.08, 0, 955.46, 6263.54, false, false,
    'Credito', 25, 6263.54, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000088742')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT2493', 'GIFT HOLDER 10PK - SPA', 1.00, 344.1400, 0.18, 406.09),
  ('RP9712', 'EASYRELEASE GLASS COV WHISTLE KNOB', 2.00, 626.3000, 0.18, 1478.07),
  ('SP0081', '3PC NEW DELUXE SERVING SET 430SS', 6.00, 541.3900, 0.18, 3833.04),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2257719 · E310000088745 · 2026-08-10 · RD$ 1,035.28
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0035', '2026-08-10', 'E310000088745', 'DR-Y002-2257719', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 877.36, 0, 157.92, 1035.28, false, false,
    'Credito', 25, 1035.28, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000088745')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 877.3600, 0.18, 1035.28)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2264520 · E310000089197 · 2026-08-17 · RD$ 24,416.71
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0036', '2026-08-17', 'E310000089197', 'DR-Y002-2264520', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 20692.13, 0, 3724.58, 24416.71, false, false,
    'Credito', 25, 24416.71, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000089197')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('NACF', 'National Advertising Campaign', 1.00, 254.9600, 0.18, 300.85),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 13899.3400, 0.18, 16401.22),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 320.0000, 0.18, 377.60),
  ('PHAN', 'Product Handling Charge', 1.00, 833.9600, 0.18, 984.07),
  ('JVPT', 'Joint Venture Payment', 1.00, 2294.6000, 0.18, 2707.63),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 451.2700, 0.18, 532.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2270692 · E310000089684 · 2026-08-25 · RD$ 45,784.15
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0037', '2026-08-25', 'E310000089684', 'DR-Y002-2270692', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 38800.13, 0, 6984.02, 45784.15, false, false,
    'Credito', 25, 45784.15, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000089684')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 7883.4000, 0.18, 9302.41),
  ('NACF', 'National Advertising Campaign', 1.00, 682.2700, 0.18, 805.08),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 3907.6000, 0.18, 4610.97),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 13899.3400, 0.18, 16401.22),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 900.0000, 0.18, 1062.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1541.4200, 0.18, 1818.88),
  ('JVPT', 'Joint Venture Payment', 1.00, 6140.4700, 0.18, 7245.75),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1207.6300, 0.18, 1425.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2270693 · E310000089685 · 2026-08-25 · RD$ 33,436.14
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0038', '2026-08-25', 'E310000089685', 'DR-Y002-2270693', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 28335.72, 0, 5100.42, 33436.14, false, false,
    'Credito', 25, 33436.14, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000089685')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('NACF', 'National Advertising Campaign', 1.00, 463.2300, 0.18, 546.61),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 819.9200, 0.18, 967.51),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8618.2900, 0.18, 10169.58),
  ('CO9232', 'INNOVE 316L10"/24CM GRMT SKLT W/CVR', 1.00, 6767.1900, 0.18, 7985.28),
  ('PR2128', 'RP ESPRESSO MAKER 4 CUP DWC', 1.00, 3341.9000, 0.18, 3943.44),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 595.0000, 0.18, 702.10),
  ('PHAN', 'Product Handling Charge', 1.00, 923.1300, 0.18, 1089.29),
  ('JVPT', 'Joint Venture Payment', 1.00, 4169.0600, 0.18, 4919.49)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2270771 · E310000089741 · 2026-08-26 · RD$ 43,462.55
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0039', '2026-08-26', 'E310000089741', 'DR-Y002-2270771', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 36832.67, 0, 6629.88, 43462.55, false, false,
    'Credito', 25, 43462.55, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000089741')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('AP2801', 'RP AIR FILTER 120-127V TYPE A', 1.00, 25530.1300, 0.18, 30125.55),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1531.8100, 0.18, 1807.54),
  ('JVPT', 'Joint Venture Payment', 1.00, 5817.3000, 0.18, 6864.41),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1144.0700, 0.18, 1350.00),
  ('NACF', 'National Advertising Campaign', 1.00, 646.3600, 0.18, 762.70)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2284002 · E310000090494 · 2026-09-08 · RD$ 32,743.02
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0040', '2026-09-08', 'E310000090494', 'DR-Y002-2284002', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 27748.33, 0, 4994.69, 32743.02, false, false,
    'Credito', 25, 32743.02, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000090494')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1458', 'RP PRESSURE COOKER 10L W/RECPE BOOK', 1.00, 16424.4500, 0.18, 19380.85),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('FXIN', 'Closed End Interest Charge', 1.00, 1875.0000, 0.18, 2212.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 500.0000, 0.18, 590.00),
  ('PHAN', 'Product Handling Charge', 1.00, 985.4700, 0.18, 1162.85),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2286068 · E310000090805 · 2026-09-10 · RD$ 1,043.60
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0041', '2026-09-10', 'E310000090805', 'DR-Y002-2286068', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 884.41, 0, 159.19, 1043.60, false, false,
    'Credito', 25, 1043.60, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000090805')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 884.4100, 0.18, 1043.60)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2313589 · E340000025838 · 2026-10-08 · RD$ 13,899.34
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0042', '2026-10-08', 'E340000025838', 'DR-Y002-2313589', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 13899.34, 0, 0.00, 13899.34, false, false,
    'Credito', 25, 13899.34, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E340000025838')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 13899.3400, 0.00, 13899.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2315252 · E310000093253 · 2026-10-10 · RD$ 1,094.30
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0043', '2026-10-10', 'E310000093253', 'DR-Y002-2315252', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 927.37, 0, 166.93, 1094.30, false, false,
    'Credito', 25, 1094.30, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000093253')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('TECH', 'Technology Fee', 1.00, 927.3700, 0.18, 1094.30)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2321108 · E310000093969 · 2026-10-16 · RD$ 302,464.77
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0044', '2026-10-16', 'E310000093969', 'DR-Y002-2321108', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 256326.08, 0, 46138.69, 302464.77, false, false,
    'Credito', 25, 302464.77, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000093969')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9736', '8" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 9555.3600, 0.18, 11275.32),
  ('CO9757', '3.5QT/26CM ER SAUTE W/HH&CVRGLS RTK', 1.00, 12388.4500, 0.18, 14618.37),
  ('PR0333', 'ROYAL PRESTIGE SHOWER FILTER', 1.00, 6154.7500, 0.18, 7262.60),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 3500.0000, 0.18, 4130.00),
  ('PHAN', 'Product Handling Charge', 1.00, 10027.2900, 0.18, 11832.20),
  ('JVPT', 'Joint Venture Payment', 1.00, 44793.1600, 0.18, 52855.93),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 8809.3200, 0.18, 10395.00),
  ('NACF', 'National Advertising Campaign', 1.00, 4977.0200, 0.18, 5872.88),
  ('JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 1.00, 31405.6500, 0.18, 37058.67),
  ('ES0082', 'RP POWER BLENDER MAX 120-127V VPU', 1.00, 27224.1800, 0.18, 32124.53),
  ('CU0831', 'ROYAL PRESTIGE ALL-IN-ONE KNFE BLCK', 1.00, 20415.9900, 0.18, 24090.87),
  ('CO9961', 'INNOVE 10PC SET + PERFECT POP DR', 1.00, 55661.4800, 0.18, 65680.55),
  ('CO0902', 'ROYAL PRESTIGE EXPERTEA', 1.00, 10470.4700, 0.18, 12355.15),
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4528.3400, 0.18, 5343.44),
  ('PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 1.00, 2180.4700, 0.18, 2572.95),
  ('PR0021', 'BAMBOO CUTTNG BOARD W/SILICON-SMALL', 1.00, 1596.1500, 0.18, 1883.46)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2321109 · E310000093984 · 2026-10-16 · RD$ 38,084.14
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0045', '2026-10-16', 'E310000093984', 'DR-Y002-2321109', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 32274.69, 0, 5809.45, 38084.14, false, false,
    'Credito', 25, 38084.14, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000093984')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 790.0000, 0.18, 932.20),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('JVPT', 'Joint Venture Payment', 1.00, 5397.1500, 0.18, 6368.64),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1061.4400, 0.18, 1252.50),
  ('NACF', 'National Advertising Campaign', 1.00, 599.6900, 0.18, 707.63),
  ('CO9738', '10" DER SKILLET SE W/GLS /3PC TOOL', 1.00, 11722.5600, 0.18, 13832.62),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8832.5400, 0.18, 10422.40),
  ('PHAN', 'Product Handling Charge', 1.00, 1233.3100, 0.18, 1455.31)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2321110 · E310000093966 · 2026-10-16 · RD$ 65,252.10
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0046', '2026-10-16', 'E310000093966', 'DR-Y002-2321110', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 55298.39, 0, 9953.71, 65252.10, false, false,
    'Credito', 25, 65252.10, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000093966')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PR1460', 'RP JUICER 3PC STRAINER', 1.00, 4528.3400, 0.18, 5343.44),
  ('PHAN', 'Product Handling Charge', 1.00, 1884.3400, 0.18, 2223.52),
  ('PR1459', 'ROYAL PRESTIGE JUICE SQUEEZER', 1.00, 2180.4700, 0.18, 2572.95),
  ('JU0038', 'RP JUICE EXTRACTOR WITH RECIPE BOOK', 1.00, 31405.6500, 0.18, 37058.67),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 1250.0000, 0.18, 1475.00),
  ('JVPT', 'Joint Venture Payment', 1.00, 8725.9400, 0.18, 10296.61),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1716.1000, 0.18, 2025.00),
  ('NACF', 'National Advertising Campaign', 1.00, 969.5500, 0.18, 1144.07),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2326357 · E310000094375 · 2026-10-22 · RD$ 33,796.65
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0047', '2026-10-22', 'E310000094375', 'DR-Y002-2326357', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 28641.24, 0, 5155.41, 33796.65, false, false,
    'Credito', 25, 33796.65, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094375')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO1458', 'RP PRESSURE COOKER 10L W/RECPE BOOK', 1.00, 16772.4700, 0.18, 19791.51),
  ('PR0609', '24PC AMERICANA FLATWR SET-18/8 DR', 1.00, 2300.5100, 0.18, 2714.60),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 598.5000, 0.18, 706.23),
  ('PHAN', 'Product Handling Charge', 1.00, 1006.3500, 0.18, 1187.49),
  ('JVPT', 'Joint Venture Payment', 1.00, 4072.1000, 0.18, 4805.08),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 800.8500, 0.18, 945.00),
  ('NACF', 'National Advertising Campaign', 1.00, 452.4600, 0.18, 533.90)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2326358 · E310000094313 · 2026-10-22 · RD$ 46,583.01
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0048', '2026-10-22', 'E310000094313', 'DR-Y002-2326358', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 39477.13, 0, 7105.88, 46583.01, false, false,
    'Credito', 25, 46583.01, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094313')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 900.0000, 0.18, 1062.00),
  ('PHAN', 'Product Handling Charge', 1.00, 1579.7400, 0.18, 1864.09),
  ('JVPT', 'Joint Venture Payment', 1.00, 6140.4700, 0.18, 7245.75),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1207.6300, 0.18, 1425.00),
  ('NACF', 'National Advertising Campaign', 1.00, 682.2700, 0.18, 805.08),
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 8079.3900, 0.18, 9533.68),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 4004.7500, 0.18, 4725.60),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14244.8800, 0.18, 16808.96)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2329296 · E310000094511 · 2026-10-26 · RD$ 63,465.77
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0049', '2026-10-26', 'E310000094511', 'DR-Y002-2329296', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 53784.54, 0, 9681.23, 63465.77, false, false,
    'Credito', 25, 63465.77, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094511')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 1270.0000, 0.18, 1498.60),
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14244.8800, 0.18, 16808.96),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('PHAN', 'Product Handling Charge', 1.00, 2182.0500, 0.18, 2574.82),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('JVPT', 'Joint Venture Payment', 1.00, 8661.3100, 0.18, 10220.35),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 1703.3900, 0.18, 2010.00),
  ('NACF', 'National Advertising Campaign', 1.00, 962.3600, 0.18, 1135.58),
  ('CO9203', 'INNOVE 316L 3QT/20CM DUTCH OVEN', 1.00, 6587.5800, 0.18, 7773.34),
  ('CO9207', 'INNOVE 316L 6QT/26CM DUTCH OVEN', 1.00, 8079.3900, 0.18, 9533.68),
  ('CO9086', 'INNOVE 20CM MEDIUM COVER', 1.00, 3450.8300, 0.18, 4071.98),
  ('CO9087', 'INNOVE 26CM LARGE COVER', 1.00, 4004.7500, 0.18, 4725.60)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2329297 · E310000094469 · 2026-10-26 · RD$ 13,204.84
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0050', '2026-10-26', 'E310000094469', 'DR-Y002-2329297', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 11190.54, 0, 2014.30, 13204.84, false, false,
    'Credito', 25, 13204.84, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094469')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PR0333', 'ROYAL PRESTIGE SHOWER FILTER', 1.00, 6154.7500, 0.18, 7262.60),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 200.0000, 0.18, 236.00),
  ('JVPT', 'Joint Venture Payment', 1.00, 1680.5500, 0.18, 1983.05),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 330.5100, 0.18, 390.00),
  ('NACF', 'National Advertising Campaign', 1.00, 186.7300, 0.18, 220.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2330212 · E310000094538 · 2026-10-27 · RD$ 14,236.68
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0051', '2026-10-27', 'E310000094538', 'DR-Y002-2330212', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 12064.99, 0, 2171.69, 14236.68, false, false,
    'Credito', 25, 14236.68, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094538')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('LT2709', 'DR CREDIT APP & PAGARE-SPA-25PK', 2.00, 314.6200, 0.18, 742.50),
  ('SP0111', 'RP 2 CUP FOOD STORAGE W/LID-6 PACK', 1.00, 700.6800, 0.18, 826.80),
  ('SP0113', 'RP FOOD STORAGE - 8 PC SET', 1.00, 958.1900, 0.18, 1130.66),
  ('SP0135', '4 PC DOUBLE WALL MUG SET', 1.00, 1556.7200, 0.18, 1836.93),
  ('SP0136', '2PC DOUBLE WALL 16OZ MUG SET', 1.00, 1216.9200, 0.18, 1435.97),
  ('SP5050', 'ROYALSHINE', 1.00, 208.7400, 0.18, 246.31),
  ('PSHP', 'Product Shipping Charge', 1.00, 926.0000, 0.18, 1092.68),
  ('LT4031', 'SALES ORDER FORM-25 PACK-DR', 1.00, 207.5400, 0.18, 244.90),
  ('PR2138', 'RP ESPRESSO MAKER 4 CUP DWC-PLUS', 1.00, 2749.5000, 0.18, 3244.41),
  ('RP2286', 'RP PRESSURE COOKER HANDLE', 1.00, 346.8500, 0.18, 409.28),
  ('RP2287', 'RP PRESSURE COOKER SILICONE GASKET', 1.00, 311.8600, 0.18, 367.99),
  ('RP4802', 'ROYAL PRESTIGE WHISTLE', 1.00, 241.1500, 0.18, 284.56),
  ('SE0091', 'RP DIST JR PIN', 1.00, 459.5600, 0.18, 542.28),
  ('SE0092', 'RP DISTR PIN', 1.00, 442.3400, 0.18, 521.96),
  ('SP0091', '3PC NEW ENHANCEMENT SERV SET-430SS', 2.00, 554.8500, 0.18, 1309.45)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2331117 · E310000094717 · 2026-10-28 · RD$ 13,240.24
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0052', '2026-10-28', 'E310000094717', 'DR-Y002-2331117', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 11220.54, 0, 2019.70, 13240.24, false, false,
    'Credito', 25, 13240.24, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094717')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('PR0333', 'ROYAL PRESTIGE SHOWER FILTER', 1.00, 6154.7500, 0.18, 7262.60),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 230.0000, 0.18, 271.40),
  ('JVPT', 'Joint Venture Payment', 1.00, 1680.5500, 0.18, 1983.05),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 330.5100, 0.18, 390.00),
  ('NACF', 'National Advertising Campaign', 1.00, 186.7300, 0.18, 220.34)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2331118 · E310000094719 · 2026-10-28 · RD$ 74,058.16
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0053', '2026-10-28', 'E310000094719', 'DR-Y002-2331118', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 62761.15, 0, 11297.01, 74058.16, false, false,
    'Credito', 25, 74058.16, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094719')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('RCCR', 'Contract Processing Charge', 1.00, 2175.0000, 0.18, 2566.50),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 1400.0000, 0.18, 1652.00),
  ('JVPT', 'Joint Venture Payment', 1.00, 10891.2600, 0.18, 12851.69),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 2141.9500, 0.18, 2527.50),
  ('NACF', 'National Advertising Campaign', 1.00, 1210.1400, 0.18, 1427.97),
  ('CO9254', 'INNOVE 316L 8PC SPECIAL W/CKBK & RS', 1.00, 41962.0800, 0.18, 49515.25),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('PHAN', 'Product Handling Charge', 1.00, 2517.7200, 0.18, 2970.91)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2331119 · E310000094706 · 2026-10-28 · RD$ 25,688.63
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0054', '2026-10-28', 'E310000094706', 'DR-Y002-2331119', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 21770.03, 0, 3918.60, 25688.63, false, false,
    'Credito', 25, 25688.63, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094706')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('CO9779', '3.5QT/26CM ER SAUTE W/CVR/3PC TOOL', 1.00, 14244.8800, 0.18, 16808.96),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 450.0000, 0.18, 531.00),
  ('PHAN', 'Product Handling Charge', 1.00, 854.6900, 0.18, 1008.53),
  ('JVPT', 'Joint Venture Payment', 1.00, 3102.5600, 0.18, 3661.02),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 610.1700, 0.18, 720.00),
  ('NACF', 'National Advertising Campaign', 1.00, 344.7300, 0.18, 406.78)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- DR-Y002-2331345 · E310000094754 · 2026-10-29 · RD$ 27,556.57
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', 'OC-0055', '2026-10-29', 'E310000094754', 'DR-Y002-2331345', '09', 'Compra de Merc', (SELECT id FROM public.proveedores WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND regexp_replace(COALESCE(rnc,''), '\D', '', 'g') = '130743819' ORDER BY id LIMIT 1), '8e0bd843-eea1-4a3f-903c-995ecc760559',
    0.00, 23353.02, 0, 4203.55, 27556.57, false, false,
    'Credito', 25, 27556.57, 0, 'PAGADA', '[]'::jsonb, 'DOP', 'Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.'
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND ncf = 'E310000094754')
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT '3e8823fa-ec63-48c2-8305-2396c1a08e42', c.id, (SELECT id FROM public.productos WHERE tenant_id = '3e8823fa-ec63-48c2-8305-2396c1a08e42' AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES
  ('JVPT', 'Joint Venture Payment', 1.00, 4052.7100, 0.18, 4782.20),
  ('RCMC', 'Revolving Credit Risk Charge', 1.00, 527.0000, 0.18, 621.86),
  ('PHAN', 'Product Handling Charge', 1.00, 529.9500, 0.18, 625.34),
  ('CLAC', 'Territory Director Meeting Fund Charge', 1.00, 797.0300, 0.18, 940.50),
  ('NACF', 'National Advertising Campaign', 1.00, 450.3100, 0.18, 531.37),
  ('CO9317', 'INNOVE 10"/26CM PAELLA PAN W/CVR', 1.00, 8832.5400, 0.18, 10422.40),
  ('PR2138', 'RP ESPRESSO MAKER 4 CUP DWC-PLUS', 1.00, 2749.5000, 0.18, 3244.41),
  ('PR0196', '6 PIECE KITCHEN TOOL SET', 1.00, 2641.3700, 0.18, 3116.82),
  ('SP0145', 'DOUBLE WALL UTENSIL HOLDER', 1.00, 609.6100, 0.18, 719.34),
  ('PSHP', 'Product Shipping Charge', 1.00, 463.0000, 0.18, 546.34),
  ('RCCR', 'Contract Processing Charge', 1.00, 1700.0000, 0.18, 2006.00)
) AS v(codigo, descripcion, cantidad, costo, itbis, importe);

-- Totales: 55 compras · base RD$ 1,556,263.89 · ITBIS RD$ 277,625.54
SELECT registrar_migracion('elite_royal_prestige_compras.sql');
