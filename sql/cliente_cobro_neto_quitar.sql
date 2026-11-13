-- 13/11/2026 — Se quita «Factura desde lo que paga» (sql/cliente_cobro_neto.sql):
-- al dueño le resultó confuso ver tres totales distintos (cliente paga,
-- total a pagar y total factura). La columna queda sin uso; AMSTAR vuelve a
-- la factura normal.
UPDATE public.clientes SET cobro_neto = false WHERE cobro_neto;
SELECT registrar_migracion('cliente_cobro_neto_quitar.sql');
