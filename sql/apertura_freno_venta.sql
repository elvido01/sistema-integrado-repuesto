-- =====================================================================
-- Freno en el servidor: no se vende con la caja cerrada (20/11/2026)
-- Modo de Caja = 'apertura' ("Una caja con apertura")
-- ---------------------------------------------------------------------
-- La pantalla ya pide abrir la caja antes de vender (VentasPage, POS del
-- teléfono), pero una versión vieja de la app o una pestaña abierta desde
-- antes del cierre podía grabar la venta igual. Ahora el servidor también
-- la frena (solo ventas de contado: el crédito no toca la caja). Mismas excepciones que el freno de 'varias': service_role,
-- superadmin, y escrituras hacia otra empresa del grupo.
-- Las demás empresas ('simple', 'varias') no cambian.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public._freno_venta_caja_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW.tenant_id IS NULL OR v_uid IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF private._modo_caja(NEW.tenant_id) <> 'apertura' THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND COALESCE(is_superadmin, false)) THEN RETURN NEW; END IF;
  -- Solo ventas que mueven efectivo: crédito, saldos iniciales y facturas
  -- generadas (colegios) no pasan por la caja.
  IF upper(COALESCE(NEW.forma_pago, '')) NOT IN ('CONTADO', 'EFECTIVO') OR COALESCE(NEW.es_saldo_inicial, false) THEN RETURN NEW; END IF;
  IF COALESCE((private._estado_caja(NEW.tenant_id, NULL)->>'abierta')::boolean, false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'caja_cerrada',
    MESSAGE = 'La caja está cerrada: ábrela primero (en Ventas: Abrir caja) y vuelve a grabar la venta.';
END;
$function$;
REVOKE ALL ON FUNCTION public._freno_venta_caja_cerrada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_venta_caja_cerrada ON public.facturas;
CREATE TRIGGER trg_venta_caja_cerrada BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._freno_venta_caja_cerrada();

COMMIT;

SELECT public.registrar_migracion('apertura_freno_venta.sql');
