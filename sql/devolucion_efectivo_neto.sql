-- =====================================================================
-- Devolución de una venta con retención: el efectivo que sale (20/11/2026)
-- ---------------------------------------------------------------------
-- Una venta de CONTADO a un cliente que retiene (AMSTAR) cobra el total
-- menos facturas.retenido_no_cobrado. Al devolver, total_devolucion y la
-- nota de crédito siguen siendo el monto fiscal (bruto); al cliente se le
-- entrega la misma proporción de lo que de verdad pagó.
-- efectivo_devuelto lo fija el servidor AL GRABAR y no cambia después:
-- si la factura se edita luego, el cierre de ese día sigue cuadrando con
-- lo que se entregó. NULL en las devoluciones viejas (= total_devolucion,
-- ninguna tenía retención).
-- =====================================================================
BEGIN;

ALTER TABLE public.devoluciones ADD COLUMN IF NOT EXISTS efectivo_devuelto numeric;

CREATE OR REPLACE FUNCTION public._devolucion_efectivo_neto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_total numeric; v_ret numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.efectivo_devuelto := OLD.efectivo_devuelto;   -- se fija al grabar
    RETURN NEW;
  END IF;
  SELECT COALESCE(total, 0), COALESCE(retenido_no_cobrado, 0) INTO v_total, v_ret
    FROM public.facturas WHERE id = NEW.factura_id;
  IF v_total > 0 AND v_ret > 0 THEN
    NEW.efectivo_devuelto := round(COALESCE(NEW.total_devolucion, 0) * GREATEST(0, LEAST(1, (v_total - v_ret) / v_total)), 2);
  ELSE
    NEW.efectivo_devuelto := COALESCE(NEW.total_devolucion, 0);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._devolucion_efectivo_neto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_devolucion_efectivo_neto ON public.devoluciones;
CREATE TRIGGER trg_devolucion_efectivo_neto BEFORE INSERT OR UPDATE ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public._devolucion_efectivo_neto();

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.registrar_migracion('devolucion_efectivo_neto.sql');
