-- =====================================================================
-- Plan MOTOFLOW FREE — Fase 1 (19/11/2026)
-- ---------------------------------------------------------------------
-- Decisiones del dueño (19/11/2026):
--   * FREE (RD$0): 1 usuario, 1 almacén, 100 artículos, 300 ventas al mes.
--     Ventas y compras SOLO DE CONTADO. Sin comprobantes fiscales (ni NCF ni
--     e-CF: "el que quiera facturar, al facturador de la DGII o que compre
--     el Básico"). Sin cotizaciones (★ Básico).
--   * Quien adquirió un plan alguna vez NUNCA vuelve a FREE: al vencer se
--     bloquea, como hoy.
--   * Una prueba que termina sin que la empresa haya comprado nunca pasa a
--     FREE.
--   * "Probar Pro 15 días": una sola vez por empresa, desde FREE.
--   * No se OFRECE todavía: Planes lo esconde y el registro sigue en TRIAL
--     hasta el lanzamiento (después de las fases 2 a 4). Sí rige desde ya
--     para las pruebas que terminan sin compra (decisión del dueño).
--
-- El plan vigente de una empresa es la suscripción CREADA más reciente, igual
-- que check_suscripcion_activa (así un cambio de plan reciente siempre gana).
-- =====================================================================

-- 1. El plan ------------------------------------------------------------
INSERT INTO public.planes (nombre, descripcion, precio, duracion_dias, activo,
  limite_usuarios, limite_productos, limite_facturas, limite_almacenes,
  feat_cobranzas, feat_api_access, feat_carta_ruta, feat_ocr_facturas,
  feat_cotizaciones_magna, feat_reportes_avanzados)
SELECT 'FREE', 'Gratis para siempre: punto de venta, inventario, clientes, suplidores y compras de contado', 0, 36500, true,
  1, 100, 300, 1,
  false, false, false, false, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.planes WHERE nombre = 'FREE');
-- ACTIVO porque la RLS de planes solo deja leer los activos (si no, la web
-- no ve el plan de una empresa FREE). Planes lo esconde hasta el lanzamiento.
UPDATE public.planes SET activo = true WHERE nombre = 'FREE' AND NOT activo;

-- 2. Las pruebas se marcan: una prueba no es "haber comprado un plan" -----
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

UPDATE public.suscripciones s SET es_prueba = true
  FROM public.planes p
 WHERE p.id = s.plan_id AND p.nombre = 'TRIAL' AND NOT s.es_prueba;

CREATE OR REPLACE FUNCTION private._suscripcion_marca_prueba()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.planes WHERE id = NEW.plan_id AND nombre = 'TRIAL') THEN
    NEW.es_prueba := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_suscripcion_marca_prueba ON public.suscripciones;
CREATE TRIGGER trg_suscripcion_marca_prueba
  BEFORE INSERT ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION private._suscripcion_marca_prueba();

