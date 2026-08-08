-- =====================================================================
-- MCP de MotoFlow — lo que cualquier IA puede consultar del sistema
-- ---------------------------------------------------------------------
-- (2026-08-08) "vamos a realizarlo sobre MotoFlow entonces."
--
-- Un MCP no es más que una lista de herramientas que una IA puede llamar.
-- Estas son las de MotoFlow. Son SUS datos, así que no hay intermediario ni
-- permiso de nadie que pedir — al revés de Instagram, donde el muro no es
-- técnico sino de Meta.
--
-- >>> TODAS DE SOLO LECTURA <<<
-- v1 no escribe nada: ni factura, ni cotiza, ni cobra. Una IA que se
-- equivoca leyendo da un dato malo y se corrige; una que se equivoca
-- escribiendo mueve inventario y plata. Escribir se agrega después, tarea
-- por tarea y con confirmación humana, no de un golpe.
--
-- >>> LA EMPRESA NO SE PIDE, SE DEDUCE <<<
-- Cada función resuelve el tenant con get_user_tenant() a partir de la
-- sesión de quien llama. Ningún parámetro permite pedir datos de otra
-- empresa: aunque el modelo se invente un tenant_id, no tiene dónde ponerlo.
--
-- >>> QUÉ NO SE EXPONE <<<
-- El COSTO de los productos no sale. Es el dato que no debe poder terminar
-- en un chat con un cliente ni por accidente. Precio y existencia sí.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) BUSCAR PIEZAS
-- ------------------------------------------------------------
-- Misma búsqueda que ya probamos con el cigüeñal: sin tildes de los dos
-- lados y conservando los modelos cortos (g2, r6). Manda el número de
-- palabras que coinciden.
CREATE OR REPLACE FUNCTION public.mcp_buscar_piezas(p_texto text, p_limite int DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pal    text[];
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  v_pal := public._hermes_palabras(p_texto);
  IF array_length(v_pal, 1) IS NULL THEN
    RETURN json_build_object('busqueda', p_texto, 'palabras', '[]'::json, 'piezas', '[]'::json,
      'nota', 'No quedó ninguna palabra útil para buscar. Pide la pieza y el modelo de la motocicleta.');
  END IF;

  SELECT COALESCE(json_agg(y), '[]'::json) INTO v_out
  FROM (
    SELECT p.codigo, p.descripcion,
           round(COALESCE(p.precio, 0), 2) AS precio,
           COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
           NULLIF(btrim(COALESCE(p.ubicacion, '')), '') AS ubicacion,
           (SELECT COUNT(*) FROM unnest(v_pal) w
             WHERE public._sin_tildes(p.descripcion) LIKE '%' || w || '%'
                OR public._sin_tildes(COALESCE(p.codigo, '')) LIKE '%' || w || '%') AS aciertos
    FROM public.productos p
    WHERE p.tenant_id = v_tenant
      AND COALESCE(p.activo, true) = true
      AND EXISTS (SELECT 1 FROM unnest(v_pal) w
                   WHERE public._sin_tildes(p.descripcion) LIKE '%' || w || '%'
                      OR public._sin_tildes(COALESCE(p.codigo, '')) LIKE '%' || w || '%')
    ORDER BY aciertos DESC, COALESCE(public.get_stock_actual(p.id), 0) DESC, p.descripcion
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 8), 25))
  ) y;

  RETURN json_build_object('busqueda', p_texto, 'palabras', to_json(v_pal), 'piezas', v_out);
END $$;

