-- ════════════════════════════════════════════════════════════════════
-- El recibo de ingreso de un pago de préstamo lleva SU número (02/11/2026)
-- ════════════════════════════════════════════════════════════════════
-- MotoPréstamos: el recibo impreso decía 0148837 y el Reporte de
-- Transacciones (y la caja, Cartera, Libros) RI-148844. Los dos contadores
-- se separaron: prestamo_pagos numera aparte y recibos_ingreso toma el
-- máximo de TODOS sus recibos (préstamos y cobros de facturas), así que va
-- ~7 adelante. Un mismo cobro tenía dos números según la pantalla.
--
-- Arreglo de raíz, sin tocar las funciones que registran pagos (registrar_
-- pago_prestamo x2, registrar_recuperacion, registrar_pago_prestamo_
-- financiera_externa): todas graban PRIMERO el pago y DESPUÉS su recibo de
-- ingreso, en la misma transacción (mismo cliente, mismo created_at).
--   1) recibos_ingreso.prestamo_pago_id: el recibo queda AMARRADO a su pago.
--   2) Disparador al grabar el recibo: si hay un pago de préstamo del mismo
--      cliente en ese mismo instante, lo amarra y le pone el número del pago
--      (0148838 -> RI-0148838). Si ese número ya existiera, deja el suyo.
--   3) _recibo_ingreso_de_pago usa primero el amarre.
--   4) Se amarran los recibos viejos a sus pagos (mismo instante).
--   5) Se renumeran SOLO los de hoy (02/11). Los de días ya cerrados
--      conservan su número (decisión del dueño 20/08: cierres viejos no se
--      tocan); siguen amarrados y encontrables por su pago.
-- Los recibos de cobros de facturas no cambian (no hay pago de préstamo).
-- ════════════════════════════════════════════════════════════════════

-- 1) El amarre
ALTER TABLE public.recibos_ingreso
  ADD COLUMN IF NOT EXISTS prestamo_pago_id uuid
  REFERENCES public.prestamo_pagos(id) ON DELETE SET NULL;

-- Para buscar el pago de un recibo al instante (disparador y amarre).
CREATE INDEX IF NOT EXISTS idx_prestamo_pagos_cliente_instante
  ON public.prestamo_pagos (tenant_id, cliente_id, created_at);

-- 4) Amarrar los recibos existentes: mismo empresa, cliente e instante.
-- Uno a uno: si en un instante hubiera varios, se casa por monto y número.
WITH pares AS (
  SELECT DISTINCT ON (ri.id) ri.id AS ri_id, p.id AS pago_id
    FROM public.recibos_ingreso ri
    JOIN public.prestamo_pagos p
      ON p.tenant_id = ri.tenant_id
     AND p.cliente_id = ri.cliente_id
     AND p.created_at = ri.created_at
   WHERE ri.prestamo_pago_id IS NULL
   ORDER BY ri.id, (p.total_pagado = ri.monto_pagado) DESC, p.numero
), unicos AS (
  SELECT DISTINCT ON (pago_id) ri_id, pago_id FROM pares ORDER BY pago_id, ri_id
)
UPDATE public.recibos_ingreso ri
   SET prestamo_pago_id = u.pago_id
  FROM unicos u
 WHERE ri.id = u.ri_id;

-- Un pago, un recibo.
CREATE UNIQUE INDEX IF NOT EXISTS recibos_ingreso_prestamo_pago_unico
  ON public.recibos_ingreso (prestamo_pago_id) WHERE prestamo_pago_id IS NOT NULL;

-- 2) El disparador
CREATE OR REPLACE FUNCTION public._recibo_ingreso_toma_su_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago record;
  v_num  text;
