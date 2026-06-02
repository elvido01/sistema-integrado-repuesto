-- Diagnostico y recalculo opcional de margenes reales con ITBIS incluido.
--
-- Formula comercial usada en mercancias:
-- precio1 = costo * (1 + margen_pct / 100)
--
-- El ITBIS se separa al facturar: PRECIO + ITBIS = MONTO.
--
-- 1) Vista previa: compara margen guardado vs margen real actual.
SELECT
  p.codigo,
  p.descripcion,
  pr.tipo,
  pr.costo,
  p.itbis_pct,
  pr.margen_pct AS margen_configurado,
  pr.precio1 AS precio_actual_sin_itbis,
  ROUND((pr.precio1 * (1 + COALESCE(p.itbis_pct, 0))), 2) AS monto_con_itbis,
  ROUND(((pr.precio1 / NULLIF(pr.costo, 0)) - 1) * 100, 2) AS margen_actual_sobre_costo,
  ROUND((pr.costo * (1 + (pr.margen_pct / 100))), 2) AS precio_sugerido_sin_itbis,
  COALESCE(ce.precio2_descuento_pct, 10) AS precio2_descuento_pct,
  COALESCE(ce.precio3_descuento_pct, 15) AS precio3_descuento_pct,
  ROUND((pr.costo * (1 + (pr.margen_pct / 100)) * (1 - COALESCE(ce.precio2_descuento_pct, 10) / 100)), 2) AS precio2_sugerido,
  ROUND((pr.costo * (1 + (pr.margen_pct / 100)) * (1 - COALESCE(ce.precio3_descuento_pct, 15) / 100)), 2) AS precio3_sugerido
FROM public.presentaciones pr
JOIN public.productos p ON p.id = pr.producto_id
LEFT JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
WHERE pr.costo > 0
ORDER BY p.codigo, pr.tipo;

-- 2) Recalculo opcional de presentaciones.
-- Descomenta y ejecuta solo si quieres recalcular precios existentes segun margen_pct.
--
-- UPDATE public.presentaciones pr
-- SET
--   precio1 = ROUND((pr.costo * (1 + (pr.margen_pct / 100))), 2),
--   precio2 = CASE
--     WHEN pr.auto_precio2 THEN ROUND((pr.costo * (1 + (pr.margen_pct / 100)) * (1 - COALESCE(ce.precio2_descuento_pct, 10) / 100)), 2)
--     ELSE pr.precio2
--   END,
--   precio3 = CASE
--     WHEN pr.auto_precio3 THEN ROUND((pr.costo * (1 + (pr.margen_pct / 100)) * (1 - COALESCE(ce.precio3_descuento_pct, 15) / 100)), 2)
--     ELSE pr.precio3
--   END,
--   precio_final = ROUND((pr.costo * (1 + (pr.margen_pct / 100)) * (1 - COALESCE(pr.descuento_pct, 0) / 100)), 2)
-- FROM public.productos p
-- LEFT JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
-- WHERE p.id = pr.producto_id
--   AND pr.costo > 0
--   AND pr.margen_pct > 0;

-- 3) Recalculo opcional del precio principal del producto desde la presentacion que afecta factura.
--
-- UPDATE public.productos p
-- SET
--   precio = pr.precio1,
--   costo = pr.costo
-- FROM public.presentaciones pr
-- WHERE pr.producto_id = p.id
--   AND pr.afecta_ft = true;
