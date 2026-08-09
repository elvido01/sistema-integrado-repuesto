-- =====================================================================
-- Las cotizaciones del agente no aparecían en el módulo
-- ---------------------------------------------------------------------
-- (2026-08-09) Jarvis propuso una cotización, se autorizó en pantalla, se
-- grabó bien —CT-000077, RD$ 1,433.70, con su línea y su ITBIS— y en
-- Gestión de Cotizaciones no estaba. Solo se veían la 76, la 75 y la 74.
--
-- No se perdió: está en la tabla. Lo que pasa es el estado.
--
--   CT-000077   estado = 'PENDIENTE'    <- la escribió el agente
--   CT-000076   estado = 'Pendiente'
--
-- Y la pantalla filtra con .eq('estado', 'Pendiente') — CotizacionPage.jsx.
-- Mayúsculas distintas, comparación exacta, cero filas. Ninguna cotización
-- creada por el agente iba a aparecer jamás, y encima el número de secuencia
-- ya se había consumido, así que en la lista quedaba un salto sin explicación.
--
-- El resto del sistema escribe 'Pendiente'. El agente es el que estaba fuera
-- de norma, así que se corrige el agente y no la pantalla.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._agente_ejecutar_cotizacion(p_tenant uuid, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id    uuid;
  v_num   text;
  v_cli   uuid;
  v_sub   numeric := 0;
  v_itbis numeric := 0;
  l       jsonb;
BEGIN
  IF NULLIF(btrim(p_payload ->> 'cliente_codigo'), '') IS NOT NULL THEN
    SELECT id INTO v_cli FROM public.clientes
    WHERE tenant_id = p_tenant AND codigo = btrim(p_payload ->> 'cliente_codigo') LIMIT 1;
  END IF;

  v_num := public.get_next_cotizacion_numero();

  INSERT INTO public.cotizaciones (
    tenant_id, numero, fecha_cotizacion, fecha_vencimiento, cliente_id,
    manual_cliente_nombre, subtotal, descuento_total, itbis_total,
    total_cotizacion, estado, notas, usuario_id
  ) VALUES (
    p_tenant, v_num, current_date, current_date + 15, v_cli,
    NULLIF(btrim(COALESCE(p_payload ->> 'cliente_nombre', '')), ''),
    -- 'Pendiente', igual que lo escribe el resto del sistema. Con 'PENDIENTE'
    -- la cotización existía pero era invisible en su propio módulo.
    0, 0, 0, 0, 'Pendiente',
    btrim(COALESCE(p_payload ->> 'notas', '') || ' [creada por el agente]'),
    auth.uid()
  ) RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(p_payload -> 'lineas') LOOP
    DECLARE
      v_prod  record;
      v_cant  numeric := GREATEST(COALESCE((l ->> 'cantidad')::numeric, 1), 0.0001);
      v_pu    numeric;
      v_imp   numeric;
      v_iv    numeric;
    BEGIN
      SELECT id, codigo, descripcion, precio, itbis_pct INTO v_prod
      FROM public.productos
      WHERE tenant_id = p_tenant AND codigo = btrim(l ->> 'codigo') LIMIT 1;
      IF v_prod.id IS NULL THEN
        RAISE EXCEPTION 'No existe el producto con código "%"', l ->> 'codigo';
      END IF;

      -- El PRECIO sale del catálogo, no del payload. Si viniera del agente,
      -- una cotización podría salir a un precio inventado aunque en pantalla
      -- se viera el bueno.
      v_pu  := COALESCE(v_prod.precio, 0);
      v_imp := round(v_pu * v_cant, 2);
      v_iv  := round(v_imp * COALESCE(v_prod.itbis_pct, 0), 2);

      INSERT INTO public.cotizaciones_detalle (
        tenant_id, cotizacion_id, producto_id, codigo, descripcion,
        cantidad, precio_unitario, descuento_pct, descuento_valor, itbis_valor, importe
      ) VALUES (
        p_tenant, v_id, v_prod.id, v_prod.codigo, v_prod.descripcion,
        v_cant, v_pu, 0, 0, v_iv, v_imp
      );

      v_sub   := v_sub + v_imp;
      v_itbis := v_itbis + v_iv;
    END;
  END LOOP;

  UPDATE public.cotizaciones
  SET subtotal = v_sub, itbis_total = v_itbis, total_cotizacion = v_sub + v_itbis
  WHERE id = v_id;

  RETURN json_build_object(
    'cotizacion_id', v_id, 'numero', v_num,
    'lineas', jsonb_array_length(COALESCE(p_payload -> 'lineas', '[]'::jsonb)),
    'total', v_sub + v_itbis);
END $$;

REVOKE EXECUTE ON FUNCTION public._agente_ejecutar_cotizacion(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- RESCATAR LAS QUE YA SE CREARON INVISIBLES
-- ------------------------------------------------------------
-- CT-000077 y cualquier otra del agente que haya quedado escondida. No se
-- tocan las anuladas ni las ya facturadas: solo se normaliza el texto.
UPDATE public.cotizaciones
SET estado = 'Pendiente'
WHERE estado = 'PENDIENTE';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('agente_cotizacion_estado_visible.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- CT-000077 debe aparecer ahora en Gestión de Cotizaciones:
SELECT numero, fecha_cotizacion, manual_cliente_nombre, total_cotizacion, estado
FROM public.cotizaciones
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 5;

-- Y que no quede ninguna con el estado en mayúsculas:
SELECT COUNT(*) AS invisibles FROM public.cotizaciones WHERE estado = 'PENDIENTE';
