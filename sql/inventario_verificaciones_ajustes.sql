-- ============================================================
-- INVENTARIO: LISTAS PARA CONFIRMAR — AJUSTES DE LA REVISIÓN (23/11/2026)
-- ============================================================
-- /code-review high sobre inventario_verificaciones.sql:
-- 1. Aplicar ya no lo hace la PC en pasos sueltos (dos clics o un reintento
--    ajustaban dos veces): inv_verif_aplicar bloquea la lista (FOR UPDATE),
--    graba la ENTRADA/SALIDA de ajuste, corrige ubicaciones y la cierra en
--    UNA transacción. Se borra inv_verif_aplicar_ubicaciones_y_cerrar.
-- 2. Una pieza no puede estar en dos listas activas (se salta al crear, con
--    candado por empresa para que dos envíos a la vez no la dupliquen).
-- 3. Permisos: crear y aplicar/cancelar = dueño, admin o gerente (o quien la
--    creó); enviar = a quien se la mandaron (o admin).
-- 4. El celular ve la existencia ACTUAL (inv_verif_items_de), no la de
--    cuando se mandó: si se vendió algo entre medio no salen ajustes falsos.
-- 5. Sin movimiento: totales reales aunque la lista se corte en 2,000, y el
--    día de las entradas/salidas de fecha sola (00:00 UTC) no se corre uno.
-- ============================================================

-- ¿Puede administrar listas en esta empresa?
CREATE OR REPLACE FUNCTION private.inv_es_admin(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid() AND ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin', 'gerente'))
      OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid()
                  AND ((pr.tenant_id = p_tenant AND pr.role IN ('owner', 'admin', 'gerente')) OR COALESCE(pr.is_superadmin, false)));
