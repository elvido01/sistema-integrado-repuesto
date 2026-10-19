-- =====================================================================
-- MOTOPRÉSTAMOS: PRECIOS DE PLACA / GPS / CASCO / SEGURO (19/10/2026)
-- ---------------------------------------------------------------------
-- En Solicitudes de Compra, marcar casco, GPS o seguro no sumaba nada en
-- MotoPréstamos Los Naranjos: el monto de cada casilla sale de
-- config_empresa.precio_* y en MotoPréstamos estaban en 0 (los precios se
-- habían puesto solo en Caminero Motors). Se copian los de Caminero.
-- Después se cambian, si hace falta, en Configuración → Perfil de Empresa.
-- =====================================================================

UPDATE public.config_empresa mp
   SET precio_placa  = c.precio_placa,
       precio_gps    = c.precio_gps,
       precio_casco  = c.precio_casco,
       precio_seguro = c.precio_seguro
  FROM public.config_empresa c
 WHERE mp.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'   -- MotoPréstamos Los Naranjos
   AND c.tenant_id  = 'b39506c3-27dc-467d-830b-096731b83113';  -- Caminero Motors

SELECT public.registrar_migracion('motoprestamos_precios_addons.sql');
