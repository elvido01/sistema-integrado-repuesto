-- =====================================================================
-- Financiamiento terceros: mantener el préstamo al EDITAR la factura
-- ---------------------------------------------------------------------
-- (2026-07-28) Hasta ahora el préstamo en la financiera solo se creaba al
-- grabar la venta en crédito, detrás de un guard `!editingFacturaId`. Si la
-- factura se editaba después, no pasaba NADA:
--
--   * grabada de contado y luego editada a crédito -> el préstamo NUNCA se
--     creaba (así se perdieron FT-12 y FT-17, reparados a mano por SQL)
--   * se cambiaba el inicial -> el préstamo seguía con el capital viejo
--   * se pasaba a contado -> el préstamo quedaba vivo cobrándole al cliente
--     una deuda que ya no existe
--
-- Esta función se llama SIEMPRE al grabar (nueva o editada) y deja el
-- préstamo igual a lo que dice la factura:
--
--   no hay préstamo + es crédito   -> lo CREA
--   hay préstamo + NO es crédito   -> lo CANCELA (borra préstamo y CxP)
--   hay préstamo + cambió el plan  -> lo REHACE con los datos nuevos
--   hay préstamo + todo igual      -> no toca nada
--
-- >>> NUNCA TOCA UN PRÉSTAMO CON PAGOS <<<
-- Si el cliente ya abonó algo, cancelar o rehacer borraría ese historial.
-- En ese caso NO hace nada y devuelve ok=false con el motivo, para que el
-- sistema avise y se resuelva a mano. Es la salvaguarda más importante:
-- vale más un aviso que un recibo borrado.
--
-- QUÉ BORRA AL CANCELAR (todo lo que creó procesar_financiamiento_terceros):
--   financiera: prestamo, prestamo_cuotas, prestamo_cargos y las CxP hacia
--               el dealer (una por cuota + la del adicional)
--   dealer:     devuelve la factura al comprador (estaba reasignada a la
--               financiera) y le quita el "| COMPRADOR: ..." al detalle
--
-- Los clientes/proveedores que se hayan creado NO se borran: son catálogo,
-- no estorban y pueden estar usados por otras operaciones.
--
-- Idempotente. Requiere sql/cxp_financiamiento_por_cuotas.sql antes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sincronizar_financiamiento_terceros(
  p_factura_id           uuid,
  p_solicitud_id         uuid,
  p_financiera_tenant_id uuid,
  p_es_credito           boolean
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer     uuid := public.get_user_tenant();
  v_fin        uuid := p_financiera_tenant_id;
  v_cfg_tipo   text;
  v_cfg_fin    uuid;
  sol          record;
  fac          record;
  pres         record;
  v_inicial    numeric;
  v_adic       numeric;
  v_capital    numeric;
  v_plazo      int;
  v_pagos      boolean;
  v_dealer_nom text;
  v_prov       uuid;
  v_borradas   int := 0;
  v_res        json;
BEGIN
  IF v_dealer IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_fin IS NULL THEN RAISE EXCEPTION 'financiera_tenant_id es requerido'; END IF;

  SELECT financiamiento_tipo, financiera_tenant_id INTO v_cfg_tipo, v_cfg_fin
    FROM public.config_empresa WHERE tenant_id = v_dealer;
  IF COALESCE(v_cfg_tipo, 'propio') <> 'terceros' OR v_cfg_fin IS DISTINCT FROM v_fin THEN
    RETURN json_build_object('ok', true, 'accion', 'no_aplica');
  END IF;

  SELECT * INTO sol FROM public.solicitudes_compras
   WHERE id = p_solicitud_id AND tenant_id = v_dealer;
  IF NOT FOUND THEN RETURN json_build_object('ok', true, 'accion', 'sin_solicitud'); END IF;

  SELECT * INTO fac FROM public.facturas
   WHERE id = p_factura_id AND tenant_id = v_dealer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  -- Lo que DEBERÍA ser el préstamo según la factura/solicitud de ahora
  v_inicial := round(COALESCE(sol.inicial, 0), 2);
  v_adic    := round(COALESCE(sol.adicional, 0), 2);
  v_capital := round(COALESCE(NULLIF(sol.financiamiento, 0), COALESCE(fac.total, 0) - v_inicial), 2);
  v_plazo   := COALESCE(sol.tiempo_meses, 0);

  SELECT * INTO pres FROM public.prestamos
   WHERE tenant_id = v_fin
     AND notas LIKE '%[FT:' || p_factura_id::text || ']%'
   LIMIT 1;

  -- ---------- no hay préstamo ----------
  IF NOT FOUND THEN
    IF p_es_credito AND v_capital > 0 THEN
      v_res := public.procesar_financiamiento_terceros(p_factura_id, p_solicitud_id, v_fin);
      RETURN json_build_object('ok', true, 'accion', 'creado', 'detalle', v_res);
    END IF;
    RETURN json_build_object('ok', true, 'accion', 'sin_cambio');
  END IF;

  -- ---------- hay préstamo: ¿está igual? ----------
  IF p_es_credito
     AND round(pres.monto_capital, 2) = v_capital
     AND COALESCE(pres.plazo_cuotas, 0) = v_plazo THEN
    RETURN json_build_object('ok', true, 'accion', 'sin_cambio',
                             'prestamo_numero', pres.numero);
  END IF;

  -- ---------- hay que cancelarlo o rehacerlo: ¿tiene pagos? ----------
  SELECT EXISTS (
    SELECT 1 FROM public.prestamo_pago_detalle pd
    JOIN public.prestamo_cuotas pc ON pc.id = pd.cuota_id
    WHERE pc.prestamo_id = pres.id
  ) INTO v_pagos;

  IF v_pagos THEN
    RETURN json_build_object(
      'ok', false,
      'accion', 'bloqueado_por_pagos',
      'prestamo_numero', pres.numero,
      'motivo', 'El préstamo ' || pres.numero || ' ya tiene pagos aplicados. '
             || 'La factura se grabó, pero el préstamo NO se modificó: hay que '
             || 'ajustarlo a mano en la financiera para no borrar los recibos.');
  END IF;

  -- ---------- deshacer ----------
  -- Las CxP que la financiera le debe al dealer por esta factura.
  SELECT nombre INTO v_dealer_nom FROM public.config_empresa WHERE tenant_id = v_dealer;
  SELECT id INTO v_prov FROM public.proveedores
   WHERE tenant_id = v_fin AND nombre ILIKE v_dealer_nom LIMIT 1;

  DELETE FROM public.compras c
   WHERE c.tenant_id = v_fin
     AND (v_prov IS NULL OR c.suplidor_id = v_prov)
     AND c.referencia LIKE 'Financiamiento factura #' || fac.numero || ' - comprador %'
     -- jamás borrar una CxP que ya tenga pagos del dealer
     AND NOT EXISTS (SELECT 1 FROM public.pagos_suplidores_detalle d WHERE d.compra_id = c.id);
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  DELETE FROM public.prestamo_cargos WHERE prestamo_id = pres.id;
  DELETE FROM public.prestamo_cuotas WHERE prestamo_id = pres.id;
  DELETE FROM public.prestamos      WHERE id = pres.id;

  -- La factura vuelve a nombre del comprador (estaba a nombre de la financiera)
  UPDATE public.facturas
     SET cliente_id            = COALESCE(sol.cliente_id, cliente_id),
         manual_cliente_nombre = NULL
   WHERE id = p_factura_id AND tenant_id = v_dealer
     AND sol.cliente_id IS NOT NULL;

  UPDATE public.facturas_detalle
     SET descripcion = regexp_replace(COALESCE(descripcion, ''), '\s*\|\s*COMPRADOR:.*$', '')
   WHERE factura_id = p_factura_id
     AND descripcion LIKE '%| COMPRADOR:%';

  -- ---------- rehacer si toca ----------
  IF p_es_credito AND v_capital > 0 THEN
    v_res := public.procesar_financiamiento_terceros(p_factura_id, p_solicitud_id, v_fin);
    RETURN json_build_object('ok', true, 'accion', 'actualizado',
                             'prestamo_anterior', pres.numero,
                             'cxp_borradas', v_borradas,
                             'detalle', v_res);
  END IF;

  RETURN json_build_object('ok', true, 'accion', 'cancelado',
                           'prestamo_numero', pres.numero,
                           'cxp_borradas', v_borradas);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_financiamiento_terceros(uuid, uuid, uuid, boolean) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('sincronizar_financiamiento_terceros.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) La función quedó creada
SELECT to_regprocedure('public.sincronizar_financiamiento_terceros(uuid,uuid,uuid,boolean)')::text AS firma;
-- esperado: no NULL

-- 2) Préstamos de financiamiento de terceros vivos hoy (los marcados [FT:])
SELECT p.numero, p.monto_capital, p.plazo_cuotas, p.estado,
       substring(p.notas from '\[FT:([0-9a-f-]+)\]') AS factura_id,
       EXISTS (SELECT 1 FROM public.prestamo_pago_detalle pd
               JOIN public.prestamo_cuotas pc ON pc.id = pd.cuota_id
               WHERE pc.prestamo_id = p.id) AS tiene_pagos
FROM public.prestamos p
WHERE p.notas LIKE '%[FT:%'
ORDER BY p.created_at DESC;
-- los que tengan pagos NUNCA se van a tocar solos: el sistema avisará
