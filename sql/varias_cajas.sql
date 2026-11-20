-- =====================================================================
-- Varias cajas (20/11/2026) — Modo de Caja = 'varias'
-- ---------------------------------------------------------------------
-- Decisiones del dueño:
--   * Se activa SOLO en Configuración del Sistema (config_empresa.modo_caja).
--     Las empresas en 'simple' o 'apertura' siguen exactamente igual.
--   * Cajas con nombre (Caja 1, Caja 2…) que crea el administrador.
--   * El cajero escoge qué caja abre y con cuánto fondo. Una caja la tiene
--     abierta un solo cajero a la vez, y un cajero una sola caja.
--   * Sin caja abierta NO se mueve dinero: ventas, cobros, devoluciones,
--     gastos de la gaveta, pagos a suplidores y compras de contado en
--     efectivo se frenan en el servidor (_freno_sin_caja).
--   * Cada caja la cierra su cajero o un administrador.
--
-- Cómo cuadra sin tocar las tablas de dinero: cada movimiento ya guarda
-- quién lo hizo (usuario_id / created_by). El cierre de una caja cuenta lo
-- que hizo SU CAJERO desde que la abrió. Cada apertura toma el turno
-- siguiente del día (como en 'apertura'), así el cierre de cada caja tiene
-- su fecha+turno propio y no pisa el de otra (trg_cierre_caja_reemplaza).
-- Una apertura está abierta mientras no exista un cierre con su fecha+turno.
-- cierres_caja NO lleva columnas nuevas (el trigger copia c.* a
-- cierres_caja_reemplazados): la caja va en la foto (detalle).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cajas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 40),
  activa      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_nombre ON public.cajas (tenant_id, lower(btrim(nombre)));
ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cajas FROM anon;
DROP POLICY IF EXISTS cajas_ver ON public.cajas;
CREATE POLICY cajas_ver ON public.cajas FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
-- Se crean y cambian solo por guardar_caja() (administrador).

ALTER TABLE public.caja_aperturas ADD COLUMN IF NOT EXISTS caja_id uuid REFERENCES public.cajas(id);
ALTER TABLE public.caja_aperturas ADD COLUMN IF NOT EXISTS caja_nombre text;
CREATE INDEX IF NOT EXISTS idx_caja_aperturas_varias ON public.caja_aperturas (tenant_id, created_at) WHERE caja_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private._modo_caja(p_tenant uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$ SELECT COALESCE((SELECT modo_caja FROM public.config_empresa WHERE tenant_id = p_tenant), 'simple') $f$;
REVOKE ALL ON FUNCTION private._modo_caja(uuid) FROM PUBLIC, anon, authenticated;

-- Aperturas de 'varias' que siguen abiertas (sin cierre con su fecha+turno).
CREATE OR REPLACE FUNCTION private._cajas_abiertas(p_tenant uuid)
RETURNS TABLE (apertura_id uuid, caja_id uuid, caja_nombre text, cajero_id uuid, cajero_nombre text,
               fecha date, turno integer, fondo numeric, desde timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  SELECT a.id, a.caja_id, COALESCE(cj.nombre, a.caja_nombre), a.cajero_id, a.cajero_nombre,
         a.fecha, a.turno, a.fondo, a.created_at
    FROM public.caja_aperturas a
    LEFT JOIN public.cajas cj ON cj.id = a.caja_id
   WHERE a.tenant_id = p_tenant AND a.caja_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cierres_caja c
                      WHERE c.tenant_id = a.tenant_id AND c.fecha = a.fecha AND c.turno = a.turno)
   ORDER BY a.created_at;
$f$;
REVOKE ALL ON FUNCTION private._cajas_abiertas(uuid) FROM PUBLIC, anon, authenticated;

-- Estado para 'varias' del usuario que llama (las abiertas se leen una vez).
-- 'recientes': cajas ya cerradas hoy, para rehacer su cierre (el cierre con
-- la misma fecha+turno reemplaza al anterior, como en los otros modos).
CREATE OR REPLACE FUNCTION private._estado_varias(p_tenant uuid, p_uid uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE
  v_dia  date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_hoy  date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_abiertas jsonb;
  m      jsonb;
  v_cajas jsonb;
  v_recientes jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_abiertas FROM private._cajas_abiertas(p_tenant) x;
  SELECT e INTO m FROM jsonb_array_elements(v_abiertas) e WHERE e->>'cajero_id' = p_uid::text LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cj.id, 'nombre', cj.nombre,
           'ocupada', EXISTS (SELECT 1 FROM jsonb_array_elements(v_abiertas) e WHERE e->>'caja_id' = cj.id::text))
           ORDER BY cj.orden, cj.nombre), '[]'::jsonb)
    INTO v_cajas FROM public.cajas cj WHERE cj.tenant_id = p_tenant AND cj.activa;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('apertura_id', a.id, 'caja_id', a.caja_id, 'caja_nombre', COALESCE(cj.nombre, a.caja_nombre),
           'cajero_id', a.cajero_id, 'cajero_nombre', a.cajero_nombre, 'fecha', a.fecha, 'turno', a.turno, 'fondo', a.fondo,
           'desde', a.created_at, 'cerrada', true,
           -- hasta: cuando ese cajero abrió su caja siguiente (lo de después es de esa)
           'hasta', (SELECT min(a2.created_at) FROM public.caja_aperturas a2
                      WHERE a2.tenant_id = a.tenant_id AND a2.cajero_id = a.cajero_id AND a2.caja_id IS NOT NULL
                        AND a2.created_at > a.created_at)) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_recientes
    FROM public.caja_aperturas a LEFT JOIN public.cajas cj ON cj.id = a.caja_id
   WHERE a.tenant_id = p_tenant AND a.caja_id IS NOT NULL AND a.fecha = v_hoy
     AND EXISTS (SELECT 1 FROM public.cierres_caja c WHERE c.tenant_id = a.tenant_id AND c.fecha = a.fecha AND c.turno = a.turno);
  RETURN jsonb_build_object(
    'modo', 'varias', 'fecha', v_dia,
    'abierta', m IS NOT NULL,
    'requiere_apertura', m IS NULL,
    -- su caja quedó abierta desde otro día: primero se cierra
    'de_otro_dia', m IS NOT NULL AND (m->>'fecha')::date < v_hoy,
    'apertura_id', m->>'apertura_id', 'caja_id', m->>'caja_id', 'caja_nombre', m->>'caja_nombre',
    'turno', (m->>'turno')::int, 'fecha_apertura', m->>'fecha', 'desde', m->>'desde', 'fondo', COALESCE((m->>'fondo')::numeric, 0),
    'es_admin', public._es_admin_de(p_tenant) OR public.is_superadmin(),
    'abiertas', v_abiertas, 'recientes', v_recientes, 'cajas', v_cajas);
