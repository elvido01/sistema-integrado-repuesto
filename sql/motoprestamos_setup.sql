-- =====================================================================
-- Ajustes para MotoPrestamos Los Naranjos (tenant aparte de Caminero)
-- ---------------------------------------------------------------------
-- Correr DESPUES de registrar la empresa en /registro.
-- Requisitos: ya haber corrido sql/cliente_ficha_dealer.sql (crea la
-- columna ficha_dealer y el flag feat_cliente_dealer).
--
-- MotoPrestamos financia motores y da prestamos con garantia de
-- matriculas -> necesita la ficha ampliada (trabajo/referencias) y la
-- cobranza, igual que un dealer.
-- =====================================================================

-- 0) Verifica que el tenant exista (debe devolver 1 fila):
--    SELECT tenant_id, nombre FROM config_empresa
--    WHERE nombre ILIKE '%motoprestamo%' OR nombre ILIKE '%naranjo%';

-- 1) Activar la ficha ampliada (dealer) para MotoPrestamos
UPDATE public.config_empresa
   SET feat_cliente_dealer = true
 WHERE nombre ILIKE '%motoprestamo%'
    OR nombre ILIKE '%naranjo%';

-- 2) (Opcional) Telefono del buscador de cobranza.
--    Requiere haber corrido antes sql/cobranza_buscador.sql (crea la
--    columna cobranza_buscador_telefono). Mejor configuralo desde la UI:
--    Configuracion del Sistema -> Extension de WhatsApp -> "Telefono del
--    buscador". O, si ya corriste cobranza_buscador.sql, aqui:
-- UPDATE public.config_empresa
--    SET cobranza_buscador_telefono = '809XXXXXXX'
--  WHERE nombre ILIKE '%motoprestamo%' OR nombre ILIKE '%naranjo%';

NOTIFY pgrst, 'reload schema';

-- Verificacion (solo columnas que crea sql/cliente_ficha_dealer.sql)
SELECT tenant_id, nombre, feat_cliente_dealer
FROM public.config_empresa
WHERE nombre ILIKE '%motoprestamo%' OR nombre ILIKE '%naranjo%';
