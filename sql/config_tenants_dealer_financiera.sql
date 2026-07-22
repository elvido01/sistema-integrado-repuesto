-- =====================================================================
-- Config de tenants: Caminero Motors (dealer) ↔ MotoPréstamos (financiera)
-- ---------------------------------------------------------------------
-- Deja lista la orquestación del flujo de terceros (RPC
-- procesar_financiamiento_terceros): al facturar financiado en Caminero,
-- el préstamo + cuentas cruzadas se crean en MotoPréstamos.
-- Correr en el editor SQL de Supabase.
-- =====================================================================

-- MotoPréstamos Los Naranjos (financiera): habilitar módulo + nombre limpio.
UPDATE public.config_empresa
   SET feat_financiera = true,
       nombre = 'MotoPréstamos Los Naranjos'
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

-- Caminero Motors (dealer): financia con terceros → la financiera de arriba.
UPDATE public.config_empresa
   SET financiamiento_tipo = 'terceros',
       financiera_tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
       feat_financiera = false
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';

-- Verificación
SELECT tenant_id, nombre, feat_financiera, financiamiento_tipo, financiera_tenant_id
FROM public.config_empresa
WHERE tenant_id IN (
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
  'b39506c3-27dc-467d-830b-096731b83113'
);
