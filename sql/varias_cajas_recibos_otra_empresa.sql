-- =====================================================================
-- Varias cajas: recibos grabados por quien no tiene caja aquí (20/11/2026)
-- ---------------------------------------------------------------------
-- La financiera registra su pago en el dealer (sincronizar_pago_a_dealer) y
-- el cobro de un préstamo puede grabarse desde la otra empresa: el recibo
-- entra a esta empresa, pero a nombre de un usuario que aquí no tiene caja.
-- Con 'varias' cada cierre cuenta lo de SU cajero, así que ese recibo no
-- caía en ninguna caja.
--
-- Regla (solo empresas en 'varias'; 'simple'/'apertura' no cambian):
--   * Quien graba tiene SU caja abierta hoy en esta empresa (aunque grabe
--     desde la otra empresa activa) → va a su caja.
--   * Quien graba no tiene caja aquí (usuario de otra empresa, superadmin):
--     el recibo es "externo" (caja_externo):
--       - de hoy y hay caja abierta → la primera abierta (orden de la lista);
--       - de hoy sin caja abierta, o de otra fecha → caja_pendiente (si trae
--         efectivo). La primera caja que se abra ESE día se lleva los de hoy;
--         el cierre avisa los que siguen pendientes.
--   * Procesos sin usuario (migraciones, scripts) quedan como siempre.
--   * Si después se edita la forma de pago (editar_forma_pago_recibo), un
--     externo sin caja que pasa a efectivo queda pendiente (y al revés).
-- usuario_id no se toca (quién lo grabó). Las columnas de caja solo las
-- escribe el servidor.
-- =====================================================================
BEGIN;

ALTER TABLE public.recibos_ingreso ADD COLUMN IF NOT EXISTS caja_cajero_id uuid;
ALTER TABLE public.recibos_ingreso ADD COLUMN IF NOT EXISTS caja_asignada_at timestamptz;
ALTER TABLE public.recibos_ingreso ADD COLUMN IF NOT EXISTS caja_pendiente boolean NOT NULL DEFAULT false;
ALTER TABLE public.recibos_ingreso ADD COLUMN IF NOT EXISTS caja_externo boolean NOT NULL DEFAULT false;
DROP INDEX IF EXISTS public.idx_recibos_caja_pendiente;
CREATE INDEX idx_recibos_caja_pendiente ON public.recibos_ingreso (tenant_id, fecha) WHERE caja_pendiente;
DROP INDEX IF EXISTS public.idx_recibos_caja_asignada;

