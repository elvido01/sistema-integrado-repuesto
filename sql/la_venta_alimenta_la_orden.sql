-- =====================================================================
-- La venta alimenta la orden de compra
-- ---------------------------------------------------------------------
-- (2026-08-24) El dueno lo dijo asi: "la mayoria de ordenes de compra son
-- ordenadas desde la venta". Cierra el circulo: se vende, se acaba, se
-- vuelve a comprar. El eslabon que faltaba es el del medio — que el
-- sistema se entere en el momento en que se acaba, y no tres semanas
-- despues cuando un cliente lo pide y no hay.
--
-- >>> LO QUE YA EXISTIA Y NO SE USA <<<
-- `solicitudes_clientes` es exactamente un modulo de captura de demanda,
-- y esta enganchado a la orden de compra desde hace tiempo: tiene
-- orden_compra_id, purchase_order_added_at, hasta el aviso al cliente
-- cuando la pieza llega.
--
-- Se ha usado DOS VECES en toda su historia, las dos el 18 de julio, y
-- las dos siguen abiertas.
--
-- No es que el modulo este mal: es que pide que alguien pare, abra otra
-- pantalla y escriba, con el cliente delante del mostrador. Construir
-- otra via de captura seria repetir el error por tercera vez.
--
-- >>> LA SENAL QUE SI SE GENERA SOLA <<<
-- Vender. Nadie tiene que acordarse de nada: cuando la ultima unidad sale
-- por la puerta, el kardex lo escribe. Eso es lo que se aprovecha.
--
-- >>> POR QUE EN EL KARDEX Y NO EN LA FACTURA <<<
-- Se comprobo: NADA en facturas_detalle escribe el movimiento de
-- inventario — se crea por otro camino. Un trigger en la factura veria el
-- stock sin descontar todavia y no dispararia nunca, o peor, dispararia
-- mal. `inventario_movimientos` es donde el stock cambia de verdad, y
-- ademas atrapa la salida venga por donde venga.
--
-- >>> POR QUE NO INUNDA <<<
-- Se midio antes de escribir el trigger. En 30 dias:
--
--   98 productos distintos se quedaron en cero vendiendo
--   93 de ellos tienen suplidor
--   88 YA estaban en una orden abierta   <- el flujo actual ya los atrapa
--    5 se escapaban de verdad
--
-- Cinco al mes. Ese es el tamano real del agujero, y son exactamente los
-- del caso del cilindro: los que se quedan invisibles semanas.
--
-- >>> NO SE METE DONDE NO LE LLAMAN <<<
-- Si el producto ya esta en una orden abierta puesto por el calculo de
-- reposicion, NO SE TOCA. Ese calculo ya decidio una cantidad mirando la
-- rotacion, y sumarle una unidad por cada venta seria pedir de mas. Solo
-- suma sobre sus PROPIAS lineas (`agotado_en_venta`).
--
-- >>> UNA VENTA NUNCA PUEDE FALLAR POR ESTO <<<
-- Todo va dentro de un BEGIN/EXCEPTION. Si algo revienta, la venta se
-- graba igual y el fallo queda ANOTADO — no tragado. Un centinela lo
-- vigila, porque un fallo en silencio en el camino de la venta es
-- justamente la clase de problema que costo tiempo y dinero descubrir.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- 1. La base tiene que aceptar la decision nueva
-- ------------------------------------------------------------
-- (Ya paso una vez con `pendiente_ult_compra`: instalar no falla, falla
-- el dia que se usa. Se hace primero y a proposito.)
ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_decision_estado;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_decision_estado
  CHECK (decision_estado = ANY (ARRAY[
    'pedir_hoy'::text,
    'pedido'::text,
    'no_disponible'::text,
    'pospuesto_presupuesto'::text,
    'poca_rotacion'::text,
    'sustituido'::text,
    'pendiente_ult_compra'::text,
    -- Se acabo vendiendolo. No lo pidio el calculo: lo pidio el mostrador.
    'agotado_en_venta'::text
  ]));

