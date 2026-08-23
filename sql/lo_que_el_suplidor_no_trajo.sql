-- =====================================================================
-- Lo que el suplidor no trajo
-- ---------------------------------------------------------------------
-- (2026-08-23) Ayer se hizo que las ordenes se cierren solas cuando el
-- suplidor viene y trae lo que trae. Bien — pero al cerrarlas se pierde
-- la conversacion mas util del negocio: "de lo que te pedi, esto nunca me
-- lo trajiste".
--
-- Hay 453 lineas pedidas sin constancia de que llegaran. Ese dato solo
-- sirve en un momento exacto: cuando el suplidor esta al frente. Y hoy no
-- esta a mano en ningun sitio.
--
-- >>> LO QUE SE PIERDE Y LO QUE NO <<<
-- Al cerrar una linea se pone cantidad_pendiente = 0, pero cantidad_pedida
-- y cantidad_recibida se conservan, asi que "cuanto falto" se sigue
-- pudiendo calcular. Lo que SI se perdia es el POR QUE: una linea
-- 'cancelada' puede ser "el suplidor no lo trajo" o "decidi no comprarlo",
-- y para reclamar no es lo mismo. Aqui se guarda el motivo y la fecha.
--
-- Las 8 lineas ya canceladas de antes quedan sin motivo: se cerraron por
-- otro camino, antes de que esto existiera. No se les inventa uno.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS cerrada_motivo text,
  ADD COLUMN IF NOT EXISTS cerrada_at     timestamptz;

COMMENT ON COLUMN public.ordenes_compra_detalle.cerrada_motivo IS
  'Por que se cerro la linea sin recibirla: no_suplida_manual (alguien la marco) o no_suplida_vencida (vencio su ventana al entrar una compra del suplidor).';

CREATE INDEX IF NOT EXISTS ix_ocd_cerrada_motivo
  ON public.ordenes_compra_detalle (cerrada_motivo)
  WHERE cerrada_motivo IS NOT NULL;