END $f$;
REVOKE ALL ON FUNCTION private._estado_varias(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- estado_caja: igual que antes para 'simple'/'apertura'; 'varias' por usuario.
CREATE OR REPLACE FUNCTION public.estado_caja(p_fecha date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RETURN NULL; END IF;
  IF private._modo_caja(v_t) = 'varias' THEN
    RETURN private._estado_varias(v_t, auth.uid(), p_fecha);
  END IF;
  RETURN private._estado_caja(v_t, p_fecha);
END;
$function$;
REVOKE ALL ON FUNCTION public.estado_caja(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_caja(date) TO authenticated;

-- Abrir una caja en modo 'varias'.
CREATE OR REPLACE FUNCTION public.abrir_caja_en(p_caja uuid, p_fondo numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_t      uuid := public.get_user_tenant();
  v_uid    uuid := auth.uid();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_caja   record;
  v_ocup   record;
  v_turno  integer;
  v_nombre text;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR v_t IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Inicia sesión.'); END IF;
  IF private._modo_caja(v_t) <> 'varias' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta empresa no usa varias cajas.');
  END IF;
  -- Dos cajeros que abren a la vez: el segundo espera y ve la caja ocupada.
  PERFORM pg_advisory_xact_lock(hashtextextended('abrir_caja:' || v_t::text, 0));

  SELECT * INTO v_caja FROM public.cajas WHERE id = p_caja AND tenant_id = v_t;
  IF v_caja.id IS NULL OR NOT v_caja.activa THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa caja no existe o está desactivada.');
  END IF;
  IF EXISTS (SELECT 1 FROM private._cajas_abiertas(v_t) x WHERE x.cajero_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.');
  END IF;
  SELECT * INTO v_ocup FROM private._cajas_abiertas(v_t) x WHERE x.caja_id = p_caja LIMIT 1;
  IF v_ocup.apertura_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_caja.nombre || ' ya está abierta por ' || COALESCE(v_ocup.cajero_nombre, 'otro cajero') || '.');
  END IF;
  IF p_fondo IS NULL OR p_fondo < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el fondo inicial (0 si no hay).');
  END IF;

  SELECT GREATEST(
           (SELECT COALESCE(max(turno), 0) FROM public.cierres_caja   WHERE tenant_id = v_t AND fecha = v_hoy),
           (SELECT COALESCE(max(turno), 0) FROM public.caja_aperturas WHERE tenant_id = v_t AND fecha = v_hoy)) + 1
    INTO v_turno;
  SELECT COALESCE(NULLIF(btrim(nombre_completo), ''), email) INTO v_nombre FROM public.perfiles WHERE id = v_uid;
  IF v_nombre IS NULL THEN SELECT NULLIF(btrim(full_name), '') INTO v_nombre FROM public.profiles WHERE id = v_uid; END IF;

  INSERT INTO public.caja_aperturas (tenant_id, fecha, turno, fondo, cajero_id, cajero_nombre, caja_id, caja_nombre, created_at)
  VALUES (v_t, v_hoy, v_turno, round(p_fondo, 2), v_uid, v_nombre, v_caja.id, v_caja.nombre, clock_timestamp())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'apertura_id', v_id, 'turno', v_turno, 'caja_nombre', v_caja.nombre);
END;
$function$;
REVOKE ALL ON FUNCTION public.abrir_caja_en(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caja_en(uuid, numeric) TO authenticated;

-- Crear / renombrar / activar o desactivar una caja (administrador).
CREATE OR REPLACE FUNCTION public.guardar_caja(p_id uuid, p_nombre text, p_activa boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_nombre text := btrim(COALESCE(p_nombre, '')); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
  IF NOT (public._es_admin_de(v_t) OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador maneja las cajas.';
  END IF;
  IF length(v_nombre) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Escribe el nombre de la caja (máximo 40 letras).'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.cajas (tenant_id, nombre, activa, orden)
    VALUES (v_t, v_nombre, COALESCE(p_activa, true),
            (SELECT COALESCE(max(orden), 0) + 1 FROM public.cajas WHERE tenant_id = v_t))
    RETURNING id INTO v_id;
  ELSE
    IF NOT COALESCE(p_activa, true)
       AND EXISTS (SELECT 1 FROM private._cajas_abiertas(v_t) x WHERE x.caja_id = p_id) THEN
      RAISE EXCEPTION 'Esa caja está abierta: ciérrala antes de desactivarla.';
    END IF;
    UPDATE public.cajas SET nombre = v_nombre, activa = COALESCE(p_activa, true)
     WHERE id = p_id AND tenant_id = v_t RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Esa caja no existe.'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Ya hay una caja con ese nombre.';
END;
$function$;
REVOKE ALL ON FUNCTION public.guardar_caja(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_caja(uuid, text, boolean) TO authenticated;

-- ── Freno: en 'varias', sin caja abierta no se mueve dinero ──────────
-- Solo usuarios de la app (no la llave de servicio ni el superadmin).
-- TG_ARGV[0] dice qué se revisa:
--   'siempre'   → facturas, recibos de ingreso, devoluciones
--   'gasto'     → gastos de la gaveta (sin cuenta bancaria y afecta_caja)
--   'pago_sup'  → pagos a suplidores con alguna forma en efectivo
--   'compra'    → compras de contado con algún pago en efectivo (tipo 01)
--   'prestamo'  → préstamos desembolsados en efectivo
--   'deposito'  → efectivo que sale de la caja a una cuenta (caja_depositos)
-- Solo en la empresa propia del usuario; y su caja tiene que ser de HOY.
CREATE OR REPLACE FUNCTION public._freno_sin_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_que text := TG_ARGV[0]; v_uid uuid := auth.uid(); v_efectivo boolean; v_fecha_ap date;
BEGIN
  IF NEW.tenant_id IS NULL OR v_uid IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF private._modo_caja(NEW.tenant_id) <> 'varias' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND COALESCE(is_superadmin, false)) THEN RETURN NEW; END IF;
  -- Procesos que escriben en OTRA empresa del grupo (la financiera registra
  -- el cobro en el dealer): la caja es de quien trabaja en su empresa.
  IF NEW.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN RETURN NEW; END IF;

  IF v_que = 'prestamo' THEN
    IF lower(COALESCE(NEW.desembolso, '')) <> 'efectivo' THEN RETURN NEW; END IF;
  ELSIF v_que = 'gasto' THEN
    IF NEW.cuenta_bancaria_id IS NOT NULL OR NEW.afecta_caja IS FALSE THEN RETURN NEW; END IF;
  ELSIF v_que = 'pago_sup' THEN
    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(NEW.formas_pago)) = 'array' THEN to_jsonb(NEW.formas_pago) ELSE '[]'::jsonb END) f
                    WHERE lower(COALESCE(f->>'forma', '')) LIKE '%efectivo%' AND (CASE WHEN regexp_replace(COALESCE(f->>'monto', ''), '[,\s]', '', 'g') ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN regexp_replace(f->>'monto', '[,\s]', '', 'g')::numeric ELSE 0 END) > 0)
      INTO v_efectivo;
    IF NOT v_efectivo THEN RETURN NEW; END IF;
  ELSIF v_que = 'compra' THEN
    IF upper(COALESCE(NEW.forma_pago, '')) <> 'CONTADO' THEN RETURN NEW; END IF;
    SELECT CASE WHEN jsonb_typeof(to_jsonb(NEW.pagos)) <> 'array' OR jsonb_array_length(to_jsonb(NEW.pagos)) = 0 THEN true
                ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(to_jsonb(NEW.pagos)) f
                              WHERE (COALESCE(f->>'tipo', '01') = '01' OR lower(COALESCE(f->>'forma', '')) LIKE '%efectivo%')
                                AND (CASE WHEN regexp_replace(COALESCE(f->>'monto', ''), '[,\s]', '', 'g') ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN regexp_replace(f->>'monto', '[,\s]', '', 'g')::numeric ELSE 0 END) > 0) END
      INTO v_efectivo;
    IF NOT v_efectivo THEN RETURN NEW; END IF;
  END IF;

  SELECT x.fecha INTO v_fecha_ap FROM private._cajas_abiertas(NEW.tenant_id) x WHERE x.cajero_id = v_uid LIMIT 1;
  IF v_fecha_ap IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'sin_caja',
      MESSAGE = 'Abre tu caja primero: esta empresa trabaja con varias cajas y no tienes ninguna abierta (en Ventas: Abrir caja).';
  END IF;
  IF v_fecha_ap < (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'caja_de_otro_dia',
      MESSAGE = 'Tu caja sigue abierta desde el ' || to_char(v_fecha_ap, 'DD/MM') || ': ciérrala en Cierre de Caja y abre la de hoy.';
  END IF;
  -- El cierre de cada caja cuenta por quién hizo el movimiento: si la
  -- pantalla no lo mandó (usuario sin perfil), lo pone el servidor.
  IF TG_TABLE_NAME IN ('prestamos', 'caja_depositos') THEN
    IF (to_jsonb(NEW)->>'created_by') IS NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('created_by', v_uid));
    END IF;
  ELSIF (to_jsonb(NEW)->>'usuario_id') IS NULL THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('usuario_id', v_uid));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sin_caja_facturas ON public.facturas;
CREATE TRIGGER trg_sin_caja_facturas BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('siempre');
DROP TRIGGER IF EXISTS trg_sin_caja_recibos ON public.recibos_ingreso;
CREATE TRIGGER trg_sin_caja_recibos BEFORE INSERT ON public.recibos_ingreso
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('siempre');
DROP TRIGGER IF EXISTS trg_sin_caja_devoluciones ON public.devoluciones;
CREATE TRIGGER trg_sin_caja_devoluciones BEFORE INSERT ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('siempre');
DROP TRIGGER IF EXISTS trg_sin_caja_gastos ON public.gastos_diarios;
CREATE TRIGGER trg_sin_caja_gastos BEFORE INSERT ON public.gastos_diarios
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('gasto');
DROP TRIGGER IF EXISTS trg_sin_caja_pagos_sup ON public.pagos_suplidores;
CREATE TRIGGER trg_sin_caja_pagos_sup BEFORE INSERT ON public.pagos_suplidores
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('pago_sup');
DROP TRIGGER IF EXISTS trg_sin_caja_compras ON public.compras;
CREATE TRIGGER trg_sin_caja_compras BEFORE INSERT ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('compra');
DROP TRIGGER IF EXISTS trg_sin_caja_prestamos ON public.prestamos;
CREATE TRIGGER trg_sin_caja_prestamos BEFORE INSERT ON public.prestamos
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('prestamo');
DROP TRIGGER IF EXISTS trg_sin_caja_depositos ON public.caja_depositos;
CREATE TRIGGER trg_sin_caja_depositos BEFORE INSERT ON public.caja_depositos
  FOR EACH ROW EXECUTE FUNCTION public._freno_sin_caja('siempre');

-- (5) Un compromiso pagado en efectivo no guarda quién lo pagó: no se puede
-- poner en el cierre de ninguna caja. Con varias cajas se paga desde la caja
-- como gasto, o por transferencia.
CREATE OR REPLACE FUNCTION public._freno_compromiso_varias()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF private._modo_caja(NEW.tenant_id) <> 'varias' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN RETURN NEW; END IF;
  -- La nómina se paga empleado por empleado con su gasto (ese sí va a la caja).
  IF lower(COALESCE(NEW.tipo, '')) = 'nomina' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.activo, true) AND NEW.activo IS FALSE AND NEW.fecha_pago IS NOT NULL
     AND lower(COALESCE(NEW.forma_pago, 'efectivo')) LIKE '%efectivo%' THEN
    RAISE EXCEPTION 'Con varias cajas, un compromiso no se paga "en efectivo" desde aquí: regístralo como gasto desde tu caja, o págalo por transferencia.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_compromiso_varias ON public.compromisos;
