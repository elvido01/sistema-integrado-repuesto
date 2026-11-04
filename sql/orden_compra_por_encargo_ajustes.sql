-- =====================================================================
-- Solo por encargo: ajustes de la revision (04/11/2026)
-- ---------------------------------------------------------------------
-- Va despues de orden_compra_solo_por_encargo.sql.
--
-- 1. centinela_orden_automatica_muda contaba las piezas por encargo como
--    'el calculo no las propone' y daba la alarma del bug del cilindro por
--    cada una. Ahora las salta (copiada de PRODUCCION 04/11).
--
-- 2. La orden se graba borrando y volviendo a insertar TODAS sus lineas.
--    El trigger viejo marcaba la pieza en cada insert con 'por_encargo', asi
--    que si el dueno le quitaba la marca en la ficha, el siguiente guardado
--    de esa misma orden se la volvia a poner. Ahora solo cuenta el CAMBIO
--    de decision, comparando con la linea anterior de la misma orden (que
--    todavia existe al momento del insert) o con OLD en un update:
--      - pasa a 'por_encargo'           -> marca la pieza;
--      - deja 'por_encargo' por pedir   -> le quita la marca.
-- Idempotente.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_linea_por_encargo_marca_producto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes_encargo boolean;
BEGIN
  IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_antes_encargo := COALESCE(OLD.decision_estado, '') = 'por_encargo';
  ELSE
    -- Al regrabar la orden, la linea vieja aun esta: ella dice que habia antes.
    v_antes_encargo := EXISTS (
      SELECT 1 FROM public.ordenes_compra_detalle d
       WHERE d.orden_compra_id = NEW.orden_compra_id
         AND d.producto_id = NEW.producto_id
         AND d.id <> NEW.id
         AND d.decision_estado = 'por_encargo');
  END IF;

  IF NEW.decision_estado = 'por_encargo' AND NOT v_antes_encargo THEN
    UPDATE public.productos SET solo_por_encargo = true
     WHERE id = NEW.producto_id AND tenant_id = NEW.tenant_id AND NOT solo_por_encargo;
  ELSIF NEW.decision_estado IN ('pedir_hoy', 'pedido') AND v_antes_encargo THEN
    UPDATE public.productos SET solo_por_encargo = false
     WHERE id = NEW.producto_id AND tenant_id = NEW.tenant_id AND solo_por_encargo;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_linea_por_encargo_marca_producto ON public.ordenes_compra_detalle;
CREATE TRIGGER trg_linea_por_encargo_marca_producto
  AFTER INSERT OR UPDATE OF decision_estado ON public.ordenes_compra_detalle
  FOR EACH ROW
  WHEN (NEW.decision_estado IN ('por_encargo', 'pedir_hoy', 'pedido'))
  EXECUTE FUNCTION public.fn_linea_por_encargo_marca_producto();

REVOKE ALL ON FUNCTION public.fn_linea_por_encargo_marca_producto() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.centinela_orden_automatica_muda(p_tenant_id uuid)
 RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH activos AS (
    -- Solo suplidores con los que se trabaja de verdad. Preguntarle al
    -- calculo por uno al que no se le compra desde hace un ano no dice
    -- nada del sistema.
    SELECT DISTINCT c.suplidor_id AS sid
    FROM public.compras c
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= now() - interval '120 days'
      AND c.suplidor_id IS NOT NULL
  ),
  en_orden AS (
    SELECT DISTINCT d.producto_id AS pid
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      AND d.producto_id IS NOT NULL
  ),
  duelen AS (
    SELECT p.suplidor_id AS sid, p.id AS pid, p.codigo
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true)
      AND p.suplidor_id IS NOT NULL
      -- Solo por encargo: el calculo no la propone a proposito, no es el bug.
      AND NOT COALESCE(p.solo_por_encargo, false)
      AND public.get_stock_actual(p.id) <= 0
      AND NOT EXISTS (SELECT 1 FROM en_orden e WHERE e.pid = p.id)
      AND EXISTS (SELECT 1 FROM public.facturas_detalle fd
                  JOIN public.facturas f ON f.id = fd.factura_id
                  WHERE fd.producto_id = p.id AND f.fecha >= now() - interval '90 days')
  ),
  juicio AS (
    SELECT d.sid, count(*) AS duelen,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.get_productos_para_orden_automatica(d.sid) g
             WHERE g.id = d.pid)) AS invisibles,
           (array_agg(d.codigo) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.get_productos_para_orden_automatica(d.sid) g
             WHERE g.id = d.pid)))[1:8] AS codigos
    FROM duelen d
    JOIN activos a ON a.sid = d.sid
    GROUP BY d.sid
  )
  SELECT
    j.sid::text,
    format('La orden automatica no esta proponiendo %s pieza(s) de %s', j.invisibles, pr.nombre),
    format('%s de %s producto(s) suyos estan en cero, se vendieron en los ultimos 90 dias, no estan en ninguna orden — y aun asi el calculo de reposicion no los propone: %s. Esto es el bug del cilindro: no es que falte la pieza, es que el sistema no la esta pidiendo.',
           j.invisibles, j.duelen, array_to_string(j.codigos, ', ')),
    NULL::numeric,
    jsonb_build_object('suplidor_id', j.sid, 'suplidor', pr.nombre,
                       'agotados_con_venta', j.duelen, 'invisibles', j.invisibles,
                       'codigos', to_jsonb(j.codigos))
  FROM juicio j
  JOIN public.proveedores pr ON pr.id = j.sid
  WHERE j.invisibles > 0
  ORDER BY j.invisibles DESC;
$function$;

SELECT public.registrar_migracion('orden_compra_por_encargo_ajustes.sql');

COMMIT;

-- VERIFICACION
SELECT
  (SELECT pg_get_functiondef(oid) LIKE '%solo_por_encargo%' FROM pg_proc WHERE proname = 'centinela_orden_automatica_muda') AS centinela_salta_encargo,
  (SELECT pg_get_functiondef(oid) LIKE '%v_antes_encargo%' FROM pg_proc WHERE proname = 'fn_linea_por_encargo_marca_producto') AS solo_cuenta_el_cambio;
