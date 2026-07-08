-- ============================================================
-- Fase 6: MEDIDOR DE ACIERTO DE COMPRA (sell-through 30/60/90)
-- ============================================================
-- Cierra el ciclo comprar -> medir -> comprar mejor: por cada compra
-- se mide que % del CAPITAL invertido ya roto (se vendio) a los 30,
-- 60 y 90 dias, y cuanto quedo MUERTO (sin venderse a los 90d).
--
-- Metodo (aproximacion FIFO honesta): para cada linea de compra, las
-- ventas del producto DESPUES de la fecha de compra se atribuyen a esa
-- compra hasta cubrir la cantidad comprada:
--     vendidas_Nd = LEAST(ventas del producto en los N dias sig., cantidad)
--     % capital rotado = SUM(vendidas x costo) / SUM(cantidad x costo)
-- Si habia stock previo del producto puede sobreestimar un poco; es la
-- aproximacion estandar cuando no se rastrea lote por lote.
--
-- Madurez: una compra solo se mide a 30d si ya tiene 30+ dias, a 60d
-- si tiene 60+, etc. (NULL = aun no madura).
--
-- RPCs:
--   get_acierto_suplidores(p_meses)                -> tabla por suplidor
--   get_acierto_compras_suplidor(p_suplidor, p_meses) -> compras del suplidor
--   get_acierto_compra_detalle(p_compra_id)        -> lineas de una compra
-- Re-ejecutable. Correr en PRODUCCION.
-- ============================================================

