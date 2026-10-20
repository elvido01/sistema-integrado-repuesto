-- =====================================================================
-- IA CEO · LA GUÍA DIARIA: PLANES Y TAREAS (20/10/2026)
-- ---------------------------------------------------------------------
-- El dueño: "está muy cargado… MORLA IA CEO tiene que ser una guía
-- diaria para el CEO, donde le proponga planes estratégicos divididos en
-- tareas diarias, para el crecimiento y fortalecimiento económico de la
-- empresa". Aprobado: planes semanales que aprueba él + 5 tareas diarias
-- con botón; también por Telegram a las 7 am y en el panel.
--
--   ia_planes        2-3 planes de 30-90 días con meta MEDIBLE: una métrica
--                    del catálogo (mora +30 días, monto vencido, ventas 30
--                    días, cuentas por cobrar, agotados, clientes sin
--                    respuesta…), su número de hoy y su meta. El dueño los
--                    aprueba o rechaza. El progreso lo mide el sistema.
--   ia_tareas        máximo 5 por día, salen de los planes activos; cada una
--                    con el dato que la justifica y un botón (abrir la
--                    pantalla, llamar, WhatsApp). Hecha / pospuesta /
--                    descartada le enseña al CEO qué sirve.
--   ia_metricas_dia  la foto diaria de esos números (de ia_ceo_contexto).
--
-- La función ia-ceo-guia (7:00 am RD) mide, propone planes los lunes (o si
-- no hay ninguno), arma las tareas y las manda por Telegram.
-- ia_ceo_contexto suma el bloque 'ventas' (ventas 30 días y cuentas por
-- cobrar) para poder medir planes de ventas y cobros.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ia_ceo_contexto(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_out   jsonb := '{}'::jsonb;
  v_user  uuid;
  v_ok    boolean := false;
  v_tmp   jsonb;
  v_tipo  text;
BEGIN
  SELECT jsonb_build_object('nombre', ce.nombre, 'tipo_negocio', coalesce(ce.tipo_negocio, 'repuestos')),
         coalesce(ce.tipo_negocio, 'repuestos')
    INTO v_tmp, v_tipo
    FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant_id;
  v_out := v_out || jsonb_build_object('empresa', v_tmp);

  -- Mirar como el dueño/admin de esa empresa (solo en esta transacción).
  FOR v_user IN
    SELECT p.id FROM public.profiles p
     WHERE p.tenant_id = p_tenant_id AND p.role IN ('owner', 'admin')
     ORDER BY (p.role = 'owner') DESC, coalesce(p.is_superadmin, false), p.created_at
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    IF public.get_user_tenant() = p_tenant_id THEN v_ok := true; EXIT; END IF;
  END LOOP;

  -- ── Grupo (Gestión Empresarial IA) ─────────────────────────────────
  IF v_ok THEN
    BEGIN
      v_tmp := to_jsonb(public.get_gestion_empresarial_ia(3));
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object(
        'posicion', v_tmp -> 'posicion', 'estado_actual', v_tmp -> 'estado_actual',
        'totales', v_tmp -> 'totales', 'margen_pct', v_tmp -> 'margen_pct',
        'ventas_mes', v_tmp -> 'ventas_mes', 'gasto_diario', v_tmp -> 'gasto_diario',
        'empresas_grupo', v_tmp -> 'empresas_grupo'));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Publicaciones: qué movió la pieza (Equipo IA) ──────────────────
  IF v_ok THEN
    BEGIN
      WITH e AS (SELECT * FROM public.efectividad_publicaciones(30))
      SELECT jsonb_build_object(
        'por_objetivo', (SELECT jsonb_agg(jsonb_build_object('objetivo', objetivo, 'piezas', n,
                           'alcance_prom', alc, 'interacciones_prom', inter, 'uds_vendidas_despues', uds))
                           FROM (SELECT objetivo, count(*) n, round(avg(alcance)) alc, round(avg(interacciones)) inter,
                                        sum(uds_despues) uds FROM e GROUP BY objetivo) o),
        'mejores', (SELECT jsonb_agg(jsonb_build_object('pieza', descripcion, 'publicado', publicado_at::date,
                      'alcance', alcance, 'uds_dia_antes', uds_dia_antes, 'uds_dia_despues', uds_dia_despues))
                      FROM (SELECT * FROM e ORDER BY (uds_dia_despues - uds_dia_antes) DESC, alcance DESC LIMIT 3) m),
        'sin_efecto', (SELECT count(*) FROM e WHERE dias_despues >= 7 AND uds_despues = 0))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('publicaciones', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('publicaciones', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Agotados que se venden y qué promocionar (Equipo IA) ───────────
  -- Solo empresas con Equipo IA (hoy Morla); las demás no lo traen.
  IF v_ok AND public.equipo_ia_permitido() THEN
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'estado', x->>'estado', 'existencia', (x->>'existencia')::numeric,
               'vendidos_30d', (x->>'vendidos_30d')::numeric, 'sugerido_pedir', (x->>'sugerido')::numeric,
               'ya_en_orden', x->'en_orden'->>'numero'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_agotados_que_se_venden(10))) x;
      v_out := v_out || jsonb_build_object('agotados', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('agotados', jsonb_build_object('error', SQLERRM));
    END;
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'existencia', (x->>'existencia')::numeric, 'razon', x->>'razon'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_candidatos_promocion(6))) x;
      v_out := v_out || jsonb_build_object('promocionar', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('promocionar', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Ventas y cuentas por cobrar (20/10/2026, para medir los planes) ─
  BEGIN
    SELECT jsonb_build_object(
      'ventas_30d', round(coalesce(sum(f.total) FILTER (WHERE f.fecha > now() - interval '30 days'), 0)),
      'ventas_30d_anterior', round(coalesce(sum(f.total) FILTER (WHERE f.fecha <= now() - interval '30 days'), 0)),
      'facturas_30d', count(*) FILTER (WHERE f.fecha > now() - interval '30 days'),
      'cxc_pendiente', (SELECT round(coalesce(sum(x.monto_pendiente), 0)) FROM public.facturas x
                         WHERE x.tenant_id = p_tenant_id AND x.estado = 'PENDIENTE'))
      INTO v_tmp
      FROM public.facturas f
     WHERE f.tenant_id = p_tenant_id AND f.estado IS DISTINCT FROM 'ANULADA'
       AND coalesce(f.es_saldo_inicial, false) = false
       AND f.fecha > now() - interval '60 days';
    v_out := v_out || jsonb_build_object('ventas', v_tmp);
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('ventas', jsonb_build_object('error', SQLERRM));
  END;

  -- ── CRM: embudo, listos, casos, perdidos, sin respuesta ────────────
  BEGIN
    SELECT jsonb_build_object(
      'embudo_30d', (SELECT jsonb_object_agg(etapa, n) FROM (
          SELECT coalesce(c.etapa, 'nuevo') etapa, count(*) n FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.last_user_message_at > now() - interval '30 days'
           GROUP BY 1) e),
      'listos_para_comprar', (SELECT jsonb_agg(jsonb_build_object('cliente', nombre, 'canal', platform,
            'quiere', producto, 'desde', desde)) FROM (
          SELECT coalesce(nullif(btrim(c.customer_name), ''), 'cliente') nombre, c.platform,
                 c.clasificacion ->> 'producto' producto, c.etapa_cambiada_at::date desde
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'listo_para_comprar'
             AND c.last_user_message_at > now() - interval '14 days'
           ORDER BY c.last_user_message_at DESC LIMIT 6) l),
      'casos_abiertos', (SELECT jsonb_agg(jsonb_build_object('motivo', k.motivo, 'quiere', k.quiere, 'falta', k.falta))
          FROM (SELECT * FROM public.crm_casos k WHERE k.tenant_id = p_tenant_id AND k.estado = 'abierto'
                 ORDER BY k.creado_at DESC LIMIT 6) k),
      'perdidos_por_no_tenerlo', (SELECT jsonb_agg(jsonb_build_object('pieza', pieza, 'veces', n)) FROM (
          SELECT coalesce(nullif(c.clasificacion ->> 'producto', ''), c.etapa_motivo) pieza, count(*) n
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'perdido'
             AND c.etapa_motivo ILIKE 'No lo tenemos%'
             AND c.etapa_cambiada_at > now() - interval '30 days'
           GROUP BY 1 ORDER BY 2 DESC LIMIT 8) p),
      'esperando_respuesta_mas_1h', (SELECT count(*) FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id
             AND c.last_user_message_at > now() - interval '3 days'
             AND c.last_user_message_at < now() - interval '1 hour'
             AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
             AND coalesce(c.etapa, '') NOT IN ('perdido', 'spam')))
      INTO v_tmp;
    v_out := v_out || jsonb_build_object('crm', v_tmp);
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('crm', jsonb_build_object('error', SQLERRM));
  END;

  -- ── Financiera: cartera y mora ─────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo') THEN
    BEGIN
      WITH venc AS (
        SELECT q.prestamo_id, count(*) cuotas,
               sum(greatest(q.monto_cuota - coalesce(q.capital_pagado, 0) - coalesce(q.interes_pagado, 0), 0)) monto,
               current_date - min(q.fecha_vencimiento) dias
          FROM public.prestamo_cuotas q
          JOIN public.prestamos p ON p.id = q.prestamo_id AND p.estado = 'activo'
         WHERE q.tenant_id = p_tenant_id AND q.estado IN ('pendiente', 'parcial')
           AND q.fecha_vencimiento < current_date
         GROUP BY q.prestamo_id)
      SELECT jsonb_build_object(
        'prestamos_activos', (SELECT count(*) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'capital_prestado_activo', (SELECT round(sum(monto_capital)) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'prestamos_con_atraso', (SELECT count(*) FROM venc),
        'monto_vencido', (SELECT round(sum(monto)) FROM venc),
        'atraso_mas_30_dias', (SELECT count(*) FROM venc WHERE dias > 30),
        'mas_atrasados', (SELECT jsonb_agg(jsonb_build_object('prestamo', p.numero, 'cliente', cl.nombre,
              'cuotas_vencidas', v.cuotas, 'monto', round(v.monto), 'dias', v.dias))
            FROM (SELECT * FROM venc ORDER BY monto DESC LIMIT 6) v
            JOIN public.prestamos p ON p.id = v.prestamo_id
            LEFT JOIN public.clientes cl ON cl.id = p.cliente_id))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('financiera', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('financiera', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Decisiones que siguen pendientes (no repetirlas) ───────────────
  SELECT jsonb_agg(jsonb_build_object('titulo', d.title, 'area', d.area, 'desde', d.created_at::date))
    INTO v_tmp
    FROM (SELECT * FROM public.ai_decisions WHERE tenant_id = p_tenant_id AND status = 'pending'
           ORDER BY created_at DESC LIMIT 10) d;
  v_out := v_out || jsonb_build_object('decisiones_pendientes', coalesce(v_tmp, '[]'::jsonb));

  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.ia_ceo_contexto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_ceo_contexto(uuid) TO service_role;



-- ---------------------------------------------------------------------
-- Las tablas de la guía
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_planes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  titulo        text NOT NULL,
  porque        text,
  metrica       text NOT NULL,          -- clave del catálogo (ver ia-ceo-guia)
  metrica_nombre text,
  direccion     text NOT NULL CHECK (direccion IN ('bajar', 'subir')),
  unidad        text,                   -- 'RD$', 'préstamos', 'clientes'…
  linea_base    numeric NOT NULL,
  meta          numeric NOT NULL,
  valor_actual  numeric,
  progreso      numeric NOT NULL DEFAULT 0,   -- 0 a 100
  fecha_inicio  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  fecha_fin     date NOT NULL,
  estado        text NOT NULL DEFAULT 'propuesto'
                CHECK (estado IN ('propuesto', 'activo', 'rechazado', 'cumplido', 'vencido')),
  nota_dueno    text,
  decidido_at   timestamptz,
  decidido_por  uuid,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_planes_tenant ON public.ia_planes (tenant_id, estado);

CREATE TABLE IF NOT EXISTS public.ia_tareas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  plan_id     uuid REFERENCES public.ia_planes(id) ON DELETE SET NULL,
  fecha       date NOT NULL,
  orden       int NOT NULL DEFAULT 1,
  titulo      text NOT NULL,
  porque      text,
  accion      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {tipo:'panel'|'llamar'|'whatsapp'|'ninguna', panel, telefono, texto}
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente', 'hecha', 'pospuesta', 'descartada')),
  marcada_at  timestamptz,
  marcada_por uuid,
  creado_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_tareas_tenant_fecha ON public.ia_tareas (tenant_id, fecha DESC);

-- La foto diaria de los números con los que se miden los planes.
CREATE TABLE IF NOT EXISTS public.ia_metricas_dia (
  tenant_id  uuid NOT NULL,
  fecha      date NOT NULL,
  valores    jsonb NOT NULL,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fecha)
);

-- Telegram: un aviso por empresa y por día.
CREATE TABLE IF NOT EXISTS public.ia_guia_avisos (
  tenant_id uuid NOT NULL,
  fecha     date NOT NULL,
  enviado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fecha)
);

ALTER TABLE public.ia_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_metricas_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_guia_avisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_planes_ver ON public.ia_planes;
CREATE POLICY ia_planes_ver ON public.ia_planes FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS ia_tareas_ver ON public.ia_tareas;
CREATE POLICY ia_tareas_ver ON public.ia_tareas FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS ia_metricas_ver ON public.ia_metricas_dia;
CREATE POLICY ia_metricas_ver ON public.ia_metricas_dia FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
REVOKE ALL ON public.ia_planes, public.ia_tareas, public.ia_metricas_dia, public.ia_guia_avisos FROM anon;
GRANT SELECT ON public.ia_planes, public.ia_tareas, public.ia_metricas_dia TO authenticated;

-- ---------------------------------------------------------------------
-- Para la pantalla: todo "Hoy" en una llamada, y los botones
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_guia_hoy()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH t AS (SELECT public.get_user_tenant() AS id),
       hoy AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d)
  SELECT jsonb_build_object(
    'fecha', (SELECT d FROM hoy),
    'metricas', (SELECT jsonb_build_object('fecha', m.fecha, 'valores', m.valores)
                   FROM public.ia_metricas_dia m WHERE m.tenant_id = (SELECT id FROM t)
                  ORDER BY m.fecha DESC LIMIT 1),
    'tareas', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.orden), '[]'::jsonb) FROM (
                 SELECT k.id, k.orden, k.titulo, k.porque, k.accion, k.estado, k.plan_id, p.titulo AS plan
                   FROM public.ia_tareas k LEFT JOIN public.ia_planes p ON p.id = k.plan_id
                  WHERE k.tenant_id = (SELECT id FROM t) AND k.fecha = (SELECT d FROM hoy)) x),
    'ayer', (SELECT jsonb_build_object('total', count(*), 'hechas', count(*) FILTER (WHERE estado = 'hecha'))
               FROM public.ia_tareas WHERE tenant_id = (SELECT id FROM t)
                AND fecha = (SELECT max(fecha) FROM public.ia_tareas
                              WHERE tenant_id = (SELECT id FROM t) AND fecha < (SELECT d FROM hoy))),
    'planes', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY
                 CASE p.estado WHEN 'propuesto' THEN 0 WHEN 'activo' THEN 1 ELSE 2 END, p.creado_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM public.ia_planes WHERE tenant_id = (SELECT id FROM t)
                        AND (estado IN ('propuesto', 'activo') OR actualizado_at > now() - interval '30 days')
                        ORDER BY creado_at DESC LIMIT 20) p)
  )
