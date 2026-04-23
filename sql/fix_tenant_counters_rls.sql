-- ============================================================
-- FIX: tenant_factura_counters y tenant_carta_ruta_counters
-- bloquean el trigger porque RLS solo tenía política SELECT.
-- Solución: SECURITY DEFINER en los triggers (bypass RLS, que
-- es seguro porque el contador se aísla por NEW.tenant_id).
-- ============================================================

-- 1. Trigger de facturas: SECURITY DEFINER
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
    NEW.numero := nextval('factura_numero_seq');
    RETURN NEW;
  END IF;

  INSERT INTO public.tenant_factura_counters (tenant_id, last_numero)
    VALUES (NEW.tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.tenant_factura_counters
     SET last_numero = last_numero + 1
   WHERE tenant_id = NEW.tenant_id
   RETURNING last_numero INTO v_next;

  NEW.numero := v_next;
  RETURN NEW;
END;
$function$;

-- 2. Trigger de cartas de ruta: SECURITY DEFINER
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

NOTIFY pgrst, 'reload schema';
