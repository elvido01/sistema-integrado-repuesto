-- =====================================================================
-- JARVIS: DEJAR DE MIRAR SOLO EL MOSTRADOR
-- ---------------------------------------------------------------------
-- (2026-08-16) Jarvis ya sabe conversar, ya habla y ya escucha. Lo que no
-- sabe es el negocio: de las 77 pantallas del sistema, sus herramientas
-- alcanzaban cuatro cosas — buscar una pieza, ver una pieza, mirar UN
-- cliente y el resumen del día.
--
-- Se nota en el uso real. En 60 días recibió 866 preguntas, y 833 fueron el
-- mismo día que se construyó. Después: 27, luego 3, luego nada. No es que
-- moleste; es que casi todo lo que uno le preguntaría de verdad —"¿quién me
-- debe?", "¿a quién le debo yo?", "¿cómo vamos este mes?", "¿qué se me
-- acabó de lo que se vende?"— él no lo puede ni mirar.
--
-- >>> POR QUÉ ESTAS CINCO Y NO OTRAS <<<
-- Son las preguntas que un dueño hace de pie, sin computadora delante. Por
-- eso importan más en voz que escritas: quien está manejando no puede abrir
-- Cartera de Clientes, pero sí puede preguntar quién le debe.
--
--   1. cartera_cobrar    ¿quién me debe y desde cuándo?
--   2. cuentas_pagar     ¿a quién le debo yo?
--   3. ventas_periodo    ¿cómo vamos, contra el período anterior?
--   4. piezas_criticas   ¿qué se vende y no tengo?
--   5. buscar_documento  "búscame la 1023"
--
-- >>> SIGUEN SIENDO OJOS, NO MANOS <<<
-- Todas LEEN. Ninguna escribe. Facturar y cobrar siguen pasando por
-- agente_proponer_accion, que congela el payload y espera autorización.
-- Una IA equivocada leyendo da un dato malo; escribiendo mueve plata.
--
-- >>> LA EMPRESA SALE DE LA SESIÓN <<<
-- get_user_tenant() en cada una, como las que ya existían. No hay parámetro
-- de empresa: un modelo no puede pedir datos de otra ni inventándose
-- argumentos, porque no hay dónde ponerlos.
--
-- >>> RESPUESTAS CORTAS A PROPÓSITO <<<
-- Cada json de estos viaja dentro del prompt y se paga por token en cada
-- vuelta. Por eso devuelven totales y un top acotado, no la tabla entera.
-- Un listado de 300 morosos no lo lee nadie y cuesta en cada pregunta.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ¿QUIÉN ME DEBE?
-- ---------------------------------------------------------------------
-- La mora se calcula sobre la fecha de la factura MÁS los días de crédito
-- que se le dieron. Contarla desde la fecha a secas marcaría como atrasado
-- a un cliente de 30 días al que le vendieron ayer.
CREATE OR REPLACE FUNCTION public.mcp_cartera_cobrar(
  p_dias_mora int DEFAULT 0, p_limite int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limite, 10), 25));
  v_dias   int  := GREATEST(0, COALESCE(p_dias_mora, 0));
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  WITH pend AS (
    SELECT f.cliente_id,
           NULLIF(btrim(COALESCE(f.manual_cliente_nombre, '')), '') AS nombre_manual,
           COALESCE(f.monto_pendiente, 0) AS debe,
           (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date
             + COALESCE(f.dias_credito, 0) AS vence
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND COALESCE(f.estado, '') <> 'ANULADA'
      AND COALESCE(f.monto_pendiente, 0) > 0
  ), porcli AS (
    SELECT COALESCE(c.nombre, p.nombre_manual, 'Sin cliente') AS nombre,
           c.codigo, c.telefono,
           SUM(p.debe)              AS debe,
           COUNT(*)                 AS documentos,
           MAX(v_hoy - p.vence)     AS dias_mora
    FROM pend p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id AND c.tenant_id = v_tenant
    GROUP BY p.cliente_id, c.nombre, p.nombre_manual, c.codigo, c.telefono
  )
  SELECT json_build_object(
    'total_por_cobrar', (SELECT COALESCE(round(SUM(debe), 2), 0) FROM porcli),
    'clientes_con_deuda', (SELECT COUNT(*) FROM porcli),
    'vencido', (SELECT COALESCE(round(SUM(debe), 2), 0) FROM pend WHERE vence < v_hoy),
    'filtro_dias_mora', v_dias,
    'clientes', (
      SELECT COALESCE(json_agg(json_build_object(
               'nombre', x.nombre, 'codigo', x.codigo, 'telefono', x.telefono,
               'debe', round(x.debe, 2), 'documentos', x.documentos,
               'dias_mora', GREATEST(x.dias_mora, 0))), '[]'::json)
      -- El "v_dias = 0 OR" no sobra: dias_mora es NEGATIVO cuando la factura
      -- todavía no vence, así que un filtro >= 0 dejaría fuera justo a los
      -- clientes que están al día — y seguirían contando en el total. La
      -- lista diría una cosa y la suma otra.
      FROM (SELECT * FROM porcli
            WHERE v_dias = 0 OR dias_mora >= v_dias
            ORDER BY debe DESC LIMIT v_lim) x)
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_cartera_cobrar(int, int) IS
  'Quién le debe a la empresa. La mora cuenta desde el vencimiento (fecha + días de crédito), no desde la fecha.';

-- ---------------------------------------------------------------------
-- 2. ¿A QUIÉN LE DEBO YO?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_cuentas_pagar(p_limite int DEFAULT 10)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limite, 10), 25));
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  WITH pend AS (
    SELECT co.suplidor_id,
           COALESCE(co.monto_pendiente, 0) AS debo,
           co.fecha + COALESCE(co.dias_credito, 0) AS vence
    FROM public.compras co
    WHERE co.tenant_id = v_tenant
      AND COALESCE(co.estado, '') NOT IN ('ANULADA', 'ANULADO')
      AND COALESCE(co.monto_pendiente, 0) > 0
  ), porprov AS (
    SELECT COALESCE(pr.nombre, 'Sin suplidor') AS nombre,
           pr.telefono,
           SUM(p.debo)          AS debo,
           COUNT(*)             AS facturas,
           MAX(v_hoy - p.vence) AS dias_mora
    FROM pend p
    LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id AND pr.tenant_id = v_tenant
    GROUP BY p.suplidor_id, pr.nombre, pr.telefono
  )
  SELECT json_build_object(
    'total_por_pagar', (SELECT COALESCE(round(SUM(debo), 2), 0) FROM porprov),
    'suplidores', (SELECT COUNT(*) FROM porprov),
    'vencido', (SELECT COALESCE(round(SUM(debo), 2), 0) FROM pend WHERE vence < v_hoy),
    'detalle', (
      SELECT COALESCE(json_agg(json_build_object(
               'suplidor', x.nombre, 'telefono', x.telefono,
               'debo', round(x.debo, 2), 'facturas', x.facturas,
               'dias_mora', GREATEST(x.dias_mora, 0))), '[]'::json)
      FROM (SELECT * FROM porprov ORDER BY debo DESC LIMIT v_lim) x)
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_cuentas_pagar(int) IS
  'Lo que la empresa le debe a sus suplidores, agrupado por suplidor.';

-- ---------------------------------------------------------------------
-- 3. ¿CÓMO VAMOS?
-- ---------------------------------------------------------------------
-- Un total suelto no dice nada: "vendimos 180 mil" solo significa algo al
-- lado de lo que se vendió el período anterior de IGUAL largo. Por eso la
-- comparación viene incluida y no hay que pedirla en otra pregunta.
CREATE OR REPLACE FUNCTION public.mcp_ventas_periodo(
  p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_hasta  date := COALESCE(p_hasta, v_hoy);
  v_desde  date := COALESCE(p_desde, date_trunc('month', v_hoy)::date);
  v_largo  int;
  v_pdesde date;
  v_phasta date;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;
  IF v_desde > v_hasta THEN RAISE EXCEPTION 'El desde no puede ser posterior al hasta'; END IF;

  v_largo  := (v_hasta - v_desde) + 1;
  v_phasta := v_desde - 1;
  v_pdesde := v_phasta - (v_largo - 1);

  WITH f AS (
    SELECT fa.id, fa.total, fa.monto_pendiente
    FROM public.facturas fa
    WHERE fa.tenant_id = v_tenant
      AND COALESCE(fa.estado, '') <> 'ANULADA'
      AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN v_desde AND v_hasta
  ), prev AS (
    SELECT COALESCE(SUM(fa.total), 0) AS total, COUNT(*) AS n
    FROM public.facturas fa
    WHERE fa.tenant_id = v_tenant
      AND COALESCE(fa.estado, '') <> 'ANULADA'
      AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN v_pdesde AND v_phasta
  )
  SELECT json_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'dias', v_largo,
    'facturas', (SELECT COUNT(*) FROM f),
    'total', (SELECT COALESCE(round(SUM(total), 2), 0) FROM f),
    'promedio_factura', (SELECT COALESCE(round(AVG(total), 2), 0) FROM f),
    'quedo_a_credito', (SELECT COALESCE(round(SUM(monto_pendiente), 2), 0) FROM f),
    'periodo_anterior', json_build_object(
      'desde', v_pdesde, 'hasta', v_phasta,
      'total', (SELECT round(total, 2) FROM prev),
      'facturas', (SELECT n FROM prev),
      'variacion_pct', (
        SELECT CASE WHEN COALESCE((SELECT total FROM prev), 0) = 0 THEN NULL
               ELSE round(((SELECT COALESCE(SUM(total), 0) FROM f) - (SELECT total FROM prev))
                          * 100 / (SELECT total FROM prev), 1) END)),
    'top_piezas', (
      SELECT COALESCE(json_agg(json_build_object(
               'codigo', x.codigo, 'descripcion', x.descripcion,
               'unidades', x.unidades, 'importe', round(x.importe, 2))), '[]'::json)
      FROM (
        SELECT fd.codigo, max(fd.descripcion) AS descripcion,
               SUM(fd.cantidad) AS unidades, SUM(fd.importe) AS importe
        FROM public.facturas_detalle fd
        WHERE fd.factura_id IN (SELECT id FROM f)
        GROUP BY fd.codigo
        ORDER BY SUM(fd.importe) DESC
        LIMIT 5) x)
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_ventas_periodo(date, date) IS
  'Ventas de un rango con la comparación contra el período anterior de igual largo. Sin fechas: el mes en curso.';

-- ---------------------------------------------------------------------
-- 4. ¿QUÉ SE VENDE Y NO TENGO?
-- ---------------------------------------------------------------------
-- >>> POR QUÉ SE PARTE DE LO VENDIDO Y NO DEL CATÁLOGO <<<
-- Recorrer las 5,369 piezas llamando a get_stock_actual() por cada una es
-- lento y además contesta mal: devolvería cientos de piezas en cero que
-- nadie pide desde hace años. Lo que duele es lo que SE VENDE y no está.
-- Así que primero se mira qué se movió, y solo a esas se les cuenta el
-- inventario.
CREATE OR REPLACE FUNCTION public.mcp_piezas_criticas(
  p_dias int DEFAULT 60, p_limite int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_dias   int  := GREATEST(7, LEAST(COALESCE(p_dias, 60), 365));
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limite, 10), 25));
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  WITH vendido AS (
    SELECT fd.producto_id,
           SUM(fd.cantidad) AS unidades,
           MAX((fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date) AS ultima_venta
    FROM public.facturas_detalle fd
    JOIN public.facturas fa ON fa.id = fd.factura_id
    WHERE fa.tenant_id = v_tenant
      AND COALESCE(fa.estado, '') <> 'ANULADA'
      AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_hoy - v_dias
      AND fd.producto_id IS NOT NULL
    GROUP BY fd.producto_id
    ORDER BY SUM(fd.cantidad) DESC
    LIMIT 300
  ), con_stock AS (
    SELECT p.codigo, p.descripcion, v.unidades, v.ultima_venta,
           COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
           COALESCE(p.min_stock, 0) AS minimo
    FROM vendido v
    JOIN public.productos p ON p.id = v.producto_id AND p.tenant_id = v_tenant
    WHERE COALESCE(p.activo, true) = true
  )
  SELECT json_build_object(
    'dias_mirados', v_dias,
    'agotadas', (SELECT COUNT(*) FROM con_stock WHERE existencia <= 0),
    'bajo_minimo', (SELECT COUNT(*) FROM con_stock WHERE existencia > 0 AND minimo > 0 AND existencia <= minimo),
    'piezas', (
      SELECT COALESCE(json_agg(json_build_object(
               'codigo', x.codigo, 'descripcion', x.descripcion,
               'existencia', x.existencia, 'minimo', x.minimo,
               'vendidas', x.unidades, 'ultima_venta', x.ultima_venta)), '[]'::json)
      FROM (SELECT * FROM con_stock
            WHERE existencia <= 0 OR (minimo > 0 AND existencia <= minimo)
            ORDER BY unidades DESC LIMIT v_lim) x)
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_piezas_criticas(int, int) IS
  'Piezas que se venden y están agotadas o bajo el mínimo. Parte de lo vendido, no del catálogo entero.';

-- ---------------------------------------------------------------------
-- 5. "BÚSCAME LA 1023"
-- ---------------------------------------------------------------------
-- Nadie dice "la factura de venta número 1023 del sistema": dice un número
-- y ya. Así que se busca el mismo número en los cuatro sitios donde puede
-- estar y se devuelve lo que aparezca, diciendo QUÉ es cada cosa.
CREATE OR REPLACE FUNCTION public.mcp_buscar_documento(p_numero text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_n      text := btrim(COALESCE(p_numero, ''));
  v_num    bigint;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;
  IF v_n = '' THEN RAISE EXCEPTION 'Falta el número del documento'; END IF;

  -- facturas.numero es bigint: si lo que dieron trae letras, ni se intenta.
  -- El tope de 18 dígitos no es capricho: sin él, alguien dictando mal un
  -- número largo revienta la función con "bigint out of range" en vez de
  -- recibir "no encontré nada".
  v_num := CASE WHEN v_n ~ '^\d{1,18}$' THEN v_n::bigint ELSE NULL END;

  SELECT json_build_object('buscado', v_n, 'encontrados', COALESCE(json_agg(d), '[]'::json))
  INTO v_out
  FROM (
    SELECT json_build_object(
             'tipo', 'factura', 'numero', f.numero::text,
             'fecha', (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date,
             'cliente', COALESCE(c.nombre, f.manual_cliente_nombre),
             'total', round(COALESCE(f.total, 0), 2),
             'pendiente', round(COALESCE(f.monto_pendiente, 0), 2),
             'estado', f.estado, 'ncf', f.ncf) AS d
    FROM public.facturas f
    LEFT JOIN public.clientes c ON c.id = f.cliente_id
    WHERE f.tenant_id = v_tenant AND v_num IS NOT NULL AND f.numero = v_num

    UNION ALL
    SELECT json_build_object(
             'tipo', 'cotizacion', 'numero', q.numero, 'fecha', q.fecha_cotizacion,
             'cliente', COALESCE(c.nombre, q.manual_cliente_nombre),
             'total', round(COALESCE(q.total_cotizacion, 0), 2),
             'estado', q.estado)
    FROM public.cotizaciones q
    LEFT JOIN public.clientes c ON c.id = q.cliente_id
    WHERE q.tenant_id = v_tenant AND q.numero = v_n

    UNION ALL
    SELECT json_build_object(
             'tipo', 'compra', 'numero', co.numero, 'fecha', co.fecha,
             'suplidor', pr.nombre,
             'total', round(COALESCE(co.total_compra, 0), 2),
             'pendiente', round(COALESCE(co.monto_pendiente, 0), 2),
             'estado', co.estado, 'ncf', co.ncf)
    FROM public.compras co
    LEFT JOIN public.proveedores pr ON pr.id = co.suplidor_id
    WHERE co.tenant_id = v_tenant AND co.numero = v_n

    UNION ALL
    SELECT json_build_object(
             'tipo', 'recibo', 'numero', r.numero, 'fecha', r.fecha,
             'cliente', c.nombre,
             'total', round(COALESCE(r.monto_pagado, 0), 2),
             'estado', CASE WHEN COALESCE(r.anulado, false) THEN 'ANULADO' ELSE 'vigente' END,
             'concepto', r.concepto)
    FROM public.recibos_ingreso r
    LEFT JOIN public.clientes c ON c.id = r.cliente_id
    WHERE r.tenant_id = v_tenant AND r.numero = v_n
    LIMIT 10
  ) t;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_buscar_documento(text) IS
  'Busca un número en facturas, cotizaciones, compras y recibos, y dice qué es cada coincidencia.';

-- ---------------------------------------------------------------------
-- PERMISOS
-- ---------------------------------------------------------------------
-- Igual que las cuatro que ya existían: nunca anon. La empresa la resuelve
-- get_user_tenant() con la sesión de quien pregunta.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.mcp_cartera_cobrar(int, int)',
    'public.mcp_cuentas_pagar(int)',
    'public.mcp_ventas_periodo(date, date)',
    'public.mcp_piezas_criticas(int, int)',
    'public.mcp_buscar_documento(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- QUE SEPA QUE AHORA PUEDE MIRAR
-- ---------------------------------------------------------------------
-- La personalidad de Jarvis lo describe como el que sabe USAR el programa:
-- "casi siempre te buscan porque no saben hacer algo". Con estas cinco
-- herramientas también puede contestar cómo va el negocio, y sin decírselo
-- corre el riesgo de mandar a la pantalla ("eso se ve en Cartera de
-- Clientes, ¿te la abro?") en vez de simplemente contestar el número.
--
-- Se AÑADE, no se reemplaza: el dueño puede haber afinado el texto y ese
-- trabajo no se pisa. El WHERE hace que re-ejecutar el archivo no lo pegue
-- dos veces.
UPDATE public.agente_sistema
SET persona = persona || E'\n\nTAMBIÉN SABES MIRAR EL NEGOCIO\n'
      || E'Puedes consultar quién debe, a quién se le debe, cómo va el mes y qué\n'
      || E'piezas hay que reponer. Cuando te pregunten eso, CONTESTA el número; no\n'
      || E'mandes a la pantalla. Ofrecer abrirla viene después, y solo si hace falta\n'
      || E'ver el detalle.\n\n'
      || E'HABLANDO SE ESCUCHA DISTINTO QUE LEYENDO\n'
      || E'Una lista de diez nombres se lee en dos segundos y se oye en treinta. Si\n'
      || E'te están hablando, di el total y a lo sumo los tres primeros, y ofrece\n'
      || E'abrir la pantalla para el resto. Los montos, redondeados: "cuarenta y dos\n'
      || E'mil y pico" se entiende; "42,317.55" no se sigue de oído.',
    actualizado_en = now()
WHERE id = 1
  AND persona NOT LIKE '%TAMBIÉN SABES MIRAR EL NEGOCIO%';

-- ---------------------------------------------------------------------
-- DE PASO: LAS PROPUESTAS QUE QUEDARON COLGADAS
-- ---------------------------------------------------------------------
-- Hay 156 filas en agente_acciones que dicen 'propuesta' y vencieron el 8
-- de agosto. No engañan a nadie —agente_confirmar_accion vuelve a mirar el
-- reloj antes de ejecutar— pero cualquier conteo de "propuestas
-- pendientes" sale mentiroso.
--
-- Se barre solo: un disparador después de cada inserción. Proponer algo
-- nuevo limpia lo viejo, sin cron ni proceso aparte.
--
-- >>> POR FILA Y NO POR SENTENCIA <<<
-- Por sentencia sería más barato, pero ahí no hay fila y por tanto no hay
-- empresa: el barrido tendría que ser global y una empresa terminaría
-- tocando filas de otra. Con NEW.tenant_id cada quien limpia lo suyo.
CREATE OR REPLACE FUNCTION public._agente_acciones_vencer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.agente_acciones
  SET estado = 'vencida', resuelto_en = now()
  WHERE tenant_id = NEW.tenant_id
    AND estado = 'propuesta'
    AND vence_en < now()
    AND id <> NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS agente_acciones_barrer ON public.agente_acciones;
CREATE TRIGGER agente_acciones_barrer
  AFTER INSERT ON public.agente_acciones
  FOR EACH ROW EXECUTE FUNCTION public._agente_acciones_vencer();

-- Y las que ya estaban colgadas antes de que existiera el disparador.
UPDATE public.agente_acciones
SET estado = 'vencida', resuelto_en = now()
WHERE estado = 'propuesta' AND vence_en < now();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_ojos_del_negocio.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- Estas cinco necesitan SESIÓN: get_user_tenant() sale de auth.uid(). Si se
-- corren desde el editor SQL sin sesión levantan "Sin sesión", y eso es que
-- están bien, no que fallaron. La prueba de verdad es preguntárselo a
-- Jarvis desde la aplicación.
-- =====================================================================
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'mcp\_%'
ORDER BY 1;

SELECT estado, count(*) FROM public.agente_acciones GROUP BY 1 ORDER BY 2 DESC;
