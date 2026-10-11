-- =====================================================================
-- MÓDULOS POR EMPRESA (plan de comercialización, semana 2)
-- =====================================================================
-- (10/10/2026) El código tenía 27 uuids de empresas fijos para decidir qué
-- ve cada una (GPS y campos de vehículo de Caminero, SAN de MotoPréstamos,
-- Equipo IA de Morla...). Para vender a muchos clientes eso tiene que ser
-- configuración, no código: config_empresa.modulos = lista de módulos
-- encendidos. Este SQL deja a cada empresa EXACTAMENTE con lo que ve hoy.
--
--   Módulo                 Qué enciende                         Hoy lo tiene
--   gps                    menú GPS (5 pantallas)               Caminero Motors
--   vehiculos              campos de vehículo, "Solicitudes",   Caminero Motors
--                          Documentación de clientes
--   carta_ruta             Carta de Ruta                        Caminero Motors
--   ocultar_pedidos        esconde Pedidos (usa Solicitudes)    Caminero Motors
--   notas_comentarios      Notas y Comentarios (además de       Caminero Motors
--                          las financieras)
--   solicitudes_compras    Solicitudes de Compras               Caminero, Odalys, Inversiones Los Naranjos
--   ai_ceo_dashboard       Dashboard IA                         Repuestos Morla
--   gestion_empresarial    Gestión Empresarial IA               Morla, MotoPréstamos Los Naranjos
--   equipo_ia              Equipo IA (además: solo el dueño)    Repuestos Morla
--   seguimientos_hoy       Seguimientos de Hoy                  Repuestos Morla
--   cotizaciones_magna     Cot. Facturas Magna                  Repuestos Morla
--   san                    SAN Ahorro                           MotoPréstamos Los Naranjos
--   mover_a_empresa_nueva  botón "mover a la empresa nueva"     Repuestos Morla Vieja
--
-- Además: Compras ponía por defecto el almacén de Repuestos Morla
-- (a01dc84d...) a TODAS las empresas: 112 compras de Repuestos Caminero (58)
-- y Caminero Motors (54) quedaron con el almacén de Morla. Las entradas,
-- salidas y existencias no dependen de él. Se pasan a su único almacén.
-- =====================================================================

BEGIN;

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS modulos text[] NOT NULL DEFAULT '{}';

UPDATE public.config_empresa SET modulos = ARRAY[
  'gps','vehiculos','carta_ruta','ocultar_pedidos','notas_comentarios','solicitudes_compras']
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';                 -- Caminero Motors
UPDATE public.config_empresa SET modulos = ARRAY['solicitudes_compras']
 WHERE tenant_id IN ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',               -- Moto Préstamos Odalys
                     'c07a1d07-1e2f-4b3c-9d4a-107a10500007');              -- Inversiones Los Naranjos
UPDATE public.config_empresa SET modulos = ARRAY[
  'ai_ceo_dashboard','gestion_empresarial','equipo_ia','seguimientos_hoy','cotizaciones_magna']
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';                 -- Repuestos Morla
UPDATE public.config_empresa SET modulos = ARRAY['gestion_empresarial','san']
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';                 -- MotoPréstamos Los Naranjos
UPDATE public.config_empresa SET modulos = ARRAY['mover_a_empresa_nueva']
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002';                 -- Repuestos Morla Vieja

-- Compras con el almacén de Morla en otra empresa → su único almacén.
UPDATE public.compras c
   SET almacen_id = (SELECT a.id FROM public.almacenes a WHERE a.tenant_id = c.tenant_id ORDER BY a.id LIMIT 1)
 WHERE c.almacen_id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'
   AND c.tenant_id <> '00000000-0000-0000-0000-000000000001'
   AND (SELECT count(*) FROM public.almacenes a WHERE a.tenant_id = c.tenant_id) = 1;

COMMIT;

SELECT left(nombre, 30) AS empresa, modulos FROM public.config_empresa
 WHERE modulos <> '{}' ORDER BY nombre;
SELECT count(*) AS compras_con_almacen_ajeno FROM public.compras
 WHERE almacen_id = 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7'
   AND tenant_id <> '00000000-0000-0000-0000-000000000001';

SELECT public.registrar_migracion('modulos_por_empresa.sql');