CREATE TRIGGER trg_compromiso_varias BEFORE UPDATE ON public.compromisos
  FOR EACH ROW EXECUTE FUNCTION public._freno_compromiso_varias();

-- (3) Editar una factura no la cambia de cajero (se movería de caja).
CREATE OR REPLACE FUNCTION public._factura_conserva_cajero()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF OLD.usuario_id IS NOT NULL AND NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     AND private._modo_caja(NEW.tenant_id) = 'varias' THEN
    NEW.usuario_id := OLD.usuario_id;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_factura_conserva_cajero ON public.facturas;
CREATE TRIGGER trg_factura_conserva_cajero BEFORE UPDATE OF usuario_id ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._factura_conserva_cajero();

-- (8) No se sale de "Varias cajas" con cajas abiertas (quedarían abiertas
-- para siempre y volverían si se activa otra vez).
CREATE OR REPLACE FUNCTION public._freno_salir_de_varias()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF OLD.modo_caja = 'varias' AND NEW.modo_caja IS DISTINCT FROM 'varias'
     AND EXISTS (SELECT 1 FROM private._cajas_abiertas(NEW.tenant_id)) THEN
    RAISE EXCEPTION 'Hay cajas abiertas: ciérralas en Cierre de Caja antes de cambiar el Modo de Caja.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_salir_de_varias ON public.config_empresa;
