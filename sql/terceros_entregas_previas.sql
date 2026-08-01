-- =====================================================================
-- Todo lo viejo ya se entregó: se da por saldado SIN mover dinero
-- ---------------------------------------------------------------------
-- (2026-08-01) "Ya todos esos GPS, seguros, placa y matrículas fueron
-- entregados, borra el historial."
--
-- >>> POR QUÉ NO SE REGISTRAN COMO PAGOS <<<
-- Lo directo sería crear los 72,800 como pagos a terceros y que la lista
-- quedara en cero. Sería un error grave: esos pagos SALIERON DE LA CAJA EN
-- SU MOMENTO, meses atrás y fuera del sistema. Registrarlos hoy le sacaría
-- 72,800 a la caja de HOY, y el cierre de hoy pediría un efectivo que nadie
-- se llevó. El descuadre de los 50,000 de la compra de contado fue
-- exactamente eso al revés, y costó encontrarlo.
--
-- Lo que hace falta no es un pago: es DEJAR CONSTANCIA de que ya se entregó.
-- Por eso va en su propia tabla, sin monto que reste de ningún lado. La
-- lista de pendientes queda limpia y la caja no se entera, que es justo lo
-- que tiene que pasar cuando algo se saldó antes de existir el registro.
--
-- Los 3 pagos que sí están grabados (GPS 3,600 x2 y SEGURO 1,000) se quedan
-- como están: ese dinero sí salió con el sistema andando y ya cuadró.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.terceros_entregas_previas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  solicitud_id uuid NOT NULL,
  concepto     text NOT NULL,
  fecha        date NOT NULL DEFAULT CURRENT_DATE,
  nota         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.terceros_entregas_previas IS
  'Extras (GPS, seguro, casco, placa) ya entregados antes de que existiera el registro de pagos a terceros. NO son un movimiento de dinero: solo sacan el concepto de la lista de pendientes.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_terceros_entregas_previas
  ON public.terceros_entregas_previas (solicitud_id, concepto);

DO $$ BEGIN
  ALTER TABLE public.terceros_entregas_previas ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS terceros_entregas_previas_tenant ON public.terceros_entregas_previas;
  CREATE POLICY terceros_entregas_previas_tenant ON public.terceros_entregas_previas FOR ALL
    USING (tenant_id = public.get_user_tenant())
    WITH CHECK (tenant_id = public.get_user_tenant());
  REVOKE ALL ON public.terceros_entregas_previas FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.terceros_entregas_previas TO authenticated, service_role;
END $$;

-- ------------------------------------------------------------
-- LO PENDIENTE DE CAMINERO SE DA POR ENTREGADO
-- ------------------------------------------------------------
INSERT INTO public.terceros_entregas_previas (tenant_id, solicitud_id, concepto, fecha, nota)
SELECT s.tenant_id, s.id, x.concepto, CURRENT_DATE,
       'Entregado antes de existir el registro de pagos a terceros (2026-08-01)'
FROM public.solicitudes_compras s
CROSS JOIN LATERAL (VALUES
  ('GPS',               s.incluye_gps,    COALESCE(s.monto_gps, 0)),
  ('SEGURO',            s.incluye_seguro, COALESCE(s.monto_seguro, 0)),
  ('CASCO',             s.incluye_casco,  COALESCE(s.monto_casco, 0)),
  ('PLACA Y MATRICULA', s.incluye_placa,  COALESCE(s.monto_placa, 0))
) AS x(concepto, incluido, monto)
WHERE s.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND s.estado ILIKE 'aprobad%'
  AND COALESCE(x.incluido, false) = true
  AND x.monto > 0
ON CONFLICT (solicitud_id, concepto) DO NOTHING;

