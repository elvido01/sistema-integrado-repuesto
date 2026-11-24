-- ============================================================
-- INVENTARIO: SIN MOVIMIENTO + LISTAS PARA CONFIRMAR EN EL CELULAR (23/11/2026)
-- ============================================================
-- Pedido del dueño: en Inventario Inteligente filtrar la mercancía por tiempo
-- sin movimiento (60-90 días, etc.), mandar la lista desde la PC a un usuario
-- de la misma empresa, que en la app confirma la existencia y la ubicación
-- ("batería 4 Hosuya: 5, ubicación blanco"). Las diferencias NO tocan el
-- inventario solas: vuelven a la PC y quien la mandó aplica el ajuste
-- (crear_entrada/salida_inventario tipo AJUSTE, el mismo camino del
-- Inventario Físico) y las ubicaciones corregidas.
--
-- "Movimiento" = compra o venta (ENTRADA / SALIDA). Los AJUSTE no cuentan: un
-- conteo no es que la pieza se haya movido. Sin compras ni ventas, cuenta
-- desde su primer registro.
-- ============================================================

-- ── 2. Listas de verificación ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inv_verificaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo       text NOT NULL,
  asignado_a   uuid NOT NULL,
  creado_por   uuid NOT NULL DEFAULT auth.uid(),
  estado       text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada', 'aplicada', 'cancelada')),
  nota         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  enviada_at   timestamptz,
  aplicada_at  timestamptz,
  aplicada_por uuid
);
CREATE INDEX IF NOT EXISTS inv_verificaciones_asignado ON public.inv_verificaciones (asignado_a, estado);
CREATE INDEX IF NOT EXISTS inv_verificaciones_tenant ON public.inv_verificaciones (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inv_verificacion_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verificacion_id     uuid NOT NULL REFERENCES public.inv_verificaciones(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL,
  producto_id         uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  codigo              text,
  descripcion         text,
  existencia_sistema  numeric NOT NULL,            -- al mandar la lista
  ubicacion_sistema   text,
  existencia_al_contar numeric,                    -- la del sistema cuando la contaron (base del ajuste)
  existencia_contada  numeric CHECK (existencia_contada IS NULL OR existencia_contada >= 0),
  ubicacion_confirmada text,
  resultado           text NOT NULL DEFAULT 'pendiente' CHECK (resultado IN ('pendiente', 'ok', 'diferencia', 'no_esta')),
  nota                text,
  contado_por         uuid,
  contado_at          timestamptz,
  UNIQUE (verificacion_id, producto_id)
);
CREATE INDEX IF NOT EXISTS inv_verif_items_lista ON public.inv_verificacion_items (verificacion_id);
CREATE INDEX IF NOT EXISTS inv_verif_items_producto ON public.inv_verificacion_items (producto_id);

ALTER TABLE public.inv_verificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_verificacion_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_verif_ver ON public.inv_verificaciones;
CREATE POLICY inv_verif_ver ON public.inv_verificaciones FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());
DROP POLICY IF EXISTS inv_verif_items_ver ON public.inv_verificacion_items;
CREATE POLICY inv_verif_items_ver ON public.inv_verificacion_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());
REVOKE INSERT, UPDATE, DELETE ON public.inv_verificaciones, public.inv_verificacion_items FROM authenticated, anon;
GRANT SELECT ON public.inv_verificaciones, public.inv_verificacion_items TO authenticated;

-- ── 1. Mercancía sin movimiento ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_inventario_sin_movimiento(
  p_dias_min integer DEFAULT 60, p_dias_max integer DEFAULT NULL, p_search text DEFAULT '')
