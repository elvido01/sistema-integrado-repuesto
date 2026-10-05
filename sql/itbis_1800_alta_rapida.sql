-- =====================================================================
-- ITBIS 1800%: el alta rápida de la Orden de Compra guardaba 18, no 0.18
-- =====================================================================
-- (05/10/2026) TAZA XPRESS 011124, creada desde "Producto Nuevo Rápido" de
-- la orden, entró a Compras con ITBIS 1800% (RD$9,610 en una línea de
-- RD$534). itbis_pct va en decimal (0.18). El formulario ya es una lista
-- (18% por defecto) y normaliza; aquí se arreglan los que ya entraron.
-- Solo Morla tenía casos (3 productos, 4 líneas de orden, 0 compras).
-- =====================================================================

UPDATE public.productos
   SET itbis_pct = itbis_pct / 100
 WHERE itbis_pct > 1 AND itbis_pct <= 100;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT orden_compra_id FROM public.ordenes_compra_detalle
     WHERE itbis_pct > 1 AND itbis_pct <= 100
  LOOP
    UPDATE public.ordenes_compra_detalle
       SET itbis_pct = itbis_pct / 100
     WHERE orden_compra_id = r.orden_compra_id AND itbis_pct > 1 AND itbis_pct <= 100;
    PERFORM public._recalcular_totales_orden_compra(r.orden_compra_id);
  END LOOP;
END $$;

SELECT public.registrar_migracion('itbis_1800_alta_rapida.sql');