-- ------------------------------------------------------------
-- LA LISTA DE PENDIENTES RESPETA LAS ENTREGAS VIEJAS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_terceros_pendientes()
RETURNS TABLE (
  solicitud_id   uuid,
  numero         text,
  fecha          date,
  cliente_id     uuid,
  cliente_nombre text,
  concepto       text,
  monto          numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id,
         s.numero::text,
         s.fecha::date,
         s.cliente_id,
         COALESCE(NULLIF(btrim(s.cliente_nombre), ''), '(sin nombre)'),
         x.concepto,
         x.monto
  FROM public.solicitudes_compras s
  CROSS JOIN LATERAL (VALUES
    ('GPS',               s.incluye_gps,    COALESCE(s.monto_gps, 0)),
    ('SEGURO',            s.incluye_seguro, COALESCE(s.monto_seguro, 0)),
    ('CASCO',             s.incluye_casco,  COALESCE(s.monto_casco, 0)),
    ('PLACA Y MATRICULA', s.incluye_placa,  COALESCE(s.monto_placa, 0))
  ) AS x(concepto, incluido, monto)
  WHERE s.tenant_id = public.get_user_tenant()
    -- Solo las aprobadas: una solicitud rechazada no cobró nada.
    AND s.estado ILIKE 'aprobad%'
    AND COALESCE(x.incluido, false) = true
    AND x.monto > 0
    -- Ya se pagó con el sistema andando...
    AND NOT EXISTS (
      SELECT 1 FROM public.gastos_diarios g
      WHERE g.solicitud_id = s.id
        AND g.concepto_tercero = x.concepto
        AND COALESCE(g.anulado, false) = false
    )
    -- ...o se entregó antes de que esto existiera.
    AND NOT EXISTS (
      SELECT 1 FROM public.terceros_entregas_previas e
      WHERE e.solicitud_id = s.id AND e.concepto = x.concepto
    )
  ORDER BY s.fecha DESC, s.numero DESC, x.concepto;
$$;

GRANT EXECUTE ON FUNCTION public.get_terceros_pendientes() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('terceros_entregas_previas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) CUÁNTO SE DIO POR ENTREGADO
SELECT concepto, COUNT(*) AS cuantos
FROM public.terceros_entregas_previas
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
GROUP BY concepto ORDER BY 2 DESC;
-- esperado: GPS 15 · SEGURO 12 · CASCO 5 · PLACA Y MATRICULA 4  (36 en total)

-- 2) QUE LA CAJA NO SE MOVIÓ
SELECT COUNT(*) AS pagos_a_terceros, COALESCE(SUM(monto), 0) AS total
FROM public.gastos_diarios
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND es_tercero = true AND COALESCE(anulado, false) = false;
-- esperado: 3 pagos · 8,200 — LOS MISMOS DE ANTES.
-- Si aquí apareciera 81,000, se habría metido dinero que nadie sacó hoy.

-- 3) QUE NO QUEDA NADA PENDIENTE
SELECT COUNT(*) AS pendientes
FROM public.solicitudes_compras s
CROSS JOIN LATERAL (VALUES
  ('GPS', s.incluye_gps, COALESCE(s.monto_gps,0)),
  ('SEGURO', s.incluye_seguro, COALESCE(s.monto_seguro,0)),
  ('CASCO', s.incluye_casco, COALESCE(s.monto_casco,0)),
  ('PLACA Y MATRICULA', s.incluye_placa, COALESCE(s.monto_placa,0))
) AS x(concepto, incluido, monto)
WHERE s.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND s.estado ILIKE 'aprobad%' AND COALESCE(x.incluido,false) AND x.monto > 0
  AND NOT EXISTS (SELECT 1 FROM public.terceros_entregas_previas e
                   WHERE e.solicitud_id = s.id AND e.concepto = x.concepto)
  AND NOT EXISTS (SELECT 1 FROM public.gastos_diarios g
                   WHERE g.solicitud_id = s.id AND g.concepto_tercero = x.concepto
                     AND COALESCE(g.anulado,false) = false);
-- esperado: 0
