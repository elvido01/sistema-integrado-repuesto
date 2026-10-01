-- =====================================================================
-- Módulos desactivados POR EMPRESA (para todos, administradores incluidos)
-- ---------------------------------------------------------------------
-- (2026-10-01) La OC-0014 de Caminero Motors se digitó en MotoPréstamos Los
-- Naranjos (ver oc_0014_a_caminero_motors.sql). Pedido del dueño: desactivar
-- Compras y Ventas en MotoPréstamos para TODOS los usuarios.
--
-- Quitar permisos usuario por usuario no alcanza: canAccess() deja pasar a
-- todo rol 'admin'/'owner', y MotoPréstamos tiene 5 admins. Además la app
-- móvil graba ventas sin pasar por el menú web. Por eso son dos capas:
--   1) config_empresa.modulos_deshabilitados: el menú no los muestra y la
--      pantalla responde "desactivado en esta empresa" (RouteGuard).
--   2) En la base: una PERSONA no puede grabar compras ni facturas en esa
--      empresa. Los procesos automáticos sí: las 561 compras de
--      financiamiento de terceros (factura_dealer_id) y los scripts con
--      service_role siguen pasando.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS modulos_deshabilitados text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.config_empresa.modulos_deshabilitados IS
  'Claves de módulo (las de permissionsHelper) apagadas para TODOS en esta empresa, admins incluidos. compras/ventas además se bloquean en la base.';

-- MotoPréstamos Los Naranjos: Compras y Ventas (con lo que cuelga de cada uno).
-- Se dejan a propósito: Pago a Suplidores (paga las CxP de los financiamientos),
-- Recibo de Ingreso y los reportes.
UPDATE public.config_empresa
   SET modulos_deshabilitados = ARRAY[
         'compras', 'orden-compra', 'solicitudes-compras', 'aprobaciones-compras',
         'ventas', 'cotizaciones', 'devoluciones']
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

-- ------------------------------------------------------------
-- La base: compras y facturas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_modulo_deshabilitado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_modulo text := TG_ARGV[0];
BEGIN
  -- Solo personas (sesión de la app). Los scripts y los procesos con
  -- service_role no pasan por aquí.
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;

  -- Las compras que nacen de un financiamiento de terceros las crea el
  -- sistema al vender en Caminero: no son una compra digitada.
  -- OJO: IF anidado, no "AND". PL/pgSQL no corta la condición: con AND leía
  -- NEW.factura_dealer_id también en FACTURAS (que no tienen esa columna) y
  -- tumbó la grabación de facturas de todas las empresas el 01/10 17:39 UTC.
  IF TG_TABLE_NAME = 'compras' THEN
    IF (to_jsonb(NEW) ->> 'factura_dealer_id') IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.config_empresa
              WHERE tenant_id = NEW.tenant_id
                AND v_modulo = ANY (modulos_deshabilitados)) THEN
    RAISE EXCEPTION 'El módulo de % está desactivado en esta empresa. Cambia a la empresa correcta antes de grabar.',
      CASE v_modulo WHEN 'ventas' THEN 'Ventas' ELSE 'Compras' END
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_modulo_compras_deshabilitado ON public.compras;
CREATE TRIGGER trg_modulo_compras_deshabilitado
  BEFORE INSERT ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_modulo_deshabilitado('compras');

DROP TRIGGER IF EXISTS trg_modulo_ventas_deshabilitado ON public.facturas;
CREATE TRIGGER trg_modulo_ventas_deshabilitado
  BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_modulo_deshabilitado('ventas');

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('modulos_deshabilitados_por_empresa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT modulos_deshabilitados::text FROM public.config_empresa
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS motoprestamos,
  (SELECT count(*) FROM public.config_empresa WHERE cardinality(modulos_deshabilitados) > 0) AS empresas_con_bloqueo,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_modulo_compras_deshabilitado','trg_modulo_ventas_deshabilitado')) AS triggers;
