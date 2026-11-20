-- =====================================================================
-- Fase 5 del onboarding (19/11/2026): pausa por inactividad del plan FREE
-- ---------------------------------------------------------------------
-- Modelo Supabase, opción B (decisión del dueño):
--   * Actividad = alguien de la empresa abre la web o la app
--     (marcar_actividad(), no last_sign_in: la sesión dura semanas).
--   * Día 5 sin actividad → aviso en la campanita a dueño/administradores
--     (el correo queda para cuando esté Resend).
--   * Día 7 → PAUSA (solo plan FREE; quien paga nunca se pausa). Siempre con
--     al menos 2 días entre el aviso y la pausa: una prueba que pasa a FREE
--     ya vieja no se pausa sin aviso.
--   * Pausada SIN datos de negocio → se borra a los 7 días de la pausa
--     (margen por si vuelve). Pausada CON datos → se guarda; a los 6 meses
--     se avisa al superadmin, que decide (la base no borra datos sola).
--   * La 1ª pausa se levanta gratis una vez (reactivar_empresa). Desde la
--     2ª hace falta un plan pagado: al comprar Básico o más, la pausa se
--     quita sola (la pausa solo vale mientras el plan vigente sea FREE).
--   * En pausa: la pantalla se bloquea (web y app) y el servidor no deja
--     crear ventas, artículos ni almacenes (_freno_limite_plan).
-- tenant_actividad no se lee directo: solo por estas funciones.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_actividad (
  tenant_id            uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ultima               timestamptz NOT NULL DEFAULT now(),
  aviso_at             timestamptz,            -- aviso del día 5 de este ciclo
  pausada_at           timestamptz,
  pausas               integer NOT NULL DEFAULT 0,
  reactivacion_gratis  boolean NOT NULL DEFAULT false,  -- ya usó la gratis
  aviso_6_meses_at     timestamptz,
  con_datos            boolean NOT NULL DEFAULT false   -- en pausa y con datos: no se intenta borrar
);
-- (la primera versión de la tabla se creó sin esta columna)
ALTER TABLE public.tenant_actividad ADD COLUMN IF NOT EXISTS con_datos boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_actividad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_actividad FROM anon, authenticated;

