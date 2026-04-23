-- ============================================================
-- Número propio para Cartas de Ruta (por tenant)
-- Antes se identificaban solo por chasis. Ahora cada carta tiene
-- su propio correlativo por tenant para facilitar búsqueda
-- y referencias impresas.
-- ============================================================

-- 1. Columna numero
ALTER TABLE public.cartas_ruta ADD COLUMN IF NOT EXISTS numero BIGINT;

-- 2. Backfill por tenant (por fecha de creación)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at) AS n
    FROM public.cartas_ruta
   WHERE numero IS NULL
)
UPDATE public.cartas_ruta c SET numero = r.n FROM ranked r WHERE c.id = r.id;

-- 3. Contador por tenant
CREATE TABLE IF NOT EXISTS public.tenant_carta_ruta_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_numero BIGINT NOT NULL DEFAULT 0
);

INSERT INTO public.tenant_carta_ruta_counters (tenant_id, last_numero)
SELECT tenant_id, COALESCE(MAX(numero), 0)
  FROM public.cartas_ruta
 WHERE tenant_id IS NOT NULL
 GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE
   SET last_numero = GREATEST(tenant_carta_ruta_counters.last_numero, EXCLUDED.last_numero);

-- 4. Trigger: asigna numero automáticamente en INSERT
CREATE OR REPLACE FUNCTION public.set_carta_ruta_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next BIGINT;
BEGIN
  IF NEW.numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tenant_carta_ruta_counters (tenant_id, last_numero)
    VALUES (NEW.tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.tenant_carta_ruta_counters
     SET last_numero = last_numero + 1
   WHERE tenant_id = NEW.tenant_id
   RETURNING last_numero INTO v_next;

  NEW.numero := v_next;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_carta_ruta_numero ON public.cartas_ruta;
CREATE TRIGGER trg_set_carta_ruta_numero BEFORE INSERT ON public.cartas_ruta
  FOR EACH ROW EXECUTE FUNCTION public.set_carta_ruta_numero();

-- 5. Índice para búsqueda por número
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_numero_tenant
  ON public.cartas_ruta(tenant_id, numero);

-- 6. RLS contador
ALTER TABLE public.tenant_carta_ruta_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_carta_ruta_counters_select" ON public.tenant_carta_ruta_counters;
CREATE POLICY "tenant_carta_ruta_counters_select" ON public.tenant_carta_ruta_counters
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

NOTIFY pgrst, 'reload schema';
