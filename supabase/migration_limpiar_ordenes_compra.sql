-- Migration to add configuration options for automatic purchase order cleaning
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'config_empresa' AND column_name = 'limpiar_ordenes_compra_auto') THEN
        ALTER TABLE config_empresa ADD COLUMN limpiar_ordenes_compra_auto BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'config_empresa' AND column_name = 'modo_limpieza_orden') THEN
        ALTER TABLE config_empresa ADD COLUMN modo_limpieza_orden TEXT DEFAULT 'agresivo';
    END IF;
END $$;

UPDATE config_empresa 
SET limpiar_ordenes_compra_auto = COALESCE(limpiar_ordenes_compra_auto, TRUE), 
    modo_limpieza_orden = COALESCE(modo_limpieza_orden, 'agresivo');