$fn$;
REVOKE EXECUTE ON FUNCTION private.inv_es_admin(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Sin movimiento (cambia lo que devuelve: se recrea) ────────────────
DROP FUNCTION IF EXISTS public.get_inventario_sin_movimiento(integer, integer, text);
CREATE FUNCTION public.get_inventario_sin_movimiento(
  p_dias_min integer DEFAULT 60, p_dias_max integer DEFAULT NULL, p_search text DEFAULT '')
RETURNS TABLE(id uuid, codigo text, descripcion text, referencia text, ubicacion text, marca text,
              existencia numeric, costo numeric, valor numeric, ultimo_movimiento date, dias integer,
              en_verificacion boolean, total_piezas bigint, total_valor numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH t AS (SELECT public.get_user_tenant() AS id, (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy),
  mov AS (
    SELECT m.producto_id,
           sum(m.cantidad) AS stock,
           -- Las entradas/salidas con fecha sola quedan a las 00:00 UTC: su día es ese, no el anterior en RD.
           COALESCE(max(CASE WHEN (m.fecha AT TIME ZONE 'UTC')::time = '00:00' THEN (m.fecha AT TIME ZONE 'UTC')::date
                             ELSE (m.fecha AT TIME ZONE 'America/Santo_Domingo')::date END) FILTER (WHERE m.tipo <> 'AJUSTE'),
                    min(CASE WHEN (m.fecha AT TIME ZONE 'UTC')::time = '00:00' THEN (m.fecha AT TIME ZONE 'UTC')::date
                             ELSE (m.fecha AT TIME ZONE 'America/Santo_Domingo')::date END)) AS ultimo
      FROM public.inventario_movimientos m, t
     WHERE m.tenant_id = t.id
     GROUP BY m.producto_id
  ),
  base AS (
    SELECT p.id, p.codigo, p.descripcion, p.referencia, p.ubicacion, ma.nombre AS marca,
           mov.stock AS existencia, COALESCE(p.costo, 0) AS costo, round(mov.stock * COALESCE(p.costo, 0), 2) AS valor,
           mov.ultimo AS ultimo_movimiento, (t.hoy - mov.ultimo)::int AS dias,
           EXISTS (SELECT 1 FROM public.inv_verificacion_items i JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
                    WHERE i.producto_id = p.id AND v.estado IN ('pendiente', 'enviada')) AS en_verificacion
      FROM public.productos p
      JOIN t ON p.tenant_id = t.id
      JOIN mov ON mov.producto_id = p.id
      LEFT JOIN public.marcas ma ON ma.id = p.marca_id
     WHERE COALESCE(p.activo, true) AND mov.stock > 0
       AND (t.hoy - mov.ultimo) >= COALESCE(p_dias_min, 0)
       AND (p_dias_max IS NULL OR (t.hoy - mov.ultimo) <= p_dias_max)
       AND (COALESCE(btrim(p_search), '') = ''
            OR public._sin_tildes(concat_ws(' ', p.codigo, p.referencia, p.descripcion, p.ubicacion, ma.nombre))
               LIKE '%' || public._sin_tildes(btrim(p_search)) || '%')
  )
  SELECT b.*, count(*) OVER (), sum(b.valor) OVER ()
    FROM base b
   ORDER BY b.valor DESC, b.codigo
   LIMIT 2000;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventario_sin_movimiento(integer, integer, text) TO authenticated;

-- ── 2 y 3. Crear: solo admin; salta piezas que ya están en otra lista ────
CREATE OR REPLACE FUNCTION public.inv_verif_crear(p_asignado uuid, p_titulo text, p_productos uuid[], p_nota text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_t uuid := public.get_user_tenant(); v_id uuid; v_n int;
BEGIN
  IF auth.uid() IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin sesión o sin empresa activa'; END IF;
  IF NOT private.inv_es_admin(v_t) THEN RAISE EXCEPTION 'Solo el dueño, un administrador o un gerente manda listas'; END IF;
  IF p_asignado IS NULL OR NOT private.inv_es_de_empresa(p_asignado, v_t) THEN
    RAISE EXCEPTION 'Ese usuario no es de esta empresa';
  END IF;
  IF COALESCE(array_length(p_productos, 1), 0) = 0 THEN RAISE EXCEPTION 'La lista está vacía'; END IF;
  IF array_length(p_productos, 1) > 500 THEN RAISE EXCEPTION 'Máximo 500 piezas por lista'; END IF;

  -- Dos envíos a la vez de la misma empresa van uno detrás del otro.
  PERFORM pg_advisory_xact_lock(hashtext('inv_verif:' || v_t::text));

  INSERT INTO public.inv_verificaciones (tenant_id, titulo, asignado_a, nota)
  VALUES (v_t, COALESCE(NULLIF(btrim(p_titulo), ''), 'Confirmar existencia y ubicación'), p_asignado, NULLIF(btrim(p_nota), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.inv_verificacion_items (verificacion_id, tenant_id, producto_id, codigo, descripcion, existencia_sistema, ubicacion_sistema)
  SELECT v_id, v_t, p.id, p.codigo, p.descripcion, public.get_stock_actual(p.id), p.ubicacion
    FROM public.productos p
   WHERE p.id = ANY (p_productos) AND p.tenant_id = v_t
     AND NOT EXISTS (SELECT 1 FROM public.inv_verificacion_items i JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
                      WHERE i.producto_id = p.id AND v.estado IN ('pendiente', 'enviada') AND v.id <> v_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Esas piezas ya están en otra lista activa (o no son de esta empresa)'; END IF;

  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  VALUES (v_t, p_asignado, 'inv_verificacion',
          left('Te mandaron a confirmar ' || v_n || ' pieza' || CASE WHEN v_n = 1 THEN '' ELSE 's' END, 120),
          'Ábrela en la app de MotoFlow (Inicio → Por confirmar): existencia y ubicación.');
  RETURN v_id;
END;
$fn$;

-- ── 3. Enviar: a quien se la mandaron (o admin) ──────────────────────────
CREATE OR REPLACE FUNCTION public.inv_verif_enviar(p_id uuid)
RETURNS public.inv_verificaciones
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v public.inv_verificaciones; v_falta int; v_dif int;
BEGIN
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = p_id AND tenant_id = public.get_user_tenant() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada'; END IF;
  IF auth.uid() IS DISTINCT FROM v.asignado_a AND NOT private.inv_es_admin(v.tenant_id) THEN
    RAISE EXCEPTION 'Esta lista se la mandaron a otra persona';
  END IF;
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

-- ── 3. Cancelar: quien la creó o admin ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.inv_verif_cancelar(p_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v public.inv_verificaciones;
BEGIN
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = p_id AND tenant_id = public.get_user_tenant() FOR UPDATE;
  IF NOT FOUND OR v.estado NOT IN ('pendiente', 'enviada') THEN RAISE EXCEPTION 'Lista no encontrada o ya cerrada'; END IF;
  IF auth.uid() IS DISTINCT FROM v.creado_por AND NOT private.inv_es_admin(v.tenant_id) THEN
    RAISE EXCEPTION 'Solo quien la mandó o un administrador la cancela';
  END IF;
  UPDATE public.inv_verificaciones SET estado = 'cancelada' WHERE id = p_id;
END;
$fn$;

-- ── 1. Aplicar todo en una transacción ───────────────────────────────────
DROP FUNCTION IF EXISTS public.inv_verif_aplicar_ubicaciones_y_cerrar(uuid);

CREATE OR REPLACE FUNCTION public.inv_verif_aplicar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v public.inv_verificaciones;
  v_alm uuid; v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_sube jsonb; v_baja jsonb; v_num text; v_ub int := 0; v_ns int := 0; v_nb int := 0;
  v_nota text;
BEGIN
  SELECT * INTO v FROM public.inv_verificaciones WHERE id = p_id AND tenant_id = public.get_user_tenant() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada'; END IF;
  IF auth.uid() IS DISTINCT FROM v.creado_por AND NOT private.inv_es_admin(v.tenant_id) THEN
    RAISE EXCEPTION 'Solo quien la mandó o un administrador la aplica';
  END IF;
  IF v.estado <> 'enviada' THEN RAISE EXCEPTION 'La lista no está para aplicar (está %)', v.estado; END IF;
  v_nota := 'Confirmación en el celular: ' || v.titulo;

  -- Diferencia contra lo que decía el sistema cuando se contó.
  WITH d AS (
    SELECT i.producto_id, i.codigo, i.descripcion, COALESCE(p.costo, 0) AS costo,
           (i.existencia_contada - i.existencia_al_contar) AS delta
      FROM public.inv_verificacion_items i JOIN public.productos p ON p.id = i.producto_id
     WHERE i.verificacion_id = p_id AND i.existencia_contada IS NOT NULL AND i.existencia_al_contar IS NOT NULL
       AND abs(i.existencia_contada - i.existencia_al_contar) > 0.0001
  )
  SELECT jsonb_agg(jsonb_build_object('producto_id', producto_id, 'codigo', codigo, 'descripcion', descripcion, 'cantidad', delta,
                    'unidad', 'UND - Unidad', 'costo_unitario', costo, 'importe', round(delta * costo, 2))) FILTER (WHERE delta > 0),
         jsonb_agg(jsonb_build_object('producto_id', producto_id, 'codigo', codigo, 'descripcion', descripcion, 'cantidad', -delta,
                    'unidad', 'UND - Unidad', 'costo_unitario', costo, 'importe', round(-delta * costo, 2))) FILTER (WHERE delta < 0)
    INTO v_sube, v_baja FROM d;

  IF v_sube IS NOT NULL OR v_baja IS NOT NULL THEN
    -- Almacén principal, igual que findAlmacenPrincipal: '01' > 'ALM01' > nombre con "principal" > el primero.
    SELECT a.id INTO v_alm FROM public.almacenes a WHERE a.tenant_id = v.tenant_id
     ORDER BY (btrim(a.codigo) = '01') DESC NULLS LAST, (upper(a.codigo) = 'ALM01') DESC NULLS LAST,
              (lower(a.nombre) LIKE '%principal%') DESC NULLS LAST, a.nombre
     LIMIT 1;
    IF v_alm IS NULL THEN RAISE EXCEPTION 'Falta el Almacén Principal: créalo en Inventario → Almacenes'; END IF;
  END IF;

  IF v_sube IS NOT NULL THEN
    v_num := public.get_next_entrada_numero();
    PERFORM public.crear_entrada_inventario(
      jsonb_build_object('numero', v_num, 'fecha', v_hoy, 'referencia', 'AJUSTE POR CONFIRMACIÓN', 'concepto', 'AJUSTE DE INVENTARIO',
                         'almacen_id', v_alm, 'notas', v_nota,
                         'total_costo', (SELECT sum((x->>'importe')::numeric) FROM jsonb_array_elements(v_sube) x)),
      v_sube, 'AJUSTE');
    v_ns := jsonb_array_length(v_sube);
  END IF;
  IF v_baja IS NOT NULL THEN
    v_num := public.get_next_salida_numero();
    PERFORM public.crear_salida_inventario(
      jsonb_build_object('numero', v_num, 'fecha', v_hoy, 'referencia', 'AJUSTE POR CONFIRMACIÓN', 'concepto', 'AJUSTE DE SALIDA',
                         'almacen_id', v_alm, 'notas', v_nota,
                         'total_costo', (SELECT sum((x->>'importe')::numeric) FROM jsonb_array_elements(v_baja) x)),
      v_baja, 'AJUSTE');
    v_nb := jsonb_array_length(v_baja);
  END IF;

  UPDATE public.productos p SET ubicacion = i.ubicacion_confirmada
    FROM public.inv_verificacion_items i
   WHERE i.verificacion_id = p_id AND p.id = i.producto_id AND p.tenant_id = v.tenant_id
     AND i.resultado <> 'no_esta' AND i.ubicacion_confirmada IS NOT NULL
     AND COALESCE(upper(p.ubicacion), '') <> upper(i.ubicacion_confirmada);
  GET DIAGNOSTICS v_ub = ROW_COUNT;

  UPDATE public.inv_verificaciones SET estado = 'aplicada', aplicada_at = now(), aplicada_por = auth.uid() WHERE id = p_id;
  RETURN jsonb_build_object('suben', v_ns, 'bajan', v_nb, 'ubicaciones', v_ub);
END;
$fn$;

-- ── 4. Lo que ve el celular: con la existencia de ahora ──────────────────
CREATE OR REPLACE FUNCTION public.inv_verif_items_de(p_id uuid)
RETURNS TABLE(id uuid, codigo text, descripcion text, existencia_actual numeric, ubicacion_sistema text,
              existencia_contada numeric, ubicacion_confirmada text, resultado text, nota text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT i.id, i.codigo, i.descripcion, public.get_stock_actual(i.producto_id), i.ubicacion_sistema,
         i.existencia_contada, i.ubicacion_confirmada, i.resultado, i.nota
    FROM public.inv_verificacion_items i
    JOIN public.inv_verificaciones v ON v.id = i.verificacion_id
   WHERE i.verificacion_id = p_id AND v.tenant_id = public.get_user_tenant()
   ORDER BY i.ubicacion_sistema NULLS LAST, i.codigo;
$fn$;

REVOKE EXECUTE ON FUNCTION public.inv_verif_aplicar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inv_verif_items_de(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_verif_aplicar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_verif_items_de(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA (se deshace): admin de Morla manda 2 piezas a sí mismo; una con
-- diferencia de -1 y ubicación nueva; aplicar ajusta UNA vez.
DO $prueba$
DECLARE v_user uuid; v_id uuid; v_items uuid[]; v_prod uuid[]; v_p1 uuid; v_stock_antes numeric; v_stock_desp numeric; r jsonb; v_ub text;
BEGIN
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue
                 WHERE ue.tenant_id = '00000000-0000-0000-0000-000000000001' AND ue.rol IN ('owner', 'admin') ORDER BY ue.user_id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = '00000000-0000-0000-0000-000000000001';
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sin admin de Morla para probar'; END IF;

  SELECT array_agg(id) INTO v_prod FROM (SELECT id FROM public.get_inventario_sin_movimiento(90, NULL, '') WHERE existencia >= 2 LIMIT 2) x;
  IF (SELECT total_piezas FROM public.get_inventario_sin_movimiento(90, NULL, '') LIMIT 1) < 1 THEN RAISE EXCEPTION 'Sin total'; END IF;

  v_id := public.inv_verif_crear(v_user, 'PRUEBA', v_prod);
  BEGIN PERFORM public.inv_verif_crear(v_user, 'PRUEBA 2', v_prod); RAISE EXCEPTION 'Duplicó piezas en dos listas';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Duplicó piezas en dos listas' THEN RAISE; END IF; END;

  SELECT array_agg(i.id ORDER BY i.codigo) INTO v_items FROM public.inv_verificacion_items i WHERE i.verificacion_id = v_id;
  SELECT i.producto_id INTO v_p1 FROM public.inv_verificacion_items i WHERE i.id = v_items[1];
  v_prod[1] := v_p1;
  v_stock_antes := public.get_stock_actual(v_p1);
  IF (SELECT existencia_actual FROM public.inv_verif_items_de(v_id) WHERE id = v_items[1]) <> v_stock_antes THEN
    RAISE EXCEPTION 'inv_verif_items_de no da la existencia actual';
  END IF;

  PERFORM public.inv_verif_contar(v_items[1], v_stock_antes - 1, 'PRUEBA-UBIC');
  PERFORM public.inv_verif_contar(v_items[2], (SELECT existencia_actual FROM public.inv_verif_items_de(v_id) WHERE id = v_items[2]), NULL);
  PERFORM public.inv_verif_enviar(v_id);

  r := public.inv_verif_aplicar(v_id);
  v_stock_desp := public.get_stock_actual(v_prod[1]);
  IF v_stock_desp <> v_stock_antes - 1 THEN RAISE EXCEPTION 'Ajuste: antes %, después %', v_stock_antes, v_stock_desp; END IF;
  SELECT ubicacion INTO v_ub FROM public.productos WHERE id = v_prod[1];
  IF v_ub <> 'PRUEBA-UBIC' THEN RAISE EXCEPTION 'No corrigió la ubicación: %', v_ub; END IF;
  IF (r->>'bajan')::int <> 1 THEN RAISE EXCEPTION 'Resultado: %', r; END IF;

  BEGIN PERFORM public.inv_verif_aplicar(v_id); RAISE EXCEPTION 'Aplicó dos veces';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'Aplicó dos veces' THEN RAISE; END IF; END;
  IF public.get_stock_actual(v_prod[1]) <> v_stock_antes - 1 THEN RAISE EXCEPTION 'El segundo intento movió el stock'; END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('inventario_verificaciones_ajustes.sql');
