-- =====================================================================
-- EL PRECIO YA TRAE EL ITBIS DENTRO
-- ---------------------------------------------------------------------
-- (2026-08-16) Jarvis cotizó un tanque de gasolina y anunció "Cotización
-- CT-000086 · RD$ 11,800". El documento decía RD$ 10,000. El precio del
-- catálogo es 10,000.
--
-- No era un fallo de pantalla: era el agente cobrando el ITBIS dos veces.
--
-- >>> LA REGLA DE LA CASA <<<
-- En MotoFlow el precio del catálogo ES lo que paga el cliente, con el
-- ITBIS ya dentro. El impuesto no se suma: se DESPEJA, dividiendo. Así lo
-- hace el módulo de cotizaciones desde siempre
-- (src/components/cotizaciones/CotizacionFormModal.jsx):
--
--     const baseImponible = importeFinal / (1 + itbis_pct);
--     const itemItbis     = importeFinal - baseImponible;
--
-- Se comprueba en cualquier cotización hecha a mano. CT-000085, de una sola
-- línea:  precio 2,200.01  ·  subtotal 1,864.42  ·  ITBIS 335.59
--         2,200.01 / 1.18 = 1,864.42  ✓
--
-- El ejecutor del agente hacía justo lo contrario:
--
--     v_iv  := round(v_imp * itbis_pct, 2);      -- 10,000 × 0.18 = 1,800
--     total  = v_sub + v_itbis                   -- 11,800
--
-- >>> POR QUÉ IMPORTA MÁS DE LO QUE PARECE <<<
-- El número inflado no se quedó en el chat. El `itbis_valor` equivocado se
-- guardó en la línea, y cuando alguien abrió esa cotización para editarla,
-- el modal dedujo la tasa al revés desde ese valor:
--
--     itbis_pct = itbis_valor / (importe - itbis_valor) = 1800 / 8200 = 0.2195
--
-- y volvió a grabar con un ITBIS del 21.95%. Una cifra mal calculada por el
-- agente terminó inventándole al sistema una tasa de impuesto que no existe.
--
-- >>> QUÉ SE CAMBIA <<<
-- Solo la aritmética de _agente_ejecutar_cotizacion. El precio sigue
-- saliendo del catálogo y no del payload — eso ya estaba bien y es lo que
-- impide que el agente cotice a un precio inventado.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

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
  v_sub   numeric := 0;   -- base imponible: lo que queda al quitarle el ITBIS
  v_itbis numeric := 0;   -- el impuesto contenido en el precio
  v_total numeric := 0;   -- lo que paga el cliente = suma de los importes
  l       jsonb;
BEGIN
  IF jsonb_array_length(COALESCE(p_payload -> 'lineas', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'La cotización no tiene líneas';
  END IF;

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
      v_pct   numeric;
      v_pu    numeric;
      v_imp   numeric;
      v_base  numeric;
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

      -- Algunas filas viejas guardan la tasa como 18 en vez de 0.18. Se
      -- normaliza igual que normalizeTaxRate() en src/lib/taxUtils.js: sin
      -- esto, un 18 daría una base de importe/19 y un ITBIS del 94%.
      v_pct := COALESCE(v_prod.itbis_pct, 0);
      IF v_pct > 1 THEN v_pct := v_pct / 100; END IF;

      -- Aquí está el arreglo: el ITBIS se DESPEJA del precio, no se suma.
      v_base := round(v_imp / (1 + v_pct), 2);
      v_iv   := round(v_imp - v_base, 2);

      INSERT INTO public.cotizaciones_detalle (
        tenant_id, cotizacion_id, producto_id, codigo, descripcion,
        cantidad, precio_unitario, descuento_pct, descuento_valor, itbis_valor, importe
      ) VALUES (
        p_tenant, v_id, v_prod.id, v_prod.codigo, v_prod.descripcion,
        v_cant, v_pu, 0, 0, v_iv, v_imp
      );

      v_sub   := v_sub + v_base;
      v_itbis := v_itbis + v_iv;
      v_total := v_total + v_imp;
    END;
  END LOOP;

  UPDATE public.cotizaciones
  SET subtotal = v_sub, itbis_total = v_itbis, total_cotizacion = v_total
  WHERE id = v_id;

  -- 'total' es lo que el agente le dice a la persona en el chat
  -- (JarvisAdminAssistant.jsx: "Listo. Cotización X · RD$ ..."). Tiene que
  -- ser lo mismo que el documento, o el agente queda anunciando un precio
  -- que la cotización no dice.
  RETURN json_build_object(
    'cotizacion_id', v_id, 'numero', v_num,
    'lineas', jsonb_array_length(COALESCE(p_payload -> 'lineas', '[]'::jsonb)),
    'subtotal', v_sub, 'itbis', v_itbis, 'total', v_total);
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('agente_cotizacion_itbis_incluido.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- LO QUE QUEDÓ MAL ESCRITO ANTES DE ESTE ARREGLO
-- ---------------------------------------------------------------------
-- Esto NO corrige nada: solo enseña qué cotizaciones tienen el ITBIS mal
-- repartido, para decidir a mano. El total que paga el cliente puede estar
-- bien y el reparto interno mal, que es justo el caso de CT-000086.
-- =====================================================================
SELECT c.numero, c.fecha_cotizacion,
       c.subtotal, c.itbis_total, c.total_cotizacion,
       round(c.total_cotizacion - c.subtotal - c.itbis_total, 2) AS descuadre,
       round(c.itbis_total / NULLIF(c.subtotal, 0) * 100, 2)     AS tasa_implicita_pct
FROM public.cotizaciones c
WHERE c.total_cotizacion > 0
  AND round(c.itbis_total / NULLIF(c.subtotal, 0) * 100, 2) NOT IN (0, 8, 16, 18)
ORDER BY c.fecha_cotizacion DESC
LIMIT 20;
