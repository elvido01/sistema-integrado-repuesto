-- =====================================================================
-- Ficha de cliente ampliada para empresas tipo DEALER (Caminero Motors)
-- ---------------------------------------------------------------------
-- Digitaliza el formulario fisico "DATOS DE CLIENTE" que usan los
-- dealers que venden a credito (datos de localizacion + referencias
-- para la cobranza). Solo se muestra en empresas con feat_cliente_dealer.
--
-- Toda la ficha extendida se guarda en UNA columna JSONB (ficha_dealer)
-- para no inflar la tabla clientes (compartida por todos los tenants)
-- con 25+ columnas que las demas empresas nunca usan.
-- =====================================================================

-- 1) Columna JSONB en clientes (opcional, NULL para no-dealers)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ficha_dealer jsonb;

-- 2) Feature flag por empresa
ALTER TABLE config_empresa
  ADD COLUMN IF NOT EXISTS feat_cliente_dealer boolean NOT NULL DEFAULT false;

-- 3) Activar el flag para Caminero (ajusta el filtro si hace falta).
--    Revisa primero que empresas matchean:
--      SELECT tenant_id, nombre, razon_social FROM config_empresa
--      WHERE nombre ILIKE '%caminero%' OR razon_social ILIKE '%caminero%';
UPDATE config_empresa
   SET feat_cliente_dealer = true
 WHERE nombre ILIKE '%caminero%'
    OR razon_social ILIKE '%caminero%';

-- 4) Refrescar el cache de PostgREST
NOTIFY pgrst, 'reload schema';
