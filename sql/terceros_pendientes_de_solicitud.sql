-- =====================================================================
-- Lo que falta entregar sale de la solicitud, no de la factura
-- ---------------------------------------------------------------------
-- (2026-08-01) "En la solicitud de compra ya viene seleccionado si en la
-- venta se le agregará el GPS, placa y matrícula, casco, seguro. OJO: no se
-- le puede rebajar nada a la factura porque Caminero Motors le financia al
-- cliente el casco, placa, GPS y seguro. Y tampoco afecta la comisión porque
-- Caminero paga una cuota fija por motocicleta vendida, no por el monto."
--
-- >>> ESO CIERRA EL HUECO SIN TOCAR LA FACTURA <<<
-- Yo venía diciendo que para saber qué falta entregar había que partir la
-- factura en líneas. No hace falta y además no se debe: el cliente FINANCIA
-- esos 4,600, así que la factura tiene que seguir por el total. El dato ya
-- estaba guardado en otro lado —la solicitud— desde antes:
--
--   solicitudes_compras.incluye_gps / incluye_seguro /
--                       incluye_casco / incluye_placa
--                       monto_gps / monto_seguro / monto_casco / monto_placa
--
-- >>> LO QUE APARECE AL CRUZARLO <<<
--   19 solicitudes aprobadas
--
--   GPS                 54,000
--   SEGURO              12,000
--   PLACA Y MATRICULA   10,000
--   CASCO                5,000
--   -----------------------------
--   cobrado a terceros  81,000
--   ya entregado         8,200
--   sin registro        72,800
--
-- OJO CON ESE NÚMERO: no dice que se deban 72,800. Dice que el sistema no
-- puede dar por entregados 72,800, que no es lo mismo —lo más probable es
-- que buena parte se pagara antes de usar el módulo y nunca se anotara—.
-- Sirve para ponerse al día, no para cobrarle a nadie.
--
-- >>> CÓMO QUEDA AMARRADO <<<
-- gastos_diarios.solicitud_id dice a qué venta corresponde cada entrega. Un
-- concepto deja de estar pendiente cuando existe un pago no anulado con esa
-- solicitud y ese concepto. Sin esa columna habría que adivinar por nombre y
-- fecha, que es como se pierden las cosas.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL AMARRE
-- ------------------------------------------------------------
ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS solicitud_id uuid;

COMMENT ON COLUMN public.gastos_diarios.solicitud_id IS
  'Solicitud de compra cuyo GPS/seguro/casco/placa se está entregando. Es lo que saca ese concepto de la lista de pendientes.';

CREATE INDEX IF NOT EXISTS idx_gastos_diarios_solicitud
  ON public.gastos_diarios (solicitud_id)
  WHERE solicitud_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) LOS MONTOS, DE UNA SOLA FUENTE
-- ------------------------------------------------------------
-- Los precios ya vivían en config_empresa (precio_gps, precio_placa...), que
-- es de donde los toma la solicitud. El catálogo que creé ayer los repetía y
-- casco y placa habían quedado en 0. Se rellenan desde el precio de verdad
-- para que no haya dos respuestas a "cuánto cuesta el casco".
UPDATE public.conceptos_terceros ct
   SET monto = v.precio,
       updated_at = now()
  FROM (
    SELECT ce.tenant_id, x.nombre, x.precio
    FROM public.config_empresa ce
    CROSS JOIN LATERAL (VALUES
      ('GPS',               COALESCE(ce.precio_gps, 0)),
      ('SEGURO',            COALESCE(ce.precio_seguro, 0)),
      ('CASCO',             COALESCE(ce.precio_casco, 0)),
      ('PLACA Y MATRICULA', COALESCE(ce.precio_placa, 0))
    ) AS x(nombre, precio)
  ) v
 WHERE ct.tenant_id = v.tenant_id
   AND upper(btrim(ct.nombre)) = v.nombre
   AND COALESCE(ct.monto, 0) = 0
   AND v.precio > 0;

-- ------------------------------------------------------------
-- 3) LO QUE FALTA POR ENTREGAR
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
    AND NOT EXISTS (
      SELECT 1 FROM public.gastos_diarios g
      WHERE g.solicitud_id = s.id
        AND g.concepto_tercero = x.concepto
        AND COALESCE(g.anulado, false) = false
    )
  ORDER BY s.fecha DESC, s.numero DESC, x.concepto;
$$;

GRANT EXECUTE ON FUNCTION public.get_terceros_pendientes() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('terceros_pendientes_de_solicitud.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- OJO: get_user_tenant() es NULL en el editor SQL. Se comprueba con la
-- consulta equivalente, fijando el tenant a mano.

-- 1) LOS MONTOS DEL CATÁLOGO, YA SIN CEROS
SELECT nombre, monto FROM public.conceptos_terceros
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
ORDER BY orden;
-- esperado: GPS 3600 · SEGURO 1000 · CASCO 1000 · PLACA Y MATRICULA 2500

-- 2) LO QUE FALTA POR ENTREGAR, POR CONCEPTO
SELECT x.concepto, COUNT(*) AS cuantos, SUM(x.monto) AS monto
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
  AND NOT EXISTS (SELECT 1 FROM public.gastos_diarios g
                   WHERE g.solicitud_id = s.id AND g.concepto_tercero = x.concepto
                     AND COALESCE(g.anulado, false) = false)
GROUP BY x.concepto ORDER BY 3 DESC;
-- esperado hoy: GPS 54,000 (15) · SEGURO 12,000 (12) ·
--               PLACA Y MATRICULA 10,000 (4) · CASCO 5,000 (5) = 81,000
-- Los 3 pagos ya hechos NO descuentan aquí: se registraron antes de que
-- existiera solicitud_id, así que no están amarrados a ninguna solicitud.
-- Al marcarlos como entregados desde la pantalla, salen de la lista.
