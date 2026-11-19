-- =====================================================================
-- Límites del plan, de verdad (Fase 0 de MotoFlow FREE, 19/11/2026)
-- ---------------------------------------------------------------------
-- Hasta hoy solo el límite de USUARIOS se respetaba (cupo_usuarios, que mira
-- admin-management). Los de artículos, ventas del mes y almacenes solo se
-- mostraban en Planes: un Básico podía tener 5,000 productos. Decisión del
-- dueño (19/11): se aplican a TODOS los planes.
--
--   * Se frena CREAR (o reactivar) por encima del límite. Consultar, editar y
--     exportar lo que ya existe, siempre.
--   * Quien ya pasa del límite no pierde nada: solo no puede crear más
--     (al 19/11 era una sola empresa, una prueba con 68 de 50 artículos).
--   * Límite NULL o "ilimitado" (productos >= 99999, almacenes >= 99) = sin freno.
--   * El servidor (service_role: migraciones, funciones) y el superadmin no
--     se frenan: el freno es para lo que hace el usuario.
--   * Ventas del mes = facturas con fecha en el mes de HOY en hora de RD,
--     sin contar saldos iniciales.
-- =====================================================================

-- El límite del plan vigente de la empresa: la suscripción CREADA más
-- reciente, igual que check_suscripcion_activa (19/11: así la prueba de Pro
-- gana a la de FREE, que vence en 100 años).
CREATE OR REPLACE FUNCTION public._limite_plan(p_tenant uuid, p_que text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE p_que
           WHEN 'productos' THEN pl.limite_productos
           WHEN 'facturas'  THEN pl.limite_facturas
           WHEN 'almacenes' THEN pl.limite_almacenes
         END
    FROM public.suscripciones s
    JOIN public.planes pl ON pl.id = s.plan_id
   WHERE s.tenant_id = p_tenant
   ORDER BY s.created_at DESC, s.fecha_fin DESC
   LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public._limite_plan(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._freno_limite_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_que    text := TG_ARGV[0];          -- 'productos' | 'facturas' | 'almacenes'
  v_lim    integer;
  v_usados integer;
  v_plan   text;
  v_mes    timestamptz;
BEGIN
  IF NEW.tenant_id IS NULL
     OR COALESCE(auth.role(), '') = 'service_role'
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN
    RETURN NEW;
  END IF;

  IF v_que IN ('productos', 'almacenes') THEN
    -- Solo cuenta lo que queda ACTIVO: crear inactivo o editar no se frena;
    -- reactivar uno inactivo sí cuenta.
    IF NOT COALESCE(NEW.activo, true) THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND COALESCE(OLD.activo, true) THEN RETURN NEW; END IF;
  ELSIF v_que = 'facturas' THEN
    IF COALESCE(NEW.es_saldo_inicial, false) THEN RETURN NEW; END IF;
  END IF;

  v_lim := public._limite_plan(NEW.tenant_id, v_que);
  IF v_lim IS NULL
     OR (v_que = 'productos' AND v_lim >= 99999)
     OR (v_que = 'almacenes' AND v_lim >= 99) THEN
    RETURN NEW;
  END IF;

  IF v_que = 'productos' THEN
    SELECT count(*) INTO v_usados FROM public.productos
     WHERE tenant_id = NEW.tenant_id AND COALESCE(activo, true) AND id IS DISTINCT FROM NEW.id;
  ELSIF v_que = 'almacenes' THEN
    SELECT count(*) INTO v_usados FROM public.almacenes
     WHERE tenant_id = NEW.tenant_id AND COALESCE(activo, true) AND id IS DISTINCT FROM NEW.id;
  ELSE
    v_mes := date_trunc('month', now() AT TIME ZONE 'America/Santo_Domingo') AT TIME ZONE 'America/Santo_Domingo';
    SELECT count(*) INTO v_usados FROM public.facturas
     WHERE tenant_id = NEW.tenant_id AND fecha >= v_mes AND NOT COALESCE(es_saldo_inicial, false);
  END IF;

  IF v_usados < v_lim THEN RETURN NEW; END IF;

  SELECT pl.nombre INTO v_plan
    FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
   WHERE s.tenant_id = NEW.tenant_id
   ORDER BY s.created_at DESC, s.fecha_fin DESC
   LIMIT 1;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    HINT = 'limite_plan',
    MESSAGE = format('Llegaste al límite de tu plan %s: %s %s. Lo que ya tienes lo puedes seguir viendo y editando; para agregar más, mejora tu plan en Planes.',
                     v_plan, v_lim,
                     CASE v_que WHEN 'productos' THEN 'artículos'
                                WHEN 'almacenes' THEN 'almacenes'
                                ELSE 'ventas por mes' END);
END;
$function$;
REVOKE ALL ON FUNCTION public._freno_limite_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_limite_plan_productos ON public.productos;
CREATE TRIGGER trg_limite_plan_productos
  BEFORE INSERT OR UPDATE OF activo ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public._freno_limite_plan('productos');

DROP TRIGGER IF EXISTS trg_limite_plan_almacenes ON public.almacenes;
CREATE TRIGGER trg_limite_plan_almacenes
  BEFORE INSERT OR UPDATE OF activo ON public.almacenes
  FOR EACH ROW EXECUTE FUNCTION public._freno_limite_plan('almacenes');

DROP TRIGGER IF EXISTS trg_limite_plan_facturas ON public.facturas;
CREATE TRIGGER trg_limite_plan_facturas
  BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._freno_limite_plan('facturas');

-- ── Prueba (ejecuta los frenos de verdad y deshace todo lo que inserta) ──
DO $prueba$
DECLARE
  v_elite uuid;   -- prueba con 68 artículos de 50 y 1 almacén de 1
  v_morla uuid := '00000000-0000-0000-0000-000000000001';  -- ENTERPRISE: sin límites
  v_msg   text;
BEGIN
  SELECT id INTO v_elite FROM public.tenants WHERE nombre ILIKE 'ELITE SOLUTIONS%' ORDER BY created_at LIMIT 1;
  IF v_elite IS NULL THEN RAISE EXCEPTION 'prueba: no encontré la empresa de prueba'; END IF;
  IF public._limite_plan(v_elite, 'productos') IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'prueba: límite de artículos de la prueba = %', public._limite_plan(v_elite, 'productos');
  END IF;

  -- 1. Artículo nuevo por encima del límite → frena.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.productos (codigo, tenant_id, activo) VALUES ('ZZ-PRUEBA-LIMITE', v_elite, true);
    v_msg := 'no_freno';
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_msg := COALESCE(v_msg, SQLERRM);
  END;
  IF v_msg NOT ILIKE 'Llegaste al límite de tu plan TRIAL: 50 artículos%' THEN
    RAISE EXCEPTION 'prueba 1 (artículo sobre el límite): %', v_msg;
  END IF;

  -- 2. Artículo nuevo INACTIVO → no frena.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.productos (codigo, tenant_id, activo) VALUES ('ZZ-PRUEBA-LIMITE', v_elite, false);
    v_msg := 'paso';
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_msg := COALESCE(v_msg, SQLERRM);
  END;
  IF v_msg <> 'paso' THEN RAISE EXCEPTION 'prueba 2 (artículo inactivo): %', v_msg; END IF;

  -- 3. Segundo almacén con límite de 1 → frena.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.almacenes (codigo, nombre, activo, tenant_id) VALUES ('ZZPRUEBA', 'ZZ PRUEBA', true, v_elite);
    v_msg := 'no_freno';
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_msg := COALESCE(v_msg, SQLERRM);
  END;
  IF v_msg NOT ILIKE 'Llegaste al límite de tu plan TRIAL: 1 almacenes%' THEN
    RAISE EXCEPTION 'prueba 3 (almacén sobre el límite): %', v_msg;
  END IF;

  -- 4. Venta dentro del límite (0 de 100 este mes) → no frena.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.facturas (tenant_id, numero, fecha, total) VALUES (v_elite, 999999999, now(), 0);
    v_msg := 'paso';
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_msg := COALESCE(v_msg, SQLERRM);
  END;
  IF v_msg <> 'paso' THEN RAISE EXCEPTION 'prueba 4 (venta dentro del límite): %', v_msg; END IF;

  -- 5. ENTERPRISE (sin límites) → artículo nuevo no frena.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.productos (codigo, tenant_id, activo) VALUES ('ZZ-PRUEBA-LIMITE', v_morla, true);
    v_msg := 'paso';
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN v_msg := COALESCE(v_msg, SQLERRM);
  END;
  IF v_msg <> 'paso' THEN RAISE EXCEPTION 'prueba 5 (ENTERPRISE sin límites): %', v_msg; END IF;
END
$prueba$;

SELECT public.registrar_migracion('limites_plan_servidor.sql');