-- 3. Plan vigente y "compró alguna vez" --------------------------------
CREATE OR REPLACE FUNCTION public._plan_vigente(p_tenant uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT upper(pl.nombre)
    FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
   WHERE s.tenant_id = p_tenant
   ORDER BY s.created_at DESC, s.fecha_fin DESC
   LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public._plan_vigente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._plan_vigente(uuid) TO service_role;   -- emitir-fiscal

-- Cualquier suscripción que no sea prueba ni FREE = adquirió un plan (pagado
-- o regalado por el dueño): esa empresa ya no vuelve a FREE.
CREATE OR REPLACE FUNCTION public._compro_alguna_vez(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
     WHERE s.tenant_id = p_tenant AND NOT s.es_prueba AND upper(pl.nombre) <> 'FREE')
$function$;
REVOKE ALL ON FUNCTION public._compro_alguna_vez(uuid) FROM PUBLIC, anon, authenticated;

-- _limite_plan (Fase 0) usa la misma regla: vive en limites_plan_servidor.sql.

-- 4. Pasar a FREE una prueba que terminó sin compra --------------------
CREATE OR REPLACE FUNCTION private._pasar_a_free(p_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_sub record; v_free uuid;
BEGIN
  SELECT s.*, upper(pl.nombre) AS plan INTO v_sub
    FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
   WHERE s.tenant_id = p_tenant
   ORDER BY s.created_at DESC, s.fecha_fin DESC
   LIMIT 1;
  IF v_sub IS NULL OR v_sub.plan = 'FREE' OR NOT v_sub.es_prueba THEN RETURN false; END IF;
  IF v_sub.fecha_fin > now() AND v_sub.estado IN ('trial', 'activo') THEN RETURN false; END IF;  -- la prueba sigue
  IF public._compro_alguna_vez(p_tenant) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.pagos_suscripcion WHERE tenant_id = p_tenant AND estado = 'pendiente') THEN RETURN false; END IF;

  SELECT id INTO v_free FROM public.planes WHERE nombre = 'FREE';
  IF v_free IS NULL THEN RETURN false; END IF;
  INSERT INTO public.suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar, created_at)
  VALUES (p_tenant, v_free, 'activo', clock_timestamp(), now() + interval '100 years', 0, false, clock_timestamp());
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private._pasar_a_free(uuid) FROM PUBLIC, anon, authenticated;

-- La pantalla de "sistema bloqueado" la llama: si la prueba terminó sin
-- compra, la empresa sigue en FREE en vez de quedarse bloqueada.
CREATE OR REPLACE FUNCTION public.activar_free_si_corresponde()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', private._pasar_a_free(v_tenant), 'plan', public._plan_vigente(v_tenant));
END;
$function$;
REVOKE ALL ON FUNCTION public.activar_free_si_corresponde() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activar_free_si_corresponde() TO authenticated;

-- Todos los días: las pruebas que terminaron desde que existe FREE. Las
-- pruebas viejas abandonadas (antes del 19/11) solo pasan si vuelven a entrar.
CREATE OR REPLACE FUNCTION private._free_tras_prueba()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT DISTINCT s.tenant_id FROM public.suscripciones s
            WHERE s.es_prueba AND s.fecha_fin <= now() AND s.fecha_fin >= '2026-11-19'
  LOOP
    IF private._pasar_a_free(r.tenant_id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION private._free_tras_prueba() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'free-tras-prueba';
SELECT cron.schedule('free-tras-prueba', '15 10 * * *', $$SELECT private._free_tras_prueba()$$);  -- 6:15 a. m. RD

-- 5. "Probar Pro 15 días" (una vez por empresa, desde FREE) -------------
CREATE OR REPLACE FUNCTION public.estado_prueba_pro()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object(
    'plan', public._plan_vigente(public.get_user_tenant()),
    'puede_probar', public._plan_vigente(public.get_user_tenant()) = 'FREE'
      AND NOT EXISTS (SELECT 1 FROM public.suscripciones WHERE tenant_id = public.get_user_tenant() AND es_prueba))
  WHERE auth.uid() IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.estado_prueba_pro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_prueba_pro() TO authenticated;

CREATE OR REPLACE FUNCTION private._iniciar_prueba_pro(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_pro uuid;
BEGIN
  IF public._plan_vigente(p_tenant) IS DISTINCT FROM 'FREE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La prueba de Pro se activa desde el plan FREE.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.suscripciones WHERE tenant_id = p_tenant AND es_prueba) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta empresa ya usó su prueba de Pro.');
  END IF;
  SELECT id INTO v_pro FROM public.planes WHERE nombre = 'PRO';
  -- Prueba = plan PRO completo (sus límites y funciones) marcado como prueba.
  INSERT INTO public.suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar, es_prueba, created_at)
  VALUES (p_tenant, v_pro, 'trial', clock_timestamp(), now() + interval '15 days', 0, false, true, clock_timestamp());
  RETURN jsonb_build_object('ok', true, 'hasta', (now() + interval '15 days')::date);
