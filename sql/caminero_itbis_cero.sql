-- ============================================================
-- Caminero Motors: ITBIS 0% en todos los productos
-- Los vehículos de motor en RD no causan ITBIS (tienen otros
-- impuestos: placa, CO2, etc). Las facturas deben mostrar
-- ITBIS = 0 y Subtotal = Total.
-- ============================================================

UPDATE public.productos
   SET itbis_pct = 0
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';

-- Opcional: cambiar el default de la columna para que los
-- nuevos productos de cualquier tenant respeten el itbis_pct
-- que les pongan en el form (ya lo hace — sin cambios aquí).

NOTIFY pgrst, 'reload schema';
