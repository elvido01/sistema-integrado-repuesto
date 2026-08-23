-- =====================================================================
-- Lo que no trajo entra solo en el borrador
-- ---------------------------------------------------------------------
-- (2026-08-23) Ayer se puso un boton que abria la lista de lo que el
-- suplidor no habia traido. El dueno lo miro y dijo lo obvio: "un boton y
-- una lista es mas trabajo para mi".
--
-- Tiene razon. La informacion correcta entregada como una tarea nueva no
-- es una mejora: si hay que acordarse de abrirla y darle a un boton, se
-- olvida igual que se olvidaba el "marcar como no suplido".
--
-- >>> LA REGLA <<<
-- Cuando el suplidor viene y se le digita la compra, sus ordenes vencidas
-- se cierran (eso ya pasaba) y AHORA, ademas, lo que quedo debiendo cae
-- solo en su borrador — el mismo donde se juntan los productos entre
-- visita y visita. Si el producto ya estaba en el borrador se le SUMA la
-- cantidad; si no estaba, entra como linea nueva.
--
-- Las lineas asi entran marcadas `pendiente_ult_compra` en la columna
-- Decision, para que se distingan de un vistazo de lo que pidio el
-- calculo normal. Cuentan como pedidas: van en la orden.
--
-- >>> POR QUE NO SE DUPLICA <<<
-- Cada linea de origen se sella con `reclamada_at` y la orden donde
-- entro. Una linea reclamada no se vuelve a reclamar nunca, aunque esto
-- corra mil veces. Es lo que permite llamarlo sin miedo.
--
-- >>> LO QUE NO ENTRA <<<
-- Solo se reclama lo que se CIERRA, o sea lo que ya paso su ventana
-- (entrega + un ciclo de compras). Una linea de hace tres dias sigue
-- viniendo en camino de verdad y no hay nada que reclamar todavia.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS reclamada_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reclamada_en_orden  uuid REFERENCES public.ordenes_compra(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ordenes_compra_detalle.reclamada_at IS
  'Cuando lo que no llego de esta linea se volvio a pedir. El sello que evita reclamarla dos veces.';

CREATE INDEX IF NOT EXISTS ix_ocd_sin_reclamar
  ON public.ordenes_compra_detalle (orden_compra_id)
  WHERE reclamada_at IS NULL;

-- ------------------------------------------------------------
-- Meter una cantidad en el borrador del suplidor
-- ------------------------------------------------------------
-- Devuelve el id de la orden borrador donde quedo. Si el producto ya
-- estaba, suma; si no, agrega. Si el suplidor no tiene borrador, lo crea.
CREATE OR REPLACE FUNCTION public.poner_en_borrador_del_suplidor(
  p_suplidor_id uuid,
  p_producto_id uuid,
  p_cantidad    numeric,
  p_decision    text DEFAULT 'pendiente_ult_compra',
  p_motivo      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_orden   uuid;
  v_det     record;
  v_prod    record;
  v_numero  text;
  v_cant    numeric := GREATEST(1, CEIL(COALESCE(p_cantidad, 1)));
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT id, codigo, descripcion, costo, precio, itbis_pct
    INTO v_prod
  FROM public.productos
  WHERE id = p_producto_id AND tenant_id = v_tenant;
  IF v_prod.id IS NULL THEN RETURN NULL; END IF;

  -- El borrador mas reciente del suplidor, que es la canasta viva.
  SELECT id INTO v_orden
  FROM public.ordenes_compra
  WHERE tenant_id = v_tenant AND suplidor_id = p_suplidor_id
    AND COALESCE(estado, 'Pendiente') = 'Pendiente'
  ORDER BY fecha_orden DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_orden IS NULL THEN
    SELECT public.get_next_orden_compra_numero() INTO v_numero;
    INSERT INTO public.ordenes_compra (
      tenant_id, numero, suplidor_id, fecha_orden, fecha_vencimiento,
      estado, aplicar_itbis, itbis_incluido, notas
    ) VALUES (
      v_tenant, v_numero, p_suplidor_id, CURRENT_DATE, CURRENT_DATE + 30,
      'Pendiente', true, true, 'Abierta automaticamente con lo que el suplidor no trajo.'
    ) RETURNING id INTO v_orden;
  END IF;

  SELECT id, cantidad, cantidad_pedida INTO v_det
  FROM public.ordenes_compra_detalle
  WHERE orden_compra_id = v_orden AND producto_id = p_producto_id
  LIMIT 1;

  IF v_det.id IS NOT NULL THEN
    -- Ya estaba pedido: se le suma lo que falto, no se crea otra linea.
    UPDATE public.ordenes_compra_detalle
    SET cantidad       = COALESCE(cantidad, 0) + v_cant,
        decision_estado = COALESCE(p_decision, decision_estado),
        decision_motivo = COALESCE(p_motivo, decision_motivo)
    WHERE id = v_det.id;
  ELSE
    INSERT INTO public.ordenes_compra_detalle (
      tenant_id, orden_compra_id, producto_id, codigo, descripcion,
      cantidad, unidad, precio, descuento_pct, itbis_pct, importe,
      decision_estado, decision_motivo
    ) VALUES (
      v_tenant, v_orden, v_prod.id, v_prod.codigo, v_prod.descripcion,
      v_cant, 'UND', COALESCE(NULLIF(v_prod.costo, 0), v_prod.precio, 0),
      0, COALESCE(v_prod.itbis_pct, 0), 0,
      COALESCE(p_decision, 'pendiente_ult_compra'), p_motivo
    );
  END IF;

  PERFORM public._recalcular_totales_orden_compra(v_orden);
  RETURN v_orden;
END $fn$;

GRANT EXECUTE ON FUNCTION public.poner_en_borrador_del_suplidor(uuid, uuid, numeric, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- El cierre, ahora devolviendo al borrador lo que no vino
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(p_suplidor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_dias       int;
  v_ordenes    int := 0;
  v_lineas     int := 0;
  v_unidades   numeric := 0;
  v_reclamadas int := 0;
  v_nums       text[] := ARRAY[]::text[];
  v_borrador   uuid;
  r            record;
  d            record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  v_dias := public.dias_caducidad_orden(p_suplidor_id);

  FOR r IN
    SELECT oc.id, oc.numero
    FROM public.ordenes_compra oc
    WHERE oc.tenant_id = v_tenant
      AND oc.suplidor_id = p_suplidor_id
      -- Solo ordenes YA PEDIDAS. El borrador no se cierra nunca: es la
      -- canasta donde se juntan los productos entre visita y visita.
      AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND oc.fecha_orden < CURRENT_DATE - v_dias
      AND EXISTS (SELECT 1 FROM public.ordenes_compra_detalle x
                   WHERE x.orden_compra_id = oc.id
                     AND COALESCE(x.estado_linea, 'pendiente') IN ('pendiente', 'parcial'))
  LOOP
    -- Linea por linea: primero se devuelve al borrador lo que falto, y
    -- despues se cierra. En ese orden, porque al cerrar la cantidad
    -- pendiente se pone en cero y ya no habria que devolver.
    FOR d IN
      SELECT x.id, x.producto_id,
             GREATEST(COALESCE(x.cantidad_pendiente,
               COALESCE(x.cantidad_pedida, x.cantidad, 0) - COALESCE(x.cantidad_recibida, 0)), 0) AS falto
      FROM public.ordenes_compra_detalle x
      WHERE x.orden_compra_id = r.id
        AND COALESCE(x.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
        AND x.reclamada_at IS NULL
    LOOP
      IF d.falto > 0 AND d.producto_id IS NOT NULL THEN
        v_borrador := public.poner_en_borrador_del_suplidor(
          p_suplidor_id, d.producto_id, d.falto,
          'pendiente_ult_compra',
          format('Quedo debiendo %s und. de la orden %s', ROUND(d.falto, 0), r.numero));

        IF v_borrador IS NOT NULL THEN
          UPDATE public.ordenes_compra_detalle
          SET reclamada_at = NOW(), reclamada_en_orden = v_borrador
          WHERE id = d.id;
          v_reclamadas := v_reclamadas + 1;
        END IF;
      END IF;

      v_lineas   := v_lineas + 1;
      v_unidades := v_unidades + COALESCE(d.falto, 0);
    END LOOP;

    UPDATE public.ordenes_compra_detalle x
    SET cantidad_pedida    = COALESCE(x.cantidad_pedida, x.cantidad, 0),
        cantidad_recibida  = COALESCE(x.cantidad_recibida, 0),
        cantidad_pendiente = 0,
        estado_linea       = 'cancelada',
        cerrada_motivo     = 'no_suplida_vencida',
        cerrada_at         = NOW()
    WHERE x.orden_compra_id = r.id
      AND COALESCE(x.estado_linea, 'pendiente') IN ('pendiente', 'parcial');

    PERFORM public.recalcular_estado_recepcion_orden(r.id);

    v_ordenes := v_ordenes + 1;
    v_nums    := array_append(v_nums, r.numero);
  END LOOP;

  RETURN json_build_object(
    'ok', true, 'ordenes', v_ordenes, 'lineas', v_lineas,
    'unidades', v_unidades, 'reclamadas', v_reclamadas,
    'numeros', v_nums, 'ventana_dias', v_dias);
END $fn$;

GRANT EXECUTE ON FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('lo_que_no_trajo_entra_solo_al_borrador.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No se cierra ni se reclama nada aqui: eso pasa cuando entra la compra
-- del suplidor. Solo se comprueba que las piezas existan.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordenes_compra_detalle'
      AND column_name IN ('reclamada_at','reclamada_en_orden'))            AS columnas_nuevas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='poner_en_borrador_del_suplidor') AS existe_poner,
  -- Cuanto se devolveria al borrador cuando cada suplidor traiga algo
  (SELECT count(*) FROM public.ordenes_compra_detalle d
     JOIN public.ordenes_compra oc ON oc.id=d.orden_compra_id
    WHERE oc.tenant_id='00000000-0000-0000-0000-000000000001'
      AND COALESCE(oc.estado,'Pendiente') IN ('Enviada','Parcial')
      AND COALESCE(d.estado_linea,'pendiente') IN ('pendiente','parcial')
      AND d.reclamada_at IS NULL
      AND oc.fecha_orden < CURRENT_DATE - public.dias_caducidad_orden(oc.suplidor_id)) AS lineas_por_reclamar;