-- ------------------------------------------------------------
-- El boton manual, ahora dejando rastro
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_linea_orden_compra_no_suplida(p_detalle_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_orden_id UUID;
  v_estado TEXT;
BEGIN
  SELECT orden_compra_id INTO v_orden_id
  FROM public.ordenes_compra_detalle WHERE id = p_detalle_id;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la linea de orden %', p_detalle_id;
  END IF;

  UPDATE public.ordenes_compra_detalle
  SET cantidad_pedida    = COALESCE(cantidad_pedida, cantidad, 0),
      cantidad_recibida  = COALESCE(cantidad_recibida, 0),
      cantidad_pendiente = 0,
      estado_linea       = 'cancelada',
      cerrada_motivo     = 'no_suplida_manual',
      cerrada_at         = NOW()
  WHERE id = p_detalle_id
    AND COALESCE(estado_linea, 'pendiente') IN ('pendiente', 'parcial');

  v_estado := public.recalcular_estado_recepcion_orden(v_orden_id);
  RETURN v_estado;
END $fn$;

GRANT EXECUTE ON FUNCTION public.cancelar_linea_orden_compra_no_suplida(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- El cierre automatico, idem
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(p_suplidor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_dias     int;
  v_ordenes  int := 0;
  v_lineas   int := 0;
  v_unidades numeric := 0;
  v_nums     text[] := ARRAY[]::text[];
  v_n        int;
  v_u        numeric;
  r          record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  v_dias := public.dias_caducidad_orden(p_suplidor_id);

  FOR r IN
    SELECT oc.id, oc.numero
    FROM public.ordenes_compra oc
    WHERE oc.tenant_id = v_tenant
      AND oc.suplidor_id = p_suplidor_id
      -- Solo ordenes YA PEDIDAS. El borrador es la canasta de trabajo y
      -- no se toca: ahi se juntan los productos entre visita y visita.
      AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND oc.fecha_orden < CURRENT_DATE - v_dias
      AND EXISTS (SELECT 1 FROM public.ordenes_compra_detalle d
                   WHERE d.orden_compra_id = oc.id
                     AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial'))
  LOOP
    SELECT count(*),
           COALESCE(SUM(GREATEST(COALESCE(d.cantidad_pendiente,
             COALESCE(d.cantidad_pedida, d.cantidad, 0) - COALESCE(d.cantidad_recibida, 0)), 0)), 0)
      INTO v_n, v_u
    FROM public.ordenes_compra_detalle d
    WHERE d.orden_compra_id = r.id
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial');

    UPDATE public.ordenes_compra_detalle d
    SET cantidad_pedida    = COALESCE(d.cantidad_pedida, d.cantidad, 0),
        cantidad_recibida  = COALESCE(d.cantidad_recibida, 0),
        cantidad_pendiente = 0,
        estado_linea       = 'cancelada',
        cerrada_motivo     = 'no_suplida_vencida',
        cerrada_at         = NOW()
    WHERE d.orden_compra_id = r.id
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial');

    PERFORM public.recalcular_estado_recepcion_orden(r.id);

    v_ordenes  := v_ordenes + 1;
    v_lineas   := v_lineas + COALESCE(v_n, 0);
    v_unidades := v_unidades + COALESCE(v_u, 0);
    v_nums     := array_append(v_nums, r.numero);
  END LOOP;

  RETURN json_build_object(
    'ok', true, 'ordenes', v_ordenes, 'lineas', v_lineas,
    'unidades', v_unidades, 'numeros', v_nums, 'ventana_dias', v_dias);
END $fn$;

GRANT EXECUTE ON FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- LA CONVERSACION: que le pedi y no me trajo
-- ------------------------------------------------------------
-- Devuelve las dos caras: lo que TODAVIA debe (lineas abiertas) y lo que
-- ya se dio por perdido (cerradas sin recibir). Las dos importan cuando lo
-- tienes al frente: una es reclamo, la otra es historial.
CREATE OR REPLACE FUNCTION public.get_no_suplido_por_suplidor(
  p_suplidor_id uuid,
  p_dias        integer DEFAULT 365
)
RETURNS TABLE(
  detalle_id  uuid,
  producto_id uuid,
  codigo      text,
  descripcion text,
  orden       text,
  fecha_orden date,
  dias        integer,
  pedida      numeric,
  recibida    numeric,
  falto       numeric,
  costo       numeric,
  importe     numeric,
  itbis_pct   numeric,
  situacion   text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    d.id,
    d.producto_id,
    COALESCE(d.codigo, p.codigo)           AS codigo,
    COALESCE(d.descripcion, p.descripcion) AS descripcion,
    oc.numero                              AS orden,
    oc.fecha_orden::date,
    (CURRENT_DATE - oc.fecha_orden::date)::int AS dias,
    COALESCE(d.cantidad_pedida, d.cantidad, 0)  AS pedida,
    COALESCE(d.cantidad_recibida, 0)            AS recibida,
    GREATEST(COALESCE(d.cantidad_pedida, d.cantidad, 0) - COALESCE(d.cantidad_recibida, 0), 0) AS falto,
    COALESCE(d.precio, p.costo, 0)              AS costo,
    GREATEST(COALESCE(d.cantidad_pedida, d.cantidad, 0) - COALESCE(d.cantidad_recibida, 0), 0)
      * COALESCE(d.precio, p.costo, 0)          AS importe,
    COALESCE(d.itbis_pct, p.itbis_pct, 0)       AS itbis_pct,
    CASE WHEN COALESCE(d.estado_linea, 'pendiente') = 'cancelada'
         THEN 'cerrada' ELSE 'pendiente' END    AS situacion
  FROM public.ordenes_compra_detalle d
  JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
  LEFT JOIN public.productos p ON p.id = d.producto_id
  WHERE oc.tenant_id = public.get_user_tenant()
    AND oc.suplidor_id = p_suplidor_id
    AND oc.fecha_orden >= CURRENT_DATE - COALESCE(p_dias, 365)
    AND (
      -- Todavia la debe
      (COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
       AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial'))
      OR
      -- Ya se dio por perdida, pero por NO HABERLA TRAIDO. Una linea que
      -- se cancelo porque se decidio no comprarla no es un reclamo.
      (COALESCE(d.estado_linea, '') = 'cancelada'
       AND d.cerrada_motivo LIKE 'no_suplida%')
    )
    AND GREATEST(COALESCE(d.cantidad_pedida, d.cantidad, 0) - COALESCE(d.cantidad_recibida, 0), 0) > 0
  ORDER BY oc.fecha_orden DESC, COALESCE(d.codigo, p.codigo);
$fn$;

GRANT EXECUTE ON FUNCTION public.get_no_suplido_por_suplidor(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('lo_que_el_suplidor_no_trajo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordenes_compra_detalle'
      AND column_name IN ('cerrada_motivo','cerrada_at'))                  AS columnas_nuevas,
  (SELECT count(*) FROM public.get_no_suplido_por_suplidor(
     'ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid, 365))                   AS magna_no_trajo_lineas,
  (SELECT round(COALESCE(SUM(importe), 0), 2) FROM public.get_no_suplido_por_suplidor(
     'ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid, 365))                   AS magna_no_trajo_importe,
  -- Regresion: la orden automatica no se toco
  (SELECT count(*) FROM public.get_productos_para_orden_automatica(
     'ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid))                        AS sugeridos_magna;
