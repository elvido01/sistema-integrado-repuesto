-- ============================================================
-- PROMESAS A CLIENTES ("Le prometí…") — 23/11/2026
-- ============================================================
-- El dueño le prometió a un cliente por WhatsApp (desde el celular)
-- "el lunes le pregunto a mi suplidor y te respondo" y se le olvidó. Los
-- casos del CRM se cierran cuando la tienda contesta, y el espejo no ve lo que
-- se escribe desde el celular. Versión manual de 10 segundos: desde la app o
-- la web se anota qué se prometió, a quién y para cuándo; ese día a las 8 am
-- avisa en la campanita y, si se vence sin marcarla hecha, sigue avisando.
-- "Preguntar al suplidor" crea además una solicitud de cliente (la lista de
-- piezas pedidas que ya ven Compras y Seguimientos).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promesas_clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  que             text NOT NULL CHECK (length(btrim(que)) BETWEEN 2 AND 500),
  cliente_nombre  text,
  telefono        text,
  fecha           date NOT NULL,
  para_suplidor   boolean NOT NULL DEFAULT false,
  solicitud_id    uuid REFERENCES public.solicitudes_clientes(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha', 'cancelada')),
  origen          text NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'app')),
  creado_por      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  cerrada_por     uuid,
  cerrada_at      timestamptz
);
CREATE INDEX IF NOT EXISTS promesas_clientes_pendientes ON public.promesas_clientes (tenant_id, fecha) WHERE estado = 'pendiente';

ALTER TABLE public.promesas_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promesas_ver ON public.promesas_clientes;
CREATE POLICY promesas_ver ON public.promesas_clientes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());
-- Se escribe solo por las funciones de abajo.
REVOKE INSERT, UPDATE, DELETE ON public.promesas_clientes FROM authenticated, anon;
GRANT SELECT ON public.promesas_clientes TO authenticated;

-- Crear. Devuelve la fila creada.
CREATE OR REPLACE FUNCTION public.promesa_crear(
  p_que text, p_fecha date, p_cliente_nombre text DEFAULT NULL, p_telefono text DEFAULT NULL,
  p_para_suplidor boolean DEFAULT false, p_origen text DEFAULT 'web')
