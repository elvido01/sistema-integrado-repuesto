-- =====================================================================
-- Diagnostico: Recordatorio de pago a los 3 dias exactos
-- ---------------------------------------------------------------------
-- Muestra si el contador "Recordatorio 3 dias" esta en cero porque no
-- existen cuotas que cumplan la regla o porque ya se envio el recordatorio
-- para esa cuota.
-- =====================================================================

WITH params AS (
  SELECT
    public.get_user_tenant() AS tenant_id,
    (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy
),
cuotas_dia3 AS (
  SELECT
    p.id AS prestamo_id,
    regexp_replace(p.numero::text, '^(PT-[0-9]+)-2[0-9]+$', '\1', 'i') AS prestamo_numero,
    c.id AS cliente_id,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    q.id AS cuota_id,
    q.numero_cuota,
    q.fecha_vencimiento,
    (params.hoy - q.fecha_vencimiento)::int AS dias_vencida,
    GREATEST(
      COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
      - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
      0
    ) AS pendiente
  FROM params
  JOIN public.prestamos p
    ON p.tenant_id = params.tenant_id
   AND p.estado = 'activo'
   AND p.cliente_id IS NOT NULL
  JOIN public.prestamo_cuotas q
    ON q.prestamo_id = p.id
   AND q.tenant_id = params.tenant_id
   AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  JOIN public.clientes c
    ON c.id = p.cliente_id
   AND c.tenant_id = params.tenant_id
   AND COALESCE(c.activo, true) = true
  WHERE (params.hoy - q.fecha_vencimiento) = 3
    AND GREATEST(
      COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
      - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
      0
    ) > 0
),
marcadas AS (
  SELECT
    cd.*,
    EXISTS (
      SELECT 1
      FROM params
      JOIN public.cobro_gestiones g
        ON g.tenant_id = params.tenant_id
       AND g.cliente_id = cd.cliente_id
       AND g.tipo = 'mensaje_enviado'
       AND COALESCE(g.metadata->>'recordatorio_pago', 'false') = 'true'
       AND g.metadata->>'recordatorio_cuota_id' = cd.cuota_id::text
    ) AS recordatorio_ya_enviado
  FROM cuotas_dia3 cd
)
SELECT
  COUNT(*) AS cuotas_en_dia_3,
  COUNT(*) FILTER (WHERE recordatorio_ya_enviado) AS ya_enviados,
  COUNT(*) FILTER (WHERE NOT recordatorio_ya_enviado) AS deben_salir_en_lista
FROM marcadas;

-- Detalle para revisar nombres si "deben_salir_en_lista" es mayor que cero.
WITH params AS (
  SELECT
    public.get_user_tenant() AS tenant_id,
    (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy
),
cuotas_dia3 AS (
  SELECT
    p.id AS prestamo_id,
    regexp_replace(p.numero::text, '^(PT-[0-9]+)-2[0-9]+$', '\1', 'i') AS prestamo_numero,
    c.id AS cliente_id,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    q.id AS cuota_id,
    q.numero_cuota,
    q.fecha_vencimiento,
    (params.hoy - q.fecha_vencimiento)::int AS dias_vencida,
    GREATEST(
      COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
      - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
      0
    ) AS pendiente
  FROM params
  JOIN public.prestamos p
    ON p.tenant_id = params.tenant_id
   AND p.estado = 'activo'
   AND p.cliente_id IS NOT NULL
  JOIN public.prestamo_cuotas q
    ON q.prestamo_id = p.id
   AND q.tenant_id = params.tenant_id
   AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  JOIN public.clientes c
    ON c.id = p.cliente_id
   AND c.tenant_id = params.tenant_id
   AND COALESCE(c.activo, true) = true
  WHERE (params.hoy - q.fecha_vencimiento) = 3
    AND GREATEST(
      COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
      - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0),
      0
    ) > 0
),
marcadas AS (
  SELECT
    cd.*,
    EXISTS (
      SELECT 1
      FROM params
      JOIN public.cobro_gestiones g
        ON g.tenant_id = params.tenant_id
       AND g.cliente_id = cd.cliente_id
       AND g.tipo = 'mensaje_enviado'
       AND COALESCE(g.metadata->>'recordatorio_pago', 'false') = 'true'
       AND g.metadata->>'recordatorio_cuota_id' = cd.cuota_id::text
    ) AS recordatorio_ya_enviado
  FROM cuotas_dia3 cd
)
SELECT *
FROM marcadas
WHERE NOT recordatorio_ya_enviado
ORDER BY fecha_vencimiento, cliente_nombre;