-- ------------------------------------------------------------
-- 2) UNA PIEZA POR CÓDIGO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_ver_pieza(p_codigo text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  SELECT json_build_object(
           'codigo', p.codigo, 'descripcion', p.descripcion,
           'precio', round(COALESCE(p.precio, 0), 2),
           'existencia', COALESCE(public.get_stock_actual(p.id), 0),
           'ubicacion', NULLIF(btrim(COALESCE(p.ubicacion, '')), ''),
           'itbis_pct', p.itbis_pct,
           'garantia_meses', p.garantia_meses,
           'activo', COALESCE(p.activo, true))
    INTO v_out
  FROM public.productos p
  WHERE p.tenant_id = v_tenant
    AND public._sin_tildes(p.codigo) = public._sin_tildes(btrim(p_codigo))
  LIMIT 1;

  RETURN COALESCE(v_out, json_build_object('encontrada', false, 'codigo', p_codigo));
END $$;

-- ------------------------------------------------------------
-- 3) ESTADO DE UN CLIENTE
-- ------------------------------------------------------------
-- Para contestar "¿cuánto debe fulano?" sin abrir el sistema. Se busca por
-- nombre, cédula o código; si hay varios, se devuelven para que la IA
-- pregunte cuál en vez de adivinar.
CREATE OR REPLACE FUNCTION public.mcp_estado_cliente(p_busqueda text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_b      text := public._sin_tildes(btrim(COALESCE(p_busqueda, '')));
  v_n      int;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;
  IF v_b = '' THEN RAISE EXCEPTION 'Falta el nombre, cédula o código del cliente'; END IF;

  SELECT COUNT(*) INTO v_n FROM public.clientes c
  WHERE c.tenant_id = v_tenant
    AND (public._sin_tildes(c.nombre) LIKE '%' || v_b || '%'
      OR public._sin_tildes(COALESCE(c.rnc, '')) LIKE '%' || v_b || '%'
      OR public._sin_tildes(COALESCE(c.codigo, '')) LIKE '%' || v_b || '%');

  IF v_n = 0 THEN RETURN json_build_object('encontrado', false, 'busqueda', p_busqueda); END IF;

  IF v_n > 1 THEN
    SELECT json_build_object('varios', true, 'cuantos', v_n, 'candidatos', COALESCE(json_agg(x), '[]'::json))
      INTO v_out
    FROM (
      SELECT c.codigo, c.nombre, c.rnc
      FROM public.clientes c
      WHERE c.tenant_id = v_tenant
        AND (public._sin_tildes(c.nombre) LIKE '%' || v_b || '%'
          OR public._sin_tildes(COALESCE(c.rnc, '')) LIKE '%' || v_b || '%'
          OR public._sin_tildes(COALESCE(c.codigo, '')) LIKE '%' || v_b || '%')
      ORDER BY c.nombre LIMIT 10
    ) x;
    RETURN v_out;
  END IF;

  SELECT json_build_object(
           'encontrado', true,
           'codigo', c.codigo, 'nombre', c.nombre, 'rnc', c.rnc, 'telefono', c.telefono,
           'facturas_pendientes', (
             SELECT COALESCE(json_agg(json_build_object(
                      'numero', f.numero, 'fecha', f.fecha::date,
                      'total', f.total, 'pendiente', f.monto_pendiente)), '[]'::json)
             FROM public.facturas f
             WHERE f.cliente_id = c.id AND f.tenant_id = v_tenant
               AND COALESCE(f.monto_pendiente, 0) > 0
               AND COALESCE(f.estado, '') <> 'ANULADA'),
           'deuda_facturas', (
             SELECT COALESCE(SUM(f.monto_pendiente), 0)
             FROM public.facturas f
             WHERE f.cliente_id = c.id AND f.tenant_id = v_tenant
               AND COALESCE(f.estado, '') <> 'ANULADA'),
           'prestamos_activos', (
             SELECT COALESCE(json_agg(json_build_object(
                      'numero', pr.numero, 'capital', pr.monto_capital,
                      'cuotas', pr.plazo_cuotas, 'frecuencia', pr.frecuencia)), '[]'::json)
             FROM public.prestamos pr
             WHERE pr.cliente_id = c.id AND pr.tenant_id = v_tenant AND pr.estado = 'activo')
         ) INTO v_out
  FROM public.clientes c
  WHERE c.tenant_id = v_tenant
    AND (public._sin_tildes(c.nombre) LIKE '%' || v_b || '%'
      OR public._sin_tildes(COALESCE(c.rnc, '')) LIKE '%' || v_b || '%'
      OR public._sin_tildes(COALESCE(c.codigo, '')) LIKE '%' || v_b || '%')
  LIMIT 1;

  RETURN v_out;
END $$;

-- ------------------------------------------------------------
-- 4) EL DÍA
-- ------------------------------------------------------------
-- Los mismos criterios del cierre de caja, incluida la lección de ayer:
-- lo ANULADO no cuenta.
CREATE OR REPLACE FUNCTION public.mcp_resumen_dia(p_fecha date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_f      date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  RETURN json_build_object(
    'fecha', v_f,
    'facturas', (SELECT COUNT(*) FROM public.facturas
                  WHERE tenant_id = v_tenant AND fecha::date = v_f
                    AND COALESCE(estado, '') <> 'ANULADA'),
    'total_ventas', (SELECT COALESCE(SUM(total), 0) FROM public.facturas
                      WHERE tenant_id = v_tenant AND fecha::date = v_f
                        AND COALESCE(estado, '') <> 'ANULADA'),
    'recibos_total', (SELECT COALESCE(SUM(monto_pagado), 0) FROM public.recibos_ingreso
                       WHERE tenant_id = v_tenant AND fecha = v_f
                         AND COALESCE(anulado, false) = false),
    'recibos_efectivo', (
      SELECT COALESCE(SUM(
        CASE WHEN jsonb_typeof(COALESCE(formas_pago::jsonb, 'null'::jsonb)) = 'array'
              AND jsonb_array_length(formas_pago::jsonb) > 0
             THEN (SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0)
                   FROM jsonb_array_elements(formas_pago::jsonb) f
                   WHERE lower(f ->> 'forma') LIKE '%efectivo%')
             ELSE monto_pagado END), 0)
      FROM public.recibos_ingreso
      WHERE tenant_id = v_tenant AND fecha = v_f AND COALESCE(anulado, false) = false),
    'gastos', (SELECT COALESCE(SUM(monto), 0) FROM public.gastos_diarios
                WHERE tenant_id = v_tenant AND fecha = v_f
                  AND COALESCE(anulado, false) = false),
    'prestamos_efectivo', (SELECT COALESCE(SUM(monto_capital), 0) FROM public.prestamos
                            WHERE tenant_id = v_tenant AND fecha_inicio = v_f
                              AND desembolso ILIKE 'efectivo')
  );
END $$;

-- ------------------------------------------------------------
-- PERMISOS
-- ------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'mcp_buscar_piezas(text,int)', 'mcp_ver_pieza(text)',
    'mcp_estado_cliente(text)', 'mcp_resumen_dia(date)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('mcp_motoflow_lectura.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN (con sesión iniciada; con service_role el tenant sale NULL)
-- ------------------------------------------------------------
-- SELECT jsonb_pretty(public.mcp_buscar_piezas('cigueñal g2 vini')::jsonb);
--   esperado: CIGUENAL RACING PRESS CUB G2 VINI de primera, con precio y existencia
-- SELECT jsonb_pretty(public.mcp_estado_cliente('ANDY')::jsonb);
-- SELECT jsonb_pretty(public.mcp_resumen_dia()::jsonb);
