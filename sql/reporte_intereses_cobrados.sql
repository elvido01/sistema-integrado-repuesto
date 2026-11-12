-- =====================================================================
-- Financiera: reporte "Interés cobrado o acreditado" (12/11/2026)
-- ---------------------------------------------------------------------
-- El mismo reporte del SiiF (Reportes → Intereses Cobrados): cada cobro
-- del período con cuánto fue a capital, a interés y a atraso (mora).
--   · Cobrado (RI): los pagos de préstamos (prestamo_pagos).
--   · Acreditado (NC): las notas de crédito (prestamo_notas_credito).
--
-- De dónde sale el desglose de cada pago:
--   1. Pagos hechos en MotoFlow: prestamo_pago_detalle (capital, interés y
--      mora por cuota). Lo que el pago trae de más fue a cargos manuales
--      (Otras Transacciones: abogado, cobrador…) y sale en "Cargos".
--   2. Pagos que vinieron del SiiF: la migración solo copió el total. El
--      SiiF sí guarda el interés y la mora de cada recibo (cxc_mov_master:
--      columnas interes / mora); se copian a las columnas nuevas
--      prestamo_pagos.siif_interes / siif_mora con el script
--      scripts/migracion-siif/desglose-pagos-siif.mjs. Capital = total -
--      interés - mora. Son columnas de CONSULTA: no tocan cuotas ni balances.
--   3. Si no hay ninguno de los dos, el pago sale con su total y la marca
--      "sin desglose" (solo pasa con recibos viejos del SiiF: un pago de
--      MotoFlow sin detalle es uno que fue completo a cargos).
--   Ojo: en los del SiiF, lo que el recibo pagó de cargos va dentro de
--   "capital" (así lo calcula también el reporte del SiiF).
-- Más de 20,000 cobros en la consulta: se pide acortar el período o escoger
-- un cliente (no se devuelve una parte callada).
--
-- get_intereses_cobrados(desde, hasta, cliente, tipo): empresa activa del
-- usuario (get_user_tenant). Solo lee.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.prestamo_pagos ADD COLUMN IF NOT EXISTS siif_interes numeric;
ALTER TABLE public.prestamo_pagos ADD COLUMN IF NOT EXISTS siif_mora numeric;
COMMENT ON COLUMN public.prestamo_pagos.siif_interes IS
  'Interés del recibo según el SiiF (pagos migrados sin prestamo_pago_detalle). Solo consulta: no afecta balances.';
COMMENT ON COLUMN public.prestamo_pagos.siif_mora IS
  'Mora (atraso) del recibo según el SiiF (pagos migrados sin prestamo_pago_detalle). Solo consulta.';

