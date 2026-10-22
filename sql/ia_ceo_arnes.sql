-- =====================================================================
-- IA CEO · EL ARNÉS (22/10/2026)
-- ---------------------------------------------------------------------
-- El dueño: "parece que no tiene memoria, no está confirmando las tareas
-- realizadas". Cada mañana el modelo escribía 5 tareas y nadie volvía a
-- mirar. Un CEO de verdad cierra lo decidido SOLO con evidencia.
--
-- 1) PRUEBA DE HECHO. Cada tarea nace con `verificacion` (qué dato la
--    cierra). ia_tareas_verificar() la revisa cada 3 minutos, SIN IA:
--      conversacion → le escribiste al cliente después de crear la tarea,
--                     o la cerraste (Compró / No compró);
--      decision     → la decisión de los agentes ya no está pendiente;
--      esperando    → cuenta en vivo los clientes sin respuesta (+1 h)
--                     y la cierra en 0.
--    Al cerrarla deja `evidencia` y `confirmada_por` = sistema.
-- 2) DECIDIR DESDE LA TAREA. ia_ceo_decidir: aprobar/rechazar la decisión
--    (RAMON CIERRA, la promo de GOMA) cierra la tarea. Antes nada cerraba
--    esas decisiones y volvían cada día.
-- 3) HERMES ES LA VOZ DEL IA CEO. Pestaña "IA CEO" en el chat: el mensaje
--    va a Hermes (su suscripción, no OpenAI) con el estado del CEO pegado.
--    Hermes lee y escribe con hermes.ia_ceo_* (marcar, nueva tarea,
--    decidir). Misma conversación de Hermes: no se parte su memoria.
-- MODO PRUEBA: solo Repuestos Morla (admin@repuestosmorla.com).
-- =====================================================================

-- ── 1. Columnas ──────────────────────────────────────────────────────
ALTER TABLE public.ia_tareas ADD COLUMN IF NOT EXISTS verificacion   jsonb;
ALTER TABLE public.ia_tareas ADD COLUMN IF NOT EXISTS evidencia      text;
ALTER TABLE public.ia_tareas ADD COLUMN IF NOT EXISTS confirmada_por text;
ALTER TABLE public.ia_tareas ADD COLUMN IF NOT EXISTS avance         jsonb;