RETURNS TABLE(id uuid, codigo text, descripcion text, referencia text, ubicacion text, marca text,
              existencia numeric, costo numeric, valor numeric, ultimo_movimiento date, dias integer,
              en_verificacion boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH t AS (SELECT public.get_user_tenant() AS id),
  mov AS (
    SELECT m.producto_id,
           sum(m.cantidad) AS stock,
           COALESCE(max(m.fecha) FILTER (WHERE m.tipo <> 'AJUSTE'), min(m.fecha)) AS ultimo
      FROM public.inventario_movimientos m, t
     WHERE m.tenant_id = t.id
     GROUP BY m.producto_id
  )
  SELECT p.id, p.codigo, p.descripcion, p.referencia, p.ubicacion, ma.nombre,
         mov.stock, COALESCE(p.costo, 0), round(mov.stock * COALESCE(p.costo, 0), 2),
         (mov.ultimo AT TIME ZONE 'America/Santo_Domingo')::date,
         ((now() AT TIME ZONE 'America/Santo_Domingo')::date - (mov.ultimo AT TIME ZONE 'America/Santo_Domingo')::date)::int,
         EXISTS (SELECT 1 FROM public.inv_verificacion_items i JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
                  WHERE i.producto_id = p.id AND v.estado IN ('pendiente', 'enviada'))
    FROM public.productos p
    JOIN t ON p.tenant_id = t.id
    JOIN mov ON mov.producto_id = p.id
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id
   WHERE COALESCE(p.activo, true) AND mov.stock > 0
     AND ((now() AT TIME ZONE 'America/Santo_Domingo')::date - (mov.ultimo AT TIME ZONE 'America/Santo_Domingo')::date) >= COALESCE(p_dias_min, 0)
     AND (p_dias_max IS NULL OR ((now() AT TIME ZONE 'America/Santo_Domingo')::date - (mov.ultimo AT TIME ZONE 'America/Santo_Domingo')::date) <= p_dias_max)
     AND (COALESCE(btrim(p_search), '') = ''
          OR public._sin_tildes(concat_ws(' ', p.codigo, p.referencia, p.descripcion, p.ubicacion, ma.nombre))
             LIKE '%' || public._sin_tildes(btrim(p_search)) || '%')
   ORDER BY round(mov.stock * COALESCE(p.costo, 0), 2) DESC, p.codigo
   LIMIT 2000;
$fn$;

-- ¿El usuario es de esta empresa?
CREATE OR REPLACE FUNCTION private.inv_es_de_empresa(p_user uuid, p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = p_user AND ue.tenant_id = p_tenant)
      OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user AND pr.tenant_id = p_tenant);
