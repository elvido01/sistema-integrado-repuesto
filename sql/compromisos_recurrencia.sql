-- ============================================================
-- Recurrencia automática para compromisos
-- ============================================================
-- 1) Agrega columnas recurrente / frecuencia.
-- 2) Marca todos los compromisos históricos como recurrentes
--    mensuales (el usuario los venía manejando así).
-- 3) Reactiva el compromiso MÁS RECIENTE de cada nombre por
--    tenant, avanzando la fecha al período mensual actual.
--
-- frecuencia: 'mensual' | 'quincenal' | 'semanal' | 'anual'
-- ============================================================

-- 1. Columnas nuevas
ALTER TABLE public.compromisos
  ADD COLUMN IF NOT EXISTS recurrente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS frecuencia text;

-- 2. Marcar TODO el histórico como recurrente mensual
UPDATE public.compromisos
SET recurrente = true,
    frecuencia = COALESCE(frecuencia, 'mensual')
WHERE recurrente IS NOT TRUE;

-- 3. Reactivar el último compromiso de cada nombre por tenant.
--    Avanza la fecha al período mensual vigente para que aparezca
--    en el dashboard con el día original del mes.
WITH ultimos AS (
  SELECT DISTINCT ON (tenant_id, nombre) id, fecha
  FROM public.compromisos
  ORDER BY tenant_id, nombre, created_at DESC
),
con_nueva_fecha AS (
  SELECT
    u.id,
    -- Reusa el día del mes original; si ya pasó este mes, va al próximo.
    CASE
      WHEN make_date(
             EXTRACT(YEAR  FROM CURRENT_DATE)::int,
             EXTRACT(MONTH FROM CURRENT_DATE)::int,
             LEAST(EXTRACT(DAY FROM u.fecha)::int, 28)
           ) < CURRENT_DATE
      THEN (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            + (LEAST(EXTRACT(DAY FROM u.fecha)::int, 28) - 1) * INTERVAL '1 day')::date
      ELSE make_date(
             EXTRACT(YEAR  FROM CURRENT_DATE)::int,
             EXTRACT(MONTH FROM CURRENT_DATE)::int,
             LEAST(EXTRACT(DAY FROM u.fecha)::int, 28)
           )
    END AS nueva_fecha
  FROM ultimos u
)
UPDATE public.compromisos c
SET activo      = true,
    recurrente  = true,
    frecuencia  = COALESCE(c.frecuencia, 'mensual'),
    fecha       = nf.nueva_fecha,
    fecha_pago  = NULL
FROM con_nueva_fecha nf
WHERE c.id = nf.id;

-- 4. Verificación rápida (opcional, descomenta para revisar)
-- SELECT tenant_id, nombre, monto, fecha, activo, recurrente, frecuencia
-- FROM public.compromisos
-- WHERE activo = true
-- ORDER BY tenant_id, fecha;