-- ---------- 1) Resumen por SUPLIDOR ----------
DROP FUNCTION IF EXISTS public.get_acierto_suplidores(INT);
CREATE OR REPLACE FUNCTION public.get_acierto_suplidores(p_meses INT DEFAULT 6)
RETURNS TABLE(
  suplidor_id        UUID,
  suplidor_nombre    TEXT,
  compras            INT,
  capital_invertido  NUMERIC,
  pct_capital_30     NUMERIC,   -- % del capital (maduro) vendido a 30d
  pct_capital_60     NUMERIC,
  pct_capital_90     NUMERIC,
  capital_muerto_90  NUMERIC,   -- costo de lo NO vendido a 90d (compras 90d+)
  unidades_compradas NUMERIC,
  unidades_muertas_90 NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.get_user_tenant();
  v_hoy    DATE := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;

  RETURN QUERY
  WITH lineas AS (
    SELECT
      c.suplidor_id AS sup_id,
      c.id AS compra_id,
      c.fecha AS fecha_compra,
      cd.producto_id,
      cd.cantidad,
      COALESCE(cd.costo_unitario, 0) AS costo_u,
      (v_hoy - c.fecha) AS edad
    FROM public.compras c
    JOIN public.compras_detalle cd ON cd.compra_id = c.id
    WHERE c.tenant_id = v_tenant
      AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
      AND c.fecha >= v_hoy - (GREATEST(1, COALESCE(p_meses, 6)) * INTERVAL '1 month')
      AND cd.producto_id IS NOT NULL
      AND cd.cantidad > 0
  ),
  ventas AS (
    SELECT
      l.compra_id,
      l.producto_id,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 30) AS v30,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 60) AS v60,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 90) AS v90
    FROM lineas l
    JOIN public.facturas_detalle fd ON fd.producto_id = l.producto_id
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND COALESCE(f.estado,'') <> 'ANULADA'
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date > l.fecha_compra
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 90
    GROUP BY l.compra_id, l.producto_id
  ),
  medido AS (
    SELECT
      l.sup_id, l.compra_id, l.edad,
      l.cantidad, l.costo_u,
      (l.cantidad * l.costo_u) AS capital,
      LEAST(COALESCE(v.v30, 0), l.cantidad) AS vend30,
      LEAST(COALESCE(v.v60, 0), l.cantidad) AS vend60,
      LEAST(COALESCE(v.v90, 0), l.cantidad) AS vend90
    FROM lineas l
    LEFT JOIN ventas v ON v.compra_id = l.compra_id AND v.producto_id = l.producto_id
  )
  SELECT
    m.sup_id,
    COALESCE(pr.nombre, '(sin suplidor)')::TEXT,
    COUNT(DISTINCT m.compra_id)::INT,
    ROUND(SUM(m.capital), 2),
    CASE WHEN SUM(m.capital) FILTER (WHERE m.edad >= 30) > 0
      THEN ROUND(100.0 * SUM(m.vend30 * m.costo_u) FILTER (WHERE m.edad >= 30)
                 / SUM(m.capital) FILTER (WHERE m.edad >= 30), 1)
      ELSE NULL END,
    CASE WHEN SUM(m.capital) FILTER (WHERE m.edad >= 60) > 0
      THEN ROUND(100.0 * SUM(m.vend60 * m.costo_u) FILTER (WHERE m.edad >= 60)
                 / SUM(m.capital) FILTER (WHERE m.edad >= 60), 1)
      ELSE NULL END,
    CASE WHEN SUM(m.capital) FILTER (WHERE m.edad >= 90) > 0
      THEN ROUND(100.0 * SUM(m.vend90 * m.costo_u) FILTER (WHERE m.edad >= 90)
                 / SUM(m.capital) FILTER (WHERE m.edad >= 90), 1)
      ELSE NULL END,
    ROUND(COALESCE(SUM((m.cantidad - m.vend90) * m.costo_u) FILTER (WHERE m.edad >= 90), 0), 2),
    ROUND(SUM(m.cantidad), 0),
    ROUND(COALESCE(SUM(m.cantidad - m.vend90) FILTER (WHERE m.edad >= 90), 0), 0)
  FROM medido m
  LEFT JOIN public.proveedores pr ON pr.id = m.sup_id
  GROUP BY m.sup_id, pr.nombre
  ORDER BY SUM(m.capital) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_acierto_suplidores(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_acierto_suplidores(INT) TO authenticated, service_role;

-- ---------- 2) Compras de un suplidor ----------
DROP FUNCTION IF EXISTS public.get_acierto_compras_suplidor(UUID, INT);
CREATE OR REPLACE FUNCTION public.get_acierto_compras_suplidor(p_suplidor_id UUID, p_meses INT DEFAULT 6)
RETURNS TABLE(
  compra_id         UUID,
  numero            TEXT,
  fecha             DATE,
  edad_dias         INT,
  capital           NUMERIC,
  lineas            INT,
  pct_capital_30    NUMERIC,
  pct_capital_60    NUMERIC,
  pct_capital_90    NUMERIC,
  capital_muerto_90 NUMERIC,
  lineas_muertas_90 INT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.get_user_tenant();
  v_hoy    DATE := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;

  RETURN QUERY
  WITH lineas AS (
    SELECT
      c.id AS cid, c.numero AS cnum, c.fecha AS fecha_compra,
      (v_hoy - c.fecha) AS edad,
      cd.producto_id, cd.cantidad, COALESCE(cd.costo_unitario, 0) AS costo_u
    FROM public.compras c
    JOIN public.compras_detalle cd ON cd.compra_id = c.id
    WHERE c.tenant_id = v_tenant
      AND c.suplidor_id = p_suplidor_id
      AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
      AND c.fecha >= v_hoy - (GREATEST(1, COALESCE(p_meses, 6)) * INTERVAL '1 month')
      AND cd.producto_id IS NOT NULL
      AND cd.cantidad > 0
  ),
  ventas AS (
    SELECT
      l.cid, l.producto_id,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 30) AS v30,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 60) AS v60,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 90) AS v90
    FROM lineas l
    JOIN public.facturas_detalle fd ON fd.producto_id = l.producto_id
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND COALESCE(f.estado,'') <> 'ANULADA'
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date > l.fecha_compra
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= l.fecha_compra + 90
    GROUP BY l.cid, l.producto_id
  ),
  medido AS (
    SELECT
      l.cid, l.cnum, l.fecha_compra, l.edad, l.cantidad, l.costo_u,
      (l.cantidad * l.costo_u) AS capital,
      LEAST(COALESCE(v.v30, 0), l.cantidad) AS vend30,
      LEAST(COALESCE(v.v60, 0), l.cantidad) AS vend60,
      LEAST(COALESCE(v.v90, 0), l.cantidad) AS vend90
    FROM lineas l
    LEFT JOIN ventas v ON v.cid = l.cid AND v.producto_id = l.producto_id
  )
  SELECT
    m.cid,
    m.cnum::TEXT,
    m.fecha_compra,
    m.edad::INT,
    ROUND(SUM(m.capital), 2),
    COUNT(*)::INT,
    CASE WHEN m.edad >= 30 AND SUM(m.capital) > 0
      THEN ROUND(100.0 * SUM(m.vend30 * m.costo_u) / SUM(m.capital), 1) ELSE NULL END,
    CASE WHEN m.edad >= 60 AND SUM(m.capital) > 0
      THEN ROUND(100.0 * SUM(m.vend60 * m.costo_u) / SUM(m.capital), 1) ELSE NULL END,
    CASE WHEN m.edad >= 90 AND SUM(m.capital) > 0
      THEN ROUND(100.0 * SUM(m.vend90 * m.costo_u) / SUM(m.capital), 1) ELSE NULL END,
    CASE WHEN m.edad >= 90
      THEN ROUND(SUM((m.cantidad - m.vend90) * m.costo_u), 2) ELSE NULL END,
    CASE WHEN m.edad >= 90
      THEN (COUNT(*) FILTER (WHERE m.vend90 <= 0))::INT ELSE NULL END
  FROM medido m
  GROUP BY m.cid, m.cnum, m.fecha_compra, m.edad
  ORDER BY m.fecha_compra DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_acierto_compras_suplidor(UUID, INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_acierto_compras_suplidor(UUID, INT) TO authenticated, service_role;

-- ---------- 3) Detalle por LINEA de una compra ----------
DROP FUNCTION IF EXISTS public.get_acierto_compra_detalle(UUID);
CREATE OR REPLACE FUNCTION public.get_acierto_compra_detalle(p_compra_id UUID)
RETURNS TABLE(
  producto_id   UUID,
  codigo        TEXT,
  descripcion   TEXT,
  cantidad      NUMERIC,
  costo_u       NUMERIC,
  capital       NUMERIC,
  vendidas_30   NUMERIC,
  vendidas_60   NUMERIC,
  vendidas_90   NUMERIC,
  sin_vender    NUMERIC,     -- a 90d (o a hoy si aun no madura)
  estado_rotacion TEXT       -- rapido | normal | lento | muerto | inmaduro
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID := public.get_user_tenant();
  v_hoy    DATE := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_fecha  DATE;
  v_edad   INT;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;

  SELECT c.fecha INTO v_fecha FROM public.compras c
  WHERE c.id = p_compra_id AND c.tenant_id = v_tenant;
  IF v_fecha IS NULL THEN RAISE EXCEPTION 'Compra no encontrada'; END IF;
  v_edad := (v_hoy - v_fecha);

  RETURN QUERY
  WITH lineas AS (
    SELECT cd.producto_id AS pid, cd.codigo AS cod, cd.descripcion AS descr,
           cd.cantidad AS cant, COALESCE(cd.costo_unitario, 0) AS cu
    FROM public.compras_detalle cd
    WHERE cd.compra_id = p_compra_id AND cd.producto_id IS NOT NULL AND cd.cantidad > 0
  ),
  ventas AS (
    SELECT
      l.pid,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_fecha + 30) AS v30,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_fecha + 60) AS v60,
      SUM(fd.cantidad) FILTER (WHERE (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_fecha + 90) AS v90
    FROM lineas l
    JOIN public.facturas_detalle fd ON fd.producto_id = l.pid
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND COALESCE(f.estado,'') <> 'ANULADA'
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date > v_fecha
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_fecha + 90
    GROUP BY l.pid
  )
  SELECT
    l.pid,
    l.cod::TEXT,
    l.descr::TEXT,
    l.cant,
    l.cu,
    ROUND(l.cant * l.cu, 2),
    LEAST(COALESCE(v.v30, 0), l.cant),
    LEAST(COALESCE(v.v60, 0), l.cant),
    LEAST(COALESCE(v.v90, 0), l.cant),
    GREATEST(l.cant - LEAST(COALESCE(v.v90, 0), l.cant), 0),
    CASE
      WHEN v_edad < 30 THEN 'inmaduro'
      WHEN LEAST(COALESCE(v.v30, 0), l.cant) >= l.cant THEN 'rapido'
      WHEN v_edad >= 90 AND COALESCE(v.v90, 0) <= 0 THEN 'muerto'
      WHEN LEAST(COALESCE(v.v90, 0), l.cant) >= l.cant * 0.5 THEN 'normal'
      ELSE 'lento'
    END::TEXT
  FROM lineas l
  LEFT JOIN ventas v ON v.pid = l.pid
  ORDER BY (l.cant * l.cu) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_acierto_compra_detalle(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_acierto_compra_detalle(UUID) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_compras_detalle_compra ON public.compras_detalle (compra_id);
CREATE INDEX IF NOT EXISTS idx_facturas_detalle_producto ON public.facturas_detalle (producto_id);

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regproc('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('acierto_compras.sql');
  END IF;
END $$;

SELECT 'Medidor de acierto de compra (30/60/90) listo' AS status;
