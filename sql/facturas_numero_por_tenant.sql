-- ============================================================
-- Numeración de facturas POR TENANT
-- Bug: el trigger usaba una secuencia global (factura_numero_seq)
-- causando que Caminero Motors viera #1112 en su primera factura
-- porque otros tenants consumieron la secuencia.
--
-- Solución: contador por tenant en tabla `tenant_factura_counters`.
-- El trigger toma el siguiente número del tenant correspondiente.
-- ============================================================

-- 1. Tabla de contadores por tenant
CREATE TABLE IF NOT EXISTS public.tenant_factura_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_numero BIGINT NOT NULL DEFAULT 0
);

-- 2. Inicializar contadores con el MAX actual por tenant (conservador:
--    no renumera facturas existentes de otros tenants para no romper
--    referencias impresas / conciliaciones).
INSERT INTO public.tenant_factura_counters (tenant_id, last_numero)
SELECT tenant_id, COALESCE(MAX(numero), 0)
  FROM public.facturas
 WHERE tenant_id IS NOT NULL
 GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE
   SET last_numero = GREATEST(tenant_factura_counters.last_numero, EXCLUDED.last_numero);

-- 3. Renumerar SOLO las facturas de Caminero Motors (su numeración
--    arrancó en 1112 por el bug; están en estado de pruebas y no
--    tienen facturas reales emitidas aún).
DO $$
DECLARE
  v_caminero UUID := 'b39506c3-27dc-467d-830b-096731b83113';
  v_count BIGINT;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, numero) AS n
      FROM public.facturas
     WHERE tenant_id = v_caminero
  )
  UPDATE public.facturas f
     SET numero = r.n
    FROM ranked r
   WHERE f.id = r.id;

  SELECT COUNT(*) INTO v_count FROM public.facturas WHERE tenant_id = v_caminero;

  -- Ajustar contador de Caminero al MAX renumerado
  INSERT INTO public.tenant_factura_counters (tenant_id, last_numero)
    VALUES (v_caminero, v_count)
    ON CONFLICT (tenant_id) DO UPDATE SET last_numero = v_count;
END $$;

-- 4. Nuevo trigger: incrementa el contador del tenant en lugar de
--    usar la secuencia global.
CREATE OR REPLACE FUNCTION public.set_factura_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next BIGINT;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    -- Fallback: comportamiento viejo (secuencia global)
    NEW.numero := nextval('factura_numero_seq');
    RETURN NEW;
  END IF;

  -- Insert del contador si no existe (primer factura del tenant)
  INSERT INTO public.tenant_factura_counters (tenant_id, last_numero)
    VALUES (NEW.tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

  -- Incremento atómico (FOR UPDATE implícito por UPDATE ... RETURNING)
  UPDATE public.tenant_factura_counters
     SET last_numero = last_numero + 1
   WHERE tenant_id = NEW.tenant_id
   RETURNING last_numero INTO v_next;

  NEW.numero := v_next;
  RETURN NEW;
END;
$function$;

-- 5. RLS: cada tenant solo ve su contador (buena práctica)
ALTER TABLE public.tenant_factura_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_factura_counters_select" ON public.tenant_factura_counters;
CREATE POLICY "tenant_factura_counters_select" ON public.tenant_factura_counters
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
