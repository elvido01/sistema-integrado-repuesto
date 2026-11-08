-- =====================================================================
-- Compras con "ITBIS incluido": total de línea con el ITBIS doble (07/11/2026)
-- ---------------------------------------------------------------------
-- En las compras marcadas itbis_incluido, compras_detalle.importe quedó con
-- el ITBIS sumado otra vez (las líneas se calculaban antes de marcar la
-- casilla y no se recalculaban). Ej.: OC-0393 de Morla, 12 × 359.78 =
-- 4,317.36 pero la línea decía 5,094.48.
-- La cabecera de la compra (total_compra, gravado, ITBIS) está BIEN; solo la
-- línea. La pantalla ya lo calcula bien (src/lib/compraLinea.js).
--
-- Se corrige una línea solo si:
--   1. su importe es la base + el ITBIS (el doble típico; se aceptan unos
--      centavos de diferencia por cómo se redondeó el ITBIS), y
--   2. la suma correcta de las líneas de la compra CUADRA con el total de la
--      compra (≤ RD$1); las financiadas en pagarés (OC-0002-01, -02…) se
--      comparan con la suma de todos sus pagarés.
-- La base se redondea igual que la pantalla: subtotal y descuento por
-- separado. Diferencias de centavos (paquetes abiertos, costos con muchos
-- decimales) no se tocan.
-- Cambia un dato que solo se lee (reportes, ticket): no mueve inventario,
-- caja ni cuentas por pagar. El único trigger de la tabla es AFTER INSERT.
-- =====================================================================

CREATE TEMP TABLE _lineas ON COMMIT DROP AS
SELECT d.id, d.compra_id, d.importe, x.base,
       x.base + trunc(x.base * COALESCE(d.itbis_pct, 0) * 100) / 100 AS con_itbis
  FROM public.compras_detalle d
  JOIN public.compras c ON c.id = d.compra_id AND c.itbis_incluido
  CROSS JOIN LATERAL (
    SELECT round(round(d.cantidad * d.costo_unitario, 2)
                 - round(round(d.cantidad * d.costo_unitario, 2) * COALESCE(d.descuento_pct, 0) / 100.0, 2), 2) AS base
  ) x;

CREATE TEMP TABLE _ref ON COMMIT DROP AS
SELECT c.id,
       -- pagaré = número base + '-NN' (OC-0002-01); 'OC-0393' NO es pagaré
       CASE WHEN c.numero ~ '-[0-9]+-[0-9]{1,3}$'
            THEN (SELECT sum(c2.total_compra) FROM public.compras c2
                   WHERE c2.tenant_id = c.tenant_id
                     AND c2.numero LIKE regexp_replace(c.numero, '-[0-9]+$', '') || '-%')
            ELSE c.total_compra END AS total_ref
  FROM public.compras c
 WHERE c.itbis_incluido;

UPDATE public.compras_detalle d
   SET importe = l.base
  FROM _lineas l
  JOIN _ref r ON r.id = l.compra_id
 WHERE d.id = l.id
   AND abs(l.importe - l.con_itbis) <= 0.05 + l.base * 0.0001    -- 1. el doble típico (centavos de redondeo del ITBIS)
   AND l.con_itbis <> l.base
   AND abs((SELECT sum(l2.base) FROM _lineas l2 WHERE l2.compra_id = l.compra_id) - r.total_ref) <= 1;  -- 2. cuadra

-- Lo que queda con líneas que no cuadran con la cabecera (para revisar a mano):
SELECT t.nombre, c.numero, c.fecha, r.total_ref,
       sum(d.importe) AS suma_lineas
  FROM public.compras c
  JOIN _ref r ON r.id = c.id
  JOIN public.compras_detalle d ON d.compra_id = c.id
  JOIN public.tenants t ON t.id = c.tenant_id
 GROUP BY t.nombre, c.numero, c.fecha, r.total_ref
HAVING abs(sum(d.importe) - r.total_ref) > 1
 ORDER BY t.nombre, c.fecha;

SELECT public.registrar_migracion('compras_itbis_incluido_importe.sql');