$fn$;
REVOKE EXECUTE ON FUNCTION private.inv_es_de_empresa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Crear la lista y avisar al que la va a confirmar.
CREATE OR REPLACE FUNCTION public.inv_verif_crear(p_asignado uuid, p_titulo text, p_productos uuid[], p_nota text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_t uuid := public.get_user_tenant(); v_id uuid; v_n int;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin sesión o sin empresa activa'; END IF;
  IF p_asignado IS NULL OR NOT private.inv_es_de_empresa(p_asignado, v_t) THEN
    RAISE EXCEPTION 'Ese usuario no es de esta empresa';
  END IF;
  IF COALESCE(array_length(p_productos, 1), 0) = 0 THEN RAISE EXCEPTION 'La lista está vacía'; END IF;
  IF array_length(p_productos, 1) > 500 THEN RAISE EXCEPTION 'Máximo 500 piezas por lista'; END IF;

  INSERT INTO public.inv_verificaciones (tenant_id, titulo, asignado_a, nota)
  VALUES (v_t, COALESCE(NULLIF(btrim(p_titulo), ''), 'Confirmar existencia y ubicación'), p_asignado, NULLIF(btrim(p_nota), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.inv_verificacion_items (verificacion_id, tenant_id, producto_id, codigo, descripcion, existencia_sistema, ubicacion_sistema)
  SELECT v_id, v_t, p.id, p.codigo, p.descripcion, public.get_stock_actual(p.id), p.ubicacion
    FROM public.productos p
   WHERE p.id = ANY (p_productos) AND p.tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Ninguna pieza es de esta empresa'; END IF;

  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  VALUES (v_t, p_asignado, 'inv_verificacion',
          left('Te mandaron a confirmar ' || v_n || ' pieza' || CASE WHEN v_n = 1 THEN '' ELSE 's' END, 120),
          'Ábrela en la app de MotoFlow (Inicio → Por confirmar): existencia y ubicación.');
  RETURN v_id;
END;
$fn$;

-- Contar una pieza (el asignado; también un admin de la empresa).
CREATE OR REPLACE FUNCTION public.inv_verif_contar(p_item uuid, p_cantidad numeric, p_ubicacion text DEFAULT NULL, p_no_esta boolean DEFAULT false, p_nota text DEFAULT NULL)
RETURNS public.inv_verificacion_items
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE r public.inv_verificacion_items; v public.inv_verificaciones; v_actual numeric; v_ub text;
BEGIN
  SELECT * INTO r FROM public.inv_verificacion_items WHERE id = p_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pieza no encontrada'; END IF;
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = r.verificacion_id;
  IF v.tenant_id IS DISTINCT FROM public.get_user_tenant() THEN RAISE EXCEPTION 'Pieza no encontrada'; END IF;
  IF v.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta lista ya se envió'; END IF;
  IF auth.uid() IS DISTINCT FROM v.asignado_a AND NOT EXISTS (
       SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid() AND ue.tenant_id = v.tenant_id AND ue.rol IN ('owner', 'admin'))
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.tenant_id = v.tenant_id AND pr.role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Esta lista se la mandaron a otra persona';
  END IF;
  IF NOT p_no_esta AND (p_cantidad IS NULL OR p_cantidad < 0) THEN RAISE EXCEPTION 'Escribe cuántas hay'; END IF;

  v_actual := public.get_stock_actual(r.producto_id);
  v_ub := NULLIF(btrim(COALESCE(p_ubicacion, '')), '');
  UPDATE public.inv_verificacion_items SET
    existencia_al_contar = v_actual,
    existencia_contada   = CASE WHEN p_no_esta THEN 0 ELSE p_cantidad END,
    ubicacion_confirmada = CASE WHEN p_no_esta THEN NULL ELSE COALESCE(v_ub, ubicacion_sistema) END,
    resultado = CASE WHEN p_no_esta THEN 'no_esta'
                     WHEN p_cantidad = v_actual AND COALESCE(upper(v_ub), upper(ubicacion_sistema), '') = COALESCE(upper(ubicacion_sistema), '') THEN 'ok'
                     ELSE 'diferencia' END,
    nota = NULLIF(btrim(COALESCE(p_nota, '')), ''),
    contado_por = auth.uid(), contado_at = now()
  WHERE id = p_item
  RETURNING * INTO r;
  RETURN r;
END;
$fn$;

-- Terminar: vuelve a quien la mandó.
CREATE OR REPLACE FUNCTION public.inv_verif_enviar(p_id uuid)
RETURNS public.inv_verificaciones
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v public.inv_verificaciones; v_falta int; v_dif int;
BEGIN
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = p_id AND tenant_id = public.get_user_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada'; END IF;
  IF v.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta lista ya se envió'; END IF;
  SELECT count(*) FILTER (WHERE resultado = 'pendiente'), count(*) FILTER (WHERE resultado IN ('diferencia', 'no_esta'))
    INTO v_falta, v_dif FROM public.inv_verificacion_items WHERE verificacion_id = p_id;
  IF v_falta > 0 THEN RAISE EXCEPTION 'Faltan % pieza% por confirmar', v_falta, CASE WHEN v_falta = 1 THEN '' ELSE 's' END; END IF;

  UPDATE public.inv_verificaciones SET estado = 'enviada', enviada_at = now() WHERE id = p_id RETURNING * INTO v;
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  VALUES (v.tenant_id, v.creado_por, 'inv_verificacion',
          left('Lista confirmada: ' || v.titulo, 120),
          CASE WHEN v_dif = 0 THEN 'Todo cuadró.' ELSE v_dif || ' con diferencia. Revísala en Inventario Inteligente y aplica el ajuste.' END);
  RETURN v;
END;
$fn$;

-- Después de que la PC aplicó los ajustes de existencia: corrige las
-- ubicaciones confirmadas y cierra la lista.
CREATE OR REPLACE FUNCTION public.inv_verif_aplicar_ubicaciones_y_cerrar(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v public.inv_verificaciones; v_n int;
BEGIN
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = p_id AND tenant_id = public.get_user_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada'; END IF;
  IF v.estado <> 'enviada' THEN RAISE EXCEPTION 'La lista no está lista para aplicar (está %)', v.estado; END IF;

  UPDATE public.productos p SET ubicacion = i.ubicacion_confirmada
    FROM public.inv_verificacion_items i
   WHERE i.verificacion_id = p_id AND p.id = i.producto_id AND p.tenant_id = v.tenant_id
     AND i.resultado <> 'no_esta' AND i.ubicacion_confirmada IS NOT NULL
     AND COALESCE(upper(p.ubicacion), '') <> upper(i.ubicacion_confirmada);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.inv_verificaciones SET estado = 'aplicada', aplicada_at = now(), aplicada_por = auth.uid() WHERE id = p_id;
  RETURN v_n;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.inv_verif_cancelar(p_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.inv_verificaciones SET estado = 'cancelada'
   WHERE id = p_id AND tenant_id = public.get_user_tenant() AND estado IN ('pendiente', 'enviada');
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada o ya cerrada'; END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_crear(uuid, text, uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_contar(uuid, numeric, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_enviar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_aplicar_ubicaciones_y_cerrar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_crear(uuid, text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_contar(uuid, numeric, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_enviar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_aplicar_ubicaciones_y_cerrar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_cancelar(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA (se deshace): un usuario de Morla manda 2 piezas a sí mismo, las cuenta y la envía.
DO $prueba$
DECLARE v_user uuid; v_id uuid; v_items uuid[]; r public.inv_verificacion_items; v_n int; v_prod uuid[];
BEGIN
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue
                 WHERE ue.tenant_id = '00000000-0000-0000-0000-000000000001' ORDER BY ue.user_id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = '00000000-0000-0000-0000-000000000001';
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin usuario de Morla para probar'; END IF;

  SELECT count(*) INTO v_n FROM public.get_inventario_sin_movimiento(60, 90, '');
  IF v_n = 0 THEN RAISE EXCEPTION 'Sin movimiento 60-90 salió vacío'; END IF;
  SELECT array_agg(id) INTO v_prod FROM (SELECT id FROM public.get_inventario_sin_movimiento(90, NULL, '') LIMIT 2) x;

  v_id := public.inv_verif_crear(v_user, 'PRUEBA', v_prod);
  SELECT array_agg(id ORDER BY codigo) INTO v_items FROM public.inv_verificacion_items WHERE verificacion_id = v_id;
  IF array_length(v_items, 1) <> 2 THEN RAISE EXCEPTION 'No guardó las 2 piezas'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_inventario_sin_movimiento(90, NULL, '') WHERE id = v_prod[1] AND en_verificacion) THEN
    RAISE EXCEPTION 'No marca la pieza como en verificación';
  END IF;

  BEGIN PERFORM public.inv_verif_enviar(v_id); RAISE EXCEPTION 'Envió sin contar';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Envió sin contar' THEN RAISE; END IF; END;

  SELECT * INTO r FROM public.inv_verificacion_items WHERE id = v_items[1];
  r := public.inv_verif_contar(v_items[1], r.existencia_sistema, r.ubicacion_sistema);
  IF r.resultado <> 'ok' THEN RAISE EXCEPTION 'Igual al sistema debía ser ok: %', r.resultado; END IF;
  r := public.inv_verif_contar(v_items[2], 0, NULL, true);
  IF r.resultado <> 'no_esta' OR r.existencia_contada <> 0 THEN RAISE EXCEPTION 'No está: %', r.resultado; END IF;

  PERFORM public.inv_verif_enviar(v_id);
  IF (SELECT estado FROM public.inv_verificaciones WHERE id = v_id) <> 'enviada' THEN RAISE EXCEPTION 'No quedó enviada'; END IF;
  PERFORM public.inv_verif_aplicar_ubicaciones_y_cerrar(v_id);
  IF (SELECT estado FROM public.inv_verificaciones WHERE id = v_id) <> 'aplicada' THEN RAISE EXCEPTION 'No quedó aplicada'; END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('inventario_verificaciones.sql');