END;
$function$;
REVOKE ALL ON FUNCTION private._iniciar_prueba_pro(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.probar_pro()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Inicia sesión.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                  AND lower(coalesce(role, '')) IN ('admin', 'owner', 'manager', 'gerente')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el dueño o un administrador puede activar la prueba.');
  END IF;
  RETURN private._iniciar_prueba_pro(public.get_user_tenant());
END;
$function$;
REVOKE ALL ON FUNCTION public.probar_pro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.probar_pro() TO authenticated;

-- 6. Lo que FREE no hace, frenado en el servidor -----------------------
CREATE OR REPLACE FUNCTION public._freno_plan_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_que text := TG_ARGV[0];   -- 'facturas' | 'compras' | 'cotizaciones'
BEGIN
  IF NEW.tenant_id IS NULL
     OR COALESCE(auth.role(), '') = 'service_role'
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false))
     OR public._plan_vigente(NEW.tenant_id) IS DISTINCT FROM 'FREE' THEN
    RETURN NEW;
  END IF;

  IF v_que = 'cotizaciones' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'plan_free',
      MESSAGE = 'Las cotizaciones en PDF vienen desde el plan BÁSICO. Mejora tu plan en Planes para usarlas.';
  END IF;

  IF v_que = 'facturas' AND COALESCE(NEW.es_saldo_inicial, false) THEN RETURN NEW; END IF;

  -- Manda la forma de pago (los días de crédito pueden quedar puestos en una
  -- compra que se pasó a Contado). Al EDITAR solo se mira lo que cambia: una
  -- factura de la prueba, con su NCF o a crédito, se puede seguir editando.
  IF upper(COALESCE(NEW.forma_pago, 'CONTADO')) <> 'CONTADO'
     AND (TG_OP = 'INSERT' OR upper(COALESCE(OLD.forma_pago, 'CONTADO')) = 'CONTADO') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'plan_free',
      MESSAGE = CASE v_que
        WHEN 'facturas' THEN 'Tu plan FREE vende solo de contado. Las ventas a crédito (cuentas por cobrar) vienen desde el plan BÁSICO.'
        ELSE 'Tu plan FREE compra solo de contado. Las compras a crédito (cuentas por pagar) vienen desde el plan BÁSICO.' END;
  END IF;

  IF v_que = 'facturas' AND NULLIF(btrim(COALESCE(NEW.ncf, '')), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.ncf IS DISTINCT FROM OLD.ncf) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'plan_free',
      MESSAGE = 'Tu plan FREE no emite comprobantes fiscales (NCF ni e-CF). Para facturar con comprobante usa el facturador gratuito de la DGII, o mejora al plan BÁSICO, que lo trae integrado.';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._freno_plan_free() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_plan_free_facturas ON public.facturas;
CREATE TRIGGER trg_plan_free_facturas
  BEFORE INSERT OR UPDATE OF forma_pago, ncf ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._freno_plan_free('facturas');

DROP TRIGGER IF EXISTS trg_plan_free_compras ON public.compras;
CREATE TRIGGER trg_plan_free_compras
  BEFORE INSERT OR UPDATE OF forma_pago ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public._freno_plan_free('compras');

DROP TRIGGER IF EXISTS trg_plan_free_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_plan_free_cotizaciones
  BEFORE INSERT ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public._freno_plan_free('cotizaciones');

NOTIFY pgrst, 'reload schema';

-- ── Prueba (la empresa de prueba pasa a FREE dentro de un bloque que se deshace) ──
DO $prueba$
DECLARE
  v_elite uuid;   -- prueba (TRIAL) que nunca compró
  v_morla uuid := '00000000-0000-0000-0000-000000000001';  -- ENTERPRISE pagado
  v_msg   text;
  v_res   jsonb;
  v_fallo text := NULL;
  v_fid   text;   -- factura con NCF hecha durante la prueba