-- Primera caja abierta hoy (por el orden de la lista), con la misma regla de
-- "abierta" que el resto de varias cajas (private._cajas_abiertas).
CREATE OR REPLACE FUNCTION private._primera_caja_abierta_hoy(p_tenant uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
  SELECT x.cajero_id
    FROM private._cajas_abiertas(p_tenant) x
    LEFT JOIN public.cajas cj ON cj.id = x.caja_id
   WHERE x.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date AND x.cajero_id IS NOT NULL
   ORDER BY COALESCE(cj.orden, 2147483647), x.desde
   LIMIT 1
$f$;
REVOKE ALL ON FUNCTION private._primera_caja_abierta_hoy(uuid) FROM PUBLIC, anon, authenticated;

-- ¿El recibo trae efectivo (> 0)? Sin formas_pago = todo efectivo, como el
-- cierre. Nunca revienta con un monto mal escrito: cuenta como 0.
CREATE OR REPLACE FUNCTION private._recibo_trae_efectivo(p_formas jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $f$
  SELECT CASE WHEN p_formas IS NULL OR jsonb_typeof(p_formas) <> 'array' OR jsonb_array_length(p_formas) = 0 THEN true
              ELSE EXISTS (
                SELECT 1 FROM jsonb_array_elements(p_formas) f,
                       LATERAL (SELECT regexp_replace(COALESCE(f->>'monto', ''), '[,[:space:]]', '', 'g') AS m) t
                 WHERE lower(COALESCE(f->>'forma', '')) LIKE '%efectivo%'
                   AND t.m ~ '^[0-9]+([.][0-9]*)?$|^[.][0-9]+$'
                   AND t.m::numeric > 0) END
$f$;
REVOKE ALL ON FUNCTION private._recibo_trae_efectivo(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._recibo_otra_empresa_a_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date; v_cajero uuid;
BEGIN
  NEW.caja_cajero_id := NULL; NEW.caja_asignada_at := NULL; NEW.caja_pendiente := false; NEW.caja_externo := false;
  IF NEW.tenant_id IS NULL OR v_uid IS NULL OR private._modo_caja(NEW.tenant_id) <> 'varias' THEN RETURN NEW; END IF;

  -- Quien graba tiene su caja abierta hoy aquí: si lo graba desde la otra
  -- empresa activa, va a su caja; desde esta, sigue como siempre (usuario_id).
  IF EXISTS (SELECT 1 FROM private._cajas_abiertas(NEW.tenant_id) x WHERE x.cajero_id = v_uid AND x.fecha = v_hoy) THEN
    IF NEW.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN
      NEW.caja_cajero_id := v_uid; NEW.caja_asignada_at := clock_timestamp();
    END IF;
    RETURN NEW;
  END IF;
  -- Alguien de esta empresa sin caja: lo frena _freno_sin_caja (salvo el
  -- superadmin, que sigue como externo).
  IF NEW.tenant_id IS NOT DISTINCT FROM public.get_user_tenant()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND COALESCE(is_superadmin, false)) THEN
    RETURN NEW;
  END IF;

  NEW.caja_externo := true;
  IF NEW.fecha IS NOT DISTINCT FROM v_hoy THEN
    -- Mismo candado que abrir_caja_en: un recibo y una apertura a la vez no
    -- pueden dejar el recibo pendiente con la caja ya abierta.
    PERFORM pg_advisory_xact_lock(hashtextextended('abrir_caja:' || NEW.tenant_id::text, 0));
    v_cajero := private._primera_caja_abierta_hoy(NEW.tenant_id);
    IF v_cajero IS NOT NULL THEN
      NEW.caja_cajero_id := v_cajero; NEW.caja_asignada_at := clock_timestamp();
      RETURN NEW;
    END IF;
  END IF;
  NEW.caja_pendiente := private._recibo_trae_efectivo(NEW.formas_pago);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._recibo_otra_empresa_a_caja() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recibo_otra_empresa_a_caja ON public.recibos_ingreso;
CREATE TRIGGER trg_recibo_otra_empresa_a_caja BEFORE INSERT ON public.recibos_ingreso
  FOR EACH ROW EXECUTE FUNCTION public._recibo_otra_empresa_a_caja();

-- Las columnas de caja no las cambia la app (solo los disparadores; el dueño
-- puede limpiar un pendiente por SQL). Un externo sin caja que cambia de forma
-- de pago se vuelve a mirar: si hoy hay caja abierta va a ella; si no, queda
-- pendiente cuando trae efectivo.
CREATE OR REPLACE FUNCTION public._recibo_caja_solo_servidor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_cajero uuid;
BEGIN
  IF pg_trigger_depth() <= 1 AND COALESCE(auth.role(), '') IN ('authenticated', 'anon') THEN
    NEW.caja_cajero_id := OLD.caja_cajero_id;
    NEW.caja_asignada_at := OLD.caja_asignada_at;
    NEW.caja_pendiente := OLD.caja_pendiente;
    NEW.caja_externo := OLD.caja_externo;
  END IF;
  IF NEW.caja_externo AND NEW.caja_cajero_id IS NULL AND NEW.formas_pago IS DISTINCT FROM OLD.formas_pago THEN
    IF NEW.fecha IS NOT DISTINCT FROM (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('abrir_caja:' || NEW.tenant_id::text, 0));
      v_cajero := private._primera_caja_abierta_hoy(NEW.tenant_id);
    END IF;
    IF v_cajero IS NOT NULL THEN
      NEW.caja_cajero_id := v_cajero; NEW.caja_asignada_at := clock_timestamp(); NEW.caja_pendiente := false;
    ELSE
      NEW.caja_pendiente := private._recibo_trae_efectivo(NEW.formas_pago);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._recibo_caja_solo_servidor() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_recibo_caja_solo_servidor ON public.recibos_ingreso;
CREATE TRIGGER trg_recibo_caja_solo_servidor
  BEFORE UPDATE OF caja_cajero_id, caja_asignada_at, caja_pendiente, caja_externo, formas_pago ON public.recibos_ingreso
  FOR EACH ROW EXECUTE FUNCTION public._recibo_caja_solo_servidor();

-- Al abrir una caja: se lleva los recibos de HOY que esperaban caja.
CREATE OR REPLACE FUNCTION public._apertura_recoge_recibos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF NEW.caja_id IS NULL OR NEW.cajero_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.fecha IS DISTINCT FROM (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN RETURN NEW; END IF;
  UPDATE public.recibos_ingreso
     SET caja_cajero_id = NEW.cajero_id, caja_asignada_at = clock_timestamp(), caja_pendiente = false
   WHERE tenant_id = NEW.tenant_id AND caja_externo AND caja_cajero_id IS NULL
     AND fecha = NEW.fecha AND NOT COALESCE(anulado, false);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._apertura_recoge_recibos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_apertura_recoge_recibos ON public.caja_aperturas;
CREATE TRIGGER trg_apertura_recoge_recibos AFTER INSERT ON public.caja_aperturas
  FOR EACH ROW EXECUTE FUNCTION public._apertura_recoge_recibos();

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.registrar_migracion('varias_cajas_recibos_otra_empresa.sql');