-- ── 2. Clientes esperando respuesta (+1 h): la MISMA regla del contexto ──
CREATE OR REPLACE FUNCTION public.ia_ceo_esperando_respuesta(p_tenant uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.sales_conversations c
   WHERE c.tenant_id = p_tenant
     AND c.last_user_message_at > now() - interval '3 days'
     AND c.last_user_message_at < now() - interval '1 hour'
     AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
     AND coalesce(c.etapa, '') NOT IN ('perdido', 'spam', 'ganado')
     AND coalesce(c.status, '') NOT IN ('cerrado', 'cerrada')
$$;
REVOKE ALL ON FUNCTION public.ia_ceo_esperando_respuesta(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. El verificador ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ia_tareas_verificar(p_tenant uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t        record;
  v        jsonb;
  c0       public.sales_conversations;
  r        record;
  d        record;
  v_n      int := 0;
  v_estado text;
  v_evid   text;
  v_actual int;
  hora     text := 'DD/MM h:MI am';
BEGIN
  FOR t IN
    SELECT * FROM public.ia_tareas
     WHERE estado = 'pendiente' AND verificacion IS NOT NULL
       AND fecha >= (now() AT TIME ZONE 'America/Santo_Domingo')::date - 3
       AND (p_tenant IS NULL OR tenant_id = p_tenant)
  LOOP
    v := t.verificacion; v_estado := NULL; v_evid := NULL;

    IF v ->> 'tipo' = 'conversacion' AND v ? 'id' THEN
      SELECT * INTO c0 FROM public.sales_conversations
       WHERE tenant_id = t.tenant_id AND (id = (v ->> 'id')::uuid OR crm_whatsapp_conversation_id = (v ->> 'id')::uuid)
       LIMIT 1;
      IF c0.id IS NOT NULL THEN
        -- La misma persona puede tener varias conversaciones (el espejo las
        -- repite): para "le escribiste" cuenta cualquiera del mismo nombre y
        -- canal. El CIERRE solo el de la conversación de la tarea: el espejo
        -- a veces deja otro chat con el mismo nombre (22/10: una venta ganada
        -- de otro cliente quedó como "sander Arias") y no puede cerrarla.
        -- crm_cerrar_venta ya cierra las repetidas cuando la cierras tú.
        SELECT max(s.last_agent_message_at) AS ultima,
               bool_or(s.id = c0.id AND coalesce(s.status, '') IN ('cerrado', 'cerrada')) AS cerrada,
               max(s.etapa) FILTER (WHERE s.id = c0.id AND s.etapa IN ('ganado', 'perdido')) AS etapa
          INTO r
          FROM public.sales_conversations s
         WHERE s.tenant_id = t.tenant_id
           AND (s.id = c0.id OR (s.platform = c0.platform
                AND nullif(btrim(c0.customer_name), '') IS NOT NULL
                AND upper(btrim(s.customer_name)) = upper(btrim(c0.customer_name))
                AND s.last_message_at > now() - interval '60 days'));
        IF r.etapa IS NOT NULL THEN
          v_estado := 'hecha';
          v_evid := CASE r.etapa WHEN 'ganado' THEN 'Cerraste la venta: compró' ELSE 'Cerraste la conversación: no compró' END;
        ELSIF r.cerrada THEN
          v_estado := 'hecha'; v_evid := 'Cerraste la conversación';
        ELSIF r.ultima > t.creado_at THEN
          v_estado := 'hecha';
          v_evid := 'Le escribiste el ' || to_char(r.ultima AT TIME ZONE 'America/Santo_Domingo', hora);
        END IF;
      END IF;

    ELSIF v ->> 'tipo' = 'decision' AND v ? 'id' THEN
      SELECT status, decision_notes, approved_at INTO d FROM public.ai_decisions
       WHERE id = (v ->> 'id')::uuid AND tenant_id = t.tenant_id;
      IF d.status IN ('approved', 'executed') THEN
        v_estado := 'hecha'; v_evid := 'Decisión aprobada' || coalesce(': ' || nullif(d.decision_notes, ''), '');
      ELSIF d.status = 'rejected' THEN
        v_estado := 'hecha'; v_evid := 'Decisión rechazada' || coalesce(': ' || nullif(d.decision_notes, ''), '');
      ELSIF d.status = 'postponed' THEN
        v_estado := 'pospuesta'; v_evid := 'Decisión pospuesta';
      END IF;

    ELSIF v ->> 'tipo' = 'esperando' THEN
      v_actual := public.ia_ceo_esperando_respuesta(t.tenant_id);
      UPDATE public.ia_tareas
         SET avance = jsonb_build_object('inicial', coalesce((v ->> 'inicial')::int, v_actual),
                                         'actual', v_actual, 'medido_at', now())
       WHERE id = t.id AND (avance ->> 'actual')::int IS DISTINCT FROM v_actual;
      IF v_actual = 0 THEN
        v_estado := 'hecha'; v_evid := 'Ya no queda ningún cliente esperando respuesta';
      END IF;
    END IF;

    IF v_estado IS NOT NULL THEN
      UPDATE public.ia_tareas
         SET estado = v_estado, marcada_at = now(), confirmada_por = 'sistema', evidencia = v_evid
       WHERE id = t.id AND estado = 'pendiente';
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.ia_tareas_verificar(uuid) FROM PUBLIC, anon, authenticated;

-- El panel la pide al abrir (y en su sondeo), solo para su empresa.
CREATE OR REPLACE FUNCTION public.ia_ceo_verificar_ahora()
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ia_tareas_verificar(public.get_user_tenant())
$$;
REVOKE ALL ON FUNCTION public.ia_ceo_verificar_ahora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_ceo_verificar_ahora() TO authenticated;

-- ── 4. Marcar a mano: queda dicho QUIÉN la confirmó ─────────────────
CREATE OR REPLACE FUNCTION public.ia_tarea_marcar(p_id uuid, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_estado NOT IN ('pendiente', 'hecha', 'pospuesta', 'descartada') THEN RAISE EXCEPTION 'Estado no válido'; END IF;
  UPDATE public.ia_tareas SET estado = p_estado,
         marcada_at = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE now() END,
         marcada_por = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE auth.uid() END,
         confirmada_por = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE 'persona' END,
         evidencia = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE evidencia END
   WHERE id = p_id AND tenant_id = public.get_user_tenant();
  RETURN FOUND;
END $$;

-- ── 5. Decidir la decisión de los agentes desde la tarea ────────────
CREATE OR REPLACE FUNCTION public.ia_ceo_decidir(p_tarea_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  t        public.ia_tareas;
BEGIN
  SELECT * INTO t FROM public.ia_tareas WHERE id = p_tarea_id AND tenant_id = v_tenant;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF t.verificacion ->> 'tipo' IS DISTINCT FROM 'decision' THEN RAISE EXCEPTION 'Esta tarea no es una decisión'; END IF;
  UPDATE public.ai_decisions
     SET status = CASE WHEN p_aprobar THEN 'approved' ELSE 'rejected' END,
         approved_by = auth.uid(), approved_at = now(),
         decision_notes = nullif(btrim(coalesce(p_nota, '')), ''), updated_at = now()
   WHERE id = (t.verificacion ->> 'id')::uuid AND tenant_id = v_tenant;
  PERFORM public.ia_tareas_verificar(v_tenant);
  RETURN jsonb_build_object('ok', true, 'aprobada', p_aprobar);
END $$;
REVOKE ALL ON FUNCTION public.ia_ceo_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_ceo_decidir(uuid, boolean, text) TO authenticated;

-- ── 6. La guía del panel trae la evidencia y el avance ──────────────
CREATE OR REPLACE FUNCTION public.ia_guia_hoy()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT public.get_user_tenant() AS id),
       hoy AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d)
  SELECT jsonb_build_object(
    'fecha', (SELECT d FROM hoy),
    'metricas', (SELECT jsonb_build_object('fecha', m.fecha, 'valores', m.valores)
                   FROM public.ia_metricas_dia m WHERE m.tenant_id = (SELECT id FROM t)
                  ORDER BY m.fecha DESC LIMIT 1),
    'tareas', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.orden), '[]'::jsonb) FROM (
                 SELECT k.id, k.orden, k.titulo, k.porque, k.accion, k.estado, k.plan_id, p.titulo AS plan,
                        k.evidencia, k.confirmada_por, k.avance, k.marcada_at,
                        k.verificacion ->> 'tipo' AS verifica
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
$function$;

-- ── 7. El estado del CEO, compacto (lo que Hermes recibe) ───────────
CREATE OR REPLACE FUNCTION public.ia_ceo_resumen(p_tenant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d)
  SELECT jsonb_build_object(
    'fecha', (SELECT d FROM hoy),
    'planes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'titulo', p.titulo, 'estado', p.estado,
                 'mide', p.metrica_nombre, 'base', p.linea_base, 'hoy', p.valor_actual, 'meta', p.meta,
                 'progreso', p.progreso, 'hasta', p.fecha_fin) ORDER BY p.creado_at DESC), '[]'::jsonb)
                 FROM public.ia_planes p WHERE p.tenant_id = p_tenant AND p.estado IN ('propuesto', 'activo')),
    'tareas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'fecha', k.fecha, 'titulo', k.titulo,
                 'estado', k.estado, 'confirmada_por', k.confirmada_por, 'evidencia', k.evidencia,
                 'avance', k.avance, 'se_confirma_con', k.verificacion ->> 'tipo')
                 ORDER BY k.fecha DESC, k.orden), '[]'::jsonb)
                 FROM public.ia_tareas k
                WHERE k.tenant_id = p_tenant AND k.fecha >= (SELECT d FROM hoy) - 1),
    'semana', (SELECT jsonb_build_object('total', count(*), 'hechas', count(*) FILTER (WHERE estado = 'hecha'),
                 'por_sistema', count(*) FILTER (WHERE confirmada_por = 'sistema'),
                 'descartadas', count(*) FILTER (WHERE estado = 'descartada'))
                 FROM public.ia_tareas WHERE tenant_id = p_tenant AND fecha >= (SELECT d FROM hoy) - 7),
    'decisiones_pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.title,
                 'area', d.area, 'recomienda', left(d.recommendation, 200), 'desde', d.created_at::date)
                 ORDER BY d.created_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM public.ai_decisions WHERE tenant_id = p_tenant AND status = 'pending'
                        ORDER BY created_at DESC LIMIT 8) d),
    'metricas', (SELECT m.valores FROM public.ia_metricas_dia m WHERE m.tenant_id = p_tenant
                  ORDER BY m.fecha DESC LIMIT 1),
    'clientes_esperando_ahora', public.ia_ceo_esperando_respuesta(p_tenant))