-- Nadie empieza vencido: el reloj de todas las empresas arranca hoy.
INSERT INTO public.tenant_actividad (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE public.empresas_eliminadas ADD COLUMN IF NOT EXISTS motivo text;

-- ¿La empresa está en pausa AHORA? (solo cuenta si el plan vigente es FREE)
CREATE OR REPLACE FUNCTION public._empresa_pausada(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  SELECT EXISTS (SELECT 1 FROM public.tenant_actividad a
                  WHERE a.tenant_id = p_tenant AND a.pausada_at IS NOT NULL)
     AND public._plan_vigente(p_tenant) = 'FREE'
     -- pagó un plan y está en revisión: sigue trabajando (como con vencida)
     AND NOT EXISTS (SELECT 1 FROM public.pagos_suscripcion ps WHERE ps.tenant_id = p_tenant AND ps.estado = 'pendiente');
$f$;
REVOKE ALL ON FUNCTION public._empresa_pausada(uuid) FROM PUBLIC, anon, authenticated;

-- ¿Tiene un plan PAGADO vigente? (no FREE, no prueba). Solo eso levanta una
-- pausa sin usar la reactivación gratis: ni un pago en revisión ni la
-- prueba de Pro (la prueba deja trabajar 15 días; al volver a FREE sigue
-- en pausa).
CREATE OR REPLACE FUNCTION private._tiene_plan_pagado(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  SELECT COALESCE((
    SELECT pl.nombre NOT IN ('FREE', 'TRIAL') AND NOT COALESCE(s.es_prueba, false)
           AND s.estado = 'activo' AND s.fecha_fin > now()
      FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
     WHERE s.tenant_id = p_tenant
     ORDER BY s.created_at DESC, s.fecha_fin DESC
     LIMIT 1), false);
$f$;
REVOKE ALL ON FUNCTION private._tiene_plan_pagado(uuid) FROM PUBLIC, anon, authenticated;

-- Web y app la llaman al abrir y cada rato mientras se usa. Escribe como
-- mucho una vez cada 10 minutos. El superadmin mirando una empresa ajena
-- no cuenta como uso de esa empresa.
CREATE OR REPLACE FUNCTION public.marcar_actividad()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN
    RETURN jsonb_build_object('ok', true, 'pausada', public._empresa_pausada(v_t));
  END IF;
  INSERT INTO public.tenant_actividad AS a (tenant_id, ultima) VALUES (v_t, now())
  ON CONFLICT (tenant_id) DO UPDATE SET ultima = now(), aviso_at = NULL
   WHERE a.ultima < now() - interval '10 minutes' OR a.aviso_at IS NOT NULL;
  RETURN jsonb_build_object('ok', true, 'pausada', public._empresa_pausada(v_t));
END $f$;
REVOKE ALL ON FUNCTION public.marcar_actividad() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_actividad() TO authenticated;

-- ¿Puede este usuario manejar la empresa? (dueño o administrador)
CREATE OR REPLACE FUNCTION public._es_admin_de(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = p_tenant AND p.role IN ('owner', 'admin'))
      OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid() AND ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin'));
$f$;
REVOKE ALL ON FUNCTION public._es_admin_de(uuid) FROM PUBLIC, anon, authenticated;

-- (la primera versión tenía estado_pausa(); lo trae check_suscripcion_activa)
DROP FUNCTION IF EXISTS public.estado_pausa();

-- Levantar la pausa: la primera vez gratis; después, solo con plan pagado.
CREATE OR REPLACE FUNCTION public.reactivar_empresa()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE v_t uuid := public.get_user_tenant(); a record;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa.'; END IF;
  IF NOT public._es_admin_de(v_t) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador de la empresa puede reactivarla.';
  END IF;
  SELECT * INTO a FROM public.tenant_actividad WHERE tenant_id = v_t FOR UPDATE;
  IF a.pausada_at IS NULL THEN RETURN jsonb_build_object('ok', true, 'gratis', false); END IF;
  IF private._tiene_plan_pagado(v_t) THEN
    UPDATE public.tenant_actividad SET pausada_at = NULL, aviso_at = NULL, ultima = now(), con_datos = false WHERE tenant_id = v_t;
    RETURN jsonb_build_object('ok', true, 'gratis', false);
  END IF;
  -- Pago en revisión o prueba de Pro: ya puede trabajar, pero la pausa sigue
  -- (si el pago no se aprueba, vuelve a estar en pausa).
  IF NOT public._empresa_pausada(v_t) THEN RETURN jsonb_build_object('ok', true, 'gratis', false, 'pendiente', true); END IF;
  IF a.reactivacion_gratis THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'requiere_plan',
      MESSAGE = 'Ya usaste la reactivación gratis. Para volver a usar tu empresa elige el plan Básico en Planes: todo lo que tenías sigue ahí.';
  END IF;
  UPDATE public.tenant_actividad
     SET pausada_at = NULL, aviso_at = NULL, ultima = now(), reactivacion_gratis = true, con_datos = false
   WHERE tenant_id = v_t;
  RETURN jsonb_build_object('ok', true, 'gratis', true);
END $f$;
REVOKE ALL ON FUNCTION public.reactivar_empresa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivar_empresa() TO authenticated;

-- Un aviso en la campanita para dueño y administradores.
CREATE OR REPLACE FUNCTION private._avisar_admins(p_tenant uuid, p_tipo text, p_titulo text, p_mensaje text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT p_tenant, u.user_id, p_tipo, left(p_titulo, 120), p_mensaje
    FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
          UNION
          SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u;
$f$;
REVOKE ALL ON FUNCTION private._avisar_admins(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- ¿Tiene la empresa datos de negocio? Igual que _empresa_tiene_datos pero
-- sin contar a los usuarios ni lo que el sistema escribe solo (avisos,
-- guías, actividad). Ante la duda (cualquier fila en otra tabla) = tiene.
CREATE OR REPLACE FUNCTION private._empresa_tiene_negocio(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
DECLARE r record; v boolean;
BEGIN
  FOR r IN
    SELECT DISTINCT x.s, x.n, x.col FROM (
      -- toda tabla con columna tenant_id…
      SELECT c.table_schema::text s, c.table_name::text n, 'tenant_id'::text col
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
                                         AND tb.table_type = 'BASE TABLE'
       WHERE c.column_name = 'tenant_id' AND c.table_schema IN ('public', 'private', 'hermes')
      UNION
      -- …y toda llave que apunte a tenants con otro nombre (gps_*.empresa_id)
      SELECT ns.nspname::text, cl.relname::text, a.attname::text
        FROM pg_constraint k
        JOIN pg_class cl ON cl.oid = k.conrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.confrelid = 'public.tenants'::regclass AND k.contype = 'f'
    ) x
     WHERE x.n NOT IN ('tenants', 'profiles', 'usuarios_empresas', 'notificaciones',
                       'tenant_actividad', 'guias_progreso', 'guias_eventos')
       AND x.n <> ALL (public._tablas_de_arranque())
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', r.s, r.n, r.col) INTO v USING p_tenant;
    IF v THEN RETURN r.n; END IF;
  END LOOP;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private._empresa_tiene_negocio(uuid) FROM PUBLIC, anon, authenticated;

-- Borra una empresa FREE vacía y a sus usuarios (solo los que no
-- pertenecen a ninguna otra empresa). Si algo no cuadra, NO borra.
CREATE OR REPLACE FUNCTION private._borrar_empresa_vacia(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE t record; v_datos text; v_users uuid[];
BEGIN
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no existe'; END IF;
  IF public._plan_vigente(p_tenant) IS DISTINCT FROM 'FREE' OR public._compro_alguna_vez(p_tenant) THEN RETURN 'no es FREE'; END IF;
  v_datos := private._empresa_tiene_negocio(p_tenant);
  IF v_datos IS NOT NULL THEN RETURN 'tiene datos en ' || v_datos; END IF;
  -- Un usuario que también está en otra empresa, o un superadmin: no se toca.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = p_tenant
              AND (COALESCE(p.is_superadmin, false)
                   OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = p.id AND ue.tenant_id <> p_tenant)))
     OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
                 WHERE ue.tenant_id = p_tenant
                   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ue.user_id AND p.tenant_id = p_tenant)) THEN
    RETURN 'usuarios compartidos';
  END IF;

  SELECT array_agg(id) INTO v_users FROM public.profiles WHERE tenant_id = p_tenant;

  DELETE FROM public.notificaciones WHERE tenant_id = p_tenant;
  DELETE FROM public.guias_eventos WHERE tenant_id = p_tenant;
  DELETE FROM public.guias_progreso WHERE tenant_id = p_tenant;
  DELETE FROM public.usuario_tenant_activo WHERE tenant_id = p_tenant;
  DELETE FROM public.usuarios_empresas WHERE tenant_id = p_tenant;
  IF v_users IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY (v_users);   -- profiles va en cascada
  END IF;
  DELETE FROM public.profiles WHERE tenant_id = p_tenant;
  DELETE FROM public.tenant_doc_counters WHERE tenant_id = p_tenant;
  DELETE FROM private.tenant_onboarding_claims WHERE tenant_id = p_tenant;
  DELETE FROM public.suscripciones WHERE tenant_id = p_tenant;
  DELETE FROM public.almacenes WHERE tenant_id = p_tenant;
  DELETE FROM public.config_empresa WHERE tenant_id = p_tenant;
  DELETE FROM public.tenants WHERE id = p_tenant;   -- tenant_actividad va en cascada

  INSERT INTO public.empresas_eliminadas (tenant_id, nombre, rnc, creada, eliminada_por, motivo)
  VALUES (t.id, t.nombre, t.rnc, t.created_at, NULL, 'FREE sin uso y sin datos (pausa por inactividad)');
  RETURN 'borrada';
END $f$;
REVOKE ALL ON FUNCTION private._borrar_empresa_vacia(uuid) FROM PUBLIC, anon, authenticated;

-- La ronda diaria (cron 6:30 am RD).
CREATE OR REPLACE FUNCTION private._ronda_inactividad()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE r record; v_res text; v_ultima timestamptz; v_aviso timestamptz;
        v_avisos int := 0; v_pausas int := 0; v_borradas int := 0; v_log jsonb := '[]'::jsonb;
BEGIN
  -- Con plan PAGADO vigente ya no hay pausa (compró Básico o más).
  UPDATE public.tenant_actividad a SET pausada_at = NULL, aviso_at = NULL, ultima = now(), con_datos = false
   WHERE a.pausada_at IS NOT NULL AND private._tiene_plan_pagado(a.tenant_id);

  -- Empresas nuevas que todavía no abrieron nada: el reloj desde su alta.
  INSERT INTO public.tenant_actividad (tenant_id, ultima)
  SELECT t.id, t.created_at FROM public.tenants t
  ON CONFLICT (tenant_id) DO NOTHING;

  FOR r IN
    SELECT a.*, t.nombre FROM public.tenant_actividad a JOIN public.tenants t ON t.id = a.tenant_id
     WHERE public._plan_vigente(a.tenant_id) = 'FREE'
  LOOP
    -- Uso visto por el servidor, además de la marca de web/app: sesión que
    -- se renueva (la app abierta, aunque sea una versión vieja sin la marca)
    -- y la última venta. Ante la duda, cuenta como uso.
    SELECT GREATEST(r.ultima,
             (SELECT max(GREATEST(s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'))
                FROM auth.sessions s
               WHERE s.user_id IN (SELECT p.id FROM public.profiles p WHERE p.tenant_id = r.tenant_id
                                   UNION SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = r.tenant_id)),
             (SELECT max(f.created_at) FROM public.facturas f WHERE f.tenant_id = r.tenant_id))
      INTO v_ultima;
    v_aviso := r.aviso_at;
    IF v_ultima > r.ultima THEN
      IF v_aviso IS NOT NULL AND v_ultima > v_aviso THEN v_aviso := NULL; END IF;  -- volvió después del aviso
      UPDATE public.tenant_actividad SET ultima = v_ultima, aviso_at = v_aviso WHERE tenant_id = r.tenant_id;
    END IF;

    IF r.pausada_at IS NULL THEN
      -- 47 h y no 48: dos rondas seguidas no empiezan al mismo milisegundo.
      IF v_ultima < now() - interval '7 days' AND v_aviso IS NOT NULL AND v_aviso <= now() - interval '47 hours' THEN
        UPDATE public.tenant_actividad SET pausada_at = now(), pausas = pausas + 1 WHERE tenant_id = r.tenant_id;
        PERFORM private._avisar_admins(r.tenant_id, 'empresa_pausada', 'Tu empresa quedó en pausa',
          CASE WHEN r.reactivacion_gratis
            THEN 'Pasaron 7 días sin usar MotoFlow. Tus datos están guardados; para volver, elige el plan Básico en Planes.'
            ELSE 'Pasaron 7 días sin usar MotoFlow. Tus datos están guardados: entra y pulsa "Reactivar gratis" para seguir.' END);
        v_pausas := v_pausas + 1;
      ELSIF v_ultima < now() - interval '5 days' AND v_aviso IS NULL THEN
        UPDATE public.tenant_actividad SET aviso_at = now() WHERE tenant_id = r.tenant_id;
        PERFORM private._avisar_admins(r.tenant_id, 'aviso_inactividad', 'Tu empresa se pausará en 2 días',
          'Llevas 5 días sin usar MotoFlow. En el plan Gratis la empresa se pausa a los 7 días sin uso. Basta con entrar para que siga activa.');
        v_avisos := v_avisos + 1;
      END IF;
    -- (quien abre la empresa en pausa aunque no la reactive no se borra)
    ELSIF r.pausada_at < now() - interval '7 days' AND v_ultima < now() - interval '7 days' THEN
      v_res := NULL;
      IF NOT r.con_datos THEN
        BEGIN
          v_res := private._borrar_empresa_vacia(r.tenant_id);
          IF v_res = 'borrada' THEN
            v_borradas := v_borradas + 1;
            v_log := v_log || jsonb_build_object('borrada', r.nombre);
          ELSE
            -- tiene datos (o usuarios compartidos): se guarda y no se vuelve a mirar
            UPDATE public.tenant_actividad SET con_datos = true WHERE tenant_id = r.tenant_id;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_log := v_log || jsonb_build_object('error', r.nombre, 'detalle', SQLERRM);
        END;
      END IF;
      IF v_res IS DISTINCT FROM 'borrada' AND r.pausada_at < now() - interval '6 months' AND r.aviso_6_meses_at IS NULL THEN
        UPDATE public.tenant_actividad SET aviso_6_meses_at = now() WHERE tenant_id = r.tenant_id;
        INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
        SELECT p.tenant_id, p.id, 'empresa_6_meses_pausa', left('6 meses en pausa: ' || r.nombre, 120),
               'La empresa ' || r.nombre || ' (' || r.tenant_id || ') lleva 6 meses en pausa con datos. Decide si se borra.'
          FROM public.profiles p WHERE COALESCE(p.is_superadmin, false) AND p.tenant_id IS NOT NULL;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_avisos, 'pausas', v_pausas, 'borradas', v_borradas, 'log', v_log);
END $f$;
REVOKE ALL ON FUNCTION private._ronda_inactividad() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('inactividad-free') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inactividad-free');
END $$;
SELECT cron.schedule('inactividad-free', '30 10 * * *', $$SELECT private._ronda_inactividad()$$);

-- El freno del servidor: en pausa no se crean ventas, artículos ni almacenes.
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

  -- (19/11/2026) Fase 5: empresa FREE en pausa por inactividad. Primero la
  -- fila barata (casi nadie está en pausa); el plan solo si hace falta.
  IF EXISTS (SELECT 1 FROM public.tenant_actividad a WHERE a.tenant_id = NEW.tenant_id AND a.pausada_at IS NOT NULL)
     AND public._empresa_pausada(NEW.tenant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      HINT = 'empresa_pausada',
      MESSAGE = 'Tu empresa está en pausa por falta de uso. Reactívala desde la pantalla de inicio para seguir trabajando.';
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

-- check_suscripcion_activa: igual que antes + estado 'pausada'.
CREATE OR REPLACE FUNCTION public.check_suscripcion_activa(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid;
  _sub RECORD;
  _dias_restantes integer;
  _activa boolean;
  _pago_pendiente boolean;
  _estado text;
  _res jsonb;
  _act RECORD;
BEGIN
  _tenant := COALESCE(p_tenant_id, get_user_tenant());

  IF _tenant IS NULL THEN
    RETURN jsonb_build_object(
      'activa', false,
      'estado', 'sin_suscripcion',
      'dias_restantes', 0,
      'mensaje', 'No se pudo determinar el tenant'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pagos_suscripcion
    WHERE tenant_id = _tenant AND estado = 'pendiente'
  ) INTO _pago_pendiente;

  -- Tomar la suscripcion mas RECIENTEMENTE CREADA (no la de fecha_fin mas lejana).
  -- Asi un cambio de plan reciente siempre gana.
  SELECT s.*, p.nombre AS plan_nombre, p.descripcion AS plan_descripcion,
         p.precio AS plan_precio, p.limite_usuarios, p.limite_productos,
         p.limite_facturas, p.limite_almacenes,
         p.feat_cotizaciones_magna, p.feat_carta_ruta, p.feat_cobranzas,
         p.feat_reportes_avanzados, p.feat_ocr_facturas, p.feat_api_access
  INTO _sub
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant
  ORDER BY s.created_at DESC, s.fecha_fin DESC  -- <-- CAMBIO
  LIMIT 1;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'activa', _pago_pendiente,
      'estado', CASE WHEN _pago_pendiente THEN 'en_revision' ELSE 'sin_suscripcion' END,
      'pago_pendiente', _pago_pendiente,
      'plan', null,
      'dias_restantes', CASE WHEN _pago_pendiente THEN 30 ELSE 0 END,
      'mensaje', CASE
        WHEN _pago_pendiente THEN 'Su pago esta siendo verificado. Recibira confirmacion en las proximas 24 horas.'
        ELSE 'No tiene suscripcion activa. Por favor, contrate un plan.'
      END
    );
  END IF;

  _dias_restantes := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_sub.fecha_fin - now())) / 86400)::integer);
  _activa := _sub.fecha_fin > now()
             AND _sub.estado NOT IN ('cancelado', 'suspendido', 'vencido');  -- <-- 'vencido' es final

  -- Solo auto-vencer suscripciones cuya fecha_fin ya paso. Ya NO auto-reactivamos
  -- 'vencido' → 'activo' aunque la fecha_fin sea futura: si el admin la marco
  -- como vencida (por ejemplo al cambiar de plan), respetamos esa decision.
  IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
    UPDATE public.suscripciones SET estado = 'vencido', updated_at = now()
    WHERE id = _sub.id;
  END IF;

  _estado := CASE
    WHEN _pago_pendiente AND NOT _activa THEN 'en_revision'
    WHEN _activa THEN _sub.estado
    WHEN _sub.estado IN ('cancelado', 'suspendido') THEN _sub.estado
    ELSE 'vencido'
  END;

  _res := jsonb_build_object(
    'activa', _activa OR _pago_pendiente,
    'suscripcion_id', _sub.id,
    'estado', _estado,
    'pago_pendiente', _pago_pendiente,
    'plan', _sub.plan_nombre,
    'plan_id', _sub.plan_id,
    'plan_descripcion', _sub.plan_descripcion,
    'plan_precio', _sub.plan_precio,
    'fecha_inicio', _sub.fecha_inicio,
    'fecha_fin', _sub.fecha_fin,
    'dias_restantes', _dias_restantes,
    'auto_renovar', _sub.auto_renovar,
    'limites', jsonb_build_object(
      'usuarios', _sub.limite_usuarios,
      'productos', _sub.limite_productos,
      'facturas', _sub.limite_facturas,
      'almacenes', _sub.limite_almacenes
    ),
    'features', jsonb_build_object(
      'cotizaciones_magna', _sub.feat_cotizaciones_magna,
      'carta_ruta', _sub.feat_carta_ruta,
      'cobranzas', _sub.feat_cobranzas,
      'reportes_avanzados', _sub.feat_reportes_avanzados,
      'ocr_facturas', _sub.feat_ocr_facturas,
      'api_access', _sub.feat_api_access
    ),
    'mensaje', CASE
      WHEN _pago_pendiente AND NOT _activa THEN 'Su pago esta siendo verificado.'
      WHEN NOT _activa THEN 'Su suscripcion ha vencido. Renueve para continuar.'
      WHEN _dias_restantes <= 3 THEN 'Su suscripcion esta por vencer en ' || _dias_restantes || ' dia(s).'
      ELSE 'Suscripcion activa.'
    END
  );

  -- (19/11/2026) Fase 5: FREE en pausa por 7 días sin uso.
  IF _activa AND _sub.plan_nombre = 'FREE' AND NOT _pago_pendiente THEN
    SELECT * INTO _act FROM public.tenant_actividad WHERE tenant_id = _tenant;
    IF _act.pausada_at IS NOT NULL THEN
      _res := _res || jsonb_build_object(
        'activa', false,
        'estado', 'pausada',
        'pausada_at', _act.pausada_at,
        'puede_reactivar_gratis', NOT COALESCE(_act.reactivacion_gratis, false),
        'es_admin', public._es_admin_de(_tenant),
        'mensaje', CASE WHEN COALESCE(_act.reactivacion_gratis, false)
          THEN 'Tu empresa está en pausa por falta de uso. Para volver, elige el plan Básico: tus datos siguen guardados.'
          ELSE 'Tu empresa está en pausa por 7 días sin uso. Tus datos están guardados: reactívala gratis para seguir.' END);
    END IF;
  END IF;

  RETURN _res;
END;
$function$;

COMMIT;

SELECT public.registrar_migracion('inactividad_free.sql');