BEGIN
  IF NEW.prestamo_pago_id IS NULL AND NEW.cliente_id IS NOT NULL THEN
    SELECT p.id, p.numero INTO v_pago
      FROM public.prestamo_pagos p
     WHERE p.tenant_id = NEW.tenant_id
       AND p.cliente_id = NEW.cliente_id
       AND p.created_at = COALESCE(NEW.created_at, now())
       AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso r WHERE r.prestamo_pago_id = p.id)
     ORDER BY (p.total_pagado = NEW.monto_pagado) DESC, p.numero DESC
     LIMIT 1;
    IF v_pago.id IS NOT NULL THEN
      NEW.prestamo_pago_id := v_pago.id;
    END IF;
  END IF;

  -- El número del pago (el del recibo impreso), si nadie más lo tiene.
  IF NEW.prestamo_pago_id IS NOT NULL THEN
    IF v_pago.numero IS NULL THEN
      SELECT numero INTO v_num FROM public.prestamo_pagos WHERE id = NEW.prestamo_pago_id;
    ELSE
      v_num := v_pago.numero;
    END IF;
    v_num := 'RI-' || regexp_replace(COALESCE(v_num, ''), '^RI-', '');
    IF v_num <> 'RI-' AND NOT EXISTS (
         SELECT 1 FROM public.recibos_ingreso r
          WHERE r.tenant_id = NEW.tenant_id AND r.numero = v_num) THEN
      NEW.numero := v_num;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recibo_ingreso_toma_su_pago ON public.recibos_ingreso;
CREATE TRIGGER trg_recibo_ingreso_toma_su_pago
  BEFORE INSERT ON public.recibos_ingreso
  FOR EACH ROW EXECUTE FUNCTION public._recibo_ingreso_toma_su_pago();

-- 3) La búsqueda de siempre usa primero el amarre (misma firma).
CREATE OR REPLACE FUNCTION public._recibo_ingreso_de_pago(p_pago_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ri.id
    FROM public.prestamo_pagos p
    JOIN public.recibos_ingreso ri
      ON ri.tenant_id = p.tenant_id
     AND ri.cliente_id = p.cliente_id
     AND COALESCE(ri.anulado, false) = false
     -- uno amarrado a OTRO pago nunca es de este
     AND (ri.prestamo_pago_id IS NULL OR ri.prestamo_pago_id = p.id)
   WHERE p.id = p_pago_id
     AND (
       ri.prestamo_pago_id = p.id
       OR ri.created_at = p.created_at
       -- Los respaldos, solo con recibos de ±1 día: nunca el de otra semana.
       OR (abs(extract(epoch FROM ri.created_at - p.created_at)) < 86400
           AND (EXISTS (SELECT 1 FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(ri.formas_pago) = 'array' THEN ri.formas_pago ELSE '[]'::jsonb END) f
                         WHERE f->>'referencia' = p.numero)
                OR (ri.monto_pagado = p.total_pagado
                    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint
                      = NULLIF(regexp_replace(p.numero, '\D', '', 'g'), '')::bigint)))
     )
   ORDER BY
     CASE WHEN ri.prestamo_pago_id = p.id THEN 0
          WHEN ri.created_at = p.created_at THEN 1
          WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(ri.formas_pago) = 'array' THEN ri.formas_pago ELSE '[]'::jsonb END) f
                WHERE f->>'referencia' = p.numero) THEN 2
          ELSE 3 END,
     (ri.monto_pagado = p.total_pagado) DESC,
     abs(extract(epoch FROM ri.created_at - p.created_at)),
     ri.id
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public._recibo_ingreso_de_pago(uuid) FROM PUBLIC, anon, authenticated;

-- 5) Renumerar SOLO los de hoy (hora de Santo Domingo), si el número del
-- pago está libre. Los de días cerrados se quedan con el suyo.
UPDATE public.recibos_ingreso ri
   SET numero = 'RI-' || regexp_replace(p.numero, '^RI-', '')
  FROM public.prestamo_pagos p
 WHERE ri.prestamo_pago_id = p.id
   AND (ri.created_at AT TIME ZONE 'America/Santo_Domingo')::date = (now() AT TIME ZONE 'America/Santo_Domingo')::date
   AND ri.numero <> 'RI-' || regexp_replace(p.numero, '^RI-', '')
   AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso r2
                    WHERE r2.tenant_id = ri.tenant_id
                      AND r2.numero = 'RI-' || regexp_replace(p.numero, '^RI-', ''));

SELECT public.registrar_migracion('recibo_ingreso_amarrado_a_su_pago.sql');

-- ===== VERIFICACION =====
-- Hoy en MotoPréstamos: cada pago con su recibo, mismos dígitos.
SELECT p.numero AS pago, ri.numero AS recibo_ingreso, ri.monto_pagado
  FROM public.prestamo_pagos p
  JOIN public.recibos_ingreso ri ON ri.prestamo_pago_id = p.id
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND p.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
 ORDER BY p.numero DESC;