$$;
REVOKE ALL ON FUNCTION public.ia_ceo_resumen(uuid) FROM PUBLIC, anon, authenticated;

-- ── 8. El canal: escribirle al IA CEO (= Hermes con el estado pegado) ──
CREATE OR REPLACE FUNCTION public.ia_ceo_escribir(p_texto text, p_pantalla jsonb DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_email  text;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  -- MODO PRUEBA (21/10/2026): solo Repuestos Morla con su admin.
  IF v_tenant IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid
     OR v_email IS DISTINCT FROM 'admin@repuestosmorla.com' THEN
    RAISE EXCEPTION 'El IA CEO está en modo prueba.';
  END IF;
  PERFORM public.ia_tareas_verificar(v_tenant);
  RETURN public.hermes_escribir(p_texto, coalesce(p_pantalla, '{}'::jsonb) || jsonb_build_object(
    'canal', 'ia_ceo',
    'como_contestar',
      'Te escriben desde la pestaña IA CEO. Contesta como el CEO de la empresa: con cifras de "ia_ceo", '
      || 'breve, y cerrando con UNA acción concreta. Si la persona dice que ya hizo una tarea, márcala con '
      || 'hermes.ia_ceo_marcar(id, ''hecha'', nota). Si pide aprobar o rechazar una decisión, usa '
      || 'hermes.ia_ceo_decidir(id, true/false, nota). Si acuerdan algo nuevo, hermes.ia_ceo_nueva_tarea. '
      || 'Una tarea con confirmada_por=sistema ya tiene prueba: no la vuelvas a pedir.',
    'ia_ceo', public.ia_ceo_resumen(v_tenant)));
END $$;
REVOKE ALL ON FUNCTION public.ia_ceo_escribir(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_ceo_escribir(text, jsonb) TO authenticated;

-- ── 9. Las manos de Hermes (rol hermes_readonly; escribe con READ WRITE) ──
CREATE OR REPLACE FUNCTION hermes.ia_ceo_estado()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.ia_tareas_verificar('00000000-0000-0000-0000-000000000001'::uuid);
  RETURN public.ia_ceo_resumen('00000000-0000-0000-0000-000000000001'::uuid);
END $$;

CREATE OR REPLACE FUNCTION hermes.ia_ceo_marcar(p_tarea_id uuid, p_estado text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_estado NOT IN ('pendiente', 'hecha', 'pospuesta', 'descartada') THEN RAISE EXCEPTION 'Estado no válido'; END IF;
  UPDATE public.ia_tareas SET estado = p_estado,
         marcada_at = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE now() END,
         confirmada_por = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE 'hermes' END,
         evidencia = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE nullif(btrim(coalesce(p_nota, '')), '') END
   WHERE id = p_tarea_id AND tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END $$;

CREATE OR REPLACE FUNCTION hermes.ia_ceo_nueva_tarea(p_titulo text, p_porque text DEFAULT NULL, p_plan_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_id  uuid;
BEGIN
  IF coalesce(btrim(p_titulo), '') = '' THEN RAISE EXCEPTION 'Falta el título'; END IF;
  IF p_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ia_planes WHERE id = p_plan_id AND tenant_id = v_tid) THEN
    RAISE EXCEPTION 'Plan no encontrado';
  END IF;
  INSERT INTO public.ia_tareas (tenant_id, plan_id, fecha, orden, titulo, porque, accion)
  VALUES (v_tid, p_plan_id, v_hoy,
          coalesce((SELECT max(orden) FROM public.ia_tareas WHERE tenant_id = v_tid AND fecha = v_hoy), 0) + 1,
          left(btrim(p_titulo), 140), left(coalesce(p_porque, 'Acordada con Hermes'), 300), '{"tipo":"ninguna"}'::jsonb)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION hermes.ia_ceo_decidir(p_decision_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.ai_decisions
     SET status = CASE WHEN p_aprobar THEN 'approved' ELSE 'rejected' END, approved_at = now(),
         decision_notes = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Decidido por el dueño con Hermes'),
         updated_at = now()
   WHERE id = p_decision_id AND tenant_id = '00000000-0000-0000-0000-000000000001'::uuid AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Decisión no encontrada o ya decidida'; END IF;
  PERFORM public.ia_tareas_verificar('00000000-0000-0000-0000-000000000001'::uuid);
  RETURN jsonb_build_object('ok', true, 'aprobada', p_aprobar);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['hermes.ia_ceo_estado()', 'hermes.ia_ceo_marcar(uuid, text, text)',
                           'hermes.ia_ceo_nueva_tarea(text, text, uuid)', 'hermes.ia_ceo_decidir(uuid, boolean, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO hermes_readonly', f);
  END LOOP;
END $$;

-- ── 10. El contexto del IA CEO da el id de cada decisión pendiente ─────
-- Se parte de la función que está EN PRODUCCIÓN (no de un archivo viejo).
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.ia_ceo_contexto(uuid)'::regprocedure);
  n := replace(d, $x$jsonb_build_object('titulo', d.title, 'area', d.area$x$,
                  $x$jsonb_build_object('id', d.id, 'titulo', d.title, 'area', d.area$x$);
  IF n = d AND position($x$'id', d.id, 'titulo', d.title$x$ IN d) = 0 THEN
    RAISE EXCEPTION 'ia_ceo_contexto cambió: no encontré el bloque de decisiones';
  END IF;
  IF n <> d THEN EXECUTE n; END IF;
END $$;

-- ── 11. Las tareas que ya existen (3 días) reciben su prueba de hecho ──
UPDATE public.ia_tareas t SET verificacion = jsonb_build_object('tipo', 'conversacion', 'id', t.accion -> 'conversacion' ->> 'id')
 WHERE t.verificacion IS NULL AND t.estado = 'pendiente' AND t.fecha >= current_date - 3
   AND t.accion -> 'conversacion' ->> 'id' IS NOT NULL;
UPDATE public.ia_tareas t SET verificacion = jsonb_build_object('tipo', 'esperando',
         'inicial', nullif(substring(t.titulo from '(\d+) clientes'), '')::int)
 WHERE t.verificacion IS NULL AND t.estado = 'pendiente' AND t.fecha >= current_date - 3
   AND t.titulo ~* 'clientes esperando respuesta';
UPDATE public.ia_tareas t SET verificacion = jsonb_build_object('tipo', 'decision', 'id', d.id)
  FROM public.ai_decisions d
 WHERE t.verificacion IS NULL AND t.estado = 'pendiente' AND t.fecha >= current_date - 3
   AND d.tenant_id = t.tenant_id AND d.status = 'pending'
   AND substring(d.title from '(?:de|para) (.+)$') IS NOT NULL
   AND upper(t.titulo) LIKE '%' || upper(substring(d.title from '(?:de|para) (.+)$')) || '%';

-- ── 12. Cada 3 minutos ───────────────────────────────────────────────
DO $$ BEGIN PERFORM cron.unschedule('ia-ceo-verificar'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('ia-ceo-verificar', '*/3 * * * *', 'SELECT public.ia_tareas_verificar()');

SELECT public.registrar_migracion('ia_ceo_arnes.sql');
