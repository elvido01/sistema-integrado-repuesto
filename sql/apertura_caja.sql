-- =====================================================================
-- Apertura de caja (19/11/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño: se configura por empresa en Configuraciones del
-- Sistema (config_empresa.modo_caja):
--   * 'simple'   — una sola caja, sin apertura. COMO HOY, y por defecto.
--   * 'apertura' — una caja con apertura y cierre.
--   * 'varias'   — varias cajas (en preparación: cada venta, recibo, gasto
--                  y pago tendrá que llevar su caja).
--
-- Con apertura:
--   * La caja amanece ABIERTA (turno 1, fondo 0): el primer cajero del día
--     vende sin abrir nada.
--   * Cuando alguien hace un cierre, la caja queda cerrada; al siguiente
--     cajero le sale "Abrir caja" con el fondo inicial (un solo monto, sin
--     desglose).
--   * Cada apertura es el turno siguiente del día. Así el cierre de cada
--     cajero no pisa al anterior (un cierre con la misma fecha y turno
--     REEMPLAZA al anterior: trg_cierre_caja_reemplaza), y rehacer el cierre
--     de un turno sigue funcionando como siempre.
--   * El cierre cuenta desde la apertura de su turno (no desde la mañana) y
--     espera en la gaveta lo cobrado + el fondo.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS modo_caja text NOT NULL DEFAULT 'simple';
DO $$ BEGIN
  ALTER TABLE public.config_empresa ADD CONSTRAINT config_empresa_modo_caja_chk
    CHECK (modo_caja IN ('simple', 'apertura', 'varias'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.caja_aperturas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  fecha         date NOT NULL,                       -- día en hora de RD
  turno         integer NOT NULL CHECK (turno >= 1),
  fondo         numeric(14,2) NOT NULL DEFAULT 0 CHECK (fondo >= 0),
  cajero_id     uuid REFERENCES auth.users(id),
  cajero_nombre text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caja_aperturas_tenant_fecha ON public.caja_aperturas (tenant_id, fecha, created_at);
-- Un turno, una apertura (respaldo del candado de abrir_caja).
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_aperturas_turno ON public.caja_aperturas (tenant_id, fecha, turno);

ALTER TABLE public.caja_aperturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.caja_aperturas FROM anon;
DROP POLICY IF EXISTS caja_aperturas_ver ON public.caja_aperturas;
CREATE POLICY caja_aperturas_ver ON public.caja_aperturas
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
-- Se abre solo por abrir_caja() (valida que la caja esté cerrada).

-- OJO: cierres_caja NO lleva columnas nuevas. trg_cierre_caja_reemplaza copia
-- c.* a cierres_caja_reemplazados: una columna de más rompe TODOS los cierres.
-- El fondo y el inicio del turno van en la foto del cierre (detalle):
-- detalle.fondoApertura y detalle.desde.

-- ── Estado de la caja en un día (hoy por defecto) ────────────────────
-- Solo el modo 'apertura' abre y cierra turnos ('varias' todavía no:
-- mientras tanto se comporta como 'simple').
-- La ventana de un turno EMPIEZA EN EL CIERRE ANTERIOR (no en la hora de la
-- apertura): un recibo o un gasto hecho entre un cierre y la apertura
-- siguiente cae en el turno siguiente, no se queda fuera de todos.
CREATE OR REPLACE FUNCTION private._estado_caja(p_tenant uuid, p_fecha date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_modo  text;
  v_dia   date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  a       record;   -- última apertura del día
  c       record;   -- último cierre del día
  v_ap    record;   -- apertura del turno ya cerrado
  v_desde timestamptz;
BEGIN
  SELECT COALESCE(modo_caja, 'simple') INTO v_modo FROM public.config_empresa WHERE tenant_id = p_tenant;
  v_modo := COALESCE(v_modo, 'simple');
  IF v_modo <> 'apertura' THEN
    RETURN jsonb_build_object('modo', v_modo, 'fecha', v_dia, 'abierta', true, 'requiere_apertura', false,
      'turno', NULL, 'desde', NULL, 'fondo', 0);
  END IF;

  SELECT id, turno, fondo, created_at, cajero_nombre INTO a
    FROM public.caja_aperturas WHERE tenant_id = p_tenant AND fecha = v_dia
   ORDER BY created_at DESC LIMIT 1;
  SELECT id, turno, created_at INTO c
    FROM public.cierres_caja WHERE tenant_id = p_tenant AND fecha = v_dia
   ORDER BY created_at DESC LIMIT 1;

  -- Abierta por una apertura posterior al último cierre: el turno cuenta
  -- desde ese cierre.
  IF a.id IS NOT NULL AND (c.id IS NULL OR a.created_at > c.created_at) THEN
    RETURN jsonb_build_object('modo', v_modo, 'fecha', v_dia, 'abierta', true, 'requiere_apertura', false,
      'turno', a.turno, 'desde', COALESCE(c.created_at, a.created_at), 'fondo', a.fondo,
      'apertura_id', a.id, 'abierta_at', a.created_at, 'abrio', a.cajero_nombre);
  END IF;

  -- Sin cierres ese día: amanece abierta (turno 1, fondo 0, el día entero).
  IF c.id IS NULL THEN
    RETURN jsonb_build_object('modo', v_modo, 'fecha', v_dia, 'abierta', true, 'requiere_apertura', false,
      'turno', 1, 'desde', NULL, 'fondo', 0, 'apertura_id', NULL);
  END IF;

  -- Cerrada: el último turno ya se cerró. Para rehacer ese cierre, su
  -- ventana empieza en el cierre anterior a su apertura (NULL = el turno de
  -- la mañana: el día entero).
  SELECT id, fondo, created_at INTO v_ap
    FROM public.caja_aperturas WHERE tenant_id = p_tenant AND fecha = v_dia AND turno = c.turno
   ORDER BY created_at DESC LIMIT 1;
  IF v_ap.id IS NOT NULL THEN
    SELECT max(created_at) INTO v_desde
      FROM public.cierres_caja WHERE tenant_id = p_tenant AND fecha = v_dia AND created_at < v_ap.created_at;
    v_desde := COALESCE(v_desde, v_ap.created_at);
  END IF;
  RETURN jsonb_build_object('modo', v_modo, 'fecha', v_dia, 'abierta', false, 'requiere_apertura', true,
    'turno', c.turno, 'desde', v_desde, 'fondo', COALESCE(v_ap.fondo, 0),
    'apertura_id', v_ap.id, 'cerrada_at', c.created_at);
END;
$function$;
REVOKE ALL ON FUNCTION private._estado_caja(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.estado_caja(p_fecha date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT private._estado_caja(public.get_user_tenant(), p_fecha)
   WHERE auth.uid() IS NOT NULL AND public.get_user_tenant() IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.estado_caja(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_caja(date) TO authenticated;

-- ── Abrir la caja (solo si está cerrada) ─────────────────────────────
CREATE OR REPLACE FUNCTION private._abrir_caja(p_tenant uuid, p_fondo numeric, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_estado jsonb;
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_turno  integer;
  v_nombre text;
  v_id     uuid;
BEGIN
  -- Dos cajeros que abren a la vez: el segundo espera y ya la ve abierta.
  PERFORM pg_advisory_xact_lock(hashtextextended('abrir_caja:' || p_tenant::text, 0));
  v_estado := private._estado_caja(p_tenant);
  IF v_estado->>'modo' <> 'apertura' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta empresa no usa apertura de caja.');
  END IF;
  IF NOT COALESCE((v_estado->>'requiere_apertura')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La caja ya está abierta.');
  END IF;
  IF p_fondo IS NULL OR p_fondo < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el fondo inicial (0 si no hay).');
  END IF;

  SELECT GREATEST(
           (SELECT COALESCE(max(turno), 0) FROM public.cierres_caja   WHERE tenant_id = p_tenant AND fecha = v_hoy),
           (SELECT COALESCE(max(turno), 0) FROM public.caja_aperturas WHERE tenant_id = p_tenant AND fecha = v_hoy)) + 1
    INTO v_turno;
  SELECT COALESCE(NULLIF(btrim(nombre_completo), ''), email) INTO v_nombre FROM public.perfiles WHERE id = p_uid;

  INSERT INTO public.caja_aperturas (tenant_id, fecha, turno, fondo, cajero_id, cajero_nombre, created_at)
  VALUES (p_tenant, v_hoy, v_turno, round(p_fondo, 2), p_uid, v_nombre, clock_timestamp())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'apertura_id', v_id, 'turno', v_turno);
END;
$function$;
REVOKE ALL ON FUNCTION private._abrir_caja(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.abrir_caja(p_fondo numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_tenant() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Inicia sesión.');
  END IF;
  RETURN private._abrir_caja(public.get_user_tenant(), p_fondo, auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.abrir_caja(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caja(numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Prueba (en una empresa de prueba, dentro de un bloque que se deshace) ──
DO $prueba$
DECLARE
  v_t uuid;
  e jsonb; r jsonb;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_fallo text := NULL;
BEGIN
  SELECT id INTO v_t FROM public.tenants WHERE nombre ILIKE 'ELITE SOLUTIONS%' ORDER BY created_at LIMIT 1;

  -- Por defecto: simple, siempre abierta, nunca pide apertura.
  e := private._estado_caja(v_t);
  IF e->>'modo' <> 'simple' OR (e->>'requiere_apertura')::boolean THEN RAISE EXCEPTION 'prueba: el modo por defecto no es el de hoy: %', e; END IF;

  BEGIN
    UPDATE public.config_empresa SET modo_caja = 'apertura' WHERE tenant_id = v_t;
    DELETE FROM public.cierres_caja WHERE tenant_id = v_t AND fecha = v_hoy;

    -- Amanece abierta: turno 1, fondo 0, sin pedir nada.
    e := private._estado_caja(v_t);
    IF NOT (e->>'abierta')::boolean OR (e->>'turno')::int <> 1 OR (e->>'requiere_apertura')::boolean THEN
      v_fallo := 'no amanece abierta: ' || e::text;
    END IF;
    -- Abrir estando abierta → no.
    IF v_fallo IS NULL AND (private._abrir_caja(v_t, 100, NULL)->>'ok')::boolean THEN v_fallo := 'abrió una caja ya abierta'; END IF;

    -- Un cierre → cerrada, pide apertura.
    IF v_fallo IS NULL THEN
      INSERT INTO public.cierres_caja (tenant_id, fecha, turno, created_at) VALUES (v_t, v_hoy, 1, clock_timestamp());
      e := private._estado_caja(v_t);
      IF (e->>'abierta')::boolean OR NOT (e->>'requiere_apertura')::boolean THEN v_fallo := 'tras el cierre no pide apertura: ' || e::text; END IF;
    END IF;
    -- Fondo negativo → no.
    IF v_fallo IS NULL AND (private._abrir_caja(v_t, -5, NULL)->>'ok')::boolean THEN v_fallo := 'aceptó un fondo negativo'; END IF;
    -- Abre el siguiente cajero con RD$500 → turno 2, abierta, desde la apertura.
    IF v_fallo IS NULL THEN
      r := private._abrir_caja(v_t, 500, NULL);
      e := private._estado_caja(v_t);
      IF NOT COALESCE((r->>'ok')::boolean, false) THEN v_fallo := 'no abrió: ' || r::text;
      ELSIF (e->>'turno')::int <> 2 OR NOT (e->>'abierta')::boolean OR (e->>'fondo')::numeric <> 500 OR e->>'desde' IS NULL THEN
        v_fallo := 'la apertura no quedó como turno 2 con fondo 500: ' || e::text;
      END IF;
    END IF;
    -- Cierra el turno 2 → pide apertura otra vez y la ventana es la del turno 2.
    IF v_fallo IS NULL THEN
      INSERT INTO public.cierres_caja (tenant_id, fecha, turno, created_at) VALUES (v_t, v_hoy, 2, clock_timestamp() + interval '1 second');
      e := private._estado_caja(v_t);
      IF NOT (e->>'requiere_apertura')::boolean OR (e->>'turno')::int <> 2 OR (e->>'fondo')::numeric <> 500 THEN
        v_fallo := 'tras cerrar el turno 2: ' || e::text;
      END IF;
    END IF;
    -- Otro día: la ventana y el turno son los de ESE día (rehacer el cierre de
    -- ayer no toma el turno de hoy).
    IF v_fallo IS NULL THEN
      e := private._estado_caja(v_t, v_hoy - 1);
      IF (e->>'turno')::int <> 1 OR (e->>'requiere_apertura')::boolean THEN v_fallo := 'ayer sin movimientos no es turno 1 abierto: ' || e::text; END IF;
    END IF;
    -- 'varias' (en preparación) se porta como simple: no pide apertura.
    IF v_fallo IS NULL THEN
      UPDATE public.config_empresa SET modo_caja = 'varias' WHERE tenant_id = v_t;
      e := private._estado_caja(v_t);
      IF (e->>'requiere_apertura')::boolean THEN v_fallo := 'varias pide apertura: ' || e::text; END IF;
    END IF;
    -- En modo simple nunca pide apertura, aunque haya cierres.
    IF v_fallo IS NULL THEN
      UPDATE public.config_empresa SET modo_caja = 'simple' WHERE tenant_id = v_t;
      e := private._estado_caja(v_t);
      IF (e->>'requiere_apertura')::boolean THEN v_fallo := 'modo simple pide apertura: ' || e::text; END IF;
    END IF;

    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'deshacer' THEN v_fallo := COALESCE(v_fallo, SQLERRM); END IF;
  END;

  IF v_fallo IS NOT NULL THEN RAISE EXCEPTION 'prueba apertura de caja: %', v_fallo; END IF;
END
$prueba$;

SELECT public.registrar_migracion('apertura_caja.sql');
