-- =====================================================================
-- Colegios: tope de CLIENTES igual al de estudiantes (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño: el plan del colegio limita estudiantes activos (700).
-- Sin tope de clientes, un colegio podía cobrarle a familias como
-- "cliente" por Ventas o Recibo de Ingreso sin inscribir al estudiante.
--
-- Regla (solo empresas con tope de estudiantes, es decir, colegios):
--   familias con algún estudiante activo o por confirmar
--   + clientes que NO son de ninguna familia (los de afuera)
--   ≤ el tope del plan (edu_limite_estudiantes).
--
-- · El cliente que el sistema crea para una familia al cobrar (cliente_id o
--   cliente_fiscal_id de edu_familias) NUNCA se bloquea: ya lo controla el
--   tope de estudiantes, y bloquearlo tumbaría un cobro.
-- · Las familias que ya no tienen estudiantes activos (graduados,
--   retirados) no cuentan: con los años no se llena solo.
-- · El trigger es DIFERIDO (se revisa al terminar la transacción) porque
--   edu_cobrar primero crea el cliente y después lo enlaza a la familia.
-- · Solo frena crear clientes nuevos; los que ya existen no se tocan.
-- =====================================================================

CREATE OR REPLACE FUNCTION private.edu_tope_clientes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_lim integer; v_fam integer; v_fuera integer;
BEGIN
  v_lim := public.edu_limite_estudiantes(NEW.tenant_id);
  IF v_lim IS NULL THEN RETURN NULL; END IF;                    -- no es colegio
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = NEW.id) THEN RETURN NULL; END IF;
  -- Cliente de una familia: lo controla el tope de estudiantes.
  IF EXISTS (SELECT 1 FROM public.edu_familias f
              WHERE f.tenant_id = NEW.tenant_id AND NEW.id IN (f.cliente_id, f.cliente_fiscal_id)) THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('edu_tope_clientes:' || NEW.tenant_id::text));
  SELECT count(*) INTO v_fam FROM public.edu_familias f
   WHERE f.tenant_id = NEW.tenant_id
     AND EXISTS (SELECT 1 FROM public.edu_estudiantes e
                  WHERE e.familia_id = f.id AND e.estado IN ('activo', 'por_confirmar'));
  SELECT count(*) INTO v_fuera FROM public.clientes c
   WHERE c.tenant_id = NEW.tenant_id
     AND NOT EXISTS (SELECT 1 FROM public.edu_familias f
                      WHERE f.tenant_id = c.tenant_id AND c.id IN (f.cliente_id, f.cliente_fiscal_id));
  IF v_fam + v_fuera > v_lim THEN
    RAISE EXCEPTION 'Llegaste al tope de % clientes de tu plan (% familias de estudiantes + % clientes de afuera). Para crear más, sube de plan.',
      v_lim, v_fam, v_fuera - 1
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_tope_clientes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS edu_tope_clientes ON public.clientes;
CREATE CONSTRAINT TRIGGER edu_tope_clientes AFTER INSERT ON public.clientes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.edu_tope_clientes();

SELECT public.registrar_migracion('centros_educativos_tope_clientes.sql');