RETURNS public.promesas_clientes
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_tel text := NULLIF(regexp_replace(COALESCE(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  v_nom text := NULLIF(btrim(COALESCE(p_cliente_nombre, '')), '');
  v_sol uuid;
  r public.promesas_clientes;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin sesión o sin empresa activa'; END IF;
  IF length(btrim(COALESCE(p_que, ''))) < 2 THEN RAISE EXCEPTION 'Escribe qué le prometiste'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Escoge para cuándo'; END IF;
  IF p_fecha < (now() AT TIME ZONE 'America/Santo_Domingo')::date - 1 THEN RAISE EXCEPTION 'La fecha ya pasó'; END IF;
  IF p_fecha > (now() AT TIME ZONE 'America/Santo_Domingo')::date + 180 THEN RAISE EXCEPTION 'Máximo 6 meses'; END IF;

  IF p_para_suplidor THEN
    INSERT INTO public.solicitudes_clientes (tenant_id, cliente_nombre, cliente_telefono, phone_normalized,
                                             producto_texto, notas, estado, creado_por, created_from, source_channel)
    VALUES (v_t, v_nom, v_tel, NULLIF(regexp_replace(COALESCE(v_tel, ''), '\D', '', 'g'), ''),
            left(btrim(p_que), 300), 'Promesa: preguntar al suplidor', 'abierta', auth.uid(), 'promesa',
            CASE WHEN p_origen = 'app' THEN 'app' ELSE 'web' END)
    RETURNING id INTO v_sol;
  END IF;

  INSERT INTO public.promesas_clientes (tenant_id, que, cliente_nombre, telefono, fecha, para_suplidor, solicitud_id, origen)
  VALUES (v_t, btrim(p_que), v_nom, v_tel, p_fecha, COALESCE(p_para_suplidor, false), v_sol,
          CASE WHEN p_origen = 'app' THEN 'app' ELSE 'web' END)
  RETURNING * INTO r;
  RETURN r;
END;
$fn$;

-- Marcar hecha / cancelada (o reabrir con 'pendiente').
CREATE OR REPLACE FUNCTION public.promesa_marcar(p_id uuid, p_estado text)
RETURNS public.promesas_clientes
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE r public.promesas_clientes;
BEGIN
  IF p_estado NOT IN ('pendiente', 'hecha', 'cancelada') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  UPDATE public.promesas_clientes
     SET estado = p_estado,
         cerrada_por = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE auth.uid() END,
         cerrada_at  = CASE WHEN p_estado = 'pendiente' THEN NULL ELSE now() END
   WHERE id = p_id AND tenant_id = public.get_user_tenant()
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promesa no encontrada'; END IF;
  RETURN r;
END;
$fn$;

-- Cambiar la fecha (posponer).
CREATE OR REPLACE FUNCTION public.promesa_posponer(p_id uuid, p_fecha date)
RETURNS public.promesas_clientes
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE r public.promesas_clientes;
BEGIN
  IF p_fecha IS NULL OR p_fecha < (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION 'Escoge hoy o un día futuro';
  END IF;
  UPDATE public.promesas_clientes SET fecha = p_fecha
   WHERE id = p_id AND tenant_id = public.get_user_tenant() AND estado = 'pendiente'
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promesa no encontrada o ya cerrada'; END IF;
  RETURN r;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.promesa_crear(text, date, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promesa_marcar(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promesa_posponer(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promesa_crear(text, date, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promesa_marcar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promesa_posponer(uuid, date) TO authenticated;

-- Aviso diario: a quien la anotó y a owner/admin. Una notificación por
-- promesa y día (si se vence, vuelve a avisar al día siguiente).
CREATE OR REPLACE FUNCTION private.promesas_avisar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date; v_n integer;
BEGIN
  WITH p AS (
    SELECT pc.*, (pc.fecha < v_hoy) AS vencida
      FROM public.promesas_clientes pc
     WHERE pc.estado = 'pendiente' AND pc.fecha <= v_hoy
  ), dest AS (
    SELECT p.id, p.tenant_id, u.user_id,
           left(CASE WHEN p.vencida THEN 'Promesa vencida: ' ELSE 'Hoy le prometiste: ' END || p.que, 120) AS titulo,
           concat_ws(' · ', COALESCE(p.cliente_nombre, p.telefono, 'cliente'),
                     CASE WHEN p.cliente_nombre IS NOT NULL THEN p.telefono END,
                     CASE WHEN p.vencida THEN 'era para el ' || to_char(p.fecha, 'DD/MM') END,
                     CASE WHEN p.para_suplidor THEN 'preguntar al suplidor' END) AS mensaje
      FROM p
      JOIN LATERAL (
        SELECT p.creado_por AS user_id
        UNION SELECT pr.id FROM public.profiles pr WHERE pr.tenant_id = p.tenant_id AND pr.role IN ('owner', 'admin')
        UNION SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p.tenant_id AND ue.rol IN ('owner', 'admin')
      ) u ON true
  )
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT d.tenant_id, d.user_id, 'promesa', d.titulo, d.mensaje
    FROM dest d
   WHERE NOT EXISTS (SELECT 1 FROM public.notificaciones n
                      WHERE n.user_id = d.user_id AND n.tenant_id = d.tenant_id AND n.tipo = 'promesa'
                        AND n.titulo = d.titulo AND n.created_at > now() - interval '20 hours');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION private.promesas_avisar() FROM PUBLIC, anon, authenticated;

-- 8:00 am RD = 12:00 UTC, todos los días.
DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'promesas-avisos';
  PERFORM cron.schedule('promesas-avisos', '0 12 * * *', 'SELECT private.promesas_avisar()');
END $cron$;

NOTIFY pgrst, 'reload schema';

-- PRUEBA (se deshace): como un usuario de Morla.
DO $prueba$
DECLARE v_user uuid; r public.promesas_clientes; v_n int; v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue
                 WHERE ue.tenant_id = '00000000-0000-0000-0000-000000000001' ORDER BY ue.user_id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = '00000000-0000-0000-0000-000000000001';
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin usuario de Morla para probar'; END IF;

  r := public.promesa_crear('PRUEBA plásticos rojos Tauro CRX250', v_hoy, 'Cliente prueba', '+509 41 60 9925', true, 'app');
  IF r.solicitud_id IS NULL THEN RAISE EXCEPTION 'No creó la solicitud al suplidor'; END IF;
  IF r.telefono <> '+50941609925' THEN RAISE EXCEPTION 'Teléfono: %', r.telefono; END IF;

  v_n := private.promesas_avisar();
  IF NOT EXISTS (SELECT 1 FROM public.notificaciones WHERE tipo = 'promesa' AND user_id = v_user
                  AND titulo LIKE 'Hoy le prometiste: PRUEBA%') THEN
    RAISE EXCEPTION 'No avisó a quien la anotó';
  END IF;
  IF private.promesas_avisar() <> 0 THEN RAISE EXCEPTION 'Avisó dos veces el mismo día'; END IF;

  r := public.promesa_marcar(r.id, 'hecha');
  IF r.estado <> 'hecha' OR r.cerrada_at IS NULL THEN RAISE EXCEPTION 'No marcó hecha'; END IF;

  BEGIN
    PERFORM public.promesa_crear('x', v_hoy);
    RAISE EXCEPTION 'Aceptó un texto de 1 letra';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Aceptó un texto de 1 letra' THEN RAISE; END IF;
  END;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('promesas_clientes.sql');