BEGIN
  SELECT id INTO v_elite FROM public.tenants WHERE nombre ILIKE 'ELITE SOLUTIONS%' ORDER BY created_at LIMIT 1;
  IF public._compro_alguna_vez(v_elite) THEN RAISE EXCEPTION 'prueba: la empresa de prueba figura como que compró'; END IF;
  IF NOT public._compro_alguna_vez(v_morla) THEN RAISE EXCEPTION 'prueba: Morla figura como que nunca compró'; END IF;
  IF private._pasar_a_free(v_elite) THEN RAISE EXCEPTION 'prueba: pasó a FREE con la prueba todavía vigente'; END IF;
  IF private._pasar_a_free(v_morla) THEN RAISE EXCEPTION 'prueba: una empresa que pagó pasó a FREE'; END IF;

  BEGIN
    -- Una factura con NCF hecha DURANTE la prueba (antes de FREE).
    INSERT INTO public.facturas (tenant_id, numero, fecha, total, forma_pago, ncf)
    VALUES (v_elite, 999999990, now(), 0, 'CONTADO', 'B0200000099') RETURNING id::text INTO v_fid;

    -- La prueba termina → pasa a FREE.
    UPDATE public.suscripciones SET fecha_fin = now() - interval '1 day' WHERE tenant_id = v_elite AND es_prueba;
    IF NOT private._pasar_a_free(v_elite) THEN v_fallo := 'no pasó a FREE al terminar la prueba'; END IF;
    IF v_fallo IS NULL AND public._plan_vigente(v_elite) <> 'FREE' THEN v_fallo := 'el plan vigente no es FREE'; END IF;
    IF v_fallo IS NULL AND public._limite_plan(v_elite, 'productos') <> 100 THEN v_fallo := 'el límite de artículos no es 100'; END IF;

    -- Venta a crédito → frena.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.facturas (tenant_id, numero, fecha, total, forma_pago) VALUES (v_elite, 999999991, now(), 0, 'CREDITO');
        v_fallo := 'la venta a crédito pasó';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE 'Tu plan FREE vende solo de contado%' THEN v_fallo := 'venta a crédito: ' || SQLERRM; END IF;
      END;
    END IF;
    -- Venta con NCF → frena.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.facturas (tenant_id, numero, fecha, total, forma_pago, ncf) VALUES (v_elite, 999999992, now(), 0, 'CONTADO', 'B0200000001');
        v_fallo := 'la venta con NCF pasó';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE 'Tu plan FREE no emite comprobantes%' THEN v_fallo := 'venta con NCF: ' || SQLERRM; END IF;
      END;
    END IF;
    -- Venta de contado sin NCF → pasa.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.facturas (tenant_id, numero, fecha, total, forma_pago) VALUES (v_elite, 999999993, now(), 0, 'CONTADO');
      EXCEPTION WHEN OTHERS THEN v_fallo := 'venta de contado: ' || SQLERRM;
      END;
    END IF;
    -- Compra a crédito ("Credito", como la escriben algunas pantallas) → frena.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.compras (tenant_id, numero, fecha, forma_pago) VALUES (v_elite, 'ZZ-PRUEBA-FREE', now(), 'Credito');
        v_fallo := 'la compra a crédito pasó';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE 'Tu plan FREE compra solo de contado%' THEN v_fallo := 'compra a crédito: ' || SQLERRM; END IF;
      END;
    END IF;
    -- Editar la factura de la prueba (sin tocar su NCF) → pasa; cambiarle el NCF → frena.
    IF v_fallo IS NULL THEN
      BEGIN
        UPDATE public.facturas SET forma_pago = 'CONTADO', total = 1 WHERE id::text = v_fid;
      EXCEPTION WHEN OTHERS THEN v_fallo := 'editar factura de la prueba: ' || SQLERRM;
      END;
    END IF;
    IF v_fallo IS NULL THEN
      BEGIN
        UPDATE public.facturas SET ncf = 'B0200000100' WHERE id::text = v_fid;
        v_fallo := 'cambiar el NCF en FREE pasó';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE 'Tu plan FREE no emite comprobantes%' THEN v_fallo := 'cambiar NCF: ' || SQLERRM; END IF;
      END;
    END IF;
    -- Compra de contado con días de crédito sobrantes → pasa.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.compras (tenant_id, numero, fecha, forma_pago, dias_credito) VALUES (v_elite, 'ZZ-PRUEBA-FREE3', now(), 'Contado', 30);
      EXCEPTION WHEN OTHERS THEN v_fallo := 'compra de contado con días: ' || SQLERRM;
      END;
    END IF;
    -- Compra de contado → pasa.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.compras (tenant_id, numero, fecha, forma_pago) VALUES (v_elite, 'ZZ-PRUEBA-FREE2', now(), 'Contado');
      EXCEPTION WHEN OTHERS THEN v_fallo := 'compra de contado: ' || SQLERRM;
      END;
    END IF;
    -- Cotización → frena.
    IF v_fallo IS NULL THEN
      BEGIN
        INSERT INTO public.cotizaciones (tenant_id, fecha_vencimiento) VALUES (v_elite, current_date + 7);
        v_fallo := 'la cotización pasó';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE 'Las cotizaciones en PDF vienen desde el plan BÁSICO%' THEN v_fallo := 'cotización: ' || SQLERRM; END IF;
      END;
    END IF;
    -- Probar Pro: entra una vez, y la segunda ya no.
    IF v_fallo IS NULL THEN
      v_res := private._iniciar_prueba_pro(v_elite);
      IF (v_res->>'ok')::boolean THEN v_fallo := 'Probar Pro entró aunque la empresa ya tuvo prueba'; END IF;
    END IF;
    -- Empresa FREE que nunca probó (se quita su prueba vieja dentro del bloque):
    -- entra a Pro 15 días, no puede repetir, y al terminar vuelve a FREE.
    IF v_fallo IS NULL THEN
      DELETE FROM public.suscripciones WHERE tenant_id = v_elite AND es_prueba;
      v_res := private._iniciar_prueba_pro(v_elite);
      IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN v_fallo := 'Probar Pro no entró: ' || v_res::text;
      ELSIF public._plan_vigente(v_elite) <> 'PRO' THEN v_fallo := 'durante la prueba el plan no es PRO';
      ELSIF public._limite_plan(v_elite, 'productos') < 99999 THEN v_fallo := 'la prueba no trae los límites de Pro';
      ELSIF (private._iniciar_prueba_pro(v_elite)->>'ok')::boolean THEN v_fallo := 'Probar Pro entró dos veces';
      ELSIF private._pasar_a_free(v_elite) THEN v_fallo := 'volvió a FREE con la prueba de Pro vigente';
      ELSE
        UPDATE public.suscripciones SET fecha_fin = now() - interval '1 minute' WHERE tenant_id = v_elite AND es_prueba;
        -- En dos pasos: una función STABLE en la misma expresión no ve la fila nueva.
        IF NOT private._pasar_a_free(v_elite) THEN
          v_fallo := 'no volvió a FREE al terminar la prueba de Pro';
        ELSIF public._plan_vigente(v_elite) <> 'FREE' THEN
          v_fallo := 'tras la prueba de Pro el plan vigente no es FREE';
        END IF;
      END IF;
    END IF;

    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'deshacer' THEN v_fallo := COALESCE(v_fallo, SQLERRM); END IF;
  END;

  IF v_fallo IS NOT NULL THEN RAISE EXCEPTION 'prueba plan FREE: %', v_fallo; END IF;
  IF public._plan_vigente(v_elite) = 'FREE' THEN RAISE EXCEPTION 'prueba: no se deshizo el cambio a FREE'; END IF;
END
$prueba$;

SELECT public.registrar_migracion('plan_free.sql');
