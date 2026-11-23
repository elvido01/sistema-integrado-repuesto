-- ============================================================
-- DGII: RAZÓN SOCIAL DEL REGISTRO — AJUSTES DE LA REVISIÓN (23/11/2026)
-- ============================================================
-- /code-review high sobre dgii_razon_social_del_registro.sql:
-- 1. El trigger corría en filas de cualquier proveedor: ahora solo
--    dgii_directo (WHEN en el trigger).
-- 2. Sin salida si la DGII cambió el nombre y el listado local está viejo:
--    config.razon_social_manual = '<nombre exacto>' (lo pone soporte por SQL)
--    gana siempre, también sobre lo que mande el formulario después.
-- 3. La comparación para pasar lo escrito a nombre_comercial ignora
--    mayúsculas y espacios ('Israel Aponte Martinez' no se vuelve nombre
--    comercial).
-- 4. La prueba falla si la fila de Aponte no existe y prueba de verdad que un
--    RNC fuera del listado no se toca.
-- ============================================================

SELECT public.registrar_migracion('dgii_razon_social_del_registro_ajustes.sql');  -- v2: razon_social_manual es el nombre

CREATE OR REPLACE FUNCTION private.dgii_emisor_razon_del_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rnc text := regexp_replace(COALESCE(NEW.config->>'rnc_emisor', ''), '\D', '', 'g');
  v_reg public.dgii_contribuyentes%ROWTYPE;
  v_escrito text := btrim(COALESCE(NEW.config->>'nombre_emisor', ''));
  v_razon text;
BEGIN
  IF NEW.config IS NULL OR v_rnc = '' THEN RETURN NEW; END IF;

  NEW.config := NEW.config || jsonb_build_object('tipo_persona',
    CASE WHEN length(v_rnc) = 11 THEN 'fisica' ELSE 'juridica' END);

  -- Nombre puesto por soporte (la DGII lo cambió y el listado está viejo):
  -- gana siempre, también sobre lo que mande el formulario.
  IF btrim(COALESCE(NEW.config->>'razon_social_manual', '')) <> '' THEN
    NEW.config := NEW.config || jsonb_build_object('nombre_emisor', btrim(NEW.config->>'razon_social_manual'),
                                                   'razon_social_registro_dgii', false);
    RETURN NEW;
  END IF;

  SELECT * INTO v_reg FROM public.dgii_contribuyentes d WHERE d.rnc = v_rnc;
  v_razon := btrim(COALESCE(v_reg.razon_social, ''));
  IF NOT FOUND OR v_razon = '' THEN
    NEW.config := NEW.config || jsonb_build_object('razon_social_registro_dgii', false);
    RETURN NEW;
  END IF;

  IF v_escrito <> '' AND upper(regexp_replace(v_escrito, '\s+', ' ', 'g')) <> upper(regexp_replace(v_razon, '\s+', ' ', 'g'))
     AND btrim(COALESCE(NEW.config->>'nombre_comercial', '')) = '' THEN
    NEW.config := NEW.config || jsonb_build_object('nombre_comercial', v_escrito);
  END IF;

  NEW.config := NEW.config || jsonb_build_object('nombre_emisor', v_razon, 'razon_social_registro_dgii', true);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_dgii_emisor_razon_del_registro ON public.integraciones_fiscales;
CREATE TRIGGER trg_dgii_emisor_razon_del_registro
  BEFORE INSERT OR UPDATE OF config ON public.integraciones_fiscales
  FOR EACH ROW WHEN (NEW.proveedor = 'dgii_directo')
  EXECUTE FUNCTION private.dgii_emisor_razon_del_registro();

-- PRUEBA (sobre una fila temporal que se borra; no toca empresas reales)
DO $prueba$
DECLARE r record; v_t uuid; v_id uuid;
BEGIN
  SELECT config->>'nombre_emisor' razon, config->>'nombre_comercial' comercial, config->>'tipo_persona' tp INTO r
    FROM public.integraciones_fiscales WHERE tenant_id = 'bd97aba4-a0a1-45ce-884f-29dc26e2785e' AND proveedor = 'dgii_directo';
  IF NOT FOUND THEN RAISE EXCEPTION 'No está la configuración DGII de Aponte'; END IF;
  IF r.razon IS DISTINCT FROM 'ISRAEL APONTE MARTINEZ' OR r.comercial IS DISTINCT FROM 'REPUESTOS APONTE' OR r.tp IS DISTINCT FROM 'fisica' THEN
    RAISE EXCEPTION 'Aponte quedó mal: % / % / %', r.razon, r.comercial, r.tp;
  END IF;

  -- Fila temporal en una empresa sin configuración fiscal (FK + unicidad):
  SELECT t.id INTO v_t FROM public.tenants t WHERE NOT EXISTS (SELECT 1 FROM public.integraciones_fiscales i WHERE i.tenant_id = t.id) ORDER BY t.id LIMIT 1;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa libre para la prueba'; END IF;
  INSERT INTO public.integraciones_fiscales (tenant_id, proveedor, config)
  VALUES (v_t, 'prueba_otro', jsonb_build_object('rnc_emisor','02800758944','nombre_emisor','NO TOCAR'))
  RETURNING id INTO v_id;
  IF (SELECT config->>'nombre_emisor' FROM public.integraciones_fiscales WHERE id = v_id) <> 'NO TOCAR' THEN
    RAISE EXCEPTION 'El trigger tocó otro proveedor';
  END IF;

  -- dgii_directo: mismo nombre en minúsculas no pasa a nombre comercial
  UPDATE public.integraciones_fiscales SET proveedor = 'dgii_directo',
         config = jsonb_build_object('rnc_emisor','02800758944','nombre_emisor','Israel  Aponte Martinez') WHERE id = v_id;
  SELECT config->>'nombre_emisor' razon, config->>'nombre_comercial' comercial INTO r FROM public.integraciones_fiscales WHERE id = v_id;
  IF r.razon <> 'ISRAEL APONTE MARTINEZ' OR r.comercial IS NOT NULL THEN RAISE EXCEPTION 'Minúsculas: % / %', r.razon, r.comercial; END IF;

  -- RNC fuera del listado: no se toca
  UPDATE public.integraciones_fiscales SET config = jsonb_build_object('rnc_emisor','99999999999','nombre_emisor','ESCRITO A MANO') WHERE id = v_id;
  IF (SELECT config->>'nombre_emisor' FROM public.integraciones_fiscales WHERE id = v_id) <> 'ESCRITO A MANO' THEN
    RAISE EXCEPTION 'Tocó un RNC que no está en el listado';
  END IF;

  -- razon_social_manual: no se toca aunque el RNC esté en el listado
  UPDATE public.integraciones_fiscales SET config = jsonb_build_object('rnc_emisor','02800758944','nombre_emisor','LO DEL FORMULARIO','razon_social_manual','NOMBRE NUEVO DGII') WHERE id = v_id;
  IF (SELECT config->>'nombre_emisor' FROM public.integraciones_fiscales WHERE id = v_id) <> 'NOMBRE NUEVO DGII' THEN
    RAISE EXCEPTION 'No respetó razon_social_manual';
  END IF;

  DELETE FROM public.integraciones_fiscales WHERE id = v_id;
END $prueba$;