CREATE TRIGGER trg_salir_de_varias BEFORE UPDATE OF modo_caja ON public.config_empresa
  FOR EACH ROW EXECUTE FUNCTION public._freno_salir_de_varias();

-- ── Cierre en 'varias': debe ser de una caja abierta, y lo hace su cajero o un admin ──
CREATE OR REPLACE FUNCTION public._cierre_varias_valida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_ap record;
BEGIN
  IF NEW.tenant_id IS NULL OR v_uid IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF private._modo_caja(NEW.tenant_id) <> 'varias' THEN RETURN NEW; END IF;
  SELECT * INTO v_ap FROM public.caja_aperturas a
   WHERE a.tenant_id = NEW.tenant_id AND a.fecha = NEW.fecha AND a.turno = NEW.turno AND a.caja_id IS NOT NULL
   ORDER BY a.created_at DESC LIMIT 1;
  IF v_ap.id IS NULL THEN
    RAISE EXCEPTION 'Con varias cajas, el cierre es de una caja: elige la caja que vas a cerrar.';
  END IF;
  -- Rehacer: solo una caja cerrada HOY (los cierres viejos no se tocan).
  IF EXISTS (SELECT 1 FROM public.cierres_caja c WHERE c.tenant_id = NEW.tenant_id AND c.fecha = NEW.fecha AND c.turno = NEW.turno)
     AND v_ap.fecha < (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION 'Ese cierre es de otro día: los cierres viejos no se rehacen.';
  END IF;
  IF v_ap.cajero_id IS DISTINCT FROM v_uid
     AND NOT (public._es_admin_de(NEW.tenant_id) OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'Solo % (quien abrió %) o un administrador puede cerrar esa caja.', COALESCE(v_ap.cajero_nombre, 'su cajero'), COALESCE(v_ap.caja_nombre, 'la caja');
  END IF;
  -- El cierre queda a nombre del cajero de la caja.
  NEW.cajero_id := v_ap.cajero_id;
  NEW.cajero_nombre := COALESCE(v_ap.caja_nombre || ' — ', '') || COALESCE(v_ap.cajero_nombre, '');
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_cierre_varias_valida ON public.cierres_caja;
CREATE TRIGGER trg_cierre_varias_valida BEFORE INSERT ON public.cierres_caja
  FOR EACH ROW EXECUTE FUNCTION public._cierre_varias_valida();

-- 'varias' ya se puede elegir (la restricción ya lo aceptaba).
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.registrar_migracion('varias_cajas.sql');
