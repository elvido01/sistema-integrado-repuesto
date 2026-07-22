-- =====================================================================
-- Castigar por ÚLTIMO PAGO REAL (> 6 años sin pagar) — corrección directa
-- ---------------------------------------------------------------------
-- Fix del bug: préstamos con último pago hace ~20 años seguían activos
-- porque la regla usaba el campo ult_pago del header (vacío). Aquí se usa
-- el último pago REAL del cliente (max fecha en prestamo_pagos), igual que
-- muestra Gestión de Cobro. Opera sobre datos ya migrados (no necesita el
-- respaldo). Respeta lo marcado a mano (castigado_manual).
-- Tenant financiera: 766fe3d6-6885-4f2b-b2cc-1a91db696fb4.
-- Correr en el editor SQL de Supabase.
-- =====================================================================

-- Vista previa: cuántos préstamos activos se castigarían.
SELECT COUNT(*) AS se_castigarian
FROM public.prestamos p
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND p.estado = 'activo'
  AND COALESCE(p.castigado_manual, false) = false
  AND COALESCE(
        (SELECT MAX(pp.fecha) FROM public.prestamo_pagos pp
          WHERE pp.cliente_id = p.cliente_id AND pp.tenant_id = p.tenant_id
            AND COALESCE(pp.anulado, false) = false),
        p.fecha_inicio
      ) < (current_date - interval '6 years');

-- Aplicar el castigo.
UPDATE public.prestamos p
   SET estado = 'castigado',
       motivo_castigo = 'incobrable',
       fecha_castigo = COALESCE(
         (SELECT MAX(pp.fecha) FROM public.prestamo_pagos pp
           WHERE pp.cliente_id = p.cliente_id AND pp.tenant_id = p.tenant_id
             AND COALESCE(pp.anulado, false) = false),
         p.fecha_inicio),
       castigado_manual = false
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND p.estado = 'activo'
   AND COALESCE(p.castigado_manual, false) = false
   AND COALESCE(
         (SELECT MAX(pp.fecha) FROM public.prestamo_pagos pp
           WHERE pp.cliente_id = p.cliente_id AND pp.tenant_id = p.tenant_id
             AND COALESCE(pp.anulado, false) = false),
         p.fecha_inicio
       ) < (current_date - interval '6 years');

-- Resultado por estado.
SELECT estado, COUNT(*) AS n
FROM public.prestamos
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
GROUP BY estado
ORDER BY n DESC;
