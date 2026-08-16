-- =====================================================================
-- "MANDA LA COTIZACIÓN DE MIKI A VENTAS"
-- ---------------------------------------------------------------------
-- (2026-08-16) Jarvis cotizó bien a Miki (CT-000089) y a Juan Pablo
-- (CT-000090). Al pedirle "manda la cotización de Miki a ventas y factúrala"
-- contestó: "he preparado la venta de la cotización CT-000079 por un total de
-- RD$ 177".
--
-- Ese número no salió de ningún lado: se lo inventó. Y coló porque CT-000079
-- EXISTE de verdad, con ese total exacto — así que la comprobación del
-- servidor la dio por buena.
--
-- >>> LA CAUSA NO ERA EL MODELO, ERA UNA HERRAMIENTA QUE NO ESTABA <<<
-- La gente no dice "CT-000089", dice "la de Miki". Y para eso Jarvis no tenía
-- NADA: buscar_documento pide el número exacto, y no hay forma de llegar a
-- una cotización por el nombre del cliente. Puesto a elegir entre no contestar
-- e inventar un número, inventó.
--
-- Un modelo al que le falta el camino correcto no se queda quieto: se inventa
-- uno. Por eso este arreglo es una herramienta y no otra regla de prompt.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mcp_buscar_cotizacion(
  p_busqueda text DEFAULT NULL, p_limite int DEFAULT 8
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_b      text := public._sin_tildes(btrim(COALESCE(p_busqueda, '')));
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limite, 8), 20));
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión: no se pudo determinar la empresa'; END IF;

  SELECT json_build_object('busqueda', p_busqueda, 'cotizaciones', COALESCE(json_agg(x), '[]'::json))
  INTO v_out
  FROM (
    SELECT q.numero,
           q.fecha_cotizacion AS fecha,
           -- El nombre puede estar en el cliente registrado o escrito a mano;
           -- las del agente casi siempre son a mano.
           COALESCE(c.nombre, q.manual_cliente_nombre, 'Sin cliente') AS cliente,
           round(COALESCE(q.total_cotizacion, 0), 2) AS total,
           q.estado
    FROM public.cotizaciones q
    LEFT JOIN public.clientes c ON c.id = q.cliente_id AND c.tenant_id = v_tenant
    WHERE q.tenant_id = v_tenant
      -- Las ya facturadas o anuladas no se ofrecen: pedir facturar algo que ya
      -- se facturó es el error que hay que hacer imposible, no advertir.
      AND lower(COALESCE(q.estado, '')) NOT IN ('facturada', 'anulada')
      AND (
        v_b = ''
        OR public._sin_tildes(q.numero) LIKE '%' || v_b || '%'
        OR public._sin_tildes(COALESCE(c.nombre, '')) LIKE '%' || v_b || '%'
        OR public._sin_tildes(COALESCE(q.manual_cliente_nombre, '')) LIKE '%' || v_b || '%'
      )
    ORDER BY q.fecha_cotizacion DESC, q.numero DESC
    LIMIT v_lim
  ) x;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.mcp_buscar_cotizacion(text, int) IS
  'Cotizaciones pendientes, por nombre de cliente o por número. Sin búsqueda, las últimas.';

REVOKE EXECUTE ON FUNCTION public.mcp_buscar_cotizacion(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mcp_buscar_cotizacion(text, int) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_buscar_cotizacion.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación (necesita sesión; desde el editor SQL da "Sin sesión", y eso
-- significa que está bien):
SELECT proname FROM pg_proc WHERE proname = 'mcp_buscar_cotizacion';
