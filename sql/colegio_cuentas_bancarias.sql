-- ============================================================
-- colegio_cuentas_bancarias.sql (24/11/2026)
-- ------------------------------------------------------------
-- Promesa del dueño al colegio: recibir pagos por transferencia bancaria.
-- La Caja del Colegio ya acepta "Transferencia" y pide a qué cuenta entró,
-- pero el colegio (plan EDUCA INICIAL) no tenía cuentas ni podía crearlas:
-- el módulo "Cuentas y Saldos" es de plan Pro en adelante.
--
-- Ahora el colegio registra sus cuentas en Configuración del Colegio →
-- "Cuentas bancarias". En EDUCA INICIAL, hasta 2 cuentas ACTIVAS (se valida
-- aquí, no solo en pantalla). Los demás planes no tienen límite.
-- Solo en PESOS desde esa pantalla: la Caja cobra en RD$ (una cuenta en US$
-- recibiría RD$ contados como dólares). Solo la dirección las cambia.
-- ============================================================

CREATE OR REPLACE FUNCTION public._limite_cuentas_bancarias(p_tenant uuid)
RETURNS integer
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  -- El plan sale de la suscripción, igual que edu_limite_estudiantes.
  -- Un usuario solo puede preguntar por una empresa a la que pertenece.
  SELECT CASE WHEN upper(btrim(COALESCE((
           SELECT p.nombre FROM public.suscripciones s JOIN public.planes p ON p.id = s.plan_id
            WHERE s.tenant_id = p_tenant
            ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC
            LIMIT 1), ''))) = 'EDUCA INICIAL' THEN 2 ELSE NULL END
   WHERE COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon')
      OR public.usuario_alcanza_tenant(auth.uid(), p_tenant);
$f$;
REVOKE ALL ON FUNCTION public._limite_cuentas_bancarias(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._limite_cuentas_bancarias(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_cuentas_bancarias_limite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_lim int;
  v_n   int;
BEGIN
  IF NOT COALESCE(NEW.activo, true) THEN RETURN NEW; END IF;
  -- Solo cuando nace activa o se reactiva.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.activo, true) THEN RETURN NEW; END IF;
  v_lim := public._limite_cuentas_bancarias(NEW.tenant_id);
  IF v_lim IS NULL THEN RETURN NEW; END IF;
  -- Dos altas al mismo tiempo no pueden pasarse del límite: una espera a la otra.
  PERFORM pg_advisory_xact_lock(hashtext('cuentas_bancarias_limite:' || NEW.tenant_id::text));
  SELECT count(*) INTO v_n FROM public.cuentas_bancarias
   WHERE tenant_id = NEW.tenant_id AND COALESCE(activo, true) AND id <> NEW.id;
  IF v_n >= v_lim THEN
    RAISE EXCEPTION 'Tu plan permite hasta % cuentas bancarias activas. Desactiva una o cambia de plan.', v_lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.trg_cuentas_bancarias_limite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cuentas_bancarias_limite ON public.cuentas_bancarias;
CREATE TRIGGER cuentas_bancarias_limite
  BEFORE INSERT OR UPDATE OF activo ON public.cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.trg_cuentas_bancarias_limite();

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('colegio_cuentas_bancarias.sql');
