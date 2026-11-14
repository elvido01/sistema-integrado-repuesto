-- =====================================================================
-- Financiera: "Interés cobrado o acreditado" con el interés del SiiF (14/11/2026)
-- ---------------------------------------------------------------------
-- La migración (fase-financiera-cxc.mjs) cargó cada cuota pendiente del SiiF
-- con todo su pendiente como capital (interés 0). Los cobros hechos después
-- en MotoFlow sobre esas cuotas quedaron completos a capital y el reporte
-- mostraba interés 0.
--
-- Arreglo SOLO DE CONSULTA (decisión del dueño 14/11): no se toca ninguna
-- cuota, pago, balance, mora ni interés corriente.
--   · prestamo_cuotas.siif_interes: el interés que le faltaba cobrar a la
--     cuota según el SiiF al migrar (lo llena
--     scripts/migracion-siif/interes-cuotas-siif.mjs --reporte). Nadie más lo lee.
--   · _interes_siif_abonos(empresa): reparte cada abono de esas cuotas
--     (pagos y notas de crédito, por fecha) con la regla del SiiF: el
--     primer dinero que entra a la cuota es interés hasta cubrirlo, luego
--     capital. El total de cada abono no cambia.
--   · get_intereses_cobrados usa ese reparto cuando existe. Solo aplica a
--     cuotas que siguen con interés 0 (si algún día se corrigen las cuotas,
--     se apaga solo).
-- Idempotente.
-- =====================================================================

ALTER TABLE public.prestamo_cuotas ADD COLUMN IF NOT EXISTS siif_interes numeric;
COMMENT ON COLUMN public.prestamo_cuotas.siif_interes IS
  'Interés pendiente de la cuota según el SiiF al migrar. Solo para el reporte Interés cobrado: no afecta balances, mora ni cobros.';

CREATE OR REPLACE FUNCTION public._interes_siif_abonos(p_tenant uuid)
RETURNS TABLE(tabla text, detalle_id uuid, interes numeric, capital numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  WITH ab AS (
    SELECT 'pago'::text AS tabla, pd.id, pd.cuota_id, cu.siif_interes AS tope,
           COALESCE(pd.abono_capital, 0) + COALESCE(pd.abono_interes, 0) AS monto,
           p.fecha, p.created_at
      FROM public.prestamo_cuotas cu
      JOIN public.prestamo_pago_detalle pd ON pd.cuota_id = cu.id
      JOIN public.prestamo_pagos p ON p.id = pd.pago_id AND NOT COALESCE(p.anulado, false)
     WHERE cu.tenant_id = p_tenant AND cu.siif_interes > 0 AND COALESCE(cu.interes, 0) = 0
    UNION ALL
    SELECT 'nc', nd.id, nd.cuota_id, cu.siif_interes,
           COALESCE(nd.abono_capital, 0) + COALESCE(nd.abono_interes, 0),
           n.fecha, n.created_at
      FROM public.prestamo_cuotas cu
      JOIN public.prestamo_nota_credito_detalle nd ON nd.cuota_id = cu.id
      JOIN public.prestamo_notas_credito n ON n.id = nd.nota_id AND NOT COALESCE(n.anulada, false)
     WHERE cu.tenant_id = p_tenant AND cu.siif_interes > 0 AND COALESCE(cu.interes, 0) = 0
  ), acum AS (
    SELECT ab.*, COALESCE(sum(monto) OVER (PARTITION BY cuota_id ORDER BY fecha, created_at, id
                                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS antes
      FROM ab
  )
  SELECT tabla, id, round(LEAST(monto, GREATEST(0, tope - antes)), 2),
         round(monto - LEAST(monto, GREATEST(0, tope - antes)), 2)
    FROM acum
$f$;
REVOKE ALL ON FUNCTION public._interes_siif_abonos(uuid) FROM PUBLIC, anon, authenticated;

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
    WITH siif AS (SELECT * FROM public._interes_siif_abonos(v_t))
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
          SELECT sum(COALESCE(sf.capital, nd.abono_capital)) FILTER (WHERE nd.cuota_id IS NOT NULL) AS capital,
                 sum(COALESCE(sf.interes, nd.abono_interes)) FILTER (WHERE nd.cuota_id IS NOT NULL) AS interes,
                 sum(nd.abono_mora)    FILTER (WHERE nd.cuota_id IS NOT NULL) AS mora,
                 sum(nd.abono_total)   FILTER (WHERE nd.cuota_id IS NULL)     AS cargos
            FROM public.prestamo_nota_credito_detalle nd
            LEFT JOIN siif sf ON sf.tabla = 'nc' AND sf.detalle_id = nd.id
           WHERE nd.nota_id = n.id) d ON true
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
  WITH siif AS (SELECT * FROM public._interes_siif_abonos(v_t))
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
        SELECT pd.pago_id, sum(COALESCE(sf.capital, pd.abono_capital)) AS capital,
               sum(COALESCE(sf.interes, pd.abono_interes)) AS interes,
               sum(pd.abono_mora) AS mora, sum(pd.abono_total) AS total,
               'PAGO ' || string_agg(cu.numero_cuota::text, ', ' ORDER BY cu.numero_cuota)
                 || COALESCE('/' || max(pr.plazo_cuotas)::text, '') AS cuotas
          FROM public.prestamo_pago_detalle pd
          LEFT JOIN siif sf ON sf.tabla = 'pago' AND sf.detalle_id = pd.id
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

SELECT registrar_migracion('reporte_interes_siif_cuotas.sql');
