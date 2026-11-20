-- =====================================================================
-- Documentación del cliente: imagen "Registro DGII" (20/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño para las empresas tipo financiera (las de hoy y las
-- futuras): una imagen más en Notas y Comentarios / Documentación Cliente.
-- La pantalla la muestra según config_empresa.tipo_negocio = 'financiera'
-- (src/lib/documentosCliente.js). Solo agrega la columna; mismo bucket y
-- mismas políticas que las otras imágenes.
-- =====================================================================
BEGIN;
ALTER TABLE public.documentacion_clientes ADD COLUMN IF NOT EXISTS registro_dgii_path text;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT public.registrar_migracion('documentacion_registro_dgii.sql');