CREATE OR REPLACE FUNCTION public.get_intereses_cobrados(
  p_desde date, p_hasta date, p_cliente_id uuid DEFAULT NULL, p_tipo text DEFAULT 'cobrado')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_out jsonb;
  v_n int;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Revisa las fechas: desde % hasta %', p_desde, p_hasta;
  END IF;

  IF COALESCE(p_tipo, 'cobrado') = 'acreditado' THEN
    -- ===== Acreditado (NC) =====
    SELECT count(*) INTO v_n FROM public.prestamo_notas_credito n
     WHERE n.tenant_id = v_t AND NOT COALESCE(n.anulada, false) AND n.fecha BETWEEN p_desde AND p_hasta
       AND (p_cliente_id IS NULL OR n.cliente_id = p_cliente_id);
    IF v_n > 20000 THEN
      RAISE EXCEPTION 'Son % notas de crédito en ese período: acorta las fechas o escoge un cliente.', v_n;
    END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha', x->>'transaccion'), '[]'::jsonb) INTO v_out
    FROM (
      SELECT jsonb_build_object(
        'fecha', n.fecha,
        'transaccion', n.numero,
        'cliente', cl.nombre, 'cliente_codigo', COALESCE(cl.codigo, cl.rnc),
        'descripcion', COALESCE(NULLIF(btrim(n.comentarios), ''), 'NOTA DE CRÉDITO'),
        'capital', COALESCE(d.capital, 0), 'interes', COALESCE(d.interes, 0),
        'atraso', COALESCE(d.mora, 0), 'cargos', COALESCE(d.cargos, 0),
        'total', n.monto, 'desglose', 'motoflow') AS x
        FROM public.prestamo_notas_credito n
        JOIN public.clientes cl ON cl.id = n.cliente_id
        LEFT JOIN LATERAL (
          SELECT sum(nd.abono_capital) FILTER (WHERE nd.cuota_id IS NOT NULL) AS capital,
                 sum(nd.abono_interes) FILTER (WHERE nd.cuota_id IS NOT NULL) AS interes,
                 sum(nd.abono_mora)    FILTER (WHERE nd.cuota_id IS NOT NULL) AS mora,
                 sum(nd.abono_total)   FILTER (WHERE nd.cuota_id IS NULL)     AS cargos
            FROM public.prestamo_nota_credito_detalle nd WHERE nd.nota_id = n.id) d ON true
       WHERE n.tenant_id = v_t AND NOT COALESCE(n.anulada, false)
         AND n.fecha BETWEEN p_desde AND p_hasta
         AND (p_cliente_id IS NULL OR n.cliente_id = p_cliente_id)
    ) q;
    RETURN v_out;
  END IF;

  -- ===== Cobrado (RI) =====
  SELECT count(*) INTO v_n FROM public.prestamo_pagos p
   WHERE p.tenant_id = v_t AND NOT COALESCE(p.anulado, false) AND p.fecha BETWEEN p_desde AND p_hasta
     AND (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id);
  IF v_n > 20000 THEN
    RAISE EXCEPTION 'Son % cobros en ese período: acorta las fechas o escoge un cliente.', v_n;
  END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha', x->>'transaccion'), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'fecha', p.fecha,
      -- El recibo de ingreso (RI-…). Los pagos del SiiF ya traen ese número;
      -- los de MotoFlow tienen su recibo aparte (contadores separados).
      'transaccion', CASE WHEN p.numero ILIKE 'RI-%' THEN p.numero
                          ELSE COALESCE((SELECT ri.numero FROM public.recibos_ingreso ri
                                          WHERE ri.id = public._recibo_ingreso_de_pago(p.id)), p.numero) END,
      'cliente', cl.nombre, 'cliente_codigo', COALESCE(cl.codigo, cl.rnc),
      'descripcion', COALESCE(NULLIF(btrim(p.comentarios), ''), d.cuotas, 'PAGO'),
      -- Tres casos: detalle de MotoFlow · desglose del SiiF · recibo viejo
      -- sin desglose. Un pago de MotoFlow (número sin "RI-") sin detalle fue
      -- completo a cargos manuales.
      'capital', CASE WHEN d.pago_id IS NOT NULL THEN d.capital
                      WHEN p.siif_interes IS NOT NULL THEN p.total_pagado - p.siif_interes - COALESCE(p.siif_mora, 0)
                      WHEN p.numero NOT ILIKE 'RI-%' THEN 0 END,
      'interes', CASE WHEN d.pago_id IS NOT NULL THEN d.interes
                      WHEN p.siif_interes IS NOT NULL THEN p.siif_interes
                      WHEN p.numero NOT ILIKE 'RI-%' THEN 0 END,
      'atraso',  CASE WHEN d.pago_id IS NOT NULL THEN d.mora
                      WHEN p.siif_interes IS NOT NULL THEN COALESCE(p.siif_mora, 0)
                      WHEN p.numero NOT ILIKE 'RI-%' THEN 0 END,
      'cargos',  CASE WHEN d.pago_id IS NOT NULL THEN GREATEST(round(p.total_pagado - d.total, 2), 0)
                      WHEN p.siif_interes IS NULL AND p.numero NOT ILIKE 'RI-%' THEN p.total_pagado
                      ELSE 0 END,
      'total', p.total_pagado,
      'desglose', CASE WHEN d.pago_id IS NOT NULL OR p.numero NOT ILIKE 'RI-%' THEN 'motoflow'
                       WHEN p.siif_interes IS NOT NULL THEN 'siif' ELSE 'sin' END) AS x
      FROM public.prestamo_pagos p
      JOIN public.clientes cl ON cl.id = p.cliente_id
      LEFT JOIN LATERAL (
        SELECT pd.pago_id, sum(pd.abono_capital) AS capital, sum(pd.abono_interes) AS interes,
               sum(pd.abono_mora) AS mora, sum(pd.abono_total) AS total,
               'PAGO ' || string_agg(cu.numero_cuota::text, ', ' ORDER BY cu.numero_cuota)
                 || COALESCE('/' || max(pr.plazo_cuotas)::text, '') AS cuotas
          FROM public.prestamo_pago_detalle pd
          LEFT JOIN public.prestamo_cuotas cu ON cu.id = pd.cuota_id
          LEFT JOIN public.prestamos pr ON pr.id = cu.prestamo_id
         WHERE pd.pago_id = p.id
         GROUP BY pd.pago_id) d ON true
     WHERE p.tenant_id = v_t AND NOT COALESCE(p.anulado, false)
       AND p.fecha BETWEEN p_desde AND p_hasta
       AND (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
  ) q;
  RETURN v_out;
END $f$;
REVOKE ALL ON FUNCTION public.get_intereses_cobrados(date, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_intereses_cobrados(date, date, uuid, text) TO authenticated;

-- Prueba: cuántos pagos tienen desglose por empresa financiera (solo cuenta).
SELECT ce.nombre,
       count(*) AS pagos,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.prestamo_pago_detalle d WHERE d.pago_id = p.id)) AS con_desglose_motoflow,
       count(*) FILTER (WHERE p.siif_interes IS NOT NULL) AS con_desglose_siif
  FROM public.prestamo_pagos p JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
 WHERE NOT COALESCE(p.anulado, false) AND ce.feat_financiera
 GROUP BY ce.nombre;

SELECT registrar_migracion('reporte_intereses_cobrados.sql');
