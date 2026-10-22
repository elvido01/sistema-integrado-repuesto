-- =====================================================================
-- NO DAR SEGUIMIENTO + REELS QUE NO SE REPITAN (22/10/2026)
-- ---------------------------------------------------------------------
-- 1) El dueño en la pestaña IA CEO: "Sander Arias es un empleado de
--    Repuestos Morla, no hay que darle seguimiento". Hermes lo entendió,
--    pero el IA CEO, los conteos de "clientes esperando", las fichas de la
--    extensión y el clasificador no lo sabían.
--    crm_no_seguir: empleados, proveedores, familia. Un trigger en
--    sales_conversations deja SUS conversaciones como interna (etapa
--    'spam' = escondida del embudo, status 'cerrado', motivo "No dar
--    seguimiento") cada vez que el espejo las toca, así que ninguno de
--    los que cuentan clientes las ve. Coincide por teléfono, por nombre
--    exacto o por nombre que empieza igual ("Sander Arias" cubre
--    "sander Arias Repuestos Morla").
-- 2) Reels: hermes.equipo_reel_para da los últimos 8 reels (plantilla,
--    escenario, titular, textos en pantalla) para que armarReel no repita
--    plantilla, escenario ni la fórmula del texto ("CLARIDAD TOTAL",
--    "CONFIANZA TOTAL"…).
-- =====================================================================

