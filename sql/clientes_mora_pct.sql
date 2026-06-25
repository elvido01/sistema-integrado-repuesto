-- =====================================================================
-- clientes.mora_pct: % de mora por periodo de atraso (por cliente)
-- ---------------------------------------------------------------------
-- Para empresas dealer/financiera (Caminero, MotoPrestamos). Se captura en
-- el catalogo de clientes (Credito y Facturacion) y se usa al crear el
-- prestamo: prestamos.mora_pct toma este valor, y get_prestamos_cliente
-- calcula la mora pendiente con esa tasa. Re-ejecutable.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS mora_pct numeric(7,4) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

SELECT 'clientes.mora_pct listo' AS status;