$$;

CREATE OR REPLACE FUNCTION public.ia_tarea_marcar(p_id uuid, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_estado NOT IN ('pendiente', 'hecha', 'pospuesta', 'descartada') THEN RAISE EXCEPTION 'Estado no válido'; END IF;
  UPDATE public.ia_tareas SET estado = p_estado,
         marcada_at = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE now() END,
         marcada_por = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE auth.uid() END
   WHERE id = p_id AND tenant_id = public.get_user_tenant();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.ia_plan_decidir(p_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.ia_planes
     SET estado = CASE WHEN p_aprobar THEN 'activo' ELSE 'rechazado' END,
         nota_dueno = nullif(btrim(coalesce(p_nota, '')), ''),
         decidido_at = now(), decidido_por = auth.uid(), actualizado_at = now(),
         fecha_inicio = CASE WHEN p_aprobar THEN (now() AT TIME ZONE 'America/Santo_Domingo')::date ELSE fecha_inicio END
   WHERE id = p_id AND tenant_id = public.get_user_tenant() AND estado = 'propuesto';
  RETURN FOUND;
END $$;

-- Pausar o cerrar un plan activo.
CREATE OR REPLACE FUNCTION public.ia_plan_cerrar(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.ia_planes SET estado = 'rechazado', nota_dueno = coalesce(nota_dueno, 'Cerrado por el dueño'),
         actualizado_at = now()
   WHERE id = p_id AND tenant_id = public.get_user_tenant() AND estado = 'activo';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.ia_guia_hoy(), public.ia_tarea_marcar(uuid, text),
  public.ia_plan_decidir(uuid, boolean, text), public.ia_plan_cerrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_guia_hoy(), public.ia_tarea_marcar(uuid, text),
  public.ia_plan_decidir(uuid, boolean, text), public.ia_plan_cerrar(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7:00 am RD (11:00 UTC): la guía del día. La llave anon solo abre la
-- puerta (como crm_clasificador_llamar); la función trabaja con la de
-- servicio y no repite lo que ya hizo hoy.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_ceo_guia_llamar()
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT net.http_post(
    url     := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/ia-ceo-guia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs'),
    body    := '{"modo":"auto"}'::jsonb,
    timeout_milliseconds := 5000)
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('ia-ceo-guia') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ia-ceo-guia');
  PERFORM cron.schedule('ia-ceo-guia', '0 11 * * *', 'SELECT public.ia_ceo_guia_llamar()');
END $$;

SELECT public.registrar_migracion('ia_ceo_guia.sql');

SELECT (SELECT schedule FROM cron.job WHERE jobname = 'ia-ceo-guia') AS cada_dia,
       to_regclass('public.ia_planes') IS NOT NULL AS planes,
       to_regclass('public.ia_tareas') IS NOT NULL AS tareas;