-- ------------------------------------------------------------
-- 2. El interruptor
-- ------------------------------------------------------------
-- Esto toca el camino de la venta, que es lo mas critico que hay. Un
-- flag permite apagarlo en un segundo desde la base, sin desplegar nada.
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_venta_alimenta_orden boolean NOT NULL DEFAULT false;

UPDATE public.config_empresa
SET feat_venta_alimenta_orden = true
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 3. Donde se anotan los fallos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venta_orden_fallos (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  producto_id  uuid,
  movimiento   uuid,
  referencia   text,
  error        text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venta_orden_fallos IS
  'Cuando la venta no pudo alimentar la orden. La venta se grabo igual; esto es para que el fallo no se quede en silencio.';

ALTER TABLE public.venta_orden_fallos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fallos_propios ON public.venta_orden_fallos;
CREATE POLICY fallos_propios ON public.venta_orden_fallos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
GRANT SELECT ON public.venta_orden_fallos TO authenticated;

-- ------------------------------------------------------------
-- 4. El borrador, ahora con la empresa dicha en voz alta
-- ------------------------------------------------------------
-- La version de ayer sacaba el tenant de get_user_tenant(). Desde un
-- trigger eso depende de quien este ejecutando, y el camino de la venta
-- no es sitio para depender de eso. Se pasa explicito.
-- La firma vieja se queda como envoltorio: lo de ayer sigue funcionando.
CREATE OR REPLACE FUNCTION public.poner_en_borrador_del_suplidor(
  p_tenant_id   uuid,
  p_suplidor_id uuid,
  p_producto_id uuid,
  p_cantidad    numeric,
  p_decision    text,
  p_motivo      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := p_tenant_id;
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
      'Pendiente', true, true, 'Abierta automaticamente.'
    ) RETURNING id INTO v_orden;
  END IF;

  SELECT id, cantidad, cantidad_pedida INTO v_det
  FROM public.ordenes_compra_detalle
  WHERE orden_compra_id = v_orden AND producto_id = p_producto_id
  LIMIT 1;

  IF v_det.id IS NOT NULL THEN
    UPDATE public.ordenes_compra_detalle
    SET cantidad        = COALESCE(cantidad, 0) + v_cant,
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

GRANT EXECUTE ON FUNCTION public.poner_en_borrador_del_suplidor(uuid, uuid, uuid, numeric, text, text)
  TO authenticated, service_role;

-- El envoltorio de ayer, para no romper a quien ya lo llama.
CREATE OR REPLACE FUNCTION public.poner_en_borrador_del_suplidor(
  p_suplidor_id uuid,
  p_producto_id uuid,
  p_cantidad    numeric,
  p_decision    text DEFAULT 'pendiente_ult_compra',
  p_motivo      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.poner_en_borrador_del_suplidor(
    public.get_user_tenant(), p_suplidor_id, p_producto_id,
    p_cantidad, p_decision, p_motivo);
$fn$;

GRANT EXECUTE ON FUNCTION public.poner_en_borrador_del_suplidor(uuid, uuid, numeric, text, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. El eslabon que faltaba
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_venta_alimenta_orden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_stock    numeric;
  v_suplidor uuid;
  v_codigo   text;
  v_ajeno    boolean;
BEGIN
  BEGIN
    -- Solo donde este encendido.
    IF NOT EXISTS (SELECT 1 FROM public.config_empresa ce
                    WHERE ce.tenant_id = NEW.tenant_id
                      AND COALESCE(ce.feat_venta_alimenta_orden, false)) THEN
      RETURN NEW;
    END IF;

    -- Todavia queda: no hay nada que reponer.
    v_stock := public.get_stock_actual(NEW.producto_id);
    IF v_stock > 0 THEN RETURN NEW; END IF;

    SELECT p.suplidor_id, p.codigo INTO v_suplidor, v_codigo
    FROM public.productos p
    WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
      AND COALESCE(p.activo, true);

    -- Sin suplidor no hay borrador donde ponerlo. No es un fallo: es el
    -- centinela `sin_suplidor` el que se encarga de eso.
    IF v_suplidor IS NULL THEN RETURN NEW; END IF;

    -- Si ya esta pedido por otro motivo, no se toca. El calculo de
    -- reposicion ya decidio una cantidad mirando la rotacion.
    SELECT EXISTS (
      SELECT 1 FROM public.ordenes_compra_detalle d
      JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
      WHERE oc.tenant_id = NEW.tenant_id
        AND d.producto_id = NEW.producto_id
        AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
        AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
        AND COALESCE(d.decision_estado, '') <> 'agotado_en_venta'
    ) INTO v_ajeno;
    IF v_ajeno THEN RETURN NEW; END IF;

    PERFORM public.poner_en_borrador_del_suplidor(
      NEW.tenant_id, v_suplidor, NEW.producto_id, abs(NEW.cantidad),
      'agotado_en_venta',
      format('Se acabo al vender %s', COALESCE(NEW.referencia_doc, 'una factura')));

  EXCEPTION WHEN OTHERS THEN
    -- LA VENTA MANDA. Pase lo que pase aqui, la factura se graba.
    BEGIN
      INSERT INTO public.venta_orden_fallos
        (tenant_id, producto_id, movimiento, referencia, error)
      VALUES (NEW.tenant_id, NEW.producto_id, NEW.id, NEW.referencia_doc, SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;   -- ni anotando el fallo se tumba una venta
    END;
  END;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_venta_alimenta_orden ON public.inventario_movimientos;
CREATE TRIGGER trg_venta_alimenta_orden
  AFTER INSERT ON public.inventario_movimientos
  FOR EACH ROW
  WHEN (NEW.cantidad < 0
        AND NEW.producto_id IS NOT NULL
        AND NEW.legacy_id IS NULL      -- lo migrado no dispara nada
        AND NEW.tipo::text = 'SALIDA') -- un AJUSTE es una correccion, no demanda
  EXECUTE FUNCTION public.fn_venta_alimenta_orden();

-- ------------------------------------------------------------
-- 6. El centinela que vigila que esto no falle callado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.centinela_venta_no_alimento(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    to_char(f.creado_en AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD'),
    format('%s venta(s) no pudieron entrar en la orden', count(*)),
    format('El %s hubo %s venta(s) que dejaron el producto en cero y no se pudieron pasar al borrador del suplidor. La factura se grabo bien; lo que fallo fue la reposicion. Ultimo error: %s',
           to_char(f.creado_en AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY'),
           count(*), left(max(f.error), 150)),
    NULL::numeric,
    jsonb_build_object('dia', (f.creado_en AT TIME ZONE 'America/Santo_Domingo')::date,
                       'fallos', count(*))
  FROM public.venta_orden_fallos f
  WHERE f.tenant_id = p_tenant_id
    AND f.creado_en >= now() - interval '14 days'
  GROUP BY (f.creado_en AT TIME ZONE 'America/Santo_Domingo')::date,
           to_char(f.creado_en AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD'),
           to_char(f.creado_en AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY');
$fn$;

INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('venta_no_alimento', 'La venta no pudo pedir la reposicion',
   'autochequeo', 'rojo', 'centinela_venta_no_alimento',
   'Ventas que dejaron el producto en cero y no llegaron al borrador del suplidor.', 3)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_venta_alimenta_la_orden.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_venta_alimenta_orden')   AS trigger_puesto,
  (SELECT pg_get_constraintdef(oid) LIKE '%agotado_en_venta%' FROM pg_constraint
    WHERE conrelid = 'public.ordenes_compra_detalle'::regclass
      AND conname = 'chk_ordenes_compra_detalle_decision_estado')               AS acepta_la_decision,
  (SELECT feat_venta_alimenta_orden FROM public.config_empresa
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1)           AS encendido_en_morla,
  (SELECT count(*) FROM public.venta_orden_fallos)                              AS fallos;