-- ── 1. La lista ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_no_seguir (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  nombre     text,
  telefono   text,
  motivo     text,
  creado_por text,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (nullif(btrim(coalesce(nombre, '')), '') IS NOT NULL OR length(regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) >= 7)
);
CREATE INDEX IF NOT EXISTS crm_no_seguir_tenant ON public.crm_no_seguir (tenant_id);
ALTER TABLE public.crm_no_seguir ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_no_seguir_leer ON public.crm_no_seguir;
CREATE POLICY crm_no_seguir_leer ON public.crm_no_seguir FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- ¿Esta conversación es de alguien de la lista? Devuelve el motivo.
CREATE OR REPLACE FUNCTION public.crm_no_seguir_motivo(p_tenant uuid, p_nombre text, p_telefono text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(btrim(n.motivo), ''), 'en la lista de no dar seguimiento')
    FROM public.crm_no_seguir n
   WHERE n.tenant_id = p_tenant
     AND ((nullif(btrim(n.nombre), '') IS NOT NULL AND nullif(btrim(p_nombre), '') IS NOT NULL
           AND (upper(btrim(p_nombre)) = upper(btrim(n.nombre))
                OR upper(btrim(p_nombre)) LIKE upper(btrim(n.nombre)) || ' %'))
       OR (length(regexp_replace(coalesce(n.telefono, ''), '\D', '', 'g')) >= 7
           AND right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10)
             = right(regexp_replace(n.telefono, '\D', '', 'g'), 10)))
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.crm_no_seguir_motivo(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── 2. El trigger: cada vez que el espejo toca la conversación ──────
CREATE OR REPLACE FUNCTION public.trg_crm_no_seguir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_motivo text;
BEGIN
  v_motivo := public.crm_no_seguir_motivo(NEW.tenant_id, NEW.customer_name, NEW.customer_phone);
  IF v_motivo IS NOT NULL THEN
    -- Una venta ganada se queda ganada (cuenta en las ventas desde el CRM):
    -- solo se cierra. El espejo a veces renombra un chat de otro cliente.
    IF coalesce(NEW.etapa, '') NOT IN ('spam', 'ganado') THEN
      NEW.etapa := 'spam';
      NEW.etapa_manual_at := now();
      NEW.etapa_motivo := left('No dar seguimiento: ' || v_motivo, 200);
    END IF;
    IF coalesce(NEW.status, '') NOT IN ('cerrado', 'cerrada') THEN NEW.status := 'cerrado'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_no_seguir ON public.sales_conversations;
CREATE TRIGGER crm_no_seguir BEFORE INSERT OR UPDATE OF customer_name, customer_phone, etapa, status,
  last_user_message_at ON public.sales_conversations
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_no_seguir();

-- Aplicar a lo que ya existe de una persona: conversaciones, casos abiertos
-- y tareas pendientes del IA CEO que la nombran.
CREATE OR REPLACE FUNCTION public.crm_no_seguir_aplicar(p_tenant uuid, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  n       public.crm_no_seguir;
  v_conv  int;
  v_casos int;
  v_tar   int;
BEGIN
  SELECT * INTO n FROM public.crm_no_seguir WHERE id = p_id AND tenant_id = p_tenant;
  IF n.id IS NULL THEN RAISE EXCEPTION 'No está en la lista'; END IF;
  -- Tocar la fila dispara el trigger.
  UPDATE public.sales_conversations c SET status = c.status
   WHERE c.tenant_id = p_tenant
     AND public.crm_no_seguir_motivo(p_tenant, c.customer_name, c.customer_phone) IS NOT NULL
     AND (coalesce(c.etapa, '') NOT IN ('spam', 'ganado') OR coalesce(c.status, '') NOT IN ('cerrado', 'cerrada'));
  GET DIAGNOSTICS v_conv = ROW_COUNT;
  UPDATE public.crm_casos k SET estado = 'resuelto', resuelto_at = now(), resuelto_como = 'a_mano'
    FROM public.sales_conversations c
   WHERE k.tenant_id = p_tenant AND k.estado = 'abierto' AND c.id = k.conversation_id
     AND public.crm_no_seguir_motivo(p_tenant, c.customer_name, c.customer_phone) IS NOT NULL;
  GET DIAGNOSTICS v_casos = ROW_COUNT;
  UPDATE public.ia_tareas t SET estado = 'descartada', marcada_at = now(), confirmada_por = 'sistema',
         evidencia = 'No dar seguimiento: ' || coalesce(nullif(btrim(n.motivo), ''), coalesce(n.nombre, n.telefono))
   WHERE t.tenant_id = p_tenant AND t.estado = 'pendiente'
     AND nullif(btrim(n.nombre), '') IS NOT NULL
     AND upper(t.titulo) LIKE '%' || upper(btrim(n.nombre)) || '%';
  GET DIAGNOSTICS v_tar = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'conversaciones', v_conv, 'casos', v_casos, 'tareas', v_tar);
END $$;
REVOKE ALL ON FUNCTION public.crm_no_seguir_aplicar(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Agregar / quitar: desde MotoFlow y desde Hermes ──────────────
CREATE OR REPLACE FUNCTION public.crm_no_seguir_agregar(p_nombre text, p_telefono text DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  INSERT INTO public.crm_no_seguir (tenant_id, nombre, telefono, motivo, creado_por)
  VALUES (v_tenant, nullif(btrim(p_nombre), ''), nullif(btrim(coalesce(p_telefono, '')), ''), nullif(btrim(coalesce(p_motivo, '')), ''),
          coalesce(auth.uid()::text, 'motoflow'))
  RETURNING id INTO v_id;
  RETURN public.crm_no_seguir_aplicar(v_tenant, v_id) || jsonb_build_object('id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.crm_no_seguir_agregar(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_no_seguir_agregar(text, text, text) TO authenticated;

-- Quitar de la lista NO reabre lo ya cerrado: vuelve a contar desde su
-- próximo mensaje (el clasificador lo pone en su etapa).
CREATE OR REPLACE FUNCTION public.crm_no_seguir_quitar(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH b AS (DELETE FROM public.crm_no_seguir WHERE id = p_id AND tenant_id = public.get_user_tenant() RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM b)
$$;
REVOKE ALL ON FUNCTION public.crm_no_seguir_quitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_no_seguir_quitar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION hermes.crm_no_seguir_agregar(p_nombre text, p_telefono text DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tid uuid := '00000000-0000-0000-0000-000000000001'::uuid; v_id uuid;
BEGIN
  INSERT INTO public.crm_no_seguir (tenant_id, nombre, telefono, motivo, creado_por)
  VALUES (v_tid, nullif(btrim(p_nombre), ''), nullif(btrim(coalesce(p_telefono, '')), ''), nullif(btrim(coalesce(p_motivo, '')), ''), 'hermes')
  RETURNING id INTO v_id;
  RETURN public.crm_no_seguir_aplicar(v_tid, v_id) || jsonb_build_object('id', v_id);
END $$;
CREATE OR REPLACE FUNCTION hermes.crm_no_seguir_lista()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'telefono', telefono, 'motivo', motivo)
           ORDER BY creado_at DESC), '[]'::jsonb)
    FROM public.crm_no_seguir WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
$$;
CREATE OR REPLACE FUNCTION hermes.crm_no_seguir_quitar(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH b AS (DELETE FROM public.crm_no_seguir WHERE id = p_id AND tenant_id = '00000000-0000-0000-0000-000000000001'::uuid RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM b)
$$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['hermes.crm_no_seguir_agregar(text, text, text)', 'hermes.crm_no_seguir_lista()',
                           'hermes.crm_no_seguir_quitar(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO hermes_readonly', f);
  END LOOP;
END $$;

-- ── 4. El primero: lo que el dueño le dijo a Hermes el 22/10 ────────
DO $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crm_no_seguir WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
                   AND upper(nombre) = 'SANDER ARIAS') THEN
    INSERT INTO public.crm_no_seguir (tenant_id, nombre, motivo, creado_por)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Sander Arias', 'empleado de Repuestos Morla', 'dueño vía Hermes 22/10')
    RETURNING id INTO v_id;
    PERFORM public.crm_no_seguir_aplicar('00000000-0000-0000-0000-000000000001', v_id);
  END IF;
END $$;

-- ── 5. Reels: los últimos 8, para no repetir ────────────────────────
-- Se parte de la función que está EN PRODUCCIÓN (no de un archivo viejo).
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('hermes.equipo_reel_para(uuid, uuid)'::regprocedure);
  IF position('''recientes''' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $x$'voces_recientes', COALESCE(v_voces, '[]'::json),$x$,
    $x$'recientes', (SELECT json_agg(json_build_object(
        'plantilla', h.guion ->> 'plantilla', 'escenario', h.guion ->> 'escenario',
        'titular', h.guion ->> 'titular',
        'textos', (SELECT json_agg(t ->> 'texto') FROM jsonb_array_elements(coalesce(h.guion -> 'tomas', '[]'::jsonb)) t))
        ORDER BY h.created_at DESC)
      FROM (SELECT * FROM public.equipo_reels_hechos WHERE tenant_id = v_m.tenant_id
             ORDER BY created_at DESC LIMIT 8) h),
    'voces_recientes', COALESCE(v_voces, '[]'::json),$x$);
  IF n = d THEN RAISE EXCEPTION 'equipo_reel_para cambió: no encontré voces_recientes'; END IF;
  EXECUTE n;
END $$;

SELECT public.registrar_migracion('crm_no_seguir_y_reels.sql');
